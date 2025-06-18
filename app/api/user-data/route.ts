import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET: Load user data from database
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        healthGoals: true,
        supplements: true,
        medications: true,
      }
    })

    if (!user) {
      return NextResponse.json({ data: null }, { status: 200 })
    }

    // Convert database user to onboarding data format
    const onboardingData = {
      gender: user.gender?.toLowerCase(),
      weight: user.weight?.toString(),
      height: user.height?.toString(),
      bodyType: user.bodyType?.toLowerCase(),
      goals: user.healthGoals.map(goal => goal.name),
      supplements: user.supplements.map(sup => ({
        name: sup.name,
        dosage: sup.dosage,
        timing: sup.timing
      })),
      medications: user.medications.map(med => ({
        name: med.name,
        dosage: med.dosage,
        timing: med.timing
      }))
    }

    return NextResponse.json({ data: onboardingData }, { status: 200 })
  } catch (error) {
    console.error('Error loading user data:', error)
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
  }
}

// POST: Save user data to database
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    console.log('Saving user data:', body)

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

    // Update user basic info
    const updateData: any = {}
    
    if (body.gender) updateData.gender = body.gender.toUpperCase()
    if (body.weight) updateData.weight = parseFloat(body.weight)
    if (body.height) updateData.height = parseFloat(body.height)
    if (body.bodyType) updateData.bodyType = body.bodyType.toUpperCase()

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData
      })
    }

    // Handle health goals
    if (body.goals && Array.isArray(body.goals)) {
      // Delete existing goals
      await prisma.healthGoal.deleteMany({
        where: { userId: user.id }
      })
      
      // Create new goals
      for (const goalName of body.goals) {
        if (goalName && typeof goalName === 'string') {
          await prisma.healthGoal.create({
            data: {
              userId: user.id,
              name: goalName,
              category: 'general',
              currentRating: 5
            }
          })
        }
      }
    }

    // Handle supplements
    if (body.supplements && Array.isArray(body.supplements)) {
      // Delete existing supplements
      await prisma.supplement.deleteMany({
        where: { userId: user.id }
      })
      
      // Create new supplements
      for (const sup of body.supplements) {
        if (sup?.name) {
          await prisma.supplement.create({
            data: {
              userId: user.id,
              name: sup.name,
              dosage: sup.dosage || '',
              timing: Array.isArray(sup.timing) ? sup.timing : [sup.timing || 'morning']
            }
          })
        }
      }
    }

    // Handle medications
    if (body.medications && Array.isArray(body.medications)) {
      // Delete existing medications
      await prisma.medication.deleteMany({
        where: { userId: user.id }
      })
      
      // Create new medications
      for (const med of body.medications) {
        if (med?.name) {
          await prisma.medication.create({
            data: {
              userId: user.id,
              name: med.name,
              dosage: med.dosage || '',
              timing: Array.isArray(med.timing) ? med.timing : [med.timing || 'morning']
            }
          })
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error saving user data:', error)
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 })
  }
} 