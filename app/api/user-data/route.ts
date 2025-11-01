import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { precomputeIssueSectionsForUser } from '@/lib/insights/issue-engine'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'

export async function GET(request: NextRequest) {
  try {
    console.log('=== GET /api/user-data DEBUG START ===')
    console.log('Request URL:', request.url)
    console.log('Request headers:', Object.fromEntries(request.headers.entries()))
    
    // Get NextAuth session - App Router automatically handles request context
    const session = await getServerSession(authOptions)
    
    console.log('NextAuth session result:', session)
    console.log('Session user:', session?.user)
    console.log('Session user email:', session?.user?.email)
    
    if (!session?.user?.email) {
      console.log('GET Authentication failed - no valid session found')
      console.log('Session:', session)
      console.log('Request headers:', Object.fromEntries(request.headers.entries()))
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const userEmail = session.user.email
    console.log('GET /api/user-data - NextAuth session found for:', userEmail)

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
    let todaysFoods = [];
    try {
      const storedFoods = user.healthGoals.find((goal: any) => goal.name === '__TODAYS_FOODS_DATA__');
      if (storedFoods && storedFoods.category) {
        const parsed = JSON.parse(storedFoods.category);
        todaysFoods = parsed.foods || [];
      }
    } catch (e) {
      console.log('No todays foods data found in storage');
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
    } catch (e) {
      console.log('No profile info data found in storage');
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

    const onboardingData = {
      gender: user.gender?.toLowerCase() || '',
      weight: user.weight?.toString() || '',
      height: user.height?.toString() || '',
      bodyType: user.bodyType?.toLowerCase() || '',
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
        scheduleInfo: supp.scheduleInfo || 'Daily'
      })),
      medications: user.medications.map((med: any) => ({
        name: med.name,
        dosage: med.dosage,
        timing: med.timing,
        dateAdded: med.dateAdded || med.createdAt || new Date().toISOString(),
        method: med.method || 'manual',
        scheduleInfo: med.scheduleInfo || 'Daily'
      })),
      profileImage: user.image || null,
      todaysFoods: todaysFoods,
      profileInfo: profileInfoData,
      deviceInterest: deviceInterestData,
      termsAccepted: (user as any).termsAccepted === true
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
    const session = await getServerSession(authOptions)
    
    console.timeEnd('⏱️ Authentication Check')
    console.log('NextAuth session result:', session)
    console.log('Session user:', session?.user)
    console.log('Session user email:', session?.user?.email)
    
    if (!session?.user?.email) {
      console.timeEnd('⏱️ Total API Processing Time')
      console.log('❌ POST Authentication failed - no valid session found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const userEmail = session.user.email
    console.log('✅ POST /api/user-data - Authenticated user:', userEmail)

    console.time('⏱️ Parse Request Data')
    const data = await request.json()
    console.timeEnd('⏱️ Parse Request Data')
    
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
        
        // Delete existing non-special goals
        const deleteResult = await prisma.healthGoal.deleteMany({
          where: { 
            userId: user.id,
            name: { notIn: ['__EXERCISE_DATA__', '__HEALTH_SITUATIONS_DATA__', '__SELECTED_ISSUES__'] }
          }
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

      // Persist the canonical selected issue list separately for insights fallback
      await prisma.healthGoal.deleteMany({
        where: { userId: user.id, name: '__SELECTED_ISSUES__' },
      })
      await prisma.healthGoal.create({
        data: {
          userId: user.id,
          name: '__SELECTED_ISSUES__',
          category: JSON.stringify(Array.isArray(data.goals) ? data.goals : []),
          currentRating: 0,
        },
      })
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
        // Remove existing food data
        await prisma.healthGoal.deleteMany({
          where: {
            userId: user.id,
            name: '__TODAYS_FOODS_DATA__'
          }
        })
        
        // Store new food data
        await prisma.healthGoal.create({
          data: {
            userId: user.id,
            name: '__TODAYS_FOODS_DATA__',
            category: JSON.stringify({ foods: data.todaysFoods }),
            currentRating: 0,
          }
        })
        console.log('Stored todays foods data successfully')
      }
    } catch (error) {
      console.error('Error storing todays foods data:', error)
      // Continue with other updates
    }

    // 7. Handle profileInfo data from profile page - store as special health goal
    try {
      if (data.profileInfo) {
        console.log('POST /api/user-data - Handling profileInfo data:', data.profileInfo)
        
        // Update basic User fields if available in profileInfo
        const profileUpdateData: any = {}
        
        // Handle name concatenation
        if (data.profileInfo.firstName || data.profileInfo.lastName) {
          const firstName = data.profileInfo.firstName || ''
          const lastName = data.profileInfo.lastName || ''
          profileUpdateData.name = `${firstName} ${lastName}`.trim()
        }
        
        // Handle gender
        if (data.profileInfo.gender) {
          profileUpdateData.gender = data.profileInfo.gender.toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE'
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
            category: JSON.stringify(data.profileInfo),
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

    if (user?.id) {
      // NEW APPROACH: Event-driven regeneration based on what actually changed
      // Instead of regenerating everything, we trigger regeneration only for affected sections
      const changedTypes: Array<'supplements' | 'medications' | 'food' | 'exercise' | 'health_goals' | 'profile' | 'blood_results'> = []
      
      if (data.supplements) changedTypes.push('supplements')
      if (data.medications) changedTypes.push('medications')
      if (data.goals) changedTypes.push('health_goals')
      if (data.gender || data.weight || data.height || data.bodyType) changedTypes.push('profile')
      if (data.exerciseFrequency || data.exerciseTypes) changedTypes.push('exercise')
      if (data.bloodResults) changedTypes.push('blood_results')
      if (data.todaysFoods) changedTypes.push('food')

      // Trigger background regeneration for each changed data type
      // This is NON-BLOCKING - user doesn't wait
      for (const changeType of changedTypes) {
        triggerBackgroundRegeneration({
          userId: user.id,
          changeType,
          timestamp: new Date(),
        }).catch((error) => {
          console.warn(`⚠️ Failed to trigger regeneration for ${changeType}`, error)
        })
      }

      console.log(`🔄 Triggered background regeneration for: ${changedTypes.join(', ')}`)
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
