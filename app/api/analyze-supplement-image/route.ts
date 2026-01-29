import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OpenAI from 'openai';
import { logAiUsageEvent } from '@/lib/ai-usage-logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getImageMetadata } from '@/lib/image-metadata';
import { prisma } from '@/lib/prisma';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import { hasFreeCredits, consumeFreeCredit, ensureFreeCreditColumns, type FreeCreditType } from '@/lib/free-credits';
import { capMaxTokensToBudget } from '@/lib/cost-meter';
import { chatCompletionWithCost } from '@/lib/metered-openai';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const imageFile = formData.get('image') as File;
    const scanType = String(formData.get('scanType') || 'supplement').toLowerCase();
    const scanId = String(formData.get('scanId') || '').trim();

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown';
    const rateCheck = await consumeRateLimit('supplement-image', `ip:${clientIp}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000));
      return NextResponse.json(
        { error: 'Too many supplement image analyses. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Convert image to base64
    const imageBuffer = await imageFile.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const meta = getImageMetadata(imageBuffer);
    
    console.log('Analyzing supplement image:', {
      name: imageFile.name,
      type: imageFile.type,
      size: imageFile.size
    });

    await ensureFreeCreditColumns();
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true, creditTopUps: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Analyze image to extract supplement name
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    const promptText = `Analyze this supplement or medication bottle/package image and extract the BRAND + PRODUCT NAME.

CRITICAL INSTRUCTIONS:
1. Return the brand AND the product name if both are visible.
2. Format: "Brand - Product" (example: "Thorne - Magnesium Bisglycinate").
3. If brand is not visible, return only the product name.
4. Do NOT include dosage, size, "capsules", "tablets", or marketing claims.
5. If it's a medication and both brand + generic are visible, return "Brand (Generic)" or "Generic (Brand)".
6. If you are not 100% sure, still return your BEST GUESS.
7. Only return "Unknown Supplement" if the label is unreadable.

Return only the final name string, no extra text.`;

    const model = "gpt-4o";
    const cm = new CreditManager(user.id);
    const freeType: FreeCreditType = scanType === 'medication' ? 'MEDICATION_IMAGE' : 'SUPPLEMENT_IMAGE';
    let maxTokens = 50;

    // If this scanId was already charged once (front/back pair), skip charging again.
    let skipCharge = false;
    if (scanId) {
      const prior = await prisma.aIUsageEvent.findFirst({
        where: {
          scanId,
          feature: scanType === 'medication' ? 'medications:image-name' : 'supplements:image-name',
        },
        select: { id: true },
      });
      if (prior) skipCharge = true;
    }

    let usedFree = false;
    if (!skipCharge) {
      // If user hasn't used photo scans yet, grant the initial free batch (10).
      const supplementField = (user as any).freeSupplementImageRemaining ?? 0;
      const medicationField = (user as any).freeMedicationImageRemaining ?? 0;
      if (scanType === 'supplement' && supplementField <= 0) {
        const usedCount = await prisma.supplement.count({
          where: { userId: user.id, imageUrl: { not: null } },
        });
        if (usedCount === 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { freeSupplementImageRemaining: 10 } as any,
          });
        }
      }
      if (scanType === 'medication' && medicationField <= 0) {
        const usedCount = await prisma.medication.count({
          where: { userId: user.id, imageUrl: { not: null } },
        });
        if (usedCount === 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { freeMedicationImageRemaining: 10 } as any,
          });
        }
      }

      const hasFree = await hasFreeCredits(user.id, freeType);
      if (hasFree) {
        const consumed = await consumeFreeCredit(user.id, freeType);
        usedFree = consumed;
      }
      if (!usedFree) {
        const wallet = await cm.getWalletStatus();
        maxTokens = capMaxTokensToBudget(model, promptText, 50, wallet.totalAvailableCents);
        if (maxTokens <= 0) {
          return NextResponse.json(
            {
              error: 'Insufficient credits',
              message: 'Free photo scans used up. Please upgrade or buy credits in Billing to add more.',
            },
            { status: 402 }
          );
        }
      }
    }

    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageFile.type};base64,${imageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: maxTokens,
      temperature: 0.1
    } as any);

    if (!usedFree && !skipCharge) {
      const ok = await cm.chargeCents(wrapped.costCents);
      if (!ok) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            message: 'Free photo scans used up. Please upgrade or buy credits in Billing to add more.',
          },
          { status: 402 }
        );
      }
    }

    // Persist usage (vision)
    logAiUsageEvent({
      feature: scanType === 'medication' ? 'medications:image-name' : 'supplements:image-name',
      endpoint: '/api/analyze-supplement-image',
      userId: user.id,
      userLabel: user.email || (clientIp ? `ip:${clientIp}` : null),
      scanId: scanId || `supplement-${Date.now()}`,
      model,
      promptTokens: wrapped.promptTokens,
      completionTokens: wrapped.completionTokens,
      costCents: usedFree || skipCharge ? 0 : wrapped.costCents,
      image: {
        width: meta.width,
        height: meta.height,
        bytes: imageBuffer.byteLength,
        mime: imageFile.type || null
      },
      success: true,
    }).catch(() => {});

    const rawName = wrapped.completion.choices?.[0]?.message?.content?.trim() || 'Unknown Supplement';
    const cleanedName = rawName
      .replace(/^[`"']+/, '')
      .replace(/[`"']+$/, '')
      .split('\n')[0]
      ?.trim() || 'Unknown Supplement';
    
    console.log('Extracted supplement name:', cleanedName);

    return NextResponse.json({
      success: true,
      supplementName: cleanedName
    });

  } catch (error) {
    console.error('Error analyzing supplement image:', error);
    return NextResponse.json(
      { error: 'Failed to analyze supplement image', supplementName: 'Analysis Error' },
      { status: 500 }
    );
  }
} 
