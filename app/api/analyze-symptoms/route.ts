import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
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
    const session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    if (!userEmail) {
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
    if (!userEmail) {
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
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // Fetch user
    const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { subscription: true, creditTopUps: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    logServerCall({
      feature: 'symptomAnalysis',
      endpoint: '/api/analyze-symptoms',
      kind: 'analysis',
    }).catch((error) => {
      console.error('❌ Failed to log symptom analysis call:', error)
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
          message: 'You\'ve used all your free symptom analyses. Subscribe to a monthly plan or purchase credits to continue.',
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

    // Build prompt for careful, longer analysis with structured JSON
    const symptomsStr = symptomsList.join(', ')
    const durationStr = duration ? String(duration).trim() : 'unspecified'
    const notesStr = notes ? String(notes).trim() : ''

    const messages = [
      {
        role: 'user' as const,
        content: `You are a careful clinical reasoning assistant that provides patient-friendly guidance without medical jargon.
Analyze the user's symptoms and produce:
- A short summary in plain language
- 4-7 likely causes with brief "why likely" and confidence (low/medium/high)
- A clear list of red flags (urgent symptoms)
- Practical next steps they can take now
- Always include a disclaimer to contact a licensed medical professional

Important:
- Be concise but careful. Do not reveal chain-of-thought; only conclusions.
- Use non-alarming, supportive language.
- If symptoms are potentially urgent, ensure they appear in red flags.

User Input:
Symptoms: ${symptomsStr}
Duration: ${durationStr}
Notes: ${notesStr}

Return two parts:
1) A readable explanation for the user (one to three short paragraphs and section headers)
2) Then a compact JSON between <STRUCTURED_JSON> and </STRUCTURED_JSON> with this exact shape:
<STRUCTURED_JSON>{"summary":"string","possibleCauses":[{"name":"string","whyLikely":"string","confidence":"low|medium|high"}],"redFlags":["string"],"nextSteps":["string"],"disclaimer":"string"}</STRUCTURED_JSON>`
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
      return NextResponse.json({ error: 'No analysis received from OpenAI' }, { status: 500 })
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
      console.warn('Failed to save symptom analysis history:', historyError)
    }

    return NextResponse.json(resp)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('insufficient_quota')) {
        return NextResponse.json({ error: 'OpenAI API quota exceeded. Please check your billing.' }, { status: 429 })
      }
      if (error.message.includes('invalid_api_key')) {
        return NextResponse.json({ error: 'Invalid OpenAI API key. Please check your configuration.' }, { status: 401 })
      }
    }
    return NextResponse.json({ error: 'Failed to analyze symptoms' }, { status: 500 })
  }
}
