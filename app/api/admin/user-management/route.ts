import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const authHeader = request.headers.get('authorization')
    if (authHeader !== 'Bearer Helfi@Admin2024!Secure$9x') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || 'all'
    const plan = searchParams.get('plan') || 'all'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Build filter conditions
    const where: any = {}
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (plan !== 'all') {
      where.subscription = {
        plan: plan.toUpperCase()
      }
    }

    // Get total count for pagination
    const totalUsers = await prisma.user.count({ where })

    // Get users with pagination
    const users = await prisma.user.findMany({
      where,
      include: {
        subscription: true,
        _count: {
          select: {
            healthGoals: true,
            supplements: true,
            medications: true,
            foodLogs: true,
            exerciseLogs: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit)
      }
    })

  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const authHeader = request.headers.get('authorization')
    if (authHeader !== 'Bearer Helfi@Admin2024!Secure$9x') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, userId, data } = body

    switch (action) {
      case 'activate':
        // Create or update subscription to PREMIUM
        await prisma.subscription.upsert({
          where: { userId },
          update: { plan: 'PREMIUM' },
          create: { userId, plan: 'PREMIUM' }
        })
        break

      case 'deactivate':
        // Update subscription to FREE
        await prisma.subscription.upsert({
          where: { userId },
          update: { plan: 'FREE' },
          create: { userId, plan: 'FREE' }
        })
        break

      case 'grant_free_access':
        // Grant permanent free premium access (we'll use a special flag or extended date)
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 100) // 100 years = permanent
        
        await prisma.subscription.upsert({
          where: { userId },
          update: { 
            plan: 'PREMIUM',
            endDate: endDate
          },
          create: { 
            userId, 
            plan: 'PREMIUM',
            endDate: endDate
          }
        })
        break

      case 'grant_trial':
        // Grant trial access (default 30 days)
        const trialDays = data?.trialDays || 30
        const trialEndDate = new Date()
        trialEndDate.setDate(trialEndDate.getDate() + trialDays)
        
        await prisma.subscription.upsert({
          where: { userId },
          update: { 
            plan: 'PREMIUM',
            endDate: trialEndDate
          },
          create: { 
            userId, 
            plan: 'PREMIUM',
            endDate: trialEndDate
          }
        })
        break

      case 'update_profile':
        // Update user profile information
        await prisma.user.update({
          where: { id: userId },
          data: {
            name: data.name,
            email: data.email,
            gender: data.gender,
            weight: data.weight,
            height: data.height
          }
        })
        break

      case 'delete_user':
        // Delete user and all related data (cascading)
        await prisma.user.delete({
          where: { id: userId }
        })
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: `User ${action} completed successfully` })

  } catch (error) {
    console.error('Error managing user:', error)
    return NextResponse.json({ error: 'Failed to manage user' }, { status: 500 })
  }
} 