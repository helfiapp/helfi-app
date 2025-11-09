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
        dailyAnalysisCredits: true,
        dailyAnalysisUsed: true,
        additionalCredits: true,
        totalAnalysisCount: true,
        dailyFoodAnalysisUsed: true,
        dailyInteractionAnalysisUsed: true,
        subscription: { select: { plan: true, monthlyPriceCents: true, endDate: true, startDate: true } },
        creditTopUps: {
          where: {
            expiresAt: { gt: new Date() }
          },
          select: {
            amountCents: true,
            usedCents: true,
            expiresAt: true
          }
        },
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
    
    // Calculate total available credits from CreditTopUp records
    const usersWithCredits = users.map(user => {
      const now = new Date()
      const availableCredits = user.creditTopUps
        .filter(topUp => topUp.expiresAt > now)
        .reduce((sum, topUp) => sum + Math.max(0, topUp.amountCents - topUp.usedCents), 0)
      
      return {
        ...user,
        totalAvailableCredits: availableCredits // Total in cents (which equals credits)
      }
    })

    return NextResponse.json({
      users: usersWithCredits,
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
        
        // Check if subscription already exists and if tier is changing
        const existingSub = await prisma.subscription.findUnique({
          where: { userId }
        })
        
        // If tier is changing, reset startDate to start new billing cycle
        const shouldResetStartDate = existingSub && existingSub.monthlyPriceCents !== priceCents
        
        const newStartDate = shouldResetStartDate || !existingSub ? new Date() : existingSub.startDate
        
        await prisma.subscription.upsert({
          where: { userId },
          update: { 
            plan: 'PREMIUM',
            monthlyPriceCents: priceCents,
            // Reset startDate if tier changed or if subscription didn't exist
            startDate: newStartDate
          },
          create: { 
            userId, 
            plan: 'PREMIUM',
            monthlyPriceCents: priceCents,
            startDate: newStartDate
          }
        })
        
        // Reset monthly counters and wallet when starting new subscription cycle
        if (shouldResetStartDate || !existingSub) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              dailyAnalysisCredits: 30,
              walletMonthlyUsedCents: 0,
              walletMonthlyResetAt: newStartDate,
              monthlySymptomAnalysisUsed: 0,
              monthlyFoodAnalysisUsed: 0,
              monthlyMedicalImageAnalysisUsed: 0,
              monthlyInteractionAnalysisUsed: 0,
            } as any
          })
        } else {
          // Just update daily credits if not resetting
          await prisma.user.update({
            where: { id: userId },
            data: { dailyAnalysisCredits: 30 }
          })
        }
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
        // Credits = cents (1 credit = 1 cent)
        const creditPackage = data?.creditPackage // e.g., '250', '500', '1000'
        const creditAmount = data?.creditAmount // Direct credit amount
        
        let centsAmount = 0
        
        if (creditPackage) {
          // Credit packages: 250, 500, or 1000 credits (1 credit = 1 cent)
          const packageMap: Record<string, number> = {
            '250': 250,    // 250 credits = 250 cents
            '500': 500,    // 500 credits = 500 cents
            '1000': 1000   // 1000 credits = 1000 cents
          }
          
          centsAmount = packageMap[creditPackage]
          if (!centsAmount) {
            return NextResponse.json({ error: 'Invalid credit package. Use: 250, 500, or 1000' }, { status: 400 })
          }
        } else if (creditAmount && creditAmount > 0) {
          // Direct credit amount (credits = cents)
          centsAmount = creditAmount
        } else {
          return NextResponse.json({ error: 'Invalid credit amount or package. Provide creditPackage (250/500/1000) or creditAmount (number)' }, { status: 400 })
        }
        
        const expiresAt = new Date()
        expiresAt.setMonth(expiresAt.getMonth() + 12) // Credits valid for 12 months
        
        await prisma.creditTopUp.create({
          data: {
            userId,
            amountCents: centsAmount,
            usedCents: 0,
            expiresAt,
            source: creditPackage ? `admin_grant_${creditPackage}_credits` : `admin_grant_${creditAmount}_credits`
          }
        })
        break

      case 'remove_credits':
        // Remove credits by creating a negative top-up or marking existing top-ups as used
        const removeAmount = data?.creditAmount || 0
        if (removeAmount <= 0) {
          return NextResponse.json({ error: 'Invalid credit amount to remove' }, { status: 400 })
        }
        
        // Get all non-expired, unused top-ups
        const now = new Date()
        const topUps = await prisma.creditTopUp.findMany({
          where: {
            userId,
            expiresAt: { gt: now }
          },
          orderBy: { expiresAt: 'asc' } // FIFO - oldest first
        })
        
        let remainingToRemove = removeAmount
        for (const topUp of topUps) {
          if (remainingToRemove <= 0) break
          
          const available = topUp.amountCents - topUp.usedCents
          if (available > 0) {
            const toRemove = Math.min(remainingToRemove, available)
            await prisma.creditTopUp.update({
              where: { id: topUp.id },
              data: {
                usedCents: topUp.usedCents + toRemove
              }
            })
            remainingToRemove -= toRemove
          }
        }
        
        if (remainingToRemove > 0) {
          return NextResponse.json({ 
            error: `Only ${removeAmount - remainingToRemove} credits were available to remove. ${remainingToRemove} credits could not be removed.`,
            partial: true 
          }, { status: 200 }) // Still return 200 since some credits were removed
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