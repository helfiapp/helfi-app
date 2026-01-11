import { prisma } from '@/lib/prisma'

const CHECKIN_LABELS = [
  'Really bad',
  'Bad',
  'Below average',
  'Average',
  'Above average',
  'Good',
  'Excellent',
] as const

export async function ensureHealthTipTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      userId TEXT PRIMARY KEY,
      subscription JSONB NOT NULL
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTipSettings (
      userId TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      time1 TEXT NOT NULL,
      time2 TEXT NOT NULL,
      time3 TEXT NOT NULL,
      timezone TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 1,
      focusFood BOOLEAN NOT NULL DEFAULT true,
      focusSupplements BOOLEAN NOT NULL DEFAULT true,
      focusLifestyle BOOLEAN NOT NULL DEFAULT true
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTips (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tipDate DATE NOT NULL,
      sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      metadata JSONB,
      costCents INTEGER,
      chargeCents INTEGER
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS HealthTipDeliveryLog (
      userId TEXT NOT NULL,
      reminderTime TEXT NOT NULL,
      tipDate DATE NOT NULL,
      sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (userId, reminderTime, tipDate)
    )
  `)
}

export async function buildUserHealthContext(userId: string) {
  // Ensure FoodLog has the lightweight 'items' column used by the Prisma client.
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "items" JSONB`
    )
  } catch (e) {
    console.error('[HEALTH_TIPS] Failed to ensure FoodLog.items column', e)
  }

  // Ensure WaterLog exists before querying hydration history.
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WaterLog" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "amount" FLOAT NOT NULL,
        "unit" TEXT NOT NULL,
        "amountMl" FLOAT NOT NULL,
        "label" TEXT,
        "localDate" TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WaterLog_userId_localDate_idx" ON "WaterLog"("userId", "localDate")
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WaterLog_userId_createdAt_idx" ON "WaterLog"("userId", "createdAt")
    `)
  } catch (e) {
    console.error('[HEALTH_TIPS] Failed to ensure WaterLog table', e)
  }

  const [healthSituationsGoal, selectedIssuesGoal, supplements, medications, recentFoodLogs, waterLogs] =
    await Promise.all([
      prisma.healthGoal.findFirst({
        where: { userId, name: '__HEALTH_SITUATIONS_DATA__' },
      }),
      prisma.healthGoal.findFirst({
        where: { userId, name: '__SELECTED_ISSUES__' },
      }),
      prisma.supplement.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.medication.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.foodLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.waterLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ])

  let healthData: {
    healthIssues?: string
    healthProblems?: string
    additionalInfo?: string
  } | null = null
  let selectedHealthGoals: string[] = []

  if (healthSituationsGoal?.category) {
    try {
      const parsed = JSON.parse(healthSituationsGoal.category as any)
      healthData = {
        healthIssues: parsed.healthIssues || '',
        healthProblems: parsed.healthProblems || '',
        additionalInfo: parsed.additionalInfo || '',
      }
    } catch {
      // ignore parse errors
    }
  }

  if (selectedIssuesGoal?.category) {
    try {
      const parsed = JSON.parse(selectedIssuesGoal.category as any)
      if (Array.isArray(parsed)) {
        selectedHealthGoals = parsed.map((name: any) => String(name || '').trim()).filter(Boolean)
      }
    } catch {
      // ignore parse errors
    }
  }

  // Recent check-in ratings (last 7 days)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const startDate = weekAgo.toISOString().slice(0, 10)
  const endDate = now.toISOString().slice(0, 10)

  // Ensure Checkin tables exist before querying (mirror /api/checkins/today)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinIssues (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      polarity TEXT NOT NULL
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinRatings (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      issueId TEXT NOT NULL,
      date TEXT NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      value INTEGER,
      note TEXT,
      isNa BOOLEAN DEFAULT false
    )
  `)

  const checkinRows: Array<{
    date: string
    issueId: string
    name: string
    polarity: string
    value: number | null
    note: string | null
  }> = await prisma.$queryRawUnsafe(
    `SELECT r.date, r.issueId, i.name, i.polarity, r.value, r.note
     FROM CheckinRatings r
     JOIN CheckinIssues i ON i.id = r.issueId
     WHERE r.userId = $1 AND r.date BETWEEN $2 AND $3
     ORDER BY r.date DESC, r.timestamp DESC`,
    userId,
    startDate,
    endDate
  )

  const hydrationLines = (() => {
    if (!waterLogs.length) return []
    const byDate = new Map<
      string,
      { totalMl: number; count: number; labels: Set<string> }
    >()
    for (const log of waterLogs) {
      const dateKey =
        (log as any)?.localDate ||
        (log as any)?.createdAt?.toISOString?.().slice(0, 10) ||
        ''
      if (!dateKey) continue
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { totalMl: 0, count: 0, labels: new Set() })
      }
      const entry = byDate.get(dateKey)!
      entry.totalMl += Number((log as any)?.amountMl || 0)
      entry.count += 1
      if ((log as any)?.label) entry.labels.add(String((log as any).label))
    }
    const sortedDates = Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 5)
    return sortedDates.map(([dateKey, entry]) => {
      const labels = Array.from(entry.labels).slice(0, 3)
      const labelText = labels.length ? ` (${labels.join(', ')})` : ''
      return `- ${dateKey}: ${Math.round(entry.totalMl)} ml across ${entry.count} drinks${labelText}`
    })
  })()

  return {
    healthData,
    selectedHealthGoals,
    supplements,
    medications,
    recentFoodLogs,
    recentCheckins: checkinRows,
    hydrationLines,
  }
}

