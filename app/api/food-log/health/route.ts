import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Health check endpoint to quickly verify food diary consistency for the
// authenticated user. Returns counts of FoodLog rows for a date, todaysFoods
// snapshot length, favorites length, and a short list of recent FoodLog entries.
// Usage: GET /api/food-log/health?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  let userEmail: string | null = null
  try {
    let session = await getServerSession(authOptions)
    userEmail = session?.user?.email ?? null
    let usedTokenFallback = false

    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
          usedTokenFallback = true
        }
      } catch (tokenError) {
        console.error('food-log health JWT fallback failed', tokenError)
      }
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') || ''
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const targetDate = datePattern.test(dateStr) ? dateStr : null

    // Pull favorites count
    let favoritesCount = 0
    try {
      const favGoal = await prisma.healthGoal.findFirst({
        where: { userId: user.id, name: '__FOOD_FAVORITES__' },
      })
      if (favGoal?.category) {
        const parsed = JSON.parse(favGoal.category)
        const favs = Array.isArray(parsed?.favorites) ? parsed.favorites : Array.isArray(parsed) ? parsed : []
        favoritesCount = favs.length
      }
    } catch (favErr) {
      console.warn('health check: failed to load favorites', favErr)
    }

    // Pull todaysFoods snapshot count
    let todaysFoodsCount = 0
    try {
      const tfGoal = await prisma.healthGoal.findFirst({
        where: { userId: user.id, name: '__TODAYS_FOODS_DATA__' },
      })
      if (tfGoal?.category) {
        const parsed = JSON.parse(tfGoal.category)
        const foods = Array.isArray(parsed?.foods) ? parsed.foods : []
        todaysFoodsCount = foods.length
      }
    } catch (tfErr) {
      console.warn('health check: failed to load todaysFoods snapshot', tfErr)
    }

    let foodLogCount = 0
    if (targetDate) {
      foodLogCount = await prisma.foodLog.count({
        where: { userId: user.id, localDate: targetDate },
      })
    }

    // Recent entries (regardless of date) for quick inspection
    const recent = await prisma.foodLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        localDate: true,
        createdAt: true,
        description: true,
        meal: true,
        category: true,
      },
    })

    return NextResponse.json({
      ok: true,
      userId: user.id,
      email: userEmail,
      date: targetDate,
      counts: {
        favorites: favoritesCount,
        todaysFoodsSnapshot: todaysFoodsCount,
        foodLogForDate: foodLogCount,
      },
      recent,
    })
  } catch (error) {
    console.error('food-log health check failed', error)
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
