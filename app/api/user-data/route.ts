import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

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

    // Transform to onboarding format
    const onboardingData = {
      gender: user.gender?.toLowerCase(),
      weight: user.weight?.toString(),
      height: user.height?.toString(),
      bodyType: user.bodyType?.toLowerCase(),
      exerciseFrequency: user.exerciseFrequency,
      exerciseTypes: user.exerciseTypes || [],
      goals: user.healthGoals.map((goal: any) => goal.name),
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
    const session = await getServerSession()
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const data = await request.json()

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
    await prisma.user.update({
      where: { id: user.id },
      data: {
        gender: data.gender?.toUpperCase(),
        weight: data.weight ? parseFloat(data.weight) : null,
        height: data.height ? parseFloat(data.height) : null,
        bodyType: data.bodyType?.toUpperCase(),
        exerciseFrequency: data.exerciseFrequency,
        exerciseTypes: data.exerciseTypes || [],
      }
    })

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