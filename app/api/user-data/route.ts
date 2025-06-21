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

    // Get exercise data from either new fields or JSON fallback
    let exerciseData = { exerciseFrequency: null, exerciseTypes: [] };
    
    // Try to get from new database fields first
    if ((user as any).exerciseFrequency || (user as any).exerciseTypes) {
      exerciseData = {
        exerciseFrequency: (user as any).exerciseFrequency || null,
        exerciseTypes: (user as any).exerciseTypes || []
      };
    } else {
      // Fallback: check if exercise data is stored in existing user notes field or similar
      try {
        const storedExercise = user.healthGoals.find((goal: any) => goal.name === '__EXERCISE_DATA__');
        if (storedExercise && storedExercise.category) {
          const parsed = JSON.parse(storedExercise.category);
          exerciseData = {
            exerciseFrequency: parsed.exerciseFrequency || null,
            exerciseTypes: parsed.exerciseTypes || []
          };
        }
      } catch (e) {
        console.log('No exercise data found in fallback storage');
      }
    }

    // Transform to onboarding format
    const onboardingData = {
      gender: user.gender?.toLowerCase(),
      weight: user.weight?.toString(),
      height: user.height?.toString(),
      bodyType: user.bodyType?.toLowerCase(),
      exerciseFrequency: exerciseData.exerciseFrequency,
      exerciseTypes: exerciseData.exerciseTypes,
      goals: user.healthGoals.filter((goal: any) => goal.name !== '__EXERCISE_DATA__').map((goal: any) => goal.name),
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

    return NextResponse.json({ data: onboardingData })
  } catch (error) {
    console.error('Error loading user data:', error)
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/user-data - Starting request processing...')
    
    // Get NextAuth session - App Router automatically handles request context
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.log('POST Authentication failed - no valid session found')
      console.log('Session:', session)
      console.log('Request headers:', Object.fromEntries(request.headers.entries()))
      console.log('Cookies:', request.headers.get('cookie'))
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const userEmail = session.user.email
    console.log('POST /api/user-data - NextAuth session found for:', userEmail)

    const data = await request.json()
    console.log('POST /api/user-data - Data received:', Object.keys(data))
    console.log('POST /api/user-data - Data size:', JSON.stringify(data).length, 'characters')

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: userEmail }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          name: userEmail.split('@')[0],
          image: null,
        }
      })
    }

    // Update user basic data - convert strings to enum values
    const updateData: any = {
      gender: data.gender ? data.gender.toUpperCase() : null,
      weight: data.weight ? parseFloat(data.weight) : null,
      height: data.height ? parseFloat(data.height) : null,
      bodyType: data.bodyType ? data.bodyType.toUpperCase() : null,
    }
    
    // Handle exercise data - try new fields first, fallback to JSON storage
    let exerciseStored = false;
    try {
      if (data.exerciseFrequency !== undefined) {
        updateData.exerciseFrequency = data.exerciseFrequency;
        exerciseStored = true;
      }
      if (data.exerciseTypes !== undefined) {
        updateData.exerciseTypes = data.exerciseTypes || [];
        exerciseStored = true;
      }
    } catch (error) {
      console.log('Exercise fields not yet available in database schema, using fallback storage');
    }

    // Use transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      // Update user basic data
      await tx.user.update({
        where: { id: user.id },
        data: updateData
      })

             // Handle exercise data storage - find and update pattern
       if (!exerciseStored && (data.exerciseFrequency !== undefined || data.exerciseTypes !== undefined)) {
         // Check if exercise data already exists
         const existingExerciseData = await tx.healthGoal.findFirst({
           where: {
             userId: user.id,
             name: '__EXERCISE_DATA__'
           }
         })
         
         const exerciseData = {
           userId: user.id,
           name: '__EXERCISE_DATA__',
           category: JSON.stringify({
             exerciseFrequency: data.exerciseFrequency,
             exerciseTypes: data.exerciseTypes || []
           }),
           currentRating: 0,
         }
         
         if (existingExerciseData) {
           await tx.healthGoal.update({
             where: { id: existingExerciseData.id },
             data: {
               category: exerciseData.category
             }
           })
         } else {
           await tx.healthGoal.create({
             data: exerciseData
           })
         }
       }

       // Handle health goals - find and create pattern
       if (data.goals && Array.isArray(data.goals) && data.goals.length > 0) {
         // Get existing goals to avoid duplicates
         const existingGoals = await tx.healthGoal.findMany({
           where: { 
             userId: user.id,
             name: { not: '__EXERCISE_DATA__' }
           }
         })
         
         // Delete goals that are no longer in the list
         const goalsToDelete = existingGoals.filter(goal => !data.goals.includes(goal.name))
         if (goalsToDelete.length > 0) {
           await tx.healthGoal.deleteMany({
             where: {
               id: { in: goalsToDelete.map(g => g.id) }
             }
           })
         }
         
         // Create new goals that don't exist yet
         for (const goalName of data.goals) {
           const exists = existingGoals.some(goal => goal.name === goalName)
           if (!exists) {
             await tx.healthGoal.create({
               data: {
                 userId: user.id,
                 name: goalName,
                 category: 'general',
                 currentRating: 5,
               }
             })
           }
         }
       }

      // Handle supplements - conservative approach
      if (data.supplements && Array.isArray(data.supplements)) {
        // Delete all existing supplements for clean slate
        await tx.supplement.deleteMany({
          where: { userId: user.id }
        })
        
        // Add new supplements if any
        if (data.supplements.length > 0) {
          for (const supp of data.supplements) {
            if (supp.name) { // Only create if has a name
              await tx.supplement.create({
                data: {
                  userId: user.id,
                  name: supp.name,
                  dosage: supp.dosage || '',
                  timing: Array.isArray(supp.timing) ? supp.timing : [supp.timing || 'morning'],
                }
              })
            }
          }
        }
      }

      // Handle medications - conservative approach
      if (data.medications && Array.isArray(data.medications)) {
        // Delete all existing medications for clean slate
        await tx.medication.deleteMany({
          where: { userId: user.id }
        })
        
        // Add new medications if any
        if (data.medications.length > 0) {
          for (const med of data.medications) {
            if (med.name) { // Only create if has a name
              await tx.medication.create({
                data: {
                  userId: user.id,
                  name: med.name,
                  dosage: med.dosage || '',
                  timing: Array.isArray(med.timing) ? med.timing : [med.timing || 'morning'],
                }
              })
            }
          }
        }
      }
    })

    console.log('POST /api/user-data - Successfully saved all data')
    return NextResponse.json({ success: true, message: 'Data saved successfully' })
  } catch (error) {
    console.error('Error saving user data:', error)
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 500) : 'No stack'
    })
    return NextResponse.json({ 
      error: 'Database error occurred', 
      debug: error instanceof Error ? error.message : 'Unknown error'
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