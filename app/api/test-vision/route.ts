import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import { CreditManager } from '@/lib/credit-system';
import { chatCompletionWithCost } from '@/lib/metered-openai';
import { logAiUsageEvent } from '@/lib/ai-usage-logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getImageMetadata } from '@/lib/image-metadata';
import { encryptBuffer } from '@/lib/file-encryption';
import { createSignedFileToken } from '@/lib/signed-file';
import { isSubscriptionActive } from '@/lib/subscription-utils';
import { logServerCall } from '@/lib/server-call-tracker';
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits';
import { getUserIdFromNativeAuth } from '@/lib/native-auth';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;

const contentTypeToExt = (contentType: string) => {
  if (contentType === 'image/avif') return 'avif';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'jpg';
};

const inferContentTypeFromName = (name: string) => {
  const lower = String(name || '').trim().toLowerCase();
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return null;
};

const detectMimeTypeFromBuffer = (buffer: Buffer): string | null => {
  if (!buffer || buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF87a / GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }

  // WEBP container
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // ISO BMFF family (AVIF/HEIC/HEIF)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.slice(8, 12).toString('ascii').toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') return 'image/heic';
    if (brand === 'heif' || brand === 'heis' || brand === 'heim' || brand === 'hevm' || brand === 'mif1' || brand === 'msf1') return 'image/heif';
  }

  return null;
};

const resolveImageContentType = (type: string, name: string, detectedFromBuffer: string | null) => {
  if (detectedFromBuffer && detectedFromBuffer.startsWith('image/')) return detectedFromBuffer;
  const trimmedType = String(type || '').trim().toLowerCase();
  if (trimmedType.startsWith('image/')) return trimmedType;
  return inferContentTypeFromName(name) || 'image/jpeg';
};

const shouldConvertForAi = (mimeType: string) => {
  return mimeType === 'image/avif' || mimeType === 'image/heic' || mimeType === 'image/heif';
};

