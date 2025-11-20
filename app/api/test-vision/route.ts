import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreditManager } from '@/lib/credit-system';
import { chatCompletionWithCost } from '@/lib/metered-openai';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    // Medical image analysis is PREMIUM only
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true, creditTopUps: true }
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    
    // PREMIUM/CREDITS/FREE USE GATING
    const isPremium = user.subscription?.plan === 'PREMIUM';
    
    // Check if user has purchased credits (non-expired)
    const now = new Date();
    const hasPurchasedCredits = user.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    );
    
    // Check if user has used their free medical analysis
    const hasUsedFreeMedical = (user as any).hasUsedFreeMedicalAnalysis || false;
    
    // Allow if: Premium subscription OR has purchased credits OR hasn't used free use yet
    if (!isPremium && !hasPurchasedCredits && !hasUsedFreeMedical) {
      // First time use - allow free (will mark as used after successful analysis)
    } else if (!isPremium && !hasPurchasedCredits) {
      // No subscription, no credits, and already used free - require payment
      return NextResponse.json(
        { 
          error: 'Payment required',
          message: 'You\'ve used your free medical image analysis. Subscribe to a monthly plan or purchase credits to continue.',
          requiresPayment: true
        },
        { status: 402 }
      );
    }

    const formData = await req.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Convert image to base64
    const imageBuffer = await imageFile.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    
    console.log('Image info:', {
      name: imageFile.name,
      type: imageFile.type,
      size: imageFile.size,
      base64Length: imageBase64.length
    });

    // Use OpenAI client (GPT-4o vision) via metered wrapper
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    
    // Immediate pre-charge (2 credits) before calling the model (skip for free trial)
    const allowViaFreeUse = !isPremium && !hasPurchasedCredits && !hasUsedFreeMedical;
    let prechargedCents = 0;
    if (!allowViaFreeUse) {
      try {
        const cm = new CreditManager(user.id);
        const immediate = 2; // medical image analysis typical cost (credits)
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
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text:
                "You are a cautious medical image assistant helping users understand visible health concerns from photos. " +
                "Treat every image you receive here as a medical or health-related image (for example: skin conditions, rashes, hives, eczema, psoriasis, acne, rosacea, vitiligo, fungal infections, " +
                "bacterial infections, viral rashes, allergic reactions, burns, cuts, bruises, wounds, surgical scars, ulcers, bedsores, bites, stings, nail changes, eye redness, swelling, jaundice, " +
                "moles, lesions, lumps, growths, discolorations, varicose veins, swelling in joints, deformities, and medical imaging such as X-rays, CT scans, MRIs, and ultrasounds). " +
                "Focus ONLY on the medically relevant parts of the image and ignore backgrounds, furniture, or unrelated objects.\n\n" +
                "Your response must ALWAYS be structured in this exact format:\n\n" +
                "1) WHAT I SEE MEDICALLY:\n" +
                "- Use simple, clear language to describe what you see that is medically relevant (location, size relative to body part, shape, color, borders, surface texture, any swelling, redness, discharge, or other visible features).\n\n" +
                "2) POSSIBLE EXPLANATIONS (NOT A DIAGNOSIS):\n" +
                "- List 2–4 possible explanations for what this could be (for example: eczema flare, contact dermatitis, fungal infection, acne breakout, infected wound, benign mole, suspicious mole, etc.).\n" +
                "- Clearly state that these are possibilities only and NOT a confirmed diagnosis.\n\n" +
                "3) RED-FLAG SIGNS TO WATCH FOR:\n" +
                "- Explain which visible features in this image are concerning or could be red flags (irregular borders, very dark or changing moles, rapidly growing lumps, spreading redness, pus, black areas in a wound, severe swelling, etc.).\n" +
                "- If the image does not show strong red-flag signs, say that clearly but still mention what would be worrying if it appeared later.\n\n" +
                "4) WHAT TO DO NEXT:\n" +
                "- Explain practical next steps in plain language: when it might be okay to monitor at home, when to book a routine doctor or dermatologist appointment, and when to seek urgent or emergency care.\n" +
                "- Be specific about timeframes (for example: “within the next few days”, “as soon as possible”, “go to emergency/ER now if…”).\n\n" +
                "After you finish sections 1–4 above, append a compact JSON block between <STRUCTURED_JSON> and </STRUCTURED_JSON> with this exact shape:\n" +
                "<STRUCTURED_JSON>{\"summary\":\"string\",\"possibleCauses\":[{\"name\":\"string\",\"whyLikely\":\"string\",\"confidence\":\"low|medium|high\"}],\"redFlags\":[\"string\"],\"nextSteps\":[\"string\"],\"disclaimer\":\"string\"}</STRUCTURED_JSON>\n" +
                "Rules for the JSON:\n" +
                "- \"summary\": 1–3 plain-language sentences describing what the image most likely shows overall.\n" +
                "- \"possibleCauses\": 2–4 conditions ordered from most to least likely (use confidence high/medium/low to match that order).\n" +
                "- \"whyLikely\": brief explanation focused on visible features in THIS image (color, shape, borders, distribution, etc.).\n" +
                "- \"redFlags\": short bullet-style strings describing dangerous or urgent features related to what is seen.\n" +
                "- \"nextSteps\": practical actions the user can take now (self-care, routine review, urgent care/emergency when needed).\n" +
                "- \"disclaimer\": clear reminder that this is information only and not a diagnosis or a replacement for a real doctor.\n\n" +
                "Important safety rules:\n" +
                "- Do NOT give a formal diagnosis or claim certainty. Always frame explanations as possibilities based on what can be seen.\n" +
                "- Do NOT tell the user that they do not need a doctor. Instead, explain when medical review would be sensible and reassuring.\n" +
                "- Always remind the user that this analysis is for information only and does not replace a real doctor’s examination.\n" +
                "- If the image does not appear to contain anything medically relevant, say that clearly and advise the user to consult a healthcare professional if they are worried."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "This image was uploaded in a Medical Image Analyzer inside a health app. " +
                "Please analyze any visible medical or health-related issues in the image following the required structure."
            },
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
      max_tokens: 900,
      temperature: 0.15
    } as any);

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
      const cm = new CreditManager(user.id);
      const remainder = Math.max(0, wrapped.costCents - prechargedCents);
      const ok = await cm.chargeCents(remainder);
      if (!ok) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }
    }
    
    // Mark free use as used if this was a free use
    if (allowViaFreeUse) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            hasUsedFreeMedicalAnalysis: true,
          } as any
        })
      } catch (e: any) {
        // Ignore if column doesn't exist yet (migration pending)
        if (!e.message?.includes('does not exist')) {
          console.warn('Failed to update hasUsedFreeMedicalAnalysis:', e)
        }
      }
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
        'This analysis is for information only and does not replace a real doctor’s examination. If symptoms worsen or you are worried, contact a licensed medical professional or emergency services.';
    } else {
      // Always include at least a basic disclaimer
      resp.disclaimer =
        'This analysis is for information only and does not replace a real doctor’s examination. If symptoms worsen or you are worried, contact a licensed medical professional or emergency services.';
    }

    return NextResponse.json(resp);

  } catch (error) {
    console.error('Vision API Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      debug: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 });
  }
} 