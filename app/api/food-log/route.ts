import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'

// Fetch logs for a specific date (YYYY-MM-DD)
export async function GET(request: NextRequest) {
  let dateStr: string | null = null;
  let tzOffsetMinRaw: string | null = null;
  let userEmail: string | null = null;
  
  try {
    console.log('📥 GET /api/food-log - Starting request handler');
    
    // Ensure localDate column exists (forward-compatible migration)
    // This prevents "column does not exist" errors if migration hasn't run
    // try {
    //   await prisma.$executeRawUnsafe('ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "localDate" TEXT')
    //   console.log('✅ GET /api/food-log - Verified localDate column exists');
    // } catch (migrationError) {
    //   // Safe to ignore if column already exists or other migration issues
    //   console.warn('⚠️ GET /api/food-log - localDate column check (safe to ignore if exists):', migrationError)
    // }
    
    console.log('🔐 GET /api/food-log - Getting session...');
    let session;
    try {
      session = await getServerSession(authOptions);
      userEmail = session?.user?.email ?? null;
      console.log('✅ GET /api/food-log - Session retrieved:', session ? 'authenticated' : 'not authenticated');
    } catch (sessionError) {
      console.error('❌ GET /api/food-log - Error getting session (will try JWT fallback):', sessionError);
    }

    // Fallback to reading JWT directly if getServerSession was unreliable (same pattern as /api/analyze-food)
    let usedTokenFallback = false;
    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        });
        if (token?.email) {
          userEmail = String(token.email);
          usedTokenFallback = true;
        }
      } catch (tokenError) {
        console.error('❌ GET /api/food-log - Error reading JWT token for auth fallback:', tokenError);
      }
    }

    if (!userEmail) {
      console.error('❌ GET /api/food-log - Authentication failed: no session or email (after JWT fallback)');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    dateStr = searchParams.get('date') // YYYY-MM-DD (local date)
    tzOffsetMinRaw = searchParams.get('tz') // minutes: same as new Date().getTimezoneOffset()
    console.log(`📥 GET /api/food-log - Request: date=${dateStr}, tz=${tzOffsetMinRaw}, user=${userEmail}`);
    
    if (!dateStr) {
      console.error('❌ GET /api/food-log - Missing date parameter');
      return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    }

    // At this point, dateStr is guaranteed to be non-null
    const validatedDateStr: string = dateStr;

    // Validate date format (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(validatedDateStr)) {
      console.error(`❌ GET /api/food-log - Invalid date format: ${validatedDateStr}`);
      return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD' }, { status: 400 })
    }

    console.log('👤 GET /api/food-log - Looking up user:', userEmail);
    let user;
    try {
      user = await prisma.user.findUnique({ where: { email: userEmail } });
      console.log('✅ GET /api/food-log - User lookup result:', user ? 'found' : 'not found');
    } catch (userError) {
      console.error('❌ GET /api/food-log - Error looking up user:', userError);
      return NextResponse.json({ 
        error: 'Database error',
        details: userError instanceof Error ? userError.message : String(userError)
      }, { status: 500 })
    }
    
    if (!user) {
      console.error(`❌ GET /api/food-log - User not found: ${userEmail}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build a UTC window that corresponds to the user's local day
    // tz is minutes difference between local time and UTC (Date.getTimezoneOffset()).
    // To get the correct UTC window for the local date, we ADD the offset.
    const [y, m, d] = validatedDateStr.split('-').map((v) => parseInt(v, 10))
    
    // Validate parsed date values
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) {
      console.error(`❌ GET /api/food-log - Invalid date values: y=${y}, m=${m}, d=${d}`);
      return NextResponse.json({ error: 'Invalid date values' }, { status: 400 })
    }
    
    const tzMin = Number.isFinite(parseInt(tzOffsetMinRaw || ''))
      ? parseInt(tzOffsetMinRaw || '0', 10)
      : 0
    
    // CRITICAL FIX: Use a wider window to catch entries that might be on the boundary
    // Query from start of requested day to end of next day, then filter precisely
    // This ensures we don't miss entries due to timezone or timing issues
    const startUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0) + tzMin * 60 * 1000
    const endUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999) + tzMin * 60 * 1000
    
    // Also create a wider query window (extend by 12 hours on each side to catch boundary cases)
    const queryStartMs = startUtcMs - (12 * 60 * 60 * 1000) // 12 hours before
    const queryEndMs = endUtcMs + (12 * 60 * 60 * 1000) // 12 hours after
    
    const start = new Date(startUtcMs)
    const end = new Date(endUtcMs)
    const queryStart = new Date(queryStartMs)
    const queryEnd = new Date(queryEndMs)

    // 🛡️ GUARD RAIL: Food Diary Entry Query (CRITICAL - DO NOT MODIFY WITHOUT READING GUARD_RAILS.md)
    // 
    // This query prevents entries from disappearing due to date filtering issues.
    // See GUARD_RAILS.md section 3 for full documentation of the bug and fix.
    //
    // DO NOT:
    // - Remove any of the OR conditions below
    // - Filter by localDate alone without checking createdAt
    // - Make the query more restrictive
    // - Remove the filtering/deduplication steps below
    //
    // DO:
    // - Query broadly to catch entries with missing/incorrect localDate
    // - Filter precisely after querying to ensure correct date
    // - Always deduplicate results
    //
    // Prefer the explicit localDate column when present so entries never drift to the wrong day.
    // For older rows that predate localDate, fall back to the createdAt time-window.
    // CRITICAL FIX: Query more broadly to catch entries that might have incorrect localDate
    // We'll filter them properly below
    console.log('🔍 GET /api/food-log - Querying database for entries...');
    let logs;
    try {
      logs = await prisma.foodLog.findMany({
        where: {
          userId: user.id,
          OR: [
            { localDate: validatedDateStr },
            {
              localDate: null,
              createdAt: { gte: queryStart, lte: queryEnd },
            },
            // Include entries created within the wider query window (even if localDate is set incorrectly)
            // This ensures we don't lose entries due to date mismatches or timezone issues
            // DO NOT REMOVE THIS CONDITION - it prevents entries from disappearing
            {
              createdAt: { gte: queryStart, lte: queryEnd },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      console.log(`✅ GET /api/food-log - Database query returned ${logs.length} entries`);
    } catch (queryError) {
      console.error('❌ GET /api/food-log - Database query error:', queryError);
      return NextResponse.json({ 
        error: 'Database query failed',
        details: queryError instanceof Error ? queryError.message : String(queryError)
      }, { status: 500 })
    }
    
    // 🛡️ GUARD RAIL: Post-Query Filtering (REQUIRED)
    // Filter to ensure we only return entries for the requested date
    // This handles entries that might have incorrect localDate values
    // DO NOT remove this filtering step - it ensures accuracy after broad query
    const filteredLogs = logs.filter((log) => {
      try {
        // If localDate matches exactly, include it
        if (log.localDate === validatedDateStr) return true;
        
        // If localDate is null or doesn't match, check the actual calendar date of createdAt
        // CRITICAL: Use the user's timezone to determine the calendar date, not UTC
        // This ensures entries are matched to the correct day regardless of timezone issues
        if (!log.localDate || log.localDate !== validatedDateStr) {
          // Safety check: createdAt must exist and be a valid date
          if (!log.createdAt) {
            console.warn(`⚠️ Entry ${log.id} has no createdAt, skipping date check`);
            return false;
          }
          
          // Ensure createdAt is a Date object
          const createdAtDate = log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt);
          if (isNaN(createdAtDate.getTime())) {
            console.warn(`⚠️ Entry ${log.id} has invalid createdAt: ${log.createdAt}, skipping date check`);
            return false;
          }
          
          // Convert createdAt to user's local date using their timezone offset
          const logDate = new Date(createdAtDate.getTime() - (tzMin * 60 * 1000));
          const logYear = logDate.getUTCFullYear();
          const logMonth = logDate.getUTCMonth();
          const logDay = logDate.getUTCDate();
          
          // Compare with requested date
          const [reqYear, reqMonth, reqDay] = validatedDateStr.split('-').map((v) => parseInt(v, 10));
          const matchesDate = logYear === reqYear && logMonth === (reqMonth - 1) && logDay === reqDay;
          
          // Also check UTC window as fallback (for entries created exactly at boundaries)
          const logTime = createdAtDate.getTime();
          const isInWindow = logTime >= start.getTime() && logTime <= end.getTime();
          
          // Include if either the calendar date matches OR it's within the UTC window
          const shouldInclude = matchesDate || isInWindow;
          
          // Debug logging for entries that might be filtered out incorrectly
          if (!shouldInclude && log.localDate && log.localDate !== validatedDateStr) {
            const logDateStr = `${logYear}-${String(logMonth + 1).padStart(2, '0')}-${String(logDay).padStart(2, '0')}`;
            console.log(`⚠️ Entry filtered out: localDate=${log.localDate}, createdAt date=${logDateStr}, requested=${validatedDateStr}, matchesDate=${matchesDate}, inWindow=${isInWindow}`);
          }
          
          return shouldInclude;
        }
        
        return false;
      } catch (error) {
        console.error(`❌ Error filtering log entry ${log.id}:`, error);
        // On error, exclude the entry to prevent breaking the entire response
        return false;
      }
    })
    
    // 🛡️ GUARD RAIL: Deduplication (REQUIRED)
    // Remove duplicates (in case an entry matches multiple OR conditions)
    // DO NOT remove this step - multiple OR conditions can return same entry multiple times
    const uniqueLogs = filteredLogs.filter((log, index, self) => 
      index === self.findIndex((l) => l.id === log.id)
    )

    console.log(`📊 GET /api/food-log - Found ${uniqueLogs.length} entries for date ${validatedDateStr} (from ${logs.length} total matches)`)
    
    // Debug: Log entries that were filtered out to help diagnose missing entries
    if (logs.length > uniqueLogs.length) {
      const filteredOut = logs.filter((log) => {
        const inUnique = uniqueLogs.some((u) => u.id === log.id);
        return !inUnique;
      });
      console.log(`⚠️ Filtered out ${filteredOut.length} entries that didn't match date ${validatedDateStr}:`, 
        filteredOut.map((l) => ({
          id: l.id,
          localDate: l.localDate,
          createdAt: l.createdAt.toISOString(),
          name: l.name?.substring(0, 30)
        }))
      );
    }
    
    console.log(`✅ GET /api/food-log - Success: Returning ${uniqueLogs.length} entries for date ${validatedDateStr}`);
    return NextResponse.json({ success: true, logs: uniqueLogs })
  } catch (error) {
    console.error('❌ GET /api/food-log - Error:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      dateStr: dateStr || 'null',
      tzOffsetMinRaw: tzOffsetMinRaw || 'null'
    });
    return NextResponse.json({ 
      error: 'Failed to load logs',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

// Append a log entry (non-blocking usage recommended)
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let userId: string | null = null
  let userEmail: string | null = null
  
  try {
    console.log('📥 POST /api/food-log - Request received')
    
    // Ensure localDate column exists (forward-compatible migration)
    // This prevents "column does not exist" errors if migration hasn't run
    // try {
    //   await prisma.$executeRawUnsafe('ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "localDate" TEXT')
    //   console.log('✅ POST /api/food-log - Verified localDate column exists')
    // } catch (migrationError) {
    //   // Safe to ignore if column already exists or other migration issues
    //   console.warn('⚠️ POST /api/food-log - localDate column check (safe to ignore if exists):', migrationError)
    // }
    
    // Robust auth: try session first, then JWT token (same pattern as /api/analyze-food)
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
        console.error('❌ POST /api/food-log - JWT auth fallback failed:', tokenError)
      }
    }

    console.log('POST /api/food-log auth result:', {
      hasSession: !!session,
      sessionEmail: session?.user?.email ?? null,
      resolvedEmail: userEmail,
      usedTokenFallback,
    })

    if (!userEmail) {
      console.error('❌ POST /api/food-log - Authentication failed: no session or token email')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
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