export function buildTipPrompt(args: {
  context: Awaited<ReturnType<typeof buildUserHealthContext>>
  localTimeDescription: string
  focusFood: boolean
  focusSupplements: boolean
  focusLifestyle: boolean
}) {
  const { context, localTimeDescription, focusFood, focusSupplements, focusLifestyle } = args
  const {
    healthData,
    selectedHealthGoals,
    supplements,
    medications,
    recentFoodLogs,
    recentCheckins,
    hydrationLines,
  } = context

  const lines: string[] = []

  if (healthData) {
    if (healthData.healthIssues?.trim()) {
      lines.push(`Current health issues: ${healthData.healthIssues.trim()}`)
    }
    if (healthData.healthProblems?.trim()) {
      lines.push(`Ongoing health problems: ${healthData.healthProblems.trim()}`)
    }
    if (healthData.additionalInfo?.trim()) {
      lines.push(`Additional health info: ${healthData.additionalInfo.trim()}`)
    }
  }

  if (selectedHealthGoals.length > 0) {
    lines.push(`Health goals/concerns being tracked: ${selectedHealthGoals.join(', ')}`)
  }

  if (supplements.length > 0) {
    const suppLines = supplements.slice(0, 8).map((s) => {
      const timingValue: any = (s as any).timing
      const timings = Array.isArray(timingValue)
        ? timingValue.map((t) => String(t)).join(', ')
        : timingValue
        ? String(timingValue)
        : ''
      return `- ${s.name} (${s.dosage || 'dose not specified'}) – timing: ${timings || 'not specified'}`
    })
    lines.push('Supplements currently taken:')
    lines.push(...suppLines)
  }

  if (medications.length > 0) {
    const medLines = medications.slice(0, 8).map((m) => {
      const timingValue: any = (m as any).timing
      const timings = Array.isArray(timingValue)
        ? timingValue.map((t) => String(t)).join(', ')
        : timingValue
        ? String(timingValue)
        : ''
      return `- ${m.name} (${m.dosage || 'dose not specified'}) – timing: ${timings || 'not specified'}`
    })
    lines.push('Medications currently taken:')
    lines.push(...medLines)
  }

  if (recentFoodLogs.length > 0) {
    const foodLines = recentFoodLogs.map((f) => {
      const when = f.createdAt.toISOString().slice(0, 16).replace('T', ' ')
      return `- [${when}] ${f.name}${f.description ? ` – ${f.description}` : ''}`
    })
    lines.push('Recent food diary entries:')
    lines.push(...foodLines)
  }

  if (recentCheckins.length > 0) {
    const ratingLines = recentCheckins.slice(0, 25).map((r) => {
      const v = r.value
      const label =
        v === null || v === undefined
          ? 'N/A'
          : CHECKIN_LABELS[Math.max(0, Math.min(CHECKIN_LABELS.length - 1, v))]
      const notePart = r.note ? ` – note: ${r.note}` : ''
      return `- [${r.date}] ${r.name}: ${label}${v !== null && v !== undefined ? ` (${v}/6)` : ''}${notePart}`
    })
    lines.push('Recent daily check-in ratings (last 7 days):')
    lines.push(...ratingLines)
  }

  if (hydrationLines.length > 0) {
    lines.push('Recent hydration logs:')
    lines.push(...hydrationLines)
  } else {
    lines.push('Hydration logs: none in the last 7 days.')
  }

  const healthSnapshot =
    lines.length > 0
      ? lines.join('\n')
      : 'No structured health data is available yet beyond basic account information.'

  const preferredCategories: string[] = []
  if (focusFood) preferredCategories.push('food')
  if (focusSupplements) preferredCategories.push('supplement')
  if (focusLifestyle) preferredCategories.push('lifestyle')
  const preferredCategoriesText =
    preferredCategories.length > 0
      ? preferredCategories.join(', ')
      : 'food, supplement, lifestyle'

  const prompt = `You are a careful, practical health coach creating ONE personalised micro health tip for a specific user.

USER HEALTH SNAPSHOT (from Helfi app):
${healthSnapshot}

CONTEXT FOR THIS TIP:
- This tip is being sent around: ${localTimeDescription}
- The user receives at most 3 tips per day, so this one should feel meaningful, not generic.

GOAL:
- Provide ONE short, highly actionable health tip that this user can realistically apply today.
- The tip should clearly connect to at least ONE specific detail from the snapshot above (for example: a named health issue, a recurring symptom, a supplement they take, or a pattern in their recent meals or ratings).

CRITICAL RULES:
1. Avoid generic advice that could apply to absolutely everyone (e.g. "drink more water", "sleep more", "eat healthier") unless you tie it tightly to a concrete pattern from their data and make it very specific.
2. The tip must feel like it was written specifically for THIS person, based on the snapshot above.
3. The user has expressed a preference for these tip categories (in order of priority): ${preferredCategoriesText}.
   - You MUST choose the JSON "category" from these options: "food", "supplement", or "lifestyle".
   - Prefer a category that is in the preferred list above, but if the health snapshot clearly demands a different category, you may choose it and briefly explain why.
4. You may focus on ONE of these categories:
   - food: a specific meal, snack, or ingredient pattern that fits their issues
   - supplement: a specific supplement idea, timing tweak, or reminder connected to their issues
   - lifestyle: a small behaviour or routine change (sleep, stress, movement, bathroom timing, etc.)
5. Never diagnose or claim to cure anything. Use soft language like "may help", "you might consider", "many people with X find Y helpful".
6. Include a brief safety note that reminds them to consider medications, allergies, and to talk with a clinician when appropriate—especially if you mention a supplement or strong change.
7. Do NOT reveal your chain-of-thought. Only show the final recommendation and brief reasoning.
8. Format the "tip" as 2-4 short lines separated by newline characters (no markdown). Use simple labels like "Action:", "Why:", or "Optional:" so it is easy to scan.
9. In addition to the tip itself, create exactly 3 concrete follow-up questions the user might naturally ask specifically about THIS tip. These questions must:
   - Explicitly reference the main recommendation (for example, the specific food, supplement, or habit you suggested).
   - Be practical and personalised (for example, about safety, interactions, alternatives, or how to tailor the advice to their routine or health issues).
   - Avoid generic wording that could apply to any random health tip.

RESPONSE FORMAT (JSON ONLY, no markdown, no extra text):
{
  "title": "Short, specific title for the notification (5-9 words)",
  "category": "food" | "supplement" | "lifestyle",
  "tip": "2-4 short lines, each one sentence, using labels like 'Action:', 'Why:', or 'Optional:' (plain text only). Each line must reference at least one detail from the snapshot above.",
  "safetyNote": "1 short sentence with a sensible safety or medical caution.",
  "suggestedQuestions": [
    "First personalised follow-up question about this specific tip...",
    "Second personalised follow-up question...",
    "Third personalised follow-up question..."
  ]
}`

  return prompt
}

export function extractTipJson(raw: string) {
  if (!raw) return null
  let text = raw.trim()

  // Strip markdown fences if present
  const fenceMatch = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i)
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim()
  }

  // Try to isolate the first JSON object
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as {
      title?: string
      category?: string
      tip?: string
      safetyNote?: string
      suggestedQuestions?: string[]
    }
  } catch {
    return null
  }
}
