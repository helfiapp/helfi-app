import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { CreditManager } from '@/lib/credit-system'

export async function GET(request: NextRequest) {
  try {
    // JWT authentication check (with temporary token support)
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
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
    let totalUsers = 0
    try {
      totalUsers = await prisma.user.count({ where })
    } catch (e) {
      console.error('User count failed, returning 0:', e)
      totalUsers = 0
    }

    // Get users with pagination
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        gender: true,
        subscription: { select: { plan: true } },
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
    // JWT authentication check (with temporary token support)
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
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
        // Update daily credits for premium
        await prisma.user.update({
          where: { id: userId },
          data: { dailyAnalysisCredits: 30 }
        })
        break

      case 'deactivate':
        // Update subscription to FREE
        await prisma.subscription.upsert({
          where: { userId },
          update: { plan: 'FREE' },
          create: { userId, plan: 'FREE' }
        })
        // Update daily credits for free
        await prisma.user.update({
          where: { id: userId },
          data: { dailyAnalysisCredits: 3 }
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

      case 'add_credits':
        // Add additional credits to user account using new credit system
        const creditAmount = data?.creditAmount || 0
        if (creditAmount <= 0) {
          return NextResponse.json({ error: 'Invalid credit amount' }, { status: 400 })
        }
        await CreditManager.addCredits(userId, creditAmount)
        break

      case 'reset_daily_quota':
        // Reset daily analysis quota using new credit system
        await CreditManager.resetDailyQuota(userId)
        break

      case 'view_credit_usage':
        // Get detailed credit usage information using new credit system
        const creditUsage = await CreditManager.getCreditUsage(userId)
        return NextResponse.json({ success: true, creditUsage })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: `User ${action} completed successfully` })

  } catch (error) {
    console.error('Error managing user:', error)
    return NextResponse.json({ error: 'Failed to manage user' }, { status: 500 })
  }
} 