async function normalizeImageForAi(buffer: Buffer, mimeType: string) {
  if (!shouldConvertForAi(mimeType)) {
    return { buffer, mimeType, converted: false as const };
  }

  try {
    // Load sharp only when needed and only if it is available in this runtime.
    // This keeps deployment/build resilient across environments.
    // eslint-disable-next-line no-new-func
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    const sharpModule = await dynamicImport('sharp').catch(() => null);
    const sharp = sharpModule?.default || sharpModule;
    if (!sharp) {
      return { buffer, mimeType, converted: false as const };
    }
    const convertedBuffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
    return { buffer: convertedBuffer, mimeType: 'image/jpeg', converted: true as const };
  } catch (error) {
    console.warn('[test-vision] failed to convert image for AI, using original format', error);
    return { buffer, mimeType, converted: false as const };
  }
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function resolveMedicalAnalysisUser(request: NextRequest) {
  const include = { subscription: true, creditTopUps: true } as const;

  const session = await getServerSession(authOptions);
  const sessionUserId = String(session?.user?.id || '').trim();
  if (sessionUserId) {
    const sessionUser = await prisma.user.findUnique({
      where: { id: sessionUserId },
      include,
    });
    if (sessionUser) return sessionUser;
  }

  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase();
  if (sessionEmail) {
    const sessionUser = await prisma.user.findUnique({
      where: { email: sessionEmail },
      include,
    });
    if (sessionUser) return sessionUser;
  }

  const token = await getToken({
    req: request as any,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
  }).catch(() => null);

  const tokenUserId = String(token?.sub || token?.id || '').trim();
  if (tokenUserId) {
    const tokenUser = await prisma.user.findUnique({
      where: { id: tokenUserId },
      include,
    });
    if (tokenUser) return tokenUser;
  }

  const tokenEmail = String(token?.email || '').trim().toLowerCase();
  if (tokenEmail) {
    const tokenUser = await prisma.user.findUnique({
      where: { email: tokenEmail },
      include,
    });
    if (tokenUser) return tokenUser;
  }

  const nativeUserId = await getUserIdFromNativeAuth(request);
  if (!nativeUserId) return null;

  const nativeUser = await prisma.user.findUnique({
    where: { id: nativeUserId },
    include,
  });
  return nativeUser || null;
}

export async function POST(req: NextRequest) {
  try {
    // Health image notes access check.
    const user = await resolveMedicalAnalysisUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    logServerCall({
      feature: 'medicalImageAnalysis',
      endpoint: '/api/test-vision',
      kind: 'analysis',
    }).catch((error) => {
      console.error('❌ Failed to log medical analysis call:', error);
    });
    
    // PREMIUM/CREDITS/FREE USE GATING
    const isPremium = isSubscriptionActive(user.subscription);
    
    // Check if user has purchased credits (non-expired)
    const now = new Date();
    const hasPurchasedCredits = user.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    );
    
    const hasLegacyCredits = Number((user as any)?.additionalCredits || 0) > 0;
    const hasPaidAccess = isPremium || hasPurchasedCredits || hasLegacyCredits;
    const hasFreeMedicalCredits = await hasFreeCredits(user.id, 'MEDICAL_ANALYSIS');
    
    // Allow if: any paid access OR free credits remaining
    if (!hasPaidAccess && !hasFreeMedicalCredits) {
      return NextResponse.json(
        { 
          error: 'Payment required',
          message: 'You have used all your free health image notes requests. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true,
          exhaustedFreeCredits: true,
        },
        { status: 402 }
      );
    }

    // NextRequest.formData() returns a standard web FormData, but type
    // definitions can vary between runtimes and cause build-time TS errors.
    // Cast to `any` here to preserve runtime behavior without changing logic.
    const formData: any = await req.formData();
    const imageFile = formData.get('image') as File;
    const saveToHistoryRaw = String(formData.get('saveToHistory') || '').toLowerCase();
    const saveToHistory = saveToHistoryRaw === 'true' || saveToHistoryRaw === '1' || saveToHistoryRaw === 'yes';

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }
    const originalBuffer = Buffer.from(await imageFile.arrayBuffer());
    const detectedImageType = detectMimeTypeFromBuffer(originalBuffer);
    const resolvedImageType = resolveImageContentType(imageFile.type, imageFile.name, detectedImageType);
    const hasImageHint =
      Boolean(detectedImageType) ||
      String(imageFile.type || '').toLowerCase().startsWith('image/') ||
      Boolean(inferContentTypeFromName(imageFile.name));
    if (!hasImageHint) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please upload an image file (JPG, PNG, GIF, WEBP, or AVIF).',
        },
        { status: 400 }
      );
    }

    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown';
    const rateKey = user.id ? `user:${user.id}` : `ip:${clientIp}`;
    const rateCheck = await consumeRateLimit('medical-image', rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rateCheck.allowed) {
      const retryAfter = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000));
      return NextResponse.json(
        { error: 'Too many health image notes requests. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Convert image to base64
    const normalizedImage = await normalizeImageForAi(originalBuffer, resolvedImageType);
    const imageBase64 = normalizedImage.buffer.toString('base64');
    const imageMeta = getImageMetadata(normalizedImage.buffer);
    
    console.log('Image info:', {
      name: imageFile.name,
      type: resolvedImageType,
      aiType: normalizedImage.mimeType,
      aiConverted: normalizedImage.converted,
      size: imageFile.size,
      base64Length: imageBase64.length
    });

    // Use OpenAI client (GPT-4o vision) via metered wrapper
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }
    
    // Immediate pre-charge (2 credits) before calling the model (skip for free trial)
    const allowViaFreeUse = !hasPaidAccess && hasFreeMedicalCredits;
    let prechargedCents = 0;
    if (!allowViaFreeUse) {
      try {
        const cm = new CreditManager(user.id);
        const immediate = 2; // health image notes typical cost (credits)
        const okPre = await cm.chargeCents(immediate);
        if (!okPre && !hasPaidAccess) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
        }
        if (okPre) {
          prechargedCents = immediate;
        } else {
          console.error('[test-vision.POST] paid-user precharge could not be written');
        }
      } catch (billingError) {
        if (!hasPaidAccess) {
          return NextResponse.json({ error: 'Billing error' }, { status: 402 });
        }
        console.error('[test-vision.POST] paid-user precharge fallback', billingError);
      }
    }

    const wrapped = await chatCompletionWithCost(openai, {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text:
                "You are a cautious general health image note assistant. You help users record visible details from photos so they can track changes and discuss them with a licensed healthcare professional. " +
                "You are not a doctor, not a medical device, and must not provide diagnosis, treatment advice, or certainty. " +
                "Use simple, everyday language and avoid medical jargon unless you immediately explain it. " +
                "Focus only on visible details in the image and ignore backgrounds, furniture, or unrelated objects.\n\n" +
                "Your response must ALWAYS be structured in this exact format:\n\n" +
                "1) VISIBLE DETAILS:\n" +
                "- Describe only what is visible: location if obvious, size relative to the body part, shape, color, borders, texture, swelling, redness, discharge, or other visible features.\n\n" +
                "2) TOPICS TO DISCUSS WITH A DOCTOR:\n" +
                "- List 2-4 broad discussion topics only. Do not list likely conditions and do not diagnose.\n" +
                "- Phrase each item as something to ask a healthcare professional about.\n\n" +
                "3) WHEN TO SEEK URGENT CARE:\n" +
                "- Explain visible warning signs that would make professional help urgent, and include general worsening signs the user should not ignore.\n\n" +
                "4) TRACKING NOTES AND DOCTOR QUESTIONS:\n" +
                "- Give practical tracking notes and questions for a doctor. Do not suggest medicines, supplements, procedures, dosing, or treatment plans.\n\n" +
                "After you finish sections 1–4 above, append a compact JSON block between <STRUCTURED_JSON> and </STRUCTURED_JSON> with this exact shape:\n" +
                "<STRUCTURED_JSON>{\"summary\":\"string\",\"possibleCauses\":[{\"name\":\"string\",\"whyLikely\":\"string\",\"confidence\":\"low|medium|high\"}],\"redFlags\":[\"string\"],\"nextSteps\":[\"string\"],\"disclaimer\":\"string\"}</STRUCTURED_JSON>\n" +
                "Rules for the JSON:\n" +
                "- \"summary\": 1-3 plain-language sentences describing visible details only.\n" +
                "- The field named \"possibleCauses\" is an internal compatibility field. Fill it with broad doctor-discussion topics only, not conditions and not likely causes.\n" +
                "- \"name\" must be a broad topic such as \"Skin change to review\" or \"Visible redness to discuss\", not a diagnosis.\n" +
                "- \"whyLikely\" must explain why the visible detail is worth discussing with a doctor, not why a condition is likely.\n" +
                "- Set every \"confidence\" value to \"low\" because Helfi is not assessing medical likelihood.\n" +
                "- \"redFlags\": short bullet-style strings describing urgent warning signs.\n" +
                "- \"nextSteps\": tracking notes and questions for a healthcare professional only.\n" +
                "- \"disclaimer\": clear reminder that these are general notes only and not medical advice, diagnosis, treatment, or a replacement for a real doctor.\n\n" +
                "Important safety rules:\n" +
                "- Do NOT give a formal diagnosis or claim certainty.\n" +
                "- Do NOT tell the user that they do not need a doctor.\n" +
                "- Do NOT provide treatment instructions.\n" +
                "- Always remind the user that these notes are general information only and do not replace a real doctor examination.\n" +
                "- If the image does not appear to contain a health-related concern, say that clearly and advise the user to consult a healthcare professional if they are worried."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "This image was uploaded to Health Image Notes inside a health app. " +
                "Please create general visible-detail notes following the required structure."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${normalizedImage.mimeType};base64,${imageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 900,
      temperature: 0.15
    } as any);

    logAiUsageEvent({
      feature: 'medical-image:analysis',
      scanId: `medical-${Date.now()}`,
      userId: user.id || null,
      userLabel: user.email || null,
      model: "gpt-4o",
      promptTokens: wrapped.promptTokens,
      completionTokens: wrapped.completionTokens,
      costCents: wrapped.costCents,
      image: {
        width: imageMeta.width,
        height: imageMeta.height,
        bytes: normalizedImage.buffer.byteLength,
        mime: normalizedImage.mimeType || null,
      },
      endpoint: '/api/test-vision',
      success: true,
    }).catch(() => {});

    const analysisRaw = wrapped.completion.choices[0]?.message?.content || '';

    // Extract optional structured JSON block (mirrors symptom analyzer pattern)
    let structured: any = null;
    let cleanAnalysis = analysisRaw;
    try {
      const m = analysisRaw.match(/<STRUCTURED_JSON>([\s\S]*?)<\/STRUCTURED_JSON>/i);
      if (m && m[1]) {
        structured = JSON.parse(m[1]);
        cleanAnalysis = analysisRaw.replace(m[0], '').trim();
      }
    } catch (err) {
      console.warn('Failed to parse medical STRUCTURED_JSON block:', err);
    }
    
    // Charge wallet remainder (skip if allowed via free use)
    if (!allowViaFreeUse) {
      try {
        const cm = new CreditManager(user.id);
        const remainder = Math.max(0, wrapped.costCents - prechargedCents);
        const ok = await cm.chargeCents(remainder);
        if (!ok && !hasPaidAccess) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
        }
        if (!ok && hasPaidAccess) {
          console.error('[test-vision.POST] paid-user remainder charge could not be written');
        }
      } catch (billingError) {
        if (!hasPaidAccess) {
          return NextResponse.json({ error: 'Billing error' }, { status: 402 });
        }
        console.error('[test-vision.POST] paid-user remainder charge fallback', billingError);
      }
    }
    
    // Consume free credit if this was a free use
    if (allowViaFreeUse) {
      await consumeFreeCredit(user.id, 'MEDICAL_ANALYSIS');
    }
    
    // Update monthly counter (for all users, not just premium)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        monthlyMedicalImageAnalysisUsed: { increment: 1 },
      } as any,
    });
    
    console.log('OpenAI Response:', {
      usage: {
        prompt: wrapped.promptTokens,
        completion: wrapped.completionTokens,
      },
      analysis: cleanAnalysis.substring(0, 100) + '...'
    });

    const resp: any = {
      success: true,
      analysis: cleanAnalysis,
      debug: {
        imageType: imageFile.type,
        normalizedImageType: resolvedImageType,
        aiImageType: normalizedImage.mimeType,
        aiImageConverted: normalizedImage.converted,
        imageSize: imageFile.size,
        tokensUsed: {
          prompt: wrapped.promptTokens,
          completion: wrapped.completionTokens,
        }
      }
    };

    if (structured && typeof structured === 'object') {
      resp.summary = structured.summary || null;
      resp.possibleCauses = Array.isArray(structured.possibleCauses) ? structured.possibleCauses : [];
      resp.redFlags = Array.isArray(structured.redFlags) ? structured.redFlags : [];
      resp.nextSteps = Array.isArray(structured.nextSteps) ? structured.nextSteps : [];
      resp.disclaimer =
        structured.disclaimer ||
        'These are general image notes only and do not replace a real doctor examination. If symptoms worsen or you are worried, contact a licensed medical professional or emergency services.';
    } else {
      const refusalPatterns = [
        /i['’]m sorry[, ]+i can['’]t assist/i,
        /i['’]m sorry[, ]+i cannot assist/i,
        /i can['’]t assist with that/i,
        /i cannot assist with that/i,
        /i can['’]t help with that/i,
        /i cannot help with that/i,
        /i can['’]t help with this/i,
        /i cannot help with this/i,
        /unable to assist/i,
        /not able to help/i,
      ];
      const refusal =
        typeof cleanAnalysis === 'string' &&
        refusalPatterns.some((pattern) => pattern.test(cleanAnalysis));

      if (refusal) {
        resp.summary =
          'This particular photo looks like something our AI provider is not allowed to describe directly. Because images like this can sometimes matter for your health, it is safer to have it checked in person.';
        resp.possibleCauses = [];
        resp.redFlags = [
          'A new or changing mole or spot on the skin, especially one that looks very dark, irregular, or different from your other moles.',
          'Any spot that is bleeding, crusting, painful, very itchy, or growing quickly.',
        ];
        resp.nextSteps = [
          'Book an urgent appointment with a GP or dermatologist and show them this exact spot and photo.',
          'Seek same-day or emergency care if the area is rapidly changing, very painful, or you feel generally unwell.',
        ];
        resp.disclaimer =
          'The AI is not allowed to give a guess for this image. These notes are not a diagnosis. Please have a licensed doctor or dermatologist examine the area as soon as you can.';
        // Avoid showing the raw refusal sentence in the UI.
        resp.analysis = '';
      } else {
        // Always include at least a basic disclaimer
        resp.disclaimer =
          'These are general image notes only and do not replace a real doctor examination. If symptoms worsen or you are worried, contact a licensed medical professional or emergency services.';
      }
    }

    let historySaved = false;
    let historyItem: any = null;
    let historyError: string | null = null;

    if (saveToHistory) {
      try {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          throw new Error('Image storage is not configured');
        }

        const storageMimeType = normalizedImage.converted ? normalizedImage.mimeType : resolvedImageType;
        const storageBuffer = normalizedImage.converted ? normalizedImage.buffer : originalBuffer;
        const ext = contentTypeToExt(storageMimeType);
        const filename = `${Date.now()}.${ext}`;
        const pathname = `medical-images/${user.id}/${filename}`;
        const encryptedPayload = encryptBuffer(storageBuffer);
        const blob = await put(pathname, encryptedPayload.encrypted, {
          access: 'public',
          contentType: 'application/octet-stream',
          addRandomSuffix: true,
        });

        const fileRecord = await prisma.file.create({
          data: {
            originalName: imageFile.name,
            fileName: blob.pathname,
            fileSize: storageBuffer.byteLength,
            mimeType: storageMimeType,
            cloudinaryId: blob.pathname,
            cloudinaryUrl: blob.url,
            secureUrl: blob.url,
            uploadedById: user.id,
            fileType: 'IMAGE',
            usage: 'MEDICAL_IMAGE',
            isPublic: false,
            metadata: {
              storage: 'vercel-blob',
              blobPathname: blob.pathname,
              blobUrl: blob.url,
              width: imageMeta.width ?? null,
              height: imageMeta.height ?? null,
              encrypted: true,
              encryption: {
                algorithm: 'aes-256-gcm',
                iv: encryptedPayload.iv,
                tag: encryptedPayload.tag,
              },
              format: ext,
              originalSize: imageFile.size,
            },
          },
        });

        const analysisData = {
          summary: resp.summary ?? null,
          possibleCauses: Array.isArray(resp.possibleCauses) ? resp.possibleCauses : [],
          redFlags: Array.isArray(resp.redFlags) ? resp.redFlags : [],
          nextSteps: Array.isArray(resp.nextSteps) ? resp.nextSteps : [],
          disclaimer: resp.disclaimer ?? null,
        };

        const saved = await prisma.medicalImageAnalysis.create({
          data: {
            userId: user.id,
            imageFileId: fileRecord.id,
            summary: resp.summary ?? null,
            analysisText: resp.analysis ?? null,
            analysisData,
          },
        });

        historySaved = true;
        historyItem = {
          id: saved.id,
          summary: saved.summary,
          analysisText: saved.analysisText,
          analysisData: saved.analysisData,
          createdAt: saved.createdAt,
          imageUrl: `/api/medical-images/file?token=${encodeURIComponent(
            createSignedFileToken({ fileId: fileRecord.id, userId: user.id, usage: 'MEDICAL_IMAGE' })
          )}`,
        };
      } catch (err) {
        console.warn('Failed to save health image history:', err);
        historyError = err instanceof Error ? err.message : 'Failed to save history';
      }
    }

    resp.historySaved = historySaved;
    if (historyItem) resp.historyItem = historyItem;
    if (historyError) resp.historyError = historyError;

    return NextResponse.json(resp);

  } catch (error) {
    console.error('Vision API Error:', error);

    const anyErr = error as any;
    const status = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.response?.status;
    const message = String(anyErr?.message || '');
    const errCode = String(anyErr?.code || anyErr?.error?.code || '').toLowerCase();
    const isQuotaOrRateLimit =
      status === 429 ||
      /exceeded your current quota/i.test(message) ||
      /rate limit/i.test(message);
    const isUnsupportedImageFormat =
      errCode === 'invalid_image_format' ||
      /invalid mime type/i.test(message) ||
      /only image types are supported/i.test(message) ||
      /unsupported image/i.test(message) ||
      /invalid image format/i.test(message);

    if (isUnsupportedImageFormat) {
      return NextResponse.json(
        {
          success: false,
          error: 'This image format is not supported yet. Please use JPG, PNG, GIF, or WEBP.',
        },
        { status: 400 }
      );
    }

    if (isQuotaOrRateLimit) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Our AI image notes service is temporarily being limited by the AI provider. Your notes could not be completed right now. Please wait a short time and try again.',
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        debug: process.env.NODE_ENV === 'development' ? error : undefined,
      },
      { status: 500 }
    );
  }
} 
