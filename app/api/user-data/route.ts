import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { precomputeIssueSectionsForUser, precomputeQuickSectionsForUser } from '@/lib/insights/issue-engine'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'

export async function GET(request: NextRequest) {
  try {
    console.log('=== GET /api/user-data DEBUG START ===')
    console.log('Request URL:', request.url)
    console.log('Request headers:', Object.fromEntries(request.headers.entries()))
    
    // Get NextAuth session - with JWT fallback (same pattern as /api/analyze-food)
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    let usedTokenFallback = false

    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
          usedTokenFallback = true
        }
      } catch (tokenError) {
        console.error('GET /api/user-data - JWT fallback failed:', tokenError)
      }
    }

    console.log('NextAuth session result:', session)
    console.log('Session user:', session?.user)
    console.log('Resolved user email (session/JWT):', userEmail, 'usedTokenFallback:', usedTokenFallback)
    
    if (!userEmail) {
      console.log('GET Authentication failed - no valid session or token found')
      console.log('Session:', session)
      console.log('Request headers:', Object.fromEntries(request.headers.entries()))
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    console.log('GET /api/user-data - Authenticated for:', userEmail)

    // Get user data by email with better error handling
    let user
    try {
      user = await prisma.user.findUnique({
      where: { email: userEmail },
        include: {
          healthGoals: true,
          supplements: true,
          medications: true,
        }
      })
    } catch (prismaError) {
      console.error('PRISMA ERROR in GET user query:', prismaError)
      return NextResponse.json({ 
        error: 'Database error', 
        debug: { 
          message: prismaError instanceof Error ? prismaError.message : 'Unknown prisma error',
          type: 'PRISMA_QUERY_ERROR'
        }
      }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log('GET /api/user-data - Loading data for user:', userEmail)

    // Debug: Log actual user data from database
    console.log('GET /api/user-data - Raw user data from DB:', {
      gender: user.gender,
      weight: user.weight,
      height: user.height,
      bodyType: user.bodyType,
      exerciseFrequency: user.exerciseFrequency,
      exerciseTypes: user.exerciseTypes,
      healthGoalsCount: user.healthGoals.length,
      supplementsCount: user.supplements.length,
      medicationsCount: user.medications.length,
      hasProfileImage: !!user.image
    })

    // Get exercise data directly from User table fields
    const exerciseData = {
      exerciseFrequency: user.exerciseFrequency || null,
      exerciseTypes: user.exerciseTypes || []
    };
    
    console.log('GET /api/user-data - Exercise data extracted for user')

    // Get health situations data
    let healthSituationsData = { healthIssues: '', healthProblems: '', additionalInfo: '', skipped: false };
    try {
      const storedHealthSituations = user.healthGoals.find((goal: any) => goal.name === '__HEALTH_SITUATIONS_DATA__');
      if (storedHealthSituations && storedHealthSituations.category) {
        const parsed = JSON.parse(storedHealthSituations.category);
        healthSituationsData = {
          healthIssues: parsed.healthIssues || '',
          healthProblems: parsed.healthProblems || '',
          additionalInfo: parsed.additionalInfo || '',
          skipped: parsed.skipped || false
        };
      }
    } catch (e) {
      console.log('No health situations data found in storage');
    }

    // Get allergy + diabetes data
    let allergyData = { allergies: [] as string[], diabetesType: '' };
    try {
      const storedAllergies = user.healthGoals.find((goal: any) => goal.name === '__ALLERGIES_DATA__');
      if (storedAllergies?.category) {
        const parsed = JSON.parse(storedAllergies.category);
        allergyData = {
          allergies: Array.isArray(parsed?.allergies) ? parsed.allergies.filter((a: any) => typeof a === 'string' && a.trim().length > 0) : [],
          diabetesType: typeof parsed?.diabetesType === 'string' ? parsed.diabetesType : '',
        };
      }
    } catch (e) {
      console.log('No allergy data found in storage');
    }

    // Get blood results data
    let bloodResultsData = { uploadMethod: 'documents', documents: [], images: [], notes: '', skipped: false };
    try {
      const storedBloodResults = user.healthGoals.find((goal: any) => goal.name === '__BLOOD_RESULTS_DATA__');
      if (storedBloodResults && storedBloodResults.category) {
        const parsed = JSON.parse(storedBloodResults.category);
        bloodResultsData = {
          uploadMethod: parsed.uploadMethod || 'documents',
          documents: parsed.documents || [],
          images: parsed.images || [],
          notes: parsed.notes || '',
          skipped: parsed.skipped || false
        };
      }
    } catch (e) {
      console.log('No blood results data found in storage');
    }

    // Get today's food entries
    const normalizeCategory = (raw: any) => {
      const value = typeof raw === 'string' ? raw.toLowerCase() : ''
      if (/breakfast/.test(value)) return 'breakfast'
      if (/lunch/.test(value)) return 'lunch'
      if (/dinner/.test(value)) return 'dinner'
      if (/snack/.test(value)) return 'snacks'
      if (/other/.test(value) || /uncat/.test(value)) return 'uncategorized'
      return value && value.trim().length > 0 ? value.trim() : 'uncategorized'
    }
    const buildTodayIso = () => {
      const d = new Date()
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    let todaysFoods: any[] = [];
    try {
      const storedFoods = user.healthGoals.find((goal: any) => goal.name === '__TODAYS_FOODS_DATA__');
      if (storedFoods && storedFoods.category) {
        const parsed = JSON.parse(storedFoods.category);
        todaysFoods = parsed.foods || [];
      }
    } catch (e) {
      console.log('No todays foods data found in storage');
    }
    const deriveLocalDateFromEntry = (entry: any) => {
      try {
        const ts = typeof entry?.id === 'number' ? entry.id : Number(entry?.id)
        if (Number.isFinite(ts)) {
          const d = new Date(ts)
          if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
          }
        }
      } catch {}
      return ''
    }
    const normalizedTodaysFoods = Array.isArray(todaysFoods)
      ? todaysFoods
          .map((entry: any) => {
            const category = normalizeCategory(entry?.meal ?? entry?.category ?? entry?.mealType ?? entry?.persistedCategory)
            const explicitLocalDate =
              typeof entry?.localDate === 'string' && entry.localDate.length >= 8
                ? entry.localDate
                : ''
            const derivedLocalDate = deriveLocalDateFromEntry(entry)
            const localDate = explicitLocalDate || derivedLocalDate
            if (!localDate) return null
            return {
              ...entry,
              meal: category,
              category,
              persistedCategory: entry?.persistedCategory ?? category,
              localDate,
            }
          })
          .filter(Boolean)
      : []

    // Get saved favorites
    let favorites: any[] = [];
    try {
      const storedFavorites = user.healthGoals.find((goal: any) => goal.name === '__FOOD_FAVORITES__');
      if (storedFavorites && storedFavorites.category) {
        const parsed = JSON.parse(storedFavorites.category);
        if (Array.isArray(parsed?.favorites)) {
          favorites = parsed.favorites;
        } else if (Array.isArray(parsed)) {
          favorites = parsed;
        }
      }
    } catch (e) {
      console.log('No favorites data found in storage');
    }

    // Get saved food name overrides (used for user renames without forcing favorites)
    let foodNameOverrides: any[] = []
    try {
      const storedOverrides = user.healthGoals.find((goal: any) => goal.name === '__FOOD_NAME_OVERRIDES__')
      if (storedOverrides && storedOverrides.category) {
        const parsed = JSON.parse(storedOverrides.category)
        if (Array.isArray(parsed?.overrides)) {
          foodNameOverrides = parsed.overrides
        } else if (Array.isArray(parsed)) {
          foodNameOverrides = parsed
        }
      }
    } catch (e) {
      console.log('No food name overrides data found in storage')
    }

    // Get device interest (stored in hidden goal record)
    let deviceInterestData: any = {}
    try {
      const storedDeviceInterest = user.healthGoals.find((goal: any) => goal.name === '__DEVICE_INTEREST__');
      if (storedDeviceInterest && storedDeviceInterest.category) {
        const parsed = JSON.parse(storedDeviceInterest.category);
        deviceInterestData = parsed || {}
      }
    } catch (e) {
      console.log('No device interest data found in storage');
    }

    // Get profile info data
    let profileInfoData = { firstName: '', lastName: '', bio: '', dateOfBirth: '', email: user.email || '' };
    try {
      const storedProfileInfo = user.healthGoals.find((goal: any) => goal.name === '__PROFILE_INFO_DATA__');
      if (storedProfileInfo && storedProfileInfo.category) {
        const parsed = JSON.parse(storedProfileInfo.category);
        profileInfoData = {
          firstName: parsed.firstName || '',
          lastName: parsed.lastName || '',
          bio: parsed.bio || '',
          dateOfBirth: parsed.dateOfBirth || '',
          email: parsed.email || user.email || ''
        };
      } else {
        // If no stored profile info, try to extract from user.name
        if (user.name) {
          const nameParts = user.name.split(' ');
          if (nameParts.length >= 2) {
            profileInfoData.firstName = nameParts[0];
            profileInfoData.lastName = nameParts.slice(1).join(' ');
          } else if (nameParts.length === 1) {
            profileInfoData.firstName = nameParts[0];
          }
        }
      }
      // Fallback: if stored profile info missing DOB but user has one, surface it
      if (!profileInfoData.dateOfBirth && (user as any).dateOfBirth) {
        profileInfoData.dateOfBirth = (user as any).dateOfBirth;
      }
    } catch (e) {
      console.log('No profile info data found in storage');
    }

    // Get primary goal choice + intensity (Step 2) stored as hidden health goal
    let primaryGoalData: { goalChoice?: string; goalIntensity?: string } = {};
    try {
      const storedPrimaryGoal = user.healthGoals.find((goal: any) => goal.name === '__PRIMARY_GOAL__');
      if (storedPrimaryGoal?.category) {
      const parsed = JSON.parse(storedPrimaryGoal.category);
      primaryGoalData = {
        goalChoice: typeof parsed.goalChoice === 'string' ? parsed.goalChoice : '',
        goalIntensity: typeof parsed.goalIntensity === 'string' ? parsed.goalIntensity.toLowerCase() : '',
      };
    }
  } catch (e) {
    console.log('No primary goal data found in storage');
  }

    // Transform to onboarding format
    let selectedGoals: string[] = []
    try {
      const selectedRecord = user.healthGoals.find((goal: any) => goal.name === '__SELECTED_ISSUES__')
      if (selectedRecord?.category) {
        const parsed = JSON.parse(selectedRecord.category)
        if (Array.isArray(parsed)) {
          selectedGoals = parsed.map((name) => String(name || '')).filter(Boolean)
        }
      }
    } catch (error) {
      console.warn('Failed to parse __SELECTED_ISSUES__ health goal', error)
      selectedGoals = []
    }
    console.log('GET /api/user-data - Parsed __SELECTED_ISSUES__ snapshot:', { count: selectedGoals.length, goals: selectedGoals })

    const onboardingData = {
      gender: user.gender?.toLowerCase() || '',
      weight: user.weight?.toString() || '',
      height: user.height?.toString() || '',
      bodyType: user.bodyType?.toLowerCase() || '',
      birthdate: profileInfoData.dateOfBirth || '',
      exerciseFrequency: exerciseData.exerciseFrequency || '',
      exerciseTypes: exerciseData.exerciseTypes || [],
      goals: selectedGoals.length
        ? selectedGoals
        : user.healthGoals.filter((goal: any) => !goal.name.startsWith('__')).map((goal: any) => goal.name),
      healthSituations: healthSituationsData,
      bloodResults: bloodResultsData,
      supplements: user.supplements.map((supp: any) => ({
        name: supp.name,
        dosage: supp.dosage,
        timing: supp.timing,
        dateAdded: supp.dateAdded || supp.createdAt || new Date().toISOString(),
        method: supp.method || 'manual',
        scheduleInfo: supp.scheduleInfo || 'Daily',
        imageUrl: supp.imageUrl || null
      })),
      medications: user.medications.map((med: any) => ({
        name: med.name,
        dosage: med.dosage,
        timing: med.timing,
        dateAdded: med.dateAdded || med.createdAt || new Date().toISOString(),
        method: med.method || 'manual',
        scheduleInfo: med.scheduleInfo || 'Daily',
        imageUrl: med.imageUrl || null
      })),
      profileImage: user.image || null,
      todaysFoods: normalizedTodaysFoods,
      favorites,
      foodNameOverrides,
      profileInfo: profileInfoData,
      deviceInterest: deviceInterestData,
      termsAccepted: (user as any).termsAccepted === true,
      goalChoice: primaryGoalData.goalChoice || '',
      goalIntensity: (primaryGoalData.goalIntensity || 'standard').toString().toLowerCase(),
      allergies: allergyData.allergies,
      diabetesType: allergyData.diabetesType,
    }

    // Fallback: if primary goal still missing, use the first non-hidden health goal as a soft default
    if (!onboardingData.goalChoice && onboardingData.goals.length > 0) {
      onboardingData.goalChoice = onboardingData.goals[0]
    }

    console.log('GET /api/user-data - Returning onboarding data for user')

    // Debug: Log transformed data being returned
    console.log('GET /api/user-data - Transformed onboarding data:', {
      gender: onboardingData.gender,
      weight: onboardingData.weight,
      height: onboardingData.height,
      bodyType: onboardingData.bodyType,
      exerciseFrequency: onboardingData.exerciseFrequency,
      exerciseTypes: onboardingData.exerciseTypes,
      goalsCount: onboardingData.goals.length,
      supplementsCount: onboardingData.supplements.length,
      medicationsCount: onboardingData.medications.length,
      hasProfileImage: !!onboardingData.profileImage
    })

    return NextResponse.json({ data: onboardingData })
  } catch (error) {
    console.error('Error loading user data:', error)
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // 🔍 BACKEND PERFORMANCE MEASUREMENT START
    console.log('=== POST /api/user-data DEBUG START ===')
    console.log('🚀 BACKEND PERFORMANCE TRACKING')
    console.time('⏱️ Total API Processing Time')
    console.time('⏱️ Authentication Check')
    const apiStartTime = Date.now()
    
    console.log('Request URL:', request.url)
    console.log('Request headers:', Object.fromEntries(request.headers.entries()))
    console.log('POST /api/user-data - Starting SIMPLIFIED approach...')
    
    // Get NextAuth session
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    let usedTokenFallback = false

    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
          usedTokenFallback = true
        }
      } catch (tokenError) {
        console.error('POST /api/user-data - JWT fallback failed:', tokenError)
      }
    }
    
    console.timeEnd('⏱️ Authentication Check')
    console.log('NextAuth session result:', session)
    console.log('Session user:', session?.user)
    console.log('Resolved user email (session/JWT):', userEmail, 'usedTokenFallback:', usedTokenFallback)
    
    if (!userEmail) {
      console.timeEnd('⏱️ Total API Processing Time')
      console.log('❌ POST Authentication failed - no valid session or token found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    console.log('✅ POST /api/user-data - Authenticated user:', userEmail)

    console.time('⏱️ Parse Request Data')
    const data = await request.json()
    console.timeEnd('⏱️ Parse Request Data')

    // #region agent log
	    try {
	      const hasTodaysFoodsKey = !!(data && typeof data === 'object' && 'todaysFoods' in data)
	      const todaysFoodsLen = Array.isArray((data as any)?.todaysFoods) ? (data as any).todaysFoods.length : null
	      const appendHistory = (data as any)?.appendHistory
	      console.log('AGENT_DEBUG', JSON.stringify({hypothesisId:'C',location:'app/api/user-data/route.ts:POST',message:'POST /api/user-data payload includes todaysFoods?',data:{hasTodaysFoodsKey,todaysFoodsLen,appendHistory,referer:(request.headers.get('referer')||'').slice(0,200),contentLength:(request.headers.get('content-length')||'')},timestamp:Date.now()}));
	    } catch {}
    // #endregion agent log
    
    console.log('📊 POST /api/user-data - Data received:', {
      hasGender: !!data.gender,
      hasWeight: !!data.weight,
      hasHeight: !!data.height,
      hasBodyType: !!data.bodyType,
      hasGoals: !!data.goals,
      hasSupplements: !!data.supplements,
      hasMedications: !!data.medications,
      hasHealthSituations: !!data.healthSituations,
      hasBloodResults: !!data.bloodResults,
      hasExercise: !!(data.exerciseFrequency || data.exerciseTypes),
      dataSize: JSON.stringify(data).length + ' characters'
    })
    if (Array.isArray(data.goals)) {
      const safeGoals = data.goals.map((g: any) => String(g || '').trim()).filter(Boolean)
      console.log('🎯 POST /api/user-data - goals payload:', { count: safeGoals.length, goals: safeGoals })
    } else {
      console.log('ℹ️ POST /api/user-data - no goals array provided; will not modify __SELECTED_ISSUES__')
    }

    // Find or create user
    console.time('⏱️ User Lookup/Creation')
    let user = await prisma.user.findUnique({
      where: { email: userEmail }
    })

    if (!user) {
      console.log('🔨 Creating new user for:', userEmail)
      user = await prisma.user.create({
        data: {
          email: userEmail,
          name: userEmail.split('@')[0],
        }
      })
      console.log('✅ Created new user with ID:', user.id)
    } else {
      console.log('✅ Found existing user with ID:', user.id)
    }
    
    console.timeEnd('⏱️ User Lookup/Creation')

    // Load existing profile info record for merging purposes (date of birth, etc.)
    let existingProfileInfoData: Record<string, any> | null = null
    try {
      const storedProfileInfo = await prisma.healthGoal.findFirst({
        where: {
          userId: user.id,
          name: '__PROFILE_INFO_DATA__'
        }
      })
      if (storedProfileInfo?.category) {
        existingProfileInfoData = JSON.parse(storedProfileInfo.category)
      }
    } catch (error) {
      console.warn('⚠️ Failed to load existing profile info data:', error)
    }

    // Load existing primary goal (goal choice + intensity) for safe merging
    let existingPrimaryGoalData: { goalChoice?: string; goalIntensity?: string } = {}
    try {
      const storedPrimaryGoal = await prisma.healthGoal.findFirst({
        where: { userId: user.id, name: '__PRIMARY_GOAL__' },
      })
      if (storedPrimaryGoal?.category) {
        const parsed = JSON.parse(storedPrimaryGoal.category)
        existingPrimaryGoalData = {
          goalChoice: typeof parsed.goalChoice === 'string' ? parsed.goalChoice : '',
          goalIntensity: typeof parsed.goalIntensity === 'string' ? parsed.goalIntensity.toLowerCase() : '',
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to load existing primary goal data:', error)
    }

    const normalizedBirthdate =
      typeof data.birthdate === 'string' ? data.birthdate.trim() : ''
    const effectiveBirthdate =
      normalizedBirthdate ||
      (existingProfileInfoData && typeof existingProfileInfoData.dateOfBirth === 'string'
        ? existingProfileInfoData.dateOfBirth
        : '')
    const birthdateChanged = Boolean(
      normalizedBirthdate &&
        normalizedBirthdate !== (existingProfileInfoData?.dateOfBirth || '')
    )

    // SIMPLIFIED APPROACH: Update each piece of data individually with proper error handling
    // This avoids complex transactions that were causing constraint violations

    // 1. Update basic user data with safe enum handling
    console.time('⏱️ Basic User Data Update')
    try {
      const updateData: any = {}
      
      if (data.gender) {
        updateData.gender = data.gender.toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE'
      }
      if (data.termsAccepted === true) {
        updateData.termsAccepted = true
      }
      if (data.weight !== undefined && data.weight !== null && data.weight !== '') {
        const weightNum = parseFloat(data.weight.toString())
        if (!isNaN(weightNum)) {
          updateData.weight = weightNum
        }
      }
      if (data.height !== undefined && data.height !== null && data.height !== '') {
        const heightNum = parseFloat(data.height.toString())
        if (!isNaN(heightNum)) {
          updateData.height = heightNum
        }
      }
      if (data.bodyType && data.bodyType.trim() !== '') {
        const bodyTypeUpper = data.bodyType.toUpperCase()
        if (['ECTOMORPH', 'MESOMORPH', 'ENDOMORPH'].includes(bodyTypeUpper)) {
          updateData.bodyType = bodyTypeUpper
        }
      }
      if (data.exerciseFrequency && data.exerciseFrequency.trim() !== '') {
        updateData.exerciseFrequency = data.exerciseFrequency.trim()
      }
      if (data.exerciseTypes && Array.isArray(data.exerciseTypes) && data.exerciseTypes.length > 0) {
        updateData.exerciseTypes = data.exerciseTypes.filter((type: any) => type && type.trim() !== '')
      }
      if (data.profileImage !== undefined) {
        updateData.image = data.profileImage
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updateData
        })
        console.log('✅ Updated user basic data successfully:', updateData)
      } else {
        console.log('ℹ️ No user basic data to update')
      }
    } catch (error) {
      console.error('❌ Error updating user basic data:', error)
      // Continue with other updates even if this fails
    }
    console.timeEnd('⏱️ Basic User Data Update')

    // 2. Handle health goals - simple upsert approach
    console.time('⏱️ Health Goals Update')
    try {
      if (data.goals && Array.isArray(data.goals) && data.goals.length > 0) {
        console.log('🎯 Processing', data.goals.length, 'health goals')
        
        // Delete existing non-hidden goals (preserve hidden snapshot records like favorites/todaysFoods)
        const deleteResult = await prisma.healthGoal.deleteMany({
          where: {
            userId: user.id,
            NOT: { name: { startsWith: '__' } },
          },
        })
        console.log('🗑️ Deleted', deleteResult.count, 'existing health goals')
        
        // Create new goals
        for (const goalName of data.goals) {
          if (goalName && typeof goalName === 'string') {
            await prisma.healthGoal.create({
              data: {
                userId: user.id,
                name: goalName,
                category: 'general',
                currentRating: 5,
              }
            })
          }
        }
        console.log('✅ Updated health goals successfully')
      } else {
        console.log('ℹ️ No health goals to update')
      }
      // Persist the canonical selected issue list only when a goals array is provided
      if (Array.isArray(data.goals)) {
        const safeGoals = data.goals.map((g: any) => String(g || '').trim()).filter(Boolean)
        await prisma.healthGoal.deleteMany({
          where: { userId: user.id, name: '__SELECTED_ISSUES__' },
        })
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__SELECTED_ISSUES__',
            category: JSON.stringify(safeGoals),
            currentRating: 0,
          },
        })
        console.log('📝 Saved __SELECTED_ISSUES__ snapshot:', { count: safeGoals.length, goals: safeGoals })
      } else {
        console.log('🔒 Preserved existing __SELECTED_ISSUES__ (no goals array provided in this request)')
      }
    } catch (error) {
      console.error('❌ Error updating health goals:', error)
      // Continue with other updates
    }
    console.timeEnd('⏱️ Health Goals Update')

    // 3. Handle health situations data (Step 5) - store as special health goal
    try {
      if (data.healthSituations) {
        // Remove existing health situations data
        await prisma.healthGoal.deleteMany({
          where: {
            userId: user.id,
            name: '__HEALTH_SITUATIONS_DATA__'
          }
        })
        
        // Store new health situations data
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__HEALTH_SITUATIONS_DATA__',
            category: JSON.stringify(data.healthSituations),
            currentRating: 0,
          }
        })
        console.log('Stored health situations data successfully')
      }
    } catch (error) {
      console.error('Error storing health situations data:', error)
      // Continue with other updates
    }

    // 3.1. Handle allergies + diabetes type (Step 2) - store as special health goal
    try {
      const hasIncomingAllergies = Array.isArray(data.allergies)
      const hasIncomingDiabetes = typeof data.diabetesType === 'string'
      if (hasIncomingAllergies || hasIncomingDiabetes) {
        let existingAllergyPayload: { allergies: string[]; diabetesType?: string } = { allergies: [], diabetesType: '' }
        try {
          const existingAllergies = await prisma.healthGoal.findFirst({
            where: { userId: user.id, name: '__ALLERGIES_DATA__' },
          })
          if (existingAllergies?.category) {
            const parsed = JSON.parse(existingAllergies.category)
            existingAllergyPayload = {
              allergies: Array.isArray(parsed?.allergies) ? parsed.allergies : [],
              diabetesType: typeof parsed?.diabetesType === 'string' ? parsed.diabetesType : '',
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to load existing allergy data:', error)
        }

        const normalizedAllergies = hasIncomingAllergies
          ? (data.allergies as any[])
              .filter((a) => typeof a === 'string')
              .map((a) => (a as string).trim())
              .filter((a) => a.length > 0)
          : existingAllergyPayload.allergies || []

        const payload = {
          allergies: normalizedAllergies,
          diabetesType: hasIncomingDiabetes ? data.diabetesType : existingAllergyPayload.diabetesType || '',
        }

        await prisma.healthGoal.deleteMany({
          where: { userId: user.id, name: '__ALLERGIES_DATA__' },
        })
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__ALLERGIES_DATA__',
            category: JSON.stringify(payload),
            currentRating: 0,
          },
        })
        console.log('Stored allergy + diabetes data successfully')
      }
    } catch (error) {
      console.error('Error storing allergy data:', error)
      // Continue with other updates
    }

    // 3.25. Handle primary goal + intensity (Step 2) - store as special health goal
    try {
      // IMPORTANT: Do not allow empty strings from autosaves (or partial saves) to wipe an existing goal.
      // This prevents calorie/macros targets from "fluctuating" when different pages POST partially-loaded forms.
      const normalizedIncomingGoalChoice =
        typeof data.goalChoice === 'string' ? data.goalChoice.trim() : ''

      const normalizedIncomingIntensityRaw =
        typeof data.goalIntensity === 'string' ? data.goalIntensity.trim().toLowerCase() : ''
      const isValidIntensity =
        normalizedIncomingIntensityRaw === 'mild' ||
        normalizedIncomingIntensityRaw === 'standard' ||
        normalizedIncomingIntensityRaw === 'aggressive'
      
      // Only update the stored primary goal when the request explicitly includes it.
      // Otherwise, unrelated saves (food snapshot, profile image, etc.) could overwrite the user's goal unintentionally.
      const shouldUpdatePrimaryGoal = normalizedIncomingGoalChoice.length > 0 || isValidIntensity
      if (shouldUpdatePrimaryGoal) {
        const incomingGoalChoice =
          normalizedIncomingGoalChoice.length > 0
            ? normalizedIncomingGoalChoice
            : (existingPrimaryGoalData.goalChoice || '')
        const incomingGoalIntensity =
          isValidIntensity
            ? normalizedIncomingIntensityRaw
            : (existingPrimaryGoalData.goalIntensity || 'standard').toLowerCase()

        await prisma.healthGoal.deleteMany({
          where: {
            userId: user.id,
            name: '__PRIMARY_GOAL__'
          }
        })

        console.log('POST /api/user-data - Persisting primary goal selection', {
          goalChoice: incomingGoalChoice,
          goalIntensity: incomingGoalIntensity || 'standard',
        })
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__PRIMARY_GOAL__',
            category: JSON.stringify({
              goalChoice: incomingGoalChoice,
              goalIntensity: incomingGoalIntensity || 'standard',
            }),
            currentRating: 0,
          }
        })
        console.log('Stored primary goal data successfully')
      }
    } catch (error) {
      console.error('Error storing primary goal data:', error)
      // Continue with other updates
    }

    // 3.5. Handle blood results data (Step 7) - store as special health goal
    try {
      if (data.bloodResults) {
        // Remove existing blood results data
        await prisma.healthGoal.deleteMany({
          where: {
            userId: user.id,
            name: '__BLOOD_RESULTS_DATA__'
          }
        })
        
        // Store new blood results data
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__BLOOD_RESULTS_DATA__',
            category: JSON.stringify(data.bloodResults),
            currentRating: 0,
          }
        })
        console.log('Stored blood results data successfully')
      }
    } catch (error) {
      console.error('Error storing blood results data:', error)
      // Continue with other updates
    }

    // 4. Handle supplements - optimized bulk replace (deleteMany + createMany)
    console.time('⏱️ Supplements Update')
    try {
      console.log('🔍 SUPPLEMENT DEBUG - Raw data.supplements:', JSON.stringify(data.supplements, null, 2))
      
      if (data.supplements && Array.isArray(data.supplements)) {
        console.log('💊 Processing', data.supplements.length, 'supplements for user:', user.id)
        
        // Validate supplement data before processing
        const validSupplements = data.supplements.filter((supp: any) => {
          const isValid = supp && supp.name && typeof supp.name === 'string' && supp.name.trim().length > 0
          if (!isValid) {
            console.warn('⚠️ Invalid supplement data:', supp)
          }
          return isValid
        })
        
        console.log('✅ Valid supplements to process:', validSupplements.length)
        
        if (validSupplements.length === 0) {
          console.log('⚠️ No valid supplements to save - all supplement data was invalid')
          return NextResponse.json({ 
            success: true, 
            warning: 'No valid supplements to save',
            debug: { originalSupplements: data.supplements }
          })
        }
        
        // Bulk replace for performance: delete all then insert all
        await prisma.$transaction([
          prisma.supplement.deleteMany({ where: { userId: user.id } }),
          prisma.supplement.createMany({
            data: validSupplements.map((supp: any) => ({
              userId: user.id,
              name: supp.name,
              dosage: supp.dosage || '',
              timing: Array.isArray(supp.timing) ? supp.timing : [supp.timing || 'morning'],
              imageUrl: supp.imageUrl || null
            }))
          })
        ])
        console.log('✅ Replaced supplements via bulk operation:', validSupplements.length)
        
        // BACKUP: Also store supplements as JSON in health goals as failsafe
        try {
          await prisma.healthGoal.deleteMany({
            where: {
              userId: user.id,
              name: '__SUPPLEMENTS_BACKUP_DATA__'
            }
          })
          
          await prisma.healthGoal.create({
            data: {
              userId: user.id,
              name: '__SUPPLEMENTS_BACKUP_DATA__',
              category: JSON.stringify({ supplements: validSupplements, timestamp: new Date().toISOString() }),
              currentRating: 0,
            }
          })
          console.log('💾 Created supplements backup in health goals')
        } catch (backupError) {
          console.error('❌ Failed to create supplements backup:', backupError)
        }
        
      } else {
        console.log('ℹ️ No supplements to update - data.supplements is:', typeof data.supplements, data.supplements)
      }
    } catch (error) {
      console.error('❌ Error updating supplements:', error)
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack available')
      
      // EMERGENCY BACKUP: If supplement save fails completely, store in health goals
      try {
        if (data.supplements && Array.isArray(data.supplements) && data.supplements.length > 0) {
          console.log('🚨 EMERGENCY: Saving supplements to health goals as backup')
          await prisma.healthGoal.deleteMany({
            where: {
              userId: user.id,
              name: '__SUPPLEMENTS_EMERGENCY_BACKUP__'
            }
          })
          
          await prisma.healthGoal.create({
            data: {
              userId: user.id,
              name: '__SUPPLEMENTS_EMERGENCY_BACKUP__',
              category: JSON.stringify({ 
                supplements: data.supplements, 
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error'
              }),
              currentRating: 0,
            }
          })
          console.log('🚨 EMERGENCY backup created successfully')
        }
      } catch (emergencyError) {
        console.error('💥 CRITICAL: Emergency backup also failed:', emergencyError)
      }
      
      // Continue with other updates
    }
    console.timeEnd('⏱️ Supplements Update')

    // Save device interest if present (hidden goal record)
    try {
      if (data && (data as any).deviceInterest && typeof (data as any).deviceInterest === 'object') {
        const deviceInterest = (data as any).deviceInterest
        const existing = await prisma.healthGoal.findFirst({ where: { userId: user.id, name: '__DEVICE_INTEREST__' } })
        if (existing) {
          await prisma.healthGoal.update({ where: { id: existing.id }, data: { category: JSON.stringify(deviceInterest) } })
        } else {
          await prisma.healthGoal.create({ data: { userId: user.id, name: '__DEVICE_INTEREST__', category: JSON.stringify(deviceInterest), currentRating: 0 } })
        }
      }
    } catch (e) {
      console.log('Device interest save skipped:', e)
    }

    // 5. Handle medications - optimized bulk replace (deleteMany + createMany)
    console.time('⏱️ Medications Update')
    try {
      if (data.medications && Array.isArray(data.medications)) {
        console.log('💉 Processing', data.medications.length, 'medications')
        
        // Bulk replace for performance: delete all then insert all
        const validMeds = (data.medications || []).filter((m: any) => m && typeof m.name === 'string' && m.name.trim().length > 0)
        await prisma.$transaction([
          prisma.medication.deleteMany({ where: { userId: user.id } }),
          prisma.medication.createMany({
            data: validMeds.map((med: any) => ({
              userId: user.id,
              name: med.name,
              dosage: med.dosage || '',
              timing: Array.isArray(med.timing) ? med.timing : [med.timing || 'morning'],
              imageUrl: med.imageUrl || null
            }))
          })
        ])
        console.log('✅ Replaced medications via bulk operation:', validMeds.length)
      } else {
        console.log('ℹ️ No medications to update')
      }
    } catch (error) {
      console.error('❌ Error updating medications:', error)
      // Continue with other updates
    }
    console.timeEnd('⏱️ Medications Update')

    // 6. Handle today's foods data - store as special health goal
    try {
      if (data.todaysFoods && Array.isArray(data.todaysFoods)) {
        // #region agent log
        try {
          const appendHistoryFlag = (data as any)?.appendHistory
          console.log('AGENT_DEBUG', JSON.stringify({
            hypothesisId: 'A',
            location: 'app/api/user-data/route.ts:POST:todaysFoods',
            message: 'Received todaysFoods in /api/user-data',
            data: {
              referer: (request.headers.get('referer') || '').slice(0, 200),
              todaysFoodsLen: data.todaysFoods.length,
              appendHistory: appendHistoryFlag,
              hasAppendHistoryKey: data && typeof data === 'object' ? Object.prototype.hasOwnProperty.call(data, 'appendHistory') : false,
            },
            timestamp: Date.now(),
          }))
        } catch {}
        // #endregion agent log

        // Remove existing food data
        await prisma.healthGoal.deleteMany({
          where: {
            userId: user.id,
            name: '__TODAYS_FOODS_DATA__'
          }
        })
        
        // Store new food data for fast \"today\" view
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__TODAYS_FOODS_DATA__',
            category: JSON.stringify({ foods: data.todaysFoods }),
            currentRating: 0,
          }
        })
        console.log('Stored todays foods data successfully')

        // Also append the latest entry into FoodLog for reliable history,
        // but ONLY when explicitly requested by the caller.
        //
        // IMPORTANT (Dec 2025 bug): Many pages POST /api/user-data as part of "Health Setup"
        // updates while carrying a copy of todaysFoods in memory. If appendHistory defaults
        // to true, those unrelated saves will create duplicate FoodLog rows (user-visible
        // duplicates after changing health settings).
        const appendHistory = data.appendHistory === true
        if (appendHistory && data.todaysFoods.length > 0) {
          const last = data.todaysFoods[0]
          if (last && (last.description || last.nutrition || last.photo)) {
            try {
              const rawDescription = (last.description || '').toString()
              const name =
                rawDescription
                  .split('\\n')[0]
                  .split('Calories:')[0]
                  .split(',')[0]
                  .split('.')[0]
                  .trim() || 'Food item'

              const normalizedMeal = (() => {
                const raw = (last as any)?.meal ?? (last as any)?.category ?? (last as any)?.mealType
                const value = typeof raw === 'string' ? raw.toLowerCase() : ''
                if (/breakfast/.test(value)) return 'breakfast'
                if (/lunch/.test(value)) return 'lunch'
                if (/dinner/.test(value)) return 'dinner'
                if (/snack/.test(value)) return 'snacks'
                if (/uncat/.test(value) || /other/.test(value)) return 'uncategorized'
                return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
              })()

              await prisma.foodLog.create({
                data: {
                  userId: user.id,
                  name,
                  description: rawDescription || null,
                  imageUrl: last.photo || null,
                  nutrients: last.nutrition || null,
                  items: Array.isArray(last.items) && last.items.length > 0 ? last.items : null,
                  localDate: (last.localDate as string | null) || null,
                  meal: normalizedMeal,
                  category: normalizedMeal,
                },
              })
              console.log('Appended latest food entry to FoodLog for history view')

              // #region agent log
              try {
                console.log('AGENT_DEBUG', JSON.stringify({
                  hypothesisId: 'A',
                  location: 'app/api/user-data/route.ts:POST:appendFoodLog',
                  message: 'Appended FoodLog row from /api/user-data (potential duplicate source)',
                  data: {
                    referer: (request.headers.get('referer') || '').slice(0, 200),
                    appendHistory,
                    namePreview: String(name || '').slice(0, 60),
                    localDate: typeof (last as any)?.localDate === 'string' ? String((last as any).localDate).slice(0, 10) : null,
                  },
                  timestamp: Date.now(),
                }))
              } catch {}
              // #endregion agent log
            } catch (foodLogError) {
              console.warn('FoodLog append failed (non-blocking):', foodLogError)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error storing todays foods data:', error)
      // Continue with other updates
    }

    // 7. Handle favorites data for quick add flow
    try {
      if (data && Array.isArray((data as any).favorites)) {
        const favoritesArray = (data as any).favorites
        const favoritesCount = Array.isArray(favoritesArray) ? favoritesArray.length : 0
        const referer = (request.headers.get('referer') || '').slice(0, 200)

        // Load existing favorites to avoid accidental wipes from empty payloads
        let existingFavGoal: any | null = null
        let existingFavorites: any[] = []
        try {
          existingFavGoal = await prisma.healthGoal.findFirst({
            where: { userId: user.id, name: '__FOOD_FAVORITES__' },
          })
          if (existingFavGoal?.category) {
            const parsed = JSON.parse(existingFavGoal.category)
            if (Array.isArray(parsed?.favorites)) existingFavorites = parsed.favorites
            else if (Array.isArray(parsed)) existingFavorites = parsed
          }
        } catch (favLoadErr) {
          console.warn('AGENT_DEBUG favorites load failed (non-blocking)', favLoadErr)
        }

        if (favoritesCount === 0 && existingFavorites.length > 0) {
          console.log('AGENT_DEBUG favorites write skipped (empty payload would wipe existing)', {
            existingCount: existingFavorites.length,
            referer,
          })
        } else {
          console.log('AGENT_DEBUG favorites write', { favoritesCount, referer })
          // Safety: store a backup copy BEFORE overwriting.
          try {
            if (existingFavGoal?.category) {
              await prisma.healthGoal.create({
                data: {
                  userId: user.id,
                  name: `__FOOD_FAVORITES__BACKUP__${Date.now()}`,
                  category: String(existingFavGoal.category),
                  currentRating: 0,
                },
              })

              // Keep only the most recent backups (best effort).
              const oldBackups = await prisma.healthGoal.findMany({
                where: {
                  userId: user.id,
                  name: { startsWith: '__FOOD_FAVORITES__BACKUP__' },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
                skip: 20,
              })
              if (oldBackups.length > 0) {
                await prisma.healthGoal.deleteMany({
                  where: { id: { in: oldBackups.map((b) => b.id) } },
                })
              }
            }
          } catch (backupErr) {
            console.warn('AGENT_DEBUG favorites backup failed (non-blocking)', backupErr)
          }

          // Avoid delete+create: update the latest record (and prune duplicates) when possible.
          const existingGoals = await prisma.healthGoal.findMany({
            where: { userId: user.id, name: '__FOOD_FAVORITES__' },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })
          const primary = existingGoals[0] || null
          if (primary?.id) {
            await prisma.healthGoal.update({
              where: { id: primary.id },
              data: {
                category: JSON.stringify({ favorites: favoritesArray }),
                currentRating: 0,
              },
            })
            if (existingGoals.length > 1) {
              await prisma.healthGoal.deleteMany({
                where: { id: { in: existingGoals.slice(1).map((g) => g.id) } },
              })
            }
          } else {
            await prisma.healthGoal.create({
              data: {
                userId: user.id,
                name: '__FOOD_FAVORITES__',
                category: JSON.stringify({ favorites: favoritesArray }),
                currentRating: 0,
              },
            })
          }
          console.log('Stored favorites data successfully')
        }
      }
    } catch (error) {
      console.error('Error storing favorites data:', error)
    }

    // 7b. Handle food name overrides (user renames that should apply across the UI)
    try {
      if (data && Array.isArray((data as any).foodNameOverrides)) {
        const overridesArray = (data as any).foodNameOverrides
        const existingGoals = await prisma.healthGoal.findMany({
          where: { userId: user.id, name: '__FOOD_NAME_OVERRIDES__' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        const primary = existingGoals[0] || null
        if (primary?.id) {
          await prisma.healthGoal.update({
            where: { id: primary.id },
            data: {
              category: JSON.stringify({ overrides: overridesArray }),
              currentRating: 0,
            },
          })
          if (existingGoals.length > 1) {
            await prisma.healthGoal.deleteMany({
              where: { id: { in: existingGoals.slice(1).map((g) => g.id) } },
            })
          }
        } else {
          await prisma.healthGoal.create({
            data: {
              userId: user.id,
              name: '__FOOD_NAME_OVERRIDES__',
              category: JSON.stringify({ overrides: overridesArray }),
              currentRating: 0,
            },
          })
        }
      }
    } catch (error) {
      console.error('Error storing food name overrides data:', error)
    }

    // 8. Handle profileInfo data from profile page - store as special health goal
    try {
      const incomingProfileInfo =
        data.profileInfo && typeof data.profileInfo === 'object'
          ? data.profileInfo
          : null

      let shouldUpdateProfileInfo = false
      let profileInfoPayload: Record<string, any> | null = null

      if (incomingProfileInfo) {
        shouldUpdateProfileInfo = true
        profileInfoPayload = {
          ...(existingProfileInfoData || {}),
          ...incomingProfileInfo,
        }
      }

      if (normalizedBirthdate) {
        if (!profileInfoPayload) {
          profileInfoPayload = { ...(existingProfileInfoData || {}) }
        }
        if (profileInfoPayload.dateOfBirth !== normalizedBirthdate) {
          profileInfoPayload.dateOfBirth = normalizedBirthdate
          shouldUpdateProfileInfo = true
        }
      }

      if (effectiveBirthdate && profileInfoPayload && !profileInfoPayload.dateOfBirth) {
        profileInfoPayload.dateOfBirth = effectiveBirthdate
        shouldUpdateProfileInfo = true
      }

      if (shouldUpdateProfileInfo && profileInfoPayload) {
        console.log('POST /api/user-data - Handling profileInfo data:', profileInfoPayload)
        if (effectiveBirthdate) {
          profileInfoPayload.dateOfBirth = effectiveBirthdate
        } else if (!profileInfoPayload.dateOfBirth && existingProfileInfoData?.dateOfBirth) {
          profileInfoPayload.dateOfBirth = existingProfileInfoData.dateOfBirth
        }
        
        // Update basic User fields if available in profileInfo
        const profileUpdateData: any = {}
        const firstName = profileInfoPayload.firstName || ''
        const lastName = profileInfoPayload.lastName || ''
        
        // Handle name concatenation
        if (firstName || lastName) {
          profileUpdateData.name = `${firstName} ${lastName}`.trim()
        }
        
        // Handle gender
        if (profileInfoPayload.gender) {
          profileUpdateData.gender = profileInfoPayload.gender.toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE'
        }
        
        // Update User model with basic profile data
        if (Object.keys(profileUpdateData).length > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: profileUpdateData
          })
          console.log('Updated user profile basic data:', profileUpdateData)
        }
        
        // Store full profileInfo as special health goal for additional fields like bio, dateOfBirth
        await prisma.healthGoal.deleteMany({
          where: {
            userId: user.id,
            name: '__PROFILE_INFO_DATA__'
          }
        })
        
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__PROFILE_INFO_DATA__',
            category: JSON.stringify(profileInfoPayload),
            currentRating: 0,
          }
        })
        console.log('Stored profile info data successfully')
      }
    } catch (error) {
      console.error('Error storing profile info data:', error)
      // Continue with other updates
    }

    console.log('✅ POST /api/user-data - All updates completed successfully')

    const insightsAutoEnabled = process.env.ENABLE_INSIGHTS_BACKGROUND_REGEN === 'true'
    let insightsUpdateRequired = false

    if (user?.id) {
      // Determine whether this payload represents a complete onboarding submission
      const isFullOnboarding = !!(data.gender && data.weight && data.height && 
        (data.goals?.length || data.supplements?.length || data.medications?.length))

      const changedTypes: Array<
        'supplements' | 'medications' | 'food' | 'exercise' | 'health_goals' | 'health_situations' | 'profile' | 'blood_results'
      > = []
      if (!isFullOnboarding) {
        if (data.supplements) changedTypes.push('supplements')
        if (data.medications) changedTypes.push('medications')
        if (data.goals) changedTypes.push('health_goals')
        if (data.healthSituations) changedTypes.push('health_situations')
        const profileFieldsUpdated = Boolean(
          data.gender ||
            data.weight ||
            data.height ||
            data.bodyType ||
            birthdateChanged ||
            (data.profileInfo && typeof data.profileInfo === 'object')
        )
        if (profileFieldsUpdated) changedTypes.push('profile')
        if (data.exerciseFrequency || data.exerciseTypes) changedTypes.push('exercise')
        if (data.bloodResults) changedTypes.push('blood_results')
        if (data.todaysFoods) changedTypes.push('food')
      }

      insightsUpdateRequired = isFullOnboarding || changedTypes.length > 0

      if (insightsAutoEnabled) {
        // Charge credits and generate insights automatically (legacy behaviour; now gated)
        if (isFullOnboarding) {
          try {
            const cm = new CreditManager(user.id)
            const hasCredits = await cm.checkCredits('INSIGHTS_GENERATION')
            
            if (hasCredits.hasCredits) {
              const costCents = CREDIT_COSTS.INSIGHTS_GENERATION
              const charged = await cm.chargeCents(costCents)
              
              if (charged) {
                await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    monthlyInsightsGenerationUsed: { increment: 1 },
                  } as any,
                })
                console.log('✅ Charged credits for insights generation:', costCents)
              } else {
                console.warn('⚠️ Insufficient credits for insights generation, skipping')
              }
            }
          } catch (error) {
            console.warn('⚠️ Failed to charge credits for insights generation:', error)
          }
        }
        
        if (isFullOnboarding) {
          try {
            console.log('🚀 Generating FULL insights for user:', user.id)
            const fullInsightsPromise = precomputeIssueSectionsForUser(user.id, { concurrency: 4 })
            
            await Promise.race([
              fullInsightsPromise.then(() => {
                console.log('✅ Full insights generation completed')
                return 'done'
              }),
              new Promise((resolve) => setTimeout(() => {
                console.log('⏱️ Full insights generation timed out after 30s, continuing in background')
                resolve('timeout')
              }, 30000)),
            ])
            
            fullInsightsPromise.catch((error) => {
              console.warn('⚠️ Full insights generation error (continuing):', error)
            })
          } catch (e) {
            console.warn('⚠️ Full insights generation failed (continuing):', e)
          }
        } else {
          try {
            console.log('🚀 Priming insights QUICK cache for user:', user.id)
            const quickPriming = precomputeQuickSectionsForUser(user.id, { concurrency: 4 })
            await Promise.race([
              quickPriming.then(() => 'done'),
              new Promise((resolve) => setTimeout(() => resolve('timeout'), 6500)),
            ])
            console.log('✅ Quick cache priming finished or timed out (<=6.5s)')
          } catch (e) {
            console.warn('⚠️ Quick cache priming failed (continuing):', e)
          }
          try {
            precomputeIssueSectionsForUser(user.id, { concurrency: 4 }).catch(() => {})
          } catch {}
        }

        if (!isFullOnboarding && changedTypes.length > 0) {
          try {
            console.log('🚀 Generating ALL insights after health data update for user:', user.id)
            precomputeIssueSectionsForUser(user.id, { concurrency: 4 }).catch((error) => {
              console.warn('⚠️ Failed to generate insights after health data update:', error)
            })
            console.log(`🔄 Triggered full insights generation after health data changes: ${changedTypes.join(', ')}`)
          } catch (error) {
            console.warn('⚠️ Error triggering insights generation:', error)
          }
        }
      } else if (insightsUpdateRequired) {
        console.log('⏸️ Insights auto-generation skipped (disabled via ENABLE_INSIGHTS_BACKGROUND_REGEN)', {
          userId: user.id,
          isFullOnboarding,
          changedTypes
        })
      }
    }

    // 🔍 FINAL PERFORMANCE MEASUREMENT
    const totalApiTime = Date.now() - apiStartTime
    console.timeEnd('⏱️ Total API Processing Time')
    console.log('📊 API PERFORMANCE SUMMARY:', {
      totalProcessingTime: totalApiTime + 'ms',
      userId: user.id,
      email: userEmail,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json({ 
      success: true, 
      message: 'Data saved successfully',
      insightsUpdateRequired,
      insightsAutoGenerationEnabled: insightsAutoEnabled,
      debug: {
        userId: user.id,
        email: userEmail,
        timestamp: new Date().toISOString(),
        processingTime: totalApiTime + 'ms'
      }
    })
    
  } catch (error) {
    console.error('CRITICAL ERROR in POST /api/user-data:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available')
    
    return NextResponse.json({ 
      error: 'Failed to save data', 
      debug: {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Get NextAuth session
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.log('DELETE Authentication failed - no valid session found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const userEmail = session.user.email
    console.log('DELETE /api/user-data - NextAuth session found for:', userEmail)

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete all user-related data
    await prisma.healthGoal.deleteMany({
      where: { userId: user.id }
    })
    
    await prisma.supplement.deleteMany({
      where: { userId: user.id }
    })
    
    await prisma.medication.deleteMany({
      where: { userId: user.id }
    })

    // Reset user profile data
    await prisma.user.update({
      where: { id: user.id },
      data: {
        gender: null,
        weight: null,
        height: null,
        bodyType: null
      }
    })

    console.log('Successfully deleted all user data for:', userEmail)
    return NextResponse.json({ success: true, message: 'All data deleted successfully' })
  } catch (error) {
    console.error('Error deleting user data:', error)
    return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 })
  }
} 
