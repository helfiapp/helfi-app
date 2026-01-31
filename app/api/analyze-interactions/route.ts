import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits';
import OpenAI from 'openai';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { capMaxTokensToBudget } from '@/lib/cost-meter';
import { logAIUsage } from '@/lib/ai-usage-logger';
import { isSubscriptionActive } from '@/lib/subscription-utils';
import { logServerCall } from '@/lib/server-call-tracker';
import { del } from '@vercel/blob';
import { v2 as cloudinary } from 'cloudinary';
import { extractBlobPathWithPrefixes } from '@/lib/blob-paths';

// Lazily initialize OpenAI to avoid build-time env requirements
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const BLOB_PATH_PREFIXES = ['supplement-images/', 'medication-images/'];

const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;

if (blobToken && !process.env.BLOB_READ_WRITE_TOKEN) {
  process.env.BLOB_READ_WRITE_TOKEN = blobToken;
}

const hasBlobToken = Boolean(blobToken);

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
  });
}

type CloudinaryResourceType = 'image' | 'video' | 'raw';
type CloudinaryAsset = { publicId: string; resourceType: CloudinaryResourceType };

const isCloudinaryUrl = (value: string) => value.includes('cloudinary.com');

const parseCloudinaryAsset = (url: string): CloudinaryAsset | null => {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('cloudinary.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const uploadIndex = parts.findIndex((part) => part === 'upload');
    if (uploadIndex <= 0) return null;
    const resourceType = parts[uploadIndex - 1] as CloudinaryResourceType;
    const afterUpload = parts.slice(uploadIndex + 1);
    const versionIndex = afterUpload.findIndex((part) => /^v\\d+$/.test(part));
    const publicParts = versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload;
    if (!publicParts.length) return null;
    const publicIdWithExt = publicParts.join('/');
    const publicId = publicIdWithExt.replace(/\\.[^/.]+$/, '');
    if (!publicId) return null;
    const normalized: CloudinaryResourceType =
      resourceType === 'video' || resourceType === 'raw' ? resourceType : 'image';
    return { publicId, resourceType: normalized };
  } catch {
    return null;
  }
};

const addCloudinaryAsset = (targets: Map<string, CloudinaryAsset>, asset: CloudinaryAsset | null) => {
  if (!asset?.publicId) return;
  const key = `${asset.resourceType}:${asset.publicId}`;
  if (!targets.has(key)) {
    targets.set(key, asset);
  }
};

const addBlobTarget = (targets: Set<string>, value?: string | null) => {
  if (!value) return;
  const path = extractBlobPathWithPrefixes(value, BLOB_PATH_PREFIXES);
  if (path) {
    targets.add(path);
  }
};

const parseImageUrls = (raw: any): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
        }
        if (parsed && (parsed.front || parsed.back)) {
          return [parsed.front, parsed.back].map((entry) => String(entry || '').trim()).filter(Boolean);
        }
      } catch {
        // fall through to treat as a direct URL
      }
    }
    return [trimmed];
  }
  if (typeof raw === 'object') {
    const urls: string[] = [];
    const front = (raw as any).front || (raw as any).frontUrl;
    const back = (raw as any).back || (raw as any).backUrl;
    const url = (raw as any).url || (raw as any).imageUrl;
    if (front) urls.push(String(front).trim());
    if (back) urls.push(String(back).trim());
    if (url) urls.push(String(url).trim());
    return urls.filter(Boolean);
  }
  return [];
};

const stripImageFields = (items: any[]) => {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const { imageUrl, frontImage, backImage, ...rest } = item as any;
    return rest;
  });
};

const deleteCloudinaryAssets = async (assets: CloudinaryAsset[]) => {
  if (!assets.length || !hasCloudinaryConfig) return 0;
  let deleted = 0;
  for (const asset of assets) {
    const result = await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType,
      invalidate: true,
    });
    if (result?.result === 'ok' || result?.result === 'not found') {
      deleted += 1;
    }
  }
  return deleted;
};

const deleteBlobTargets = async (targets: string[]) => {
  if (!targets.length || !hasBlobToken) return 0;
  await del(targets);
  return targets.length;
};

