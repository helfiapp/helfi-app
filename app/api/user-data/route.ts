import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Get NextAuth session - App Router automatically handles request context
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.log('GET Authentication failed - no valid session found')
      console.log('Session:', session)
      console.log('Request headers:', Object.fromEntries(request.headers.entries()))
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const userEmail = session.user.email
    console.log('GET /api/user-data - NextAuth session found for:', userEmail)

    // Get user data by email
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        healthGoals: true,
        supplements: true,
        medications: true,
      }
    })

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
      medicationsCount: user.medications.length
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

    // Transform to onboarding format
    const onboardingData = {
      gender: user.gender?.toLowerCase() || '',
      weight: user.weight?.toString() || '',
      height: user.height?.toString() || '',
      bodyType: user.bodyType?.toLowerCase() || '',
      exerciseFrequency: exerciseData.exerciseFrequency || '',
      exerciseTypes: exerciseData.exerciseTypes || [],
      goals: user.healthGoals.filter((goal: any) => !goal.name.startsWith('__')).map((goal: any) => goal.name),
      healthSituations: healthSituationsData,
      bloodResults: bloodResultsData,
      supplements: user.supplements.map((supp: any) => ({
        name: supp.name,
        dosage: supp.dosage,
        timing: supp.timing
      })),
      medications: user.medications.map((med: any) => ({
        name: med.name,
        dosage: med.dosage,
        timing: med.timing
      }))
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
      medicationsCount: onboardingData.medications.length
    })

    return NextResponse.json({ data: onboardingData })
  } catch (error) {
    console.error('Error loading user data:', error)
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/user-data - Starting SIMPLIFIED approach...')
    
    // Get NextAuth session
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.log('POST Authentication failed - no valid session found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const userEmail = session.user.email
    console.log('POST /api/user-data - Authenticated user:', userEmail)

    const data = await request.json()
    console.log('POST /api/user-data - Data received:', {
      hasGender: !!data.gender,
      hasWeight: !!data.weight,
      hasHeight: !!data.height,
      hasBodyType: !!data.bodyType,
      hasGoals: !!data.goals,
      hasSupplements: !!data.supplements,
      hasMedications: !!data.medications,
      hasHealthSituations: !!data.healthSituations,
      hasBloodResults: !!data.bloodResults,
      hasExercise: !!(data.exerciseFrequency || data.exerciseTypes)
    })

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: userEmail }
    })

    if (!user) {
      console.log('Creating new user for:', userEmail)
      user = await prisma.user.create({
        data: {
          email: userEmail,
          name: userEmail.split('@')[0],
        }
      })
    }

    console.log('Found/created user with ID:', user.id)

    // SIMPLIFIED APPROACH: Update each piece of data individually with proper error handling
    // This avoids complex transactions that were causing constraint violations

    // 1. Update basic user data with safe enum handling
    try {
      const updateData: any = {}
      
      if (data.gender) {
        updateData.gender = data.gender.toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE'
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

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updateData
        })
        console.log('Updated user basic data successfully:', updateData)
      } else {
        console.log('No user basic data to update')
      }
    } catch (error) {
      console.error('Error updating user basic data:', error)
      // Continue with other updates even if this fails
    }

    // 2. Handle health goals - simple upsert approach
    try {
      if (data.goals && Array.isArray(data.goals) && data.goals.length > 0) {
        // Delete existing non-special goals
        await prisma.healthGoal.deleteMany({
          where: { 
            userId: user.id,
            name: { notIn: ['__EXERCISE_DATA__', '__HEALTH_SITUATIONS_DATA__'] }
          }
        })
        
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
        console.log('Updated health goals successfully')
      }
    } catch (error) {
      console.error('Error updating health goals:', error)
      // Continue with other updates
    }

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

    // 4. Handle supplements - simple replace approach
    try {
      if (data.supplements && Array.isArray(data.supplements)) {
        // Delete existing supplements
        await prisma.supplement.deleteMany({
          where: { userId: user.id }
        })
        
        // Create new supplements
        for (const supp of data.supplements) {
          if (supp.name && typeof supp.name === 'string') {
            await prisma.supplement.create({
              data: {
                userId: user.id,
                name: supp.name,
                dosage: supp.dosage || '',
                timing: Array.isArray(supp.timing) ? supp.timing : [supp.timing || 'morning'],
              }
            })
          }
        }
        console.log('Updated supplements successfully')
      }
    } catch (error) {
      console.error('Error updating supplements:', error)
      // Continue with other updates
    }

    // 5. Handle medications - simple replace approach  
    try {
      if (data.medications && Array.isArray(data.medications)) {
        // Delete existing medications
        await prisma.medication.deleteMany({
          where: { userId: user.id }
        })
        
        // Create new medications
        for (const med of data.medications) {
          if (med.name && typeof med.name === 'string') {
            await prisma.medication.create({
              data: {
                userId: user.id,
                name: med.name,
                dosage: med.dosage || '',
                timing: Array.isArray(med.timing) ? med.timing : [med.timing || 'morning'],
              }
            })
          }
        }
        console.log('Updated medications successfully')
      }
    } catch (error) {
      console.error('Error updating medications:', error)
      // Continue with other updates
    }

    console.log('POST /api/user-data - All updates completed successfully')
    return NextResponse.json({ 
      success: true, 
      message: 'Data saved successfully',
      debug: {
        userId: user.id,
        email: userEmail,
        timestamp: new Date().toISOString()
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