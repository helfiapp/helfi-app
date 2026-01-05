import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreditManager } from '@/lib/credit-system'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'
import { consumeRateLimit } from '@/lib/rate-limit'

const HEALTH_CHECK_COST_CREDITS = 2
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 6

const parseJsonSafe = (raw: string | null) => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const parseSelectedIssues = (healthGoals: any[]) => {
  try {
    const selectedRecord = healthGoals.find((goal: any) => goal?.name === '__SELECTED_ISSUES__')
    const parsed = parseJsonSafe(selectedRecord?.category || null)
    if (Array.isArray(parsed)) {
      return parsed
        .map((name) => String(name || '').trim())
        .filter((name) => name.length > 0)
    }
  } catch {}

  return healthGoals
    .filter((goal: any) => typeof goal?.name === 'string' && !goal.name.startsWith('__'))
    .map((goal: any) => String(goal.name || '').trim())
    .filter((name: string) => name.length > 0)
}

const parseDietTypes = (healthGoals: any[]) => {
  try {
    const storedDiet = healthGoals.find((goal: any) => goal?.name === '__DIET_PREFERENCE__')
    const parsed = parseJsonSafe(storedDiet?.category || null)
    const raw = Array.isArray(parsed?.dietTypes) ? parsed.dietTypes : parsed?.dietType
    if (Array.isArray(raw)) {
      return raw.map((diet: any) => String(diet || '').trim()).filter(Boolean)
    }
    if (typeof raw === 'string' && raw.trim().length > 0) return [raw.trim()]
  } catch {}
  return []
}

const parseProfileInfo = (healthGoals: any[]) => {
  try {
    const storedProfile = healthGoals.find((goal: any) => goal?.name === '__PROFILE_INFO__')
    const parsed = parseJsonSafe(storedProfile?.category || null)
    if (parsed && typeof parsed === 'object') {
      return {
        dateOfBirth: typeof parsed?.dateOfBirth === 'string' ? parsed.dateOfBirth : '',
      }
    }
  } catch {}
  return { dateOfBirth: '' }
}

const parsePrimaryGoal = (healthGoals: any[]) => {
  try {
    const storedGoal = healthGoals.find((goal: any) => goal?.name === '__PRIMARY_GOAL__')
    const parsed = parseJsonSafe(storedGoal?.category || null)
    if (parsed && typeof parsed === 'object') {
      return {
        goalChoice: typeof parsed?.goalChoice === 'string' ? parsed.goalChoice : '',
        goalIntensity: typeof parsed?.goalIntensity === 'string' ? parsed.goalIntensity : '',
      }
    }
  } catch {}
  return { goalChoice: '', goalIntensity: '' }
}

const normalizeTotals = (raw: any) => {
  if (!raw || typeof raw !== 'object') return null
  const toNumber = (value: any) => {
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return {
    calories: toNumber(raw.calories ?? raw.kcal ?? raw.energy ?? raw.cal),
    protein: toNumber(raw.protein ?? raw.protein_g),
    carbs: toNumber(raw.carbs ?? raw.carbs_g),
    fat: toNumber(raw.fat ?? raw.fat_g),
    fiber: toNumber(raw.fiber ?? raw.fiber_g),
    sugar: toNumber(raw.sugar ?? raw.sugar_g),
  }
}

const formatNumber = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return 'unknown'
  const rounded = Math.round(value * 10) / 10
  return String(rounded)
}

const computeAge = (dob?: string | null) => {
  if (!dob) return null
  const date = new Date(dob)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const monthDiff = now.getMonth() - date.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1
  }
  return age > 0 && age < 130 ? age : null
}

const parseHealthCheckJson = (raw: string) => {
  const blockMatch = raw.match(/<HEALTH_CHECK>([\s\S]*?)<\/HEALTH_CHECK>/i)
  if (blockMatch && blockMatch[1]) {
    const parsed = parseJsonSafe(blockMatch[1].trim())
    if (parsed && typeof parsed === 'object') return parsed
  }
  const looseMatch = raw.match(/\{[\s\S]*\}/)
  if (looseMatch && looseMatch[0]) {
    const parsed = parseJsonSafe(looseMatch[0])
    if (parsed && typeof parsed === 'object') return parsed
  }
  return null
}

