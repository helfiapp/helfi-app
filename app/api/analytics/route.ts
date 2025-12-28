import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

// Initialize OpenAI only when needed to avoid build-time errors
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

// In-memory storage for demo (in production, use a database)
let analyticsData: any[] = []

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    const internalSecret = process.env.SCHEDULER_SECRET || ''
    const hasInternalSecret = !!internalSecret && authHeader === `Bearer ${internalSecret}`
    let sessionEmail = ''
    if (!admin && !hasInternalSecret) {
      const session = await getServerSession(authOptions as any)
      sessionEmail = String(session?.user?.email || '').toLowerCase()
      if (!sessionEmail) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    const data = await request.json()
    if (sessionEmail) {
      data.userId = sessionEmail
    }
    
    // Store the analytics event
    const analyticsEvent = {
      ...data,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random()
    }
    
    analyticsData.push(analyticsEvent)
    
    // Keep only last 1000 events to prevent memory issues
    if (analyticsData.length > 1000) {
      analyticsData = analyticsData.slice(-1000)
    }
    
    console.log('📊 Analytics Event Recorded:', {
      action: data.action,
      userId: data.userId,
      timestamp: analyticsEvent.timestamp
    })
    
    return NextResponse.json({ 
      success: true, 
      message: 'Analytics data recorded',
      totalEvents: analyticsData.length 
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
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    
    if (action === 'insights') {
      // Lightweight: return recent timing and cache stats + aggregated p50/p95 for first byte
      const recent = analyticsData.slice(-200)
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
      const summary = generateSummary()
      return NextResponse.json({ success: true, summary })
    }
    
    // Return raw data (last 100 events)
    return NextResponse.json({ 
      success: true, 
      data: analyticsData.slice(-100),
      totalEvents: analyticsData.length 
    })
    
  } catch (error) {
    console.error('Analytics GET Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

async function generateInsights() {
  if (analyticsData.length < 10) {
    return "Not enough data to generate insights yet. Need at least 10 user interactions."
  }
  
  try {
    // Prepare analytics data for AI analysis
    const recentEvents = analyticsData.slice(-100)
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

function generateSummary() {
  if (analyticsData.length === 0) {
    return { message: "No analytics data available yet." }
  }
  
  const recentEvents = analyticsData.slice(-100)
  
  return {
    totalEvents: analyticsData.length,
    recentEvents: recentEvents.length,
    uniqueUsers: Array.from(new Set(recentEvents.map(e => e.userId))).length,
    topActions: getTopActions(recentEvents),
    timeRange: {
      oldest: analyticsData[0]?.timestamp,
      newest: analyticsData[analyticsData.length - 1]?.timestamp
    }
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
