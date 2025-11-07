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
      if (plan === 'premium') {
        where.subscription = {
          plan: 'PREMIUM'
        }
      } else if (plan === 'non-subscribed') {
        where.subscription = null
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
        subscription: { select: { plan: true, monthlyPriceCents: true, endDate: true, startDate: true } },
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
        // Create or update subscription to PREMIUM (defaults to $20 tier)
        await prisma.subscription.upsert({
          where: { userId },
          update: { 
            plan: 'PREMIUM',
            monthlyPriceCents: 2000 // Default to $20 tier
          },
          create: { 
            userId, 
            plan: 'PREMIUM',
            monthlyPriceCents: 2000
          }
        })
        // Update daily credits for premium
        await prisma.user.update({
          where: { id: userId },
          data: { dailyAnalysisCredits: 30 }
        })
        break

      case 'grant_subscription':
        // Grant subscription with specific tier ($20, $30, or $50)
        const tier = data?.tier // '20', '30', or '50'
        const priceCentsMap: Record<string, number> = {
          '20': 2000,
          '30': 3000,
          '50': 5000
        }
        const priceCents = priceCentsMap[tier || '20'] || 2000
        
        await prisma.subscription.upsert({
          where: { userId },
          update: { 
            plan: 'PREMIUM',
            monthlyPriceCents: priceCents
          },
          create: { 
            userId, 
            plan: 'PREMIUM',
            monthlyPriceCents: priceCents
          }
        })
        // Update daily credits for premium
        await prisma.user.update({
          where: { id: userId },
          data: { dailyAnalysisCredits: 30 }
        })
        break

      case 'deactivate':
        // Remove subscription (delete subscription record)
        await prisma.subscription.delete({
          where: { userId }
        }).catch(() => {
          // Ignore if subscription doesn't exist
        })
        break

      case 'grant_free_access':
        // Grant permanent PREMIUM subscription (admin-only) - defaults to $20 tier
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 100) // 100 years = permanent
        
        await prisma.subscription.upsert({
          where: { userId },
          update: { 
            plan: 'PREMIUM',
            endDate: endDate,
            monthlyPriceCents: 2000 // Default to $20 tier
          },
          create: { 
            userId, 
            plan: 'PREMIUM',
            endDate: endDate,
            monthlyPriceCents: 2000
          }
        })
        break

      case 'grant_trial':
        // Grant temporary PREMIUM subscription (admin-only)
        const trialDays = data?.trialDays || 30
        const trialEndDate = new Date()
        trialEndDate.setDate(trialEndDate.getDate() + trialDays)
        
        // For 7-day trials, grant 250 credits ($5 tier = 500 cents, 50% = 250 credits)
        // For 30-day trials, grant 1,000 credits ($20 tier = 2000 cents, 50% = 1,000 credits)
        const monthlyPriceCents = trialDays === 7 ? 500 : 2000
        
        await prisma.subscription.upsert({
          where: { userId },
          update: { 
            plan: 'PREMIUM',
            endDate: trialEndDate,
            monthlyPriceCents: monthlyPriceCents
          },
          create: { 
            userId, 
            plan: 'PREMIUM',
            endDate: trialEndDate,
            monthlyPriceCents: monthlyPriceCents
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
        // Add credits using wallet-based system (CreditTopUp)
        // Credit packages: 250 credits ($5), 500 credits ($10), 1000 credits ($20)
        const creditPackage = data?.creditPackage // e.g., '250', '500', '1000'
        
        if (creditPackage) {
          // Map credit package names to dollar amounts in cents
          // $5 = 500 cents, $10 = 1000 cents, $20 = 2000 cents
          const packageMap: Record<string, number> = {
            '250': 500,    // $5 worth = 500 cents
            '500': 1000,   // $10 worth = 1000 cents
            '1000': 2000   // $20 worth = 2000 cents
          }
          
          const centsAmount = packageMap[creditPackage]
          if (centsAmount) {
            const expiresAt = new Date()
            expiresAt.setMonth(expiresAt.getMonth() + 12) // Credits valid for 12 months
            
            await prisma.creditTopUp.create({
              data: {
                userId,
                amountCents: centsAmount,
                usedCents: 0,
                expiresAt,
                source: `admin_grant_${creditPackage}_credits`
              }
            })
          } else {
            return NextResponse.json({ error: 'Invalid credit package. Use: 250, 500, or 1000' }, { status: 400 })
          }
        } else {
          // Allow direct cents amount for custom grants
          const creditAmountCents = data?.creditAmountCents || 0
          if (creditAmountCents > 0) {
            const expiresAt = new Date()
            expiresAt.setMonth(expiresAt.getMonth() + 12)
            
            await prisma.creditTopUp.create({
              data: {
                userId,
                amountCents: creditAmountCents,
                usedCents: 0,
                expiresAt,
                source: 'admin_grant_direct'
              }
            })
          } else {
            return NextResponse.json({ error: 'Invalid credit amount or package' }, { status: 400 })
          }
        }
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to manage user'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
} 