const cleanupInteractionImages = async (params: {
  userId: string;
  supplements: any[];
  medications: any[];
}) => {
  const blobTargets = new Set<string>();
  const cloudinaryAssets = new Map<string, CloudinaryAsset>();
  const imageUrls: string[] = [];

  params.supplements.forEach((supp: any) => {
    imageUrls.push(...parseImageUrls(supp?.imageUrl));
  });
  params.medications.forEach((med: any) => {
    imageUrls.push(...parseImageUrls(med?.imageUrl));
  });

  imageUrls.forEach((url) => {
    if (!url) return;
    addBlobTarget(blobTargets, url);
    if (isCloudinaryUrl(url)) {
      addCloudinaryAsset(cloudinaryAssets, parseCloudinaryAsset(url));
    }
  });

  const files = await prisma.file.findMany({
    where: {
      uploadedById: params.userId,
      usage: { in: ['SUPPLEMENT_IMAGE', 'MEDICATION_IMAGE'] },
    },
    select: {
      id: true,
      cloudinaryId: true,
      cloudinaryUrl: true,
      secureUrl: true,
    },
  });

  const fileIds = files.map((file) => file.id);

  files.forEach((file) => {
    addBlobTarget(blobTargets, file.cloudinaryId || undefined);
    addBlobTarget(blobTargets, file.cloudinaryUrl || undefined);
    addBlobTarget(blobTargets, file.secureUrl || undefined);

    const cloudinaryUrl = file.secureUrl || file.cloudinaryUrl;
    if (cloudinaryUrl && isCloudinaryUrl(cloudinaryUrl)) {
      addCloudinaryAsset(cloudinaryAssets, parseCloudinaryAsset(cloudinaryUrl));
      return;
    }

    if (file.cloudinaryId && !extractBlobPathWithPrefixes(file.cloudinaryId, BLOB_PATH_PREFIXES)) {
      addCloudinaryAsset(cloudinaryAssets, { publicId: file.cloudinaryId, resourceType: 'image' });
    }
  });

  if (cloudinaryAssets.size > 0) {
    await deleteCloudinaryAssets(Array.from(cloudinaryAssets.values()));
  }
  if (blobTargets.size > 0) {
    await deleteBlobTargets(Array.from(blobTargets.values()));
  }
  if (fileIds.length > 0) {
    await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
  }

  await prisma.supplement.updateMany({
    where: { userId: params.userId },
    data: { imageUrl: null },
  });
  await prisma.medication.updateMany({
    where: { userId: params.userId },
    data: { imageUrl: null },
  });

  const backupNames = ['__SUPPLEMENTS_BACKUP_DATA__', '__SUPPLEMENTS_EMERGENCY_BACKUP__'];
  for (const name of backupNames) {
    const record = await prisma.healthGoal.findFirst({
      where: { userId: params.userId, name },
    });
    if (!record?.category) continue;
    try {
      const parsed = JSON.parse(record.category);
      if (parsed && Array.isArray(parsed.supplements)) {
        parsed.supplements = stripImageFields(parsed.supplements);
        await prisma.healthGoal.update({
          where: { id: record.id },
          data: { category: JSON.stringify(parsed) },
        });
      }
    } catch {
      // ignore backup parse errors
    }
  }
};

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supplements, medications, analysisName, reanalysis } = await request.json();
    const supplementsList = Array.isArray(supplements) ? supplements : [];
    const medicationsList = Array.isArray(medications) ? medications : [];

    if (!Array.isArray(supplements) || !Array.isArray(medications)) {
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

    logServerCall({
      feature: 'interactionAnalysis',
      endpoint: '/api/analyze-interactions',
      kind: 'analysis',
    }).catch((error) => {
      console.error('❌ Failed to log interaction analysis call:', error);
    });

    // PREMIUM/CREDITS/FREE USE GATING
    const isPremium = isSubscriptionActive(user.subscription);
    
    // Check if user has purchased credits (non-expired)
    const now = new Date();
    const hasPurchasedCredits = user.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    );
    
    const hasFreeInteractionCredits = await hasFreeCredits(user.id, 'INTERACTION_ANALYSIS');
    const hasFreeInteractionReanalysis = await hasFreeCredits(user.id, 'INTERACTION_REANALYSIS');
    
    // Allow if: Premium subscription OR has purchased credits OR has free credits
    let allowViaFreeUse = false;
    if (!isPremium && !hasPurchasedCredits) {
      if (reanalysis) {
        if (hasFreeInteractionReanalysis) {
          allowViaFreeUse = true;
        } else {
          return NextResponse.json(
            {
              error: 'Payment required',
              message: 'You\'ve used all your free interaction re-analyses. Subscribe to a monthly plan or purchase credits to continue.',
              requiresPayment: true,
              exhaustedFreeCredits: true,
            },
            { status: 402 }
          );
        }
      } else if (hasFreeInteractionCredits) {
        allowViaFreeUse = true;
      } else {
        return NextResponse.json(
          { 
            error: 'Payment required',
            message: 'You\'ve used all your free interaction analyses. Subscribe to a monthly plan or purchase credits to continue.',
            requiresPayment: true,
            exhaustedFreeCredits: true,
          },
          { status: 402 }
        );
      }
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

    // Prepare the data for AI analysis
    const supplementList = (supplementsList as any[]).map((s: any) => ({
      name: s.name,
      dosage: s.dosage,
      timing: Array.isArray(s.timing) ? s.timing.join(', ') : s.timing,
      schedule: s.scheduleInfo
    }));

    const medicationList = (medicationsList as any[]).map((m: any) => ({
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
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const model = "gpt-5.2";

    let maxTokens = 2000;
    // Wallet pre-check (skip if allowed via free use)
    if (!allowViaFreeUse) {
      const cm = new CreditManager(user.id);
      const wallet = await cm.getWalletStatus();
      const cappedMaxTokens = capMaxTokensToBudget(model, prompt, maxTokens, wallet.totalAvailableCents);
      if (cappedMaxTokens <= 0) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }
      maxTokens = cappedMaxTokens;
    }

    // Immediate pre-charge (interaction analysis typical cost = CREDIT_COSTS.INTERACTION_ANALYSIS)
    let prechargedCents = 0;
    if (!allowViaFreeUse) {
      try {
        const cm = new CreditManager(user.id);
        const immediate = CREDIT_COSTS.INTERACTION_ANALYSIS;
        const okPre = await cm.chargeCents(immediate);
        if (!okPre) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
        }
        prechargedCents = immediate;
      } catch {
        return NextResponse.json({ error: 'Billing error' }, { status: 402 });
      }
    }

    const wrapped = await chatCompletionWithCost(openai, {
      model,
      messages: [
        {
          role: "system",
          content: "You are a clinical pharmacist with expertise in drug-supplement interactions. Provide accurate, evidence-based analysis while being appropriately cautious about medical advice. Return ONLY valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
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
    analysis.supplementCount = supplementsList.length;
    analysis.medicationCount = medicationsList.length;

    // Generate analysis name if not provided
    const defaultAnalysisName = analysisName || 
      `Analysis ${new Date().toLocaleDateString()} - ${supplementsList.length} supplements, ${medicationsList.length} medications`;

    const cleanedSupplements = stripImageFields(supplementsList);
    const cleanedMedications = stripImageFields(medicationsList);

    // Save analysis to database
    const savedAnalysis = await prisma.interactionAnalysis.create({
      data: {
        userId: user.id,
        analysisName: defaultAnalysisName,
        overallRisk: analysis.overallRisk,
        supplementCount: supplementsList.length,
        medicationCount: medicationsList.length,
        analysisData: analysis,
        supplementsAnalyzed: cleanedSupplements,
        medicationsAnalyzed: cleanedMedications,
      }
    });

    try {
      await cleanupInteractionImages({
        userId: user.id,
        supplements: supplementsList,
        medications: medicationsList,
      });
    } catch (cleanupError) {
      console.warn('⚠️ Failed to clean up interaction photos:', cleanupError);
    }

    // Charge wallet and update counters (skip if allowed via free use)
    if (!allowViaFreeUse) {
      const cm = new CreditManager(user.id);
      const remainder = Math.max(0, wrapped.costCents - prechargedCents);
      const ok = await cm.chargeCents(remainder);
      if (!ok) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }
    }

    // Update counters and consume free credits
    if (allowViaFreeUse) {
      await consumeFreeCredit(user.id, reanalysis ? 'INTERACTION_REANALYSIS' : 'INTERACTION_ANALYSIS');
    }
    // Update counters (for all users, not just premium)
    await prisma.user.update({
      where: { id: user.id },
      data: ( {
        monthlyInteractionAnalysisUsed: { increment: 1 },
        totalInteractionAnalysisCount: { increment: 1 },
        totalAnalysisCount: { increment: 1 },
      } as any )
    });

    // Log AI usage for interaction analysis (fire-and-forget)
    try {
      await logAIUsage({
        context: { feature: 'interactions:analysis', userId: user.id },
        model,
        promptTokens: wrapped.promptTokens,
        completionTokens: wrapped.completionTokens,
        costCents: wrapped.costCents,
      });
    } catch {
      // Logging should never break the main flow
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
