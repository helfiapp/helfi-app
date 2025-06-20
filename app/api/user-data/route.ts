import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    // Try custom session first, fallback to NextAuth
    let userEmail: string | null = null
    
    const customSession = await getSession(request)
    if (customSession?.email) {
      userEmail = customSession.email
      console.log('GET /api/user-data - Custom session found for:', userEmail)
    } else {
      const nextAuthSession = await getServerSession(authOptions)
      if (nextAuthSession?.user?.email) {
        userEmail = nextAuthSession.user.email
        console.log('GET /api/user-data - NextAuth session found for:', userEmail)
      }
    }
    
    if (!userEmail) {
      console.log('GET Authentication failed - no valid session found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

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
    
    // Try custom session first, fallback to NextAuth
    let userEmail: string | null = null
    
    const customSession = await getSession(request)
    if (customSession?.email) {
      userEmail = customSession.email
      console.log('POST /api/user-data - Custom session found for:', userEmail)
    } else {
      const nextAuthSession = await getServerSession(authOptions)
      if (nextAuthSession?.user?.email) {
        userEmail = nextAuthSession.user.email
        console.log('POST /api/user-data - NextAuth session found for:', userEmail)
      }
    }
    
    if (!userEmail) {
      console.log('POST Authentication failed - no valid session found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

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

    // Update user basic data
    const updateData: any = {
      gender: data.gender?.toUpperCase(),
      weight: data.weight ? parseFloat(data.weight) : null,
      height: data.height ? parseFloat(data.height) : null,
      bodyType: data.bodyType?.toUpperCase(),
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

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    })

    // If exercise data couldn't be stored in new fields, store as JSON in healthGoals
    if (!exerciseStored && (data.exerciseFrequency || data.exerciseTypes)) {
      // Delete existing exercise data storage
      await prisma.healthGoal.deleteMany({
        where: { 
          userId: user.id,
          name: '__EXERCISE_DATA__'
        }
      })
      
      // Store exercise data as JSON in healthGoals table
      await prisma.healthGoal.create({
        data: {
          userId: user.id,
          name: '__EXERCISE_DATA__',
          category: JSON.stringify({
            exerciseFrequency: data.exerciseFrequency,
            exerciseTypes: data.exerciseTypes || []
          }),
          currentRating: 0,
        }
      })
    }

    // Update health goals
    if (data.goals && Array.isArray(data.goals)) {
      // Delete existing goals
      await prisma.healthGoal.deleteMany({
        where: { userId: user.id }
      })
      
      // Create new goals
      const goalData = data.goals.map((goalName: string) => ({
        userId: user.id,
        name: goalName,
        category: 'general',
        currentRating: 5, // Default rating
      }))
      
      await prisma.healthGoal.createMany({
        data: goalData
      })
    }

    // Update supplements
    if (data.supplements && Array.isArray(data.supplements)) {
      // Delete existing supplements
      await prisma.supplement.deleteMany({
        where: { userId: user.id }
      })
      
      // Create new supplements
      const suppData = data.supplements.map((supp: any) => ({
        userId: user.id,
        name: supp.name || '',
        dosage: supp.dosage || '',
        timing: Array.isArray(supp.timing) ? supp.timing : [supp.timing || 'morning'],
      }))
      
      await prisma.supplement.createMany({
        data: suppData
      })
    }

    // Update medications
    if (data.medications && Array.isArray(data.medications)) {
      // Delete existing medications
      await prisma.medication.deleteMany({
        where: { userId: user.id }
      })
      
      // Create new medications
      const medData = data.medications.map((med: any) => ({
        userId: user.id,
        name: med.name || '',
        dosage: med.dosage || '',
        timing: Array.isArray(med.timing) ? med.timing : [med.timing || 'morning'],
      }))
      
      await prisma.medication.createMany({
        data: medData
      })
    }

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
    // Try custom session first, fallback to NextAuth
    let userEmail: string | null = null
    
    const customSession = await getSession(request)
    if (customSession?.email) {
      userEmail = customSession.email
      console.log('DELETE /api/user-data - Custom session found for:', userEmail)
    } else {
      const nextAuthSession = await getServerSession(authOptions)
      if (nextAuthSession?.user?.email) {
        userEmail = nextAuthSession.user.email
        console.log('DELETE /api/user-data - NextAuth session found for:', userEmail)
      }
    }
    
    if (!userEmail) {
      console.log('DELETE Authentication failed - no valid session found')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

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