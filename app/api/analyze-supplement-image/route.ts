import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OpenAI from 'openai';
import crypto from 'crypto';
import { logAiUsageEvent } from '@/lib/ai-usage-logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getImageMetadata } from '@/lib/image-metadata';
import { prisma } from '@/lib/prisma';
import { CreditManager } from '@/lib/credit-system';
import { hasFreeCredits, consumeFreeCredit, ensureFreeCreditColumns, type FreeCreditType } from '@/lib/free-credits';
import { capMaxTokensToBudget } from '@/lib/cost-meter';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { getUserIdFromNativeAuth } from '@/lib/native-auth';
import { signNativeVoiceDraft } from '@/lib/native-voice-review-token';
import { findHealthIntakeReviewMatch } from '@/lib/health-intake-review-match';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function cleanText(value: unknown, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isPlaceholderName(value: unknown) {
  const safe = cleanText(value, 120).toLowerCase();
  return new Set(['unknown', 'unknown supplement', 'unknown medication', 'analysis error', 'supplement label', 'medication label']).has(safe);
}

function hasPrivateLabelSignal(value: unknown, options: { allowSupplementBrandTerms?: boolean } = {}) {
  const text = cleanText(value, 240)
  const hasStrictPrivateSignal =
    /\b(patient|pharmacy|pharmacist|prescriber|prescribed by|doctor\s*(?:name|:)|rx\s*#?\s*\d|prescription|script|refill|npi|dob|date of birth|address|phone|tel|take as directed)\b/i.test(text)
  if (hasStrictPrivateSignal) return true
  if (options.allowSupplementBrandTerms) return false
  return /\bdr\.?\s+[a-z]+\s+[a-z]+\b/i.test(text)
}

function cleanLabelDosage(value: unknown) {
  const text = cleanText(value, 120)
  if (!text) return ''
  if (hasPrivateLabelSignal(text)) {
    return ''
  }

  const compact = text
    .replace(/\b(?:per|each)\s+(?:tablet|capsule|softgel|serving|dose)\b/gi, '')
    .replace(/\b(?:tablet|tablets|capsule|capsules|softgel|softgels)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  const doseMatch = compact.match(/\b\d+(?:[.,]\d+)?\s*(?:(?:billion|million|bn|m)\s+)?(?:mg|mcg|µg|ug|g|iu|i\.u\.|ml|mL|l|mmol|mEq|units?|cfu|%)\b(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:(?:billion|million|bn|m)\s+)?(?:mg|mcg|µg|ug|g|iu|i\.u\.|ml|mL|l|mmol|mEq|units?|cfu|%))?/i)
  if (!doseMatch) return ''

  return cleanText(doseMatch[0].replace(/\s+/g, ' '), 80)
}

function cleanLabelName(value: unknown, fallback: string) {
  const isSupplementFallback = fallback === 'Unknown Supplement'
  const text = cleanText(value, 180)
    .replace(/^[`"']+/, '')
    .replace(/[`"']+$/, '')
    .split('\n')[0]
    ?.trim() || fallback
  if (hasPrivateLabelSignal(text, { allowSupplementBrandTerms: isSupplementFallback })) {
    return fallback
  }
  const withoutDose = text
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:tablet|tablets|capsule|capsules|softgel|softgels|serving|servings|count|ct)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:(?:billion|million|bn|m)\s+)?(?:mg|mcg|µg|ug|g|iu|i\.u\.|ml|mL|l|mmol|mEq|units?|cfu|%)\b(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:(?:billion|million|bn|m)\s+)?(?:mg|mcg|µg|ug|g|iu|i\.u\.|ml|mL|l|mmol|mEq|units?|cfu|%))?/gi, ' ')
    .replace(/\b(?:per|each)\s+(?:tablet|capsule|softgel|serving|dose)\b/gi, ' ')
    .replace(/\b(?:tablet|tablets|capsule|capsules|softgel|softgels|serving|servings|count|ct)\b/gi, ' ')
    .replace(/\s*[-–—]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleanText(withoutDose || text, 160) || fallback
}

function stripJsonFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function hasAiConsentFlag(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'granted';
}

function hasPaidVoiceWalletAccess(wallet: any) {
  const topUpsAvailable = Array.isArray(wallet?.topUps)
    ? wallet.topUps.reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.availableCents || 0)), 0)
    : 0;
  const additionalAvailable = Math.max(0, Number(wallet?.additionalCreditsCents || 0));
  return Boolean(wallet?.plan) || topUpsAvailable > 0 || additionalAvailable > 0;
}

