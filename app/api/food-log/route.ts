import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'

// Fetch logs for a specific date (YYYY-MM-DD)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') // YYYY-MM-DD (local date)
    const tzOffsetMinRaw = searchParams.get('tz') // minutes: same as new Date().getTimezoneOffset()
    if (!dateStr) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build a UTC window that corresponds to the user's local day
    // tz is minutes difference between local time and UTC (Date.getTimezoneOffset()).
    // To get the correct UTC window for the local date, we ADD the offset.
    const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
    const tzMin = Number.isFinite(parseInt(tzOffsetMinRaw || ''))
      ? parseInt(tzOffsetMinRaw || '0', 10)
      : 0
    const startUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0) + tzMin * 60 * 1000
    const endUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999) + tzMin * 60 * 1000
    const start = new Date(startUtcMs)
    const end = new Date(endUtcMs)

    // Prefer the explicit localDate column when present so entries never drift to the wrong day.
    // For older rows that predate localDate, fall back to the createdAt time-window.
    const logs = await prisma.foodLog.findMany({
      where: {
        userId: user.id,
        OR: [
          { localDate: dateStr },
          {
            localDate: null,
            createdAt: { gte: start, lte: end },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, logs })
  } catch (error) {
    console.error('GET /api/food-log error', error)
    return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 })
  }
}

// Append a log entry (non-blocking usage recommended)
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let userId: string | null = null
  let userEmail: string | null = null
  
  try {
    console.log('📥 POST /api/food-log - Request received')
    
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      console.error('❌ POST /api/food-log - Authentication failed: no session or email')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    userEmail = session.user.email
    console.log('✅ POST /api/food-log - Authenticated user:', userEmail)
    
    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) {
      console.error('❌ POST /api/food-log - User not found:', userEmail)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    
    userId = user.id
    console.log('✅ POST /api/food-log - Found user:', { userId, email: userEmail })

    const body = await request.json()
    const { description, nutrition, imageUrl, items, localDate } = body || {}
    
    // Validate and normalize localDate - must be YYYY-MM-DD format
    let normalizedLocalDate: string | null = null
    if (localDate && typeof localDate === 'string' && localDate.length >= 8) {
      // Check if it matches YYYY-MM-DD format
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (datePattern.test(localDate)) {
        normalizedLocalDate = localDate
      } else {
        console.warn('⚠️ POST /api/food-log - Invalid localDate format, attempting to parse:', localDate)
        // Try to parse and reformat
        try {
          const parsed = new Date(localDate)
          if (!isNaN(parsed.getTime())) {
            const y = parsed.getFullYear()
            const m = String(parsed.getMonth() + 1).padStart(2, '0')
            const d = String(parsed.getDate()).padStart(2, '0')
            normalizedLocalDate = `${y}-${m}-${d}`
            console.log('✅ POST /api/food-log - Normalized localDate:', normalizedLocalDate)
          }
        } catch (e) {
          console.error('❌ POST /api/food-log - Failed to parse localDate:', localDate, e)
        }
      }
    }
    
    if (!normalizedLocalDate) {
      console.warn('⚠️ POST /api/food-log - No valid localDate provided, entry will not be queryable by date:', {
        providedLocalDate: localDate,
        type: typeof localDate,
      })
    }
    
    console.log('📦 POST /api/food-log - Request body:', {
      hasDescription: !!description,
      descriptionLength: description?.toString().length || 0,
      descriptionPreview: description?.toString().substring(0, 100) || '',
      hasNutrition: !!nutrition,
      hasImageUrl: !!imageUrl,
      hasItems: Array.isArray(items) && items.length > 0,
      itemCount: Array.isArray(items) ? items.length : 0,
      providedLocalDate: localDate || 'MISSING',
      normalizedLocalDate: normalizedLocalDate || 'NULL',
      localDateType: typeof localDate,
    })
    
    const name = (description || '')
      .toString()
      .split('\n')[0]
      .split('Calories:')[0]
      .split(',')[0]
      .split('.')[0]
      .trim() || 'Food item'

    console.log('💾 POST /api/food-log - Creating FoodLog entry:', {
      userId,
      name,
      localDate: normalizedLocalDate,
      hasDescription: !!description,
      hasNutrition: !!nutrition,
      hasImageUrl: !!imageUrl,
      hasItems: Array.isArray(items) && items.length > 0,
    })

    const created = await prisma.foodLog.create({
      data: {
        userId: user.id,
        name,
        description: description || null,
        imageUrl: imageUrl || null,
        nutrients: nutrition || null,
        items: items || null,
        localDate: normalizedLocalDate,
      },
    })

    const duration = Date.now() - startTime
    console.log('✅ POST /api/food-log - Successfully created FoodLog entry:', {
      foodLogId: created.id,
      userId,
      localDate: created.localDate,
      createdAt: created.createdAt.toISOString(),
      durationMs: duration,
    })

    // Trigger background regeneration of nutrition insights
    // This happens asynchronously - user doesn't wait
    triggerBackgroundRegeneration({
      userId: user.id,
      changeType: 'food',
      timestamp: new Date(),
    }).catch((error) => {
      console.warn('⚠️ Failed to trigger nutrition insights regeneration', error)
    })

    console.log('🔄 Triggered background regeneration for nutrition insights')

    return NextResponse.json({ success: true, id: created.id })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('❌ POST /api/food-log - Error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      userEmail,
      durationMs: duration,
    })
    
    // Provide more detailed error information
    if (error instanceof Error) {
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    }
    
    return NextResponse.json({ 
      error: 'Failed to save log',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

// Legacy DELETE handler kept for compatibility with older clients
// Newer clients can use POST /api/food-log/delete, but both share the same logic.
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as any))
    const id = String((body as any)?.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Ensure the log belongs to the user
    const existing = await prisma.foodLog.findUnique({ where: { id: id as any } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.foodLog.delete({ where: { id: id as any } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/food-log error', error)
    return NextResponse.json({ error: 'Failed to delete log' }, { status: 500 })
  }
}

