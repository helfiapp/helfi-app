import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import OpenAI from 'openai';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { costCentsEstimateFromText } from '@/lib/cost-meter';

// Lazily initialize OpenAI to avoid build-time env requirements
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supplements, medications, analysisName, reanalysis } = await request.json();

    if (!supplements || !medications) {
      return NextResponse.json({ error: 'Missing supplements or medications data' }, { status: 400 });
    }

    // Find user and check credit quota
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true, creditTopUps: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // PREMIUM/CREDITS/FREE USE GATING
    const isPremium = user.subscription?.plan === 'PREMIUM';
    
    // Check if user has purchased credits (non-expired)
    const now = new Date();
    const hasPurchasedCredits = user.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    );
    
    // Check if user has used their free interaction analysis
    const hasUsedFreeInteraction = (user as any).hasUsedFreeInteractionAnalysis || false;
    
    // Allow if: Premium subscription OR has purchased credits OR hasn't used free use yet
    let allowViaFreeUse = false;
    if (!isPremium && !hasPurchasedCredits && !hasUsedFreeInteraction && !reanalysis) {
      // First time use - allow free
      allowViaFreeUse = true;
    } else if (!isPremium && !hasPurchasedCredits) {
      // No subscription, no credits, and already used free - require payment
      return NextResponse.json(
        { 
          error: 'Payment required',
          message: 'You\'ve used your free interaction analysis. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true
        },
        { status: 402 }
      );
    }
    // Use optional chaining to avoid type errors if field not present in client types
    const lastMonthlyReset = (user as any).lastMonthlyResetDate as Date | null;
    const monthChanged = !lastMonthlyReset || lastMonthlyReset.getUTCFullYear() !== now.getUTCFullYear() || lastMonthlyReset.getUTCMonth() !== now.getUTCMonth();
    if (monthChanged) {
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          // Cast to any to support add-only schema push in staging
          ...( { monthlyInteractionAnalysisUsed: 0, lastMonthlyResetDate: now } as any )
        }
      });
      (user as any).monthlyInteractionAnalysisUsed = 0 as any;
    }

    // Plan/trial gating removed – wallet pre-check governs access (trial counters still updated later)

    // Prepare the data for OpenAI analysis
    const supplementList = (supplements as any[]).map((s: any) => ({
      name: s.name,
      dosage: s.dosage,
      timing: Array.isArray(s.timing) ? s.timing.join(', ') : s.timing,
      schedule: s.scheduleInfo
    }));

    const medicationList = (medications as any[]).map((m: any) => ({
      name: m.name,
      dosage: m.dosage,
      timing: Array.isArray(m.timing) ? m.timing.join(', ') : m.timing,
      schedule: m.scheduleInfo
    }));

    const prompt = `As a clinical pharmacist, analyze the following supplements and medications for potential interactions:

SUPPLEMENTS:
${supplementList.map(s => `- ${s.name}: ${s.dosage}, taken ${s.timing}, schedule: ${s.schedule}`).join('\n')}

MEDICATIONS:
${medicationList.map(m => `- ${m.name}: ${m.dosage}, taken ${m.timing}, schedule: ${m.schedule}`).join('\n')}

CRITICAL REQUIREMENT: In your summary, you MUST list ALL supplements and medications by their actual names (e.g., "Analysis completed for Vitamin E, Magnesium, and Ibuprofen. Overall risk level: medium.") - do NOT use generic counts like "5 supplements and 2 medications".

Please provide a comprehensive interaction analysis in the following JSON format:
{
  "overallRisk": "low|medium|high",
  "interactions": [
    {
      "substance1": "name",
      "substance2": "name",
      "severity": "low|medium|high",
      "description": "detailed explanation of the interaction",
      "recommendation": "specific recommendation for the user",
      "timingAdjustment": "suggested timing changes if needed"
    }
  ],
  "timingOptimization": {
    "morning": ["list of substances best taken in morning"],
    "afternoon": ["list of substances best taken in afternoon"],
    "evening": ["list of substances best taken in evening"],
    "beforeBed": ["list of substances best taken before bed"]
  },
  "generalRecommendations": [
    "general advice for this combination"
  ],
  "disclaimer": "Important medical disclaimer text"
}

CRITICAL INSTRUCTIONS:
1. ONLY include interactions that are MEDIUM or HIGH severity - do not include low/safe interactions
2. For timing optimization, DO NOT include substances that have HIGH severity interactions with each other
3. For MEDIUM severity interactions, include timing recommendations but note spacing requirements
4. Focus on actionable, significant interactions only

Focus on:
1. Drug-supplement interactions
2. Supplement-supplement interactions
3. Timing conflicts that could reduce effectiveness
4. Absorption interference
5. Dosage concerns
6. Any contraindications

Be thorough but not alarmist. Provide actionable recommendations.`;

    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const model = reanalysis ? "gpt-4o-mini" : "gpt-4";

    // Wallet pre-check (skip if allowed via free use)
    if (!allowViaFreeUse) {
      const cm = new CreditManager(user.id);
      const estimateCents = costCentsEstimateFromText(model, prompt, 2000 * 4);
      const wallet = await cm.getWalletStatus();
      if (wallet.totalAvailableCents < estimateCents) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }
    }

    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages: [
        {
          role: "system",
          content: "You are a clinical pharmacist with expertise in drug-supplement interactions. Provide accurate, evidence-based analysis while being appropriately cautious about medical advice."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    } as any);

    const analysisText = wrapped.completion.choices[0].message.content;
    console.log('OpenAI Response:', analysisText);
    
    // Parse the JSON response with improved error handling
    let analysis;
    try {
      if (!analysisText) {
        throw new Error('Empty response from OpenAI');
      }
      
      // Try to extract JSON from the response if it's wrapped in markdown
      let jsonText = analysisText.trim();
      
      // Handle different markdown formats
      if (jsonText.includes('```json')) {
        const jsonMatch = jsonText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1].trim();
        }
      } else if (jsonText.includes('```')) {
        const jsonMatch = jsonText.match(/```\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1].trim();
        }
      }
      
      // Clean up common JSON formatting issues
      jsonText = jsonText.replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
      
      analysis = JSON.parse(jsonText);
      
      // Validate the parsed analysis has required fields
      if (!analysis.overallRisk || !Array.isArray(analysis.interactions)) {
        throw new Error('Invalid analysis structure');
      }
      
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('Raw response:', analysisText);
      
      // Instead of showing broken placeholder data, return a proper error
      return NextResponse.json({ 
        error: 'Analysis parsing failed',
        details: 'Unable to process the interaction analysis. Please try again.',
        rawResponse: analysisText?.substring(0, 500) // First 500 chars for debugging
      }, { status: 500 });
    }

    // Add metadata
    analysis.analysisDate = new Date().toISOString();
    analysis.supplementCount = supplements.length;
    analysis.medicationCount = medications.length;

    // Generate analysis name if not provided
    const defaultAnalysisName = analysisName || 
      `Analysis ${new Date().toLocaleDateString()} - ${supplements.length} supplements, ${medications.length} medications`;

    // Save analysis to database
    const savedAnalysis = await prisma.interactionAnalysis.create({
      data: {
        userId: user.id,
        analysisName: defaultAnalysisName,
        overallRisk: analysis.overallRisk,
        supplementCount: supplements.length,
        medicationCount: medications.length,
        analysisData: analysis,
        supplementsAnalyzed: supplements,
        medicationsAnalyzed: medications,
      }
    });

    // Charge wallet and update counters (skip if allowed via free use)
    if (!allowViaFreeUse) {
      const cm = new CreditManager(user.id);
      const ok = await cm.chargeCents(wrapped.costCents);
      if (!ok) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }
    }

    // Update counters and mark free use as used
    if (allowViaFreeUse && !reanalysis) {
      // Mark free use as used
      await prisma.user.update({
        where: { id: user.id },
        data: {
          hasUsedFreeInteractionAnalysis: true,
        } as any
      });
    } else if (isPremium) {
      await prisma.user.update({
        where: { id: user.id },
        data: ( {
          monthlyInteractionAnalysisUsed: { increment: 1 },
          totalAnalysisCount: { increment: 1 },
        } as any )
      });
    }

    // Fire-and-forget: update insights preview based on new interaction results
    try { fetch('/api/insights/generate?preview=1', { method: 'POST' }).catch(()=>{}) } catch {}
    return NextResponse.json({ 
      success: true, 
      analysis,
      analysisId: savedAnalysis.id
    });

  } catch (error) {
    console.error('Error analyzing interactions:', error);
    return NextResponse.json({ 
      error: 'Failed to analyze interactions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 