function voicePaidAccessResponse() {
  return NextResponse.json(
    { error: VOICE_PAID_ACCESS_MESSAGE, code: 'voice_subscription_required', requiresSubscription: true },
    { status: 402 },
  );
}

function imageNameFeature(scanType: 'supplement' | 'medication') {
  return scanType === 'medication' ? 'medications:image-name' : 'supplements:image-name';
}

async function countPriorImageNameScans(userId: string, feature: string) {
  const [withScanId, withoutScanId] = await Promise.all([
    prisma.aIUsageEvent.findMany({
      where: { userId, feature, success: true, scanId: { not: null } },
      distinct: ['scanId'],
      select: { scanId: true },
    }),
    prisma.aIUsageEvent.count({
      where: { userId, feature, success: true, scanId: null },
    }),
  ]);
  return withScanId.length + withoutScanId;
}

async function resolveRequestUser(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null;
  const sessionEmail = typeof session?.user?.email === 'string' ? session.user.email : null;
  const nativeUserId = sessionUserId || sessionEmail ? null : await getUserIdFromNativeAuth(req);
  if (sessionUserId || nativeUserId) {
    return prisma.user.findUnique({
      where: { id: sessionUserId || nativeUserId || '' },
      include: { subscription: true, creditTopUps: true },
    });
  }
  if (sessionEmail) {
    return prisma.user.findUnique({
      where: { email: sessionEmail },
      include: { subscription: true, creditTopUps: true },
    });
  }
  return null;
}

function parseVoiceReviewLabelResult(raw: unknown, scanType: 'supplement' | 'medication') {
  const fallback = scanType === 'medication' ? 'Unknown Medication' : 'Unknown Supplement';
  const text = cleanText(raw, 1000) || fallback;
  let name = text.split('\n')[0]?.trim() || fallback;
  let dosage = '';

  try {
    const parsed = JSON.parse(stripJsonFence(text));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rawName =
        (parsed as any).name ||
        (parsed as any).productName ||
        (parsed as any).product ||
        (parsed as any).label ||
        fallback
      name = cleanLabelName(
        rawName,
        fallback,
      );
      dosage = cleanLabelDosage(
        (parsed as any).dosage ||
          (parsed as any).dose ||
          (parsed as any).strength ||
          '',
      ) || cleanLabelDosage(rawName);
    }
  } catch {
    name = cleanLabelName(text, fallback);
    dosage = cleanLabelDosage(text);
  }

  return { name, dosage };
}