const buildTriggerFlags = (totals: ReturnType<typeof normalizeTotals> | null) => {
  if (!totals) return []
  const flags: string[] = []
  if (typeof totals.sugar === 'number' && totals.sugar > 25) {
    flags.push(`Sugar ${formatNumber(totals.sugar)}g > 25g`)
  }
  if (typeof totals.carbs === 'number' && totals.carbs > 75) {
    flags.push(`Carbs ${formatNumber(totals.carbs)}g > 75g`)
  }
  if (typeof totals.fat === 'number' && totals.fat > 25) {
    flags.push(`Fat ${formatNumber(totals.fat)}g > 25g`)
  }
  return flags
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const rateKey = (session.user as any)?.id ? `user:${(session.user as any).id}` : `ip:${clientIp}`
  const rateCheck = await consumeRateLimit('food-health-check', rateKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000))
    return NextResponse.json(
      { error: 'Too many health checks. Please wait and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { subscription: true, healthGoals: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const totals = normalizeTotals(body?.totals)
  const itemNames = Array.isArray(body?.items)
    ? body.items
        .map((item: any) => String(item?.name || item?.label || '').trim())
        .filter((name: string) => name.length > 0)
        .slice(0, 12)
    : []

  if (!description && itemNames.length === 0) {
    return NextResponse.json({ error: 'Missing meal data' }, { status: 400 })
  }

  const selectedIssues = parseSelectedIssues(user.healthGoals || [])
  const dietTypes = parseDietTypes(user.healthGoals || [])
  const profileInfo = parseProfileInfo(user.healthGoals || [])
  const primaryGoal = parsePrimaryGoal(user.healthGoals || [])

  const age = computeAge(profileInfo.dateOfBirth)
  const userContextParts = [
    user.gender ? `Gender: ${String(user.gender).toLowerCase()}` : null,
    Number.isFinite(user.weight) ? `Weight: ${user.weight} kg` : null,
    Number.isFinite(user.height) ? `Height: ${user.height} cm` : null,
    age ? `Age: ${age}` : null,
    primaryGoal.goalChoice ? `Goal: ${primaryGoal.goalChoice}` : null,
    primaryGoal.goalIntensity ? `Goal pace: ${primaryGoal.goalIntensity}` : null,
  ].filter(Boolean)

  const triggerFlags = buildTriggerFlags(totals)
  const mealParts = [
    description ? `Meal: ${description}` : null,
    itemNames.length ? `Items: ${itemNames.join(', ')}` : null,
    totals
      ? `Totals: ${formatNumber(totals.calories)} kcal, ${formatNumber(totals.protein)}g protein, ${formatNumber(totals.carbs)}g carbs, ${formatNumber(totals.fat)}g fat, ${formatNumber(totals.fiber)}g fiber, ${formatNumber(totals.sugar)}g sugar`
      : null,
    triggerFlags.length ? `Triggered by: ${triggerFlags.join('; ')}` : null,
  ].filter(Boolean)

  const prompt = [
    'You are a nutrition coach helping a user avoid foods that conflict with their health goals and diets.',
    'Explain why the meal is problematic for each selected health issue separately. Be specific to that issue.',
    'Give one clear swap suggestion that stays similar to the meal.',
    'If the meal is acceptable, say so briefly and still give a lighter swap.',
    '',
    `Health goals/issues: ${selectedIssues.length ? selectedIssues.join(', ') : 'none listed'}.`,
    `Diet preferences: ${dietTypes.length ? dietTypes.join(', ') : 'none listed'}.`,
    userContextParts.length ? `User: ${userContextParts.join('; ')}.` : '',
    mealParts.join('\n'),
    '',
    'Return JSON between <HEALTH_CHECK> tags with exactly:',
    '{"summary":"string","issues":[{"issue":"string","why":"string"}],"alternative":"string"}',
  ]
    .filter(Boolean)
    .join('\n')

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  const cm = new CreditManager(user.id)
  const wallet = await cm.getWalletStatus()
  if (wallet.totalAvailableCents < HEALTH_CHECK_COST_CREDITS) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let content = ''
  try {
    const completion = await runChatCompletionWithLogging(
      openai,
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 350,
        temperature: 0.4,
      } as any,
      {
        feature: 'food:health-check',
        userId: user.id,
        userLabel: user.email,
        endpoint: '/api/food-health-check',
      },
    )
    const raw = (completion as any)?.choices?.[0]?.message?.content
    content = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((part: any) => part?.text || '').join('') : ''
  } catch (err) {
    console.error('[food-health-check] AI error', err)
    return NextResponse.json({ error: 'AI failed' }, { status: 500 })
  }

  const parsed = parseHealthCheckJson(content)
  const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : ''
  const rawIssues = Array.isArray(parsed?.issues) ? parsed.issues : []
  const issues = rawIssues
    .map((item: any) => ({
      issue: typeof item?.issue === 'string' ? item.issue.trim() : '',
      why: typeof item?.why === 'string' ? item.why.trim() : '',
    }))
    .filter((item: any) => item.issue && item.why)
    .slice(0, 6)
  const alternative = typeof parsed?.alternative === 'string' ? parsed.alternative.trim() : ''
  if (!summary && issues.length === 0 && !alternative) {
    return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })
  }

  const charged = await cm.chargeCents(HEALTH_CHECK_COST_CREDITS)
  if (!charged) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  return NextResponse.json({
    summary: summary || 'This meal may not fully support your current goals.',
    issues,
    alternative: alternative || 'Try a similar meal with less added sugar and more protein.',
    flags: triggerFlags,
    costCredits: HEALTH_CHECK_COST_CREDITS,
  })
}
