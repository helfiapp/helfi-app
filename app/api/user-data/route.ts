import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.log('GET Authentication failed - no session or email:', { session: !!session, email: session?.user?.email })
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    console.log('GET /api/user-data - Authenticated user:', session.user.email)

    // Get user data by email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
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
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.log('POST Authentication failed - no session or email:', { session: !!session, email: session?.user?.email })
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    console.log('POST /api/user-data - Authenticated user:', session.user.email)

    const data = await request.json()
    console.log('POST /api/user-data - Data received:', Object.keys(data))

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
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

    return NextResponse.json({ success: true, message: 'Data saved successfully' })
  } catch (error) {
    console.error('Error saving user data:', error)
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      console.log('DELETE Authentication failed - no session or email:', { session: !!session, email: session?.user?.email })
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    console.log('DELETE /api/user-data - Authenticated user:', session.user.email)

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
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

    console.log('Successfully deleted all user data for:', session.user.email)
    return NextResponse.json({ success: true, message: 'All data deleted successfully' })
  } catch (error) {
    console.error('Error deleting user data:', error)
    return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 })
  }
} 