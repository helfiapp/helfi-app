import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import OpenAI from 'openai'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { capMaxTokensToBudget } from '@/lib/cost-meter'
import { logAIUsage } from '@/lib/ai-usage-logger'
import { isSubscriptionActive } from '@/lib/subscription-utils'
import { logServerCall } from '@/lib/server-call-tracker'

// Initialize OpenAI client only when API key is available (same pattern as analyze-food)
const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  try {
    // Auth check (with JWT fallback to avoid sporadic session resolution issues)
    const nativeUserId = await getUserIdFromNativeAuth(req)
    const session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    if (!nativeUserId && !userEmail) {
      try {
        const token = await getToken({
          req,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = token.email as string
        }
      } catch {
        // ignore – will fall through to 401 below if still missing
      }
    }
    if (!nativeUserId && !userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Input parsing
    const contentType = req.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ error: 'Expected application/json' }, { status: 400 })
    }
    const body = await req.json()
    const { symptoms, duration, notes } = body as { symptoms?: string[] | string; duration?: string; notes?: string }

    const symptomsList: string[] = Array.isArray(symptoms)
      ? symptoms.filter(Boolean)
      : (typeof symptoms === 'string' ? symptoms.split(/[,\n]/).map(s => s.trim()).filter(Boolean) : [])

    if (!symptomsList.length) {
      return NextResponse.json({ error: 'Please enter at least one symptom' }, { status: 400 })
    }

    // Basic dependencies
    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    // Fetch user
    const user = nativeUserId
      ? await prisma.user.findUnique({ where: { id: nativeUserId }, include: { subscription: true, creditTopUps: true } })
      : await prisma.user.findUnique({ where: { email: userEmail as string }, include: { subscription: true, creditTopUps: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    logServerCall({
      feature: 'symptomAnalysis',
      endpoint: '/api/analyze-symptoms',
      kind: 'analysis',
    }).catch((error) => {
      console.error('❌ Failed to log symptom notes call:', error)
    })

    // PREMIUM/CREDITS/FREE USE GATING
    const isPremium = isSubscriptionActive(user.subscription)
    
    // Check if user has purchased credits (non-expired)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    
    const hasFreeSymptomCredits = await hasFreeCredits(user.id, 'SYMPTOM_ANALYSIS')
    let allowViaFreeUse = false
    if (!isPremium && !hasPurchasedCredits && hasFreeSymptomCredits) {
      allowViaFreeUse = true
    } else if (!isPremium && !hasPurchasedCredits) {
      // No subscription, no credits, and no free credits - require payment
      return NextResponse.json(
        {
          error: 'Payment required',
          message: 'You\'ve used all your free symptom note uses. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true,
          exhaustedFreeCredits: true,
        },
        { status: 402 }
      )
    }
    
    const creditManager = new CreditManager(user.id)
    // Trigger daily reset logic via credit system (ensures dailyMedicalAnalysisUsed resets too)
    const creditStatus = await creditManager.checkCredits('SYMPTOM_ANALYSIS')

    // Re-fetch to reflect any resets
    const refreshedUser = await prisma.user.findUnique({ where: { id: user.id }, include: { subscription: true } })
    if (!refreshedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Daily/plan gating removed – wallet pre-check below governs access

    // Build prompt for general symptom notes with structured JSON.
    const symptomsStr = symptomsList.join(', ')
    const durationStr = duration ? String(duration).trim() : 'unspecified'
    const notesStr = notes ? String(notes).trim() : ''

    const messages = [
      {
        role: 'user' as const,
        content: `You are a general health information assistant that helps users organise symptom notes for a future conversation with a licensed healthcare professional.
You are not a doctor, not a medical device, and must not provide diagnosis, treatment advice, or certainty.

Create general symptom notes and produce:
- A short plain-language summary of what the user logged
- 3-5 general topics the user may want to discuss with a doctor, not likely causes and not diagnoses
- A clear list of warning signs where urgent care or emergency help may be appropriate
- Practical tracking notes and questions to discuss with a licensed healthcare professional
- Always include a disclaimer that this is general information only

Important:
- Do not name a condition as the likely answer.
- Do not rank conditions by likelihood.
- Do not suggest medicines, supplements, treatment plans, dosing, or home treatment.
- Do not tell the user they do not need a doctor.
- Be concise but careful. Do not reveal chain-of-thought.
- Use non-alarming, supportive language.
- If symptoms are potentially urgent, put them in the warning signs section.

User Input:
Symptoms: ${symptomsStr}
Duration: ${durationStr}
Notes: ${notesStr}

Return two parts:
1) A readable explanation for the user (one to three short paragraphs and section headers)
2) Then a compact JSON between <STRUCTURED_JSON> and </STRUCTURED_JSON> with this exact shape:
<STRUCTURED_JSON>{"summary":"string","possibleCauses":[{"name":"string","whyLikely":"string","confidence":"low|medium|high"}],"redFlags":["string"],"nextSteps":["string"],"disclaimer":"string"}</STRUCTURED_JSON>

JSON rules:
- The field named "possibleCauses" is an internal compatibility field. Fill it with general discussion topics only.
- "name" must be a broad topic such as "Digestive pattern to discuss" or "Respiratory symptoms to discuss", not a diagnosis.
- "whyLikely" must explain why the topic is worth discussing with a doctor, not why a condition is likely.
- Set every "confidence" value to "low" because Helfi is not assessing medical likelihood.
- "nextSteps" must contain tracking notes and doctor questions only, not treatment instructions.`
      }
    ]

    // Wallet pre-check (skip when allowed via one-time free use)
    const model = 'gpt-4o'
    const promptText = messages.map((m) => (typeof (m as any).content === 'string' ? (m as any).content : '')).join('\n')
    let maxTokens = 1200
    if (!allowViaFreeUse) {
      const cm = new CreditManager(refreshedUser.id)
      const wallet = await cm.getWalletStatus()
      const cappedMaxTokens = capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents)
      if (cappedMaxTokens <= 0) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }
      maxTokens = cappedMaxTokens
    }

    // Immediate pre-charge (1 credit) before calling the model (skip for free trial)
    let prechargedCents = 0
    if (!allowViaFreeUse) {
      try {
        const cm = new CreditManager(refreshedUser.id)
        const immediate = CREDIT_COSTS.SYMPTOM_ANALYSIS
        const okPre = await cm.chargeCents(immediate)
        if (!okPre) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
        }
        prechargedCents = immediate
      } catch {
        return NextResponse.json({ error: 'Billing error' }, { status: 402 })
      }
    }

    // Progress is handled on UI; this call may take longer for deeper reasoning
    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
    } as any)

    const content = wrapped.completion.choices?.[0]?.message?.content || ''
    if (!content) {
      return NextResponse.json({ error: 'No analysis received from AI service' }, { status: 500 })
    }

    // Try to extract structured JSON block
    let structured: any = null
    try {
      const m = content.match(/<STRUCTURED_JSON>([\s\S]*?)<\/STRUCTURED_JSON>/i)
      if (m && m[1]) {
        structured = JSON.parse(m[1])
      }
    } catch {
      // ignore parsing error, we'll still return analysisText
    }

    // Charge wallet and update counters (skip charge if allowed via free use)
    if (!allowViaFreeUse) {
      const cm = new CreditManager(refreshedUser.id)
      const remainder = Math.max(0, wrapped.costCents - prechargedCents)
      const ok = await cm.chargeCents(remainder)
      if (!ok) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }
    }

    // Update counters (for all users, not just premium)
    await prisma.user.update({
      where: { id: refreshedUser.id },
      data: {
        totalAnalysisCount: { increment: 1 },
        monthlySymptomAnalysisUsed: { increment: 1 },
      } as any,
    })
    
    if (allowViaFreeUse) {
      await consumeFreeCredit(refreshedUser.id, 'SYMPTOM_ANALYSIS')
    }

    // Log AI usage for cost tracking (fire-and-forget; does not affect user flow)
    try {
      await logAIUsage({
        context: { feature: 'symptoms:analysis', userId: refreshedUser.id },
        model,
        promptTokens: wrapped.promptTokens,
        completionTokens: wrapped.completionTokens,
        costCents: wrapped.costCents,
      })
    } catch {
      // Logging failures must never break the main feature
    }

    // Build response
    const analysisText = content.replace(/<STRUCTURED_JSON>[\s\S]*?<\/STRUCTURED_JSON>/i, '').trim()
    const resp: any = {
      success: true,
      analysisText,
    }
    if (structured && typeof structured === 'object') {
      resp.summary = structured.summary || null
      resp.possibleCauses = Array.isArray(structured.possibleCauses) ? structured.possibleCauses : []
      resp.redFlags = Array.isArray(structured.redFlags) ? structured.redFlags : []
      resp.nextSteps = Array.isArray(structured.nextSteps) ? structured.nextSteps : []
      resp.disclaimer = structured.disclaimer || 'This is not medical advice. If you have concerning or worsening symptoms, contact a licensed medical professional or emergency services.'
    } else {
      // Always ensure a disclaimer is present
      resp.disclaimer = 'This is not medical advice. If you have concerning or worsening symptoms, contact a licensed medical professional or emergency services.'
    }

    try {
      const analysisData = structured && typeof structured === 'object'
        ? {
            summary: resp.summary ?? null,
            possibleCauses: resp.possibleCauses ?? [],
            redFlags: resp.redFlags ?? [],
            nextSteps: resp.nextSteps ?? [],
            disclaimer: resp.disclaimer ?? null,
          }
        : {
            summary: resp.summary ?? null,
            possibleCauses: [],
            redFlags: [],
            nextSteps: [],
            disclaimer: resp.disclaimer ?? null,
          }

      await prisma.symptomAnalysis.create({
        data: {
          userId: refreshedUser.id,
          symptoms: symptomsList,
          duration: duration ? String(duration).trim() : null,
          notes: notes ? String(notes).trim() : null,
          summary: resp.summary ?? null,
          analysisText: analysisText || null,
          analysisData,
        },
      })
    } catch (historyError) {
      console.warn('Failed to save symptom notes history:', historyError)
    }

    return NextResponse.json(resp)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('insufficient_quota')) {
        return NextResponse.json({ error: 'AI service quota exceeded. Please check your billing.' }, { status: 429 })
      }
      if (error.message.includes('invalid_api_key')) {
        return NextResponse.json({ error: 'Invalid AI service key. Please check your configuration.' }, { status: 401 })
      }
    }
    return NextResponse.json({ error: 'Failed to analyze symptoms' }, { status: 500 })
  }
}
