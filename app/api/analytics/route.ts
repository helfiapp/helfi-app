import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

// Initialize OpenAI only when needed to avoid build-time errors
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

async function ensureAnalyticsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
      id TEXT PRIMARY KEY,
      "timestamp" TIMESTAMPTZ NOT NULL,
      "action" TEXT,
      "type" TEXT,
      "userId" TEXT,
      payload JSONB NOT NULL
    )
  `)
}

function normalizePayload(value: any): any {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return { raw: value }
    }
  }
  return value
}

async function fetchRecentEvents(limit: number): Promise<any[]> {
  await ensureAnalyticsTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(
    `SELECT payload FROM "AnalyticsEvent" ORDER BY "timestamp" DESC LIMIT $1`,
    limit
  )
  return rows.map((row) => normalizePayload(row.payload))
}

async function fetchTotalEvents(): Promise<number> {
  await ensureAnalyticsTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ count: any }>>(
    `SELECT COUNT(*)::int AS count FROM "AnalyticsEvent"`
  )
  return Number(rows?.[0]?.count ?? 0)
}

async function fetchTimeRange(): Promise<{ oldest: string | null; newest: string | null }> {
  await ensureAnalyticsTable()
  const rows = await prisma.$queryRawUnsafe<Array<{ oldest: Date | null; newest: Date | null }>>(
    `SELECT MIN("timestamp") AS oldest, MAX("timestamp") AS newest FROM "AnalyticsEvent"`
  )
  const oldest = rows?.[0]?.oldest ? new Date(rows[0].oldest).toISOString() : null
  const newest = rows?.[0]?.newest ? new Date(rows[0].newest).toISOString() : null
  return { oldest, newest }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    const internalSecret = process.env.SCHEDULER_SECRET || ''
    const hasInternalSecret = !!internalSecret && authHeader === `Bearer ${internalSecret}`
    let sessionEmail = ''
    if (!admin && !hasInternalSecret) {
      const session = (await getServerSession(authOptions as any)) as { user?: { email?: string } } | null
      sessionEmail = String(session?.user?.email || '').toLowerCase()
      if (!sessionEmail) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    const data = await request.json()
    if (sessionEmail) {
      data.userId = sessionEmail
    }
    
    await ensureAnalyticsTable()

    const now = new Date()
    const eventId = `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`
    const analyticsEvent = {
      ...data,
      timestamp: now.toISOString(),
      id: eventId
    }
    
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AnalyticsEvent" (id, "timestamp", "action", "type", "userId", payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      analyticsEvent.id,
      now,
      analyticsEvent.action ?? null,
      analyticsEvent.type ?? null,
      analyticsEvent.userId ?? null,
      JSON.stringify(analyticsEvent)
    )
    
    console.log('📊 Analytics Event Recorded:', {
      action: data.action,
      userId: data.userId,
      timestamp: analyticsEvent.timestamp
    })
    
    const totalEvents = await fetchTotalEvents()
    return NextResponse.json({ 
      success: true, 
      message: 'Analytics data recorded',
      totalEvents
    })
    
  } catch (error) {
    console.error('Analytics API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record analytics' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    const internalSecret = process.env.SCHEDULER_SECRET || ''
    const diagnosticsToken = process.env.INSIGHTS_DIAGNOSTICS_TOKEN || ''
    const hasInternalSecret = !!internalSecret && authHeader === `Bearer ${internalSecret}`
    const hasDiagnosticsToken = !!diagnosticsToken && authHeader === `Bearer ${diagnosticsToken}`
    if (!admin) {
      const url = new URL(request.url)
      const action = url.searchParams.get('action')
      const allowedInternal = action === 'insights' && (hasInternalSecret || hasDiagnosticsToken)
      if (!allowedInternal) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    
    if (action === 'insights') {
      // Lightweight: return recent timing and cache stats + aggregated p50/p95 for first byte
      const recent = await fetchRecentEvents(200)
      const events = recent.filter(e => e?.type === 'insights-timing')
      const timings = events.slice(-50).map(e => ({
        section: e.section,
        mode: e.mode,
        generateMs: e.generateMs,
        classifyMs: e.classifyMs,
        rewriteMs: e.rewriteMs,
        fillMs: e.fillMs,
        totalMs: e.totalMs,
        firstByteMs: e.firstByteMs,
        cache: e.cache,
        at: e.timestamp,
      }))
      const firstBytes = events
        .map((e: any) => Number(e.firstByteMs))
        .filter((n: number) => Number.isFinite(n))
        .sort((a: number, b: number) => a - b)
      const quantile = (arr: number[], q: number) => {
        if (!arr.length) return null
        const pos = (arr.length - 1) * q
        const base = Math.floor(pos)
        const rest = pos - base
        return arr[base + 1] !== undefined ? arr[base] + rest * (arr[base + 1] - arr[base]) : arr[base]
      }
      const firstByteMsP50 = quantile(firstBytes, 0.5)
      const firstByteMsP95 = quantile(firstBytes, 0.95)
      const cacheHitCount = events.filter((e: any) => e.cache === 'hit').length
      const cacheMissCount = events.filter((e: any) => e.cache === 'miss').length
      return NextResponse.json({ success: true, timings, stats: { firstByteMsP50, firstByteMsP95, cacheHitCount, cacheMissCount, totalEvents: events.length } })
    }
    
    if (action === 'summary') {
      // Return analytics summary
      const totalEvents = await fetchTotalEvents()
      const recentEvents = await fetchRecentEvents(100)
      const timeRange = await fetchTimeRange()
      const summary = generateSummary(recentEvents, totalEvents, timeRange)
      return NextResponse.json({ success: true, summary })
    }
    
    // Return raw data (last 100 events)
    const totalEvents = await fetchTotalEvents()
    const recentEvents = await fetchRecentEvents(100)
    return NextResponse.json({ 
      success: true, 
      data: recentEvents,
      totalEvents 
    })
    
  } catch (error) {
    console.error('Analytics GET Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

async function generateInsights(events: any[]) {
  if (events.length < 10) {
    return "Not enough data to generate insights yet. Need at least 10 user interactions."
  }
  
  try {
    // Prepare analytics data for AI analysis
    const recentEvents = events.slice(-100)
    const summary = {
      totalEvents: recentEvents.length,
      uniqueUsers: Array.from(new Set(recentEvents.map(e => e.userId))).length,
      topActions: getTopActions(recentEvents),
      userSettings: getUserSettingsStats(recentEvents),
      timeDistribution: getTimeDistribution(recentEvents)
    }
    
    const prompt = `
Analyze this Helfi health app user analytics data and provide actionable insights for app improvement:

${JSON.stringify(summary, null, 2)}

Please provide:
1. Key user behavior patterns
2. Most/least used features
3. Specific recommendations to improve user experience
4. Potential issues or friction points
5. Suggestions for new features based on usage patterns

Keep response concise but actionable for app developers.
`
    
    const openai = getOpenAI()
    if (!openai) {
      return "OpenAI API key not configured. Cannot generate AI insights."
    }
    
    const response: any = await runChatCompletionWithLogging(openai, {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.3
    }, { feature: 'admin:analytics-insights' })
    
    return response.choices[0]?.message?.content || "Unable to generate insights"
    
  } catch (error) {
    console.error('OpenAI Insights Error:', error)
    return "Error generating AI insights. Please check OpenAI API configuration."
  }
}

function generateSummary(events: any[], totalEvents: number, timeRange: { oldest: string | null; newest: string | null }) {
  if (totalEvents === 0) {
    return { message: "No analytics data available yet." }
  }
  
  const recentEvents = events.slice(-100)
  
  return {
    totalEvents,
    recentEvents: recentEvents.length,
    uniqueUsers: Array.from(new Set(recentEvents.map(e => e.userId))).length,
    topActions: getTopActions(recentEvents),
    timeRange
  }
}

function getTopActions(events: any[]) {
  const actionCounts: { [key: string]: number } = {}
  events.forEach(event => {
    actionCounts[event.action] = (actionCounts[event.action] || 0) + 1
  })
  
  return Object.entries(actionCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }))
}

function getUserSettingsStats(events: any[]) {
  const settingsEvents = events.filter(e => e.action?.includes('settings'))
  const darkModeUsers = events.filter(e => e.settings?.darkMode).length
  const notificationUsers = events.filter(e => e.settings?.emailNotifications).length
  
  return {
    settingsChanges: settingsEvents.length,
    darkModeUsers,
    notificationUsers
  }
}

function getTimeDistribution(events: any[]) {
  const hours: { [key: string]: number } = {}
  events.forEach(event => {
    const hour = new Date(event.timestamp).getHours()
    hours[hour] = (hours[hour] || 0) + 1
  })
  
  return hours
} 