function parseLegacyLabelName(raw: unknown, scanType: 'supplement' | 'medication') {
  const fallback = scanType === 'medication' ? 'Unknown Medication' : 'Unknown Supplement';
  return cleanText(raw, 1000)
    .replace(/^[`"']+/, '')
    .replace(/[`"']+$/, '')
    .split('\n')[0]
    ?.trim() || fallback;
}

async function buildVoiceReviewDraft(userId: string, itemType: 'supplement' | 'medication', name: string, localDate: string, dosage = '') {
  const label = itemType === 'medication' ? 'Medication' : 'Supplement';
  const catalogMatch = await findHealthIntakeReviewMatch(itemType, name);
  const dose = cleanLabelDosage(dosage);
  const baseDraft = {
    action: 'health_intake_items',
    transcript: `Bottle label scan: ${name}`,
    localDate,
    summary: `Health Intake: 1 ${itemType}`,
    confirmationMessage:
      `I found this label:\n${label}: ${name} (${dose || 'dose not specified'}; timing not specified)\n\n` +
      'Please review it before saving. I am only recording what you already take, not recommending that you start, stop, or change anything.',
    canConfirm: true,
    autoSave: false,
    healthIntake: {
      items: [
        {
          type: itemType,
          name,
          dosage: dose,
          timing: [],
          scheduleInfo: '',
          method: 'photo',
          imageUrl: null,
          source: 'label_scan',
          catalogMatch,
        },
      ],
    },
  };
  const reviewableDraft = {
    ...baseDraft,
    reviewNonce: crypto.randomUUID(),
    reviewIssuedAt: Date.now(),
  };
  return {
    ...reviewableDraft,
    reviewToken: signNativeVoiceDraft(userId, reviewableDraft),
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await resolveRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // NextRequest.formData() returns a standard web FormData, but type
    // definitions can vary between runtimes and cause build-time TS errors.
    // Cast to `any` here to preserve runtime behavior without changing logic.
    const formData: any = await req.formData();
    const imageFile = formData.get('image') as File;
    const scanType = String(formData.get('scanType') || 'supplement').toLowerCase() === 'medication' ? 'medication' : 'supplement';
    const scanId = String(formData.get('scanId') || '').trim();
    const voiceReview = String(formData.get('voiceReview') || '').toLowerCase() === 'true';
    const aiConsentGranted = hasAiConsentFlag(formData.get('aiConsentGranted') || formData.get('aiConsent'));
    const localDate = /^\d{4}-\d{2}-\d{2}$/.test(String(formData.get('localDate') || '').trim())
      ? String(formData.get('localDate')).trim()
      : new Date().toISOString().slice(0, 10);

    if (voiceReview && !aiConsentGranted) {
      return NextResponse.json(
        { error: 'AI sharing consent is required before a bottle label can be reviewed by Talk to Helfi.' },
        { status: 403 }
      );
    }

    if (voiceReview) {
      const wallet = await new CreditManager(user.id).getWalletStatus();
      if (!hasPaidVoiceWalletAccess(wallet)) return voicePaidAccessResponse();
    }

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
    // Analyze image to extract supplement name
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }
    const promptText = voiceReview
      ? `Analyze this supplement or medication bottle/package image and extract the BRAND + PRODUCT NAME and clearly visible dose/strength.

CRITICAL INSTRUCTIONS:
1. Return the brand AND the product name if both are clearly visible.
2. Format: "Brand - Product" (example: "Thorne - Magnesium Bisglycinate").
3. If brand is not visible, return only the product name.
4. Put clearly visible dose/strength in dosage only, for example "500 mg", "1000 IU", "50 mcg", or "1 mg/mL".
5. If it's a medication and both brand + generic are clearly visible, return "Brand (Generic)" or "Generic (Brand)".
6. Do NOT include package size, capsule/tablet count, marketing claims, pharmacy details, prescriber names, patient names, or prescription numbers.
7. If dose/strength is not clearly visible, use an empty dosage string.
8. If the label is not clear enough to identify the product name, use "${scanType === 'medication' ? 'Unknown Medication' : 'Unknown Supplement'}".

Return only JSON in this exact shape:
{"name":"Brand - Product","dosage":"clearly visible dose or empty string"}`
      : `Analyze this supplement or medication bottle/package image and extract the BRAND + PRODUCT NAME.

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
    const feature = imageNameFeature(scanType);
    let maxTokens = voiceReview ? 80 : 50;

    // If this scanId was already charged once (front/back pair), skip charging again.
    let skipCharge = false;
    if (scanId) {
      const prior = await prisma.aIUsageEvent.findFirst({
        where: {
          scanId,
          feature,
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
        const [savedImageCount, usedScanCount] = await Promise.all([
          prisma.supplement.count({
            where: { userId: user.id, imageUrl: { not: null } },
          }),
          countPriorImageNameScans(user.id, feature),
        ]);
        const usedCount = Math.max(savedImageCount, usedScanCount);
        const remaining = Math.max(0, 10 - usedCount);
        if (remaining > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { freeSupplementImageRemaining: remaining } as any,
          });
        }
      }
      if (scanType === 'medication' && medicationField <= 0) {
        const [savedImageCount, usedScanCount] = await Promise.all([
          prisma.medication.count({
            where: { userId: user.id, imageUrl: { not: null } },
          }),
          countPriorImageNameScans(user.id, feature),
        ]);
        const usedCount = Math.max(savedImageCount, usedScanCount);
        const remaining = Math.max(0, 10 - usedCount);
        if (remaining > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { freeMedicationImageRemaining: remaining } as any,
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
        maxTokens = capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents);
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
      feature,
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

    const rawName = wrapped.completion.choices?.[0]?.message?.content?.trim() || (scanType === 'medication' ? 'Unknown Medication' : 'Unknown Supplement');
    const labelResult = voiceReview
      ? parseVoiceReviewLabelResult(rawName, scanType)
      : { name: parseLegacyLabelName(rawName, scanType), dosage: '' };
    const cleanedName = labelResult.name;
    
    console.log('Extracted supplement name:', cleanedName);

    if (voiceReview && isPlaceholderName(cleanedName)) {
      return NextResponse.json(
        {
          error: 'I could not read the label clearly enough. Please try a clearer photo or type the name.',
          supplementName: cleanedName,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      supplementName: cleanedName,
      ...(voiceReview ? { dosage: labelResult.dosage, draft: await buildVoiceReviewDraft(user.id, scanType, cleanedName, localDate, labelResult.dosage) } : {}),
    });

  } catch (error) {
    console.error('Error analyzing supplement image:', error);
    return NextResponse.json(
      { error: 'Failed to analyze supplement image', supplementName: 'Analysis Error' },
      { status: 500 }
    );
  }
} 
