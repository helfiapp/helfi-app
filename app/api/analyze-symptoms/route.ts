import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import OpenAI from 'openai'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { costCentsEstimateFromText } from '@/lib/cost-meter'

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

    // PREMIUM/CREDITS/FREE USE GATING
    const isPremium = user.subscription?.plan === 'PREMIUM'
    
    // Check if user has purchased credits (non-expired)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    
    // One‑time free use for symptom analysis (match other AI features)
    const hasUsedFreeSymptom = (user as any).hasUsedFreeSymptomAnalysis || false
    let allowViaFreeUse = false
    if (!isPremium && !hasPurchasedCredits && !hasUsedFreeSymptom) {
      allowViaFreeUse = true
    } else if (!isPremium && !hasPurchasedCredits) {
      // No subscription, no credits, and already used free - require payment
      return NextResponse.json(
        { 
          error: 'Payment required',
          message: 'You\'ve used your free symptom analysis. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true
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
    const estimateCents = costCentsEstimateFromText(model, promptText, 1200 * 4)
    if (!allowViaFreeUse) {
      const cm = new CreditManager(refreshedUser.id)
      const wallet = await cm.getWalletStatus()
      if (wallet.totalAvailableCents < estimateCents) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
      }
    }

    // Progress is handled on UI; this call may take longer for deeper reasoning
    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages,
      max_tokens: 1200,
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
      const ok = await cm.chargeCents(wrapped.costCents)
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
    
    // Mark free use as used (safe if column doesn't exist yet)
    if (allowViaFreeUse) {
      try {
        await prisma.user.update({
          where: { id: refreshedUser.id },
          data: {
            hasUsedFreeSymptomAnalysis: true,
          } as any
        })
      } catch (e: any) {
        if (!e?.message?.includes('does not exist')) {
          console.warn('Failed to update hasUsedFreeSymptomAnalysis:', e)
        }
      }
    }

    // Build response
    const resp: any = {
      success: true,
      analysisText: content.replace(/<STRUCTURED_JSON>[\s\S]*?<\/STRUCTURED_JSON>/i, '').trim(),
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



