import { NextRequest, NextResponse } from 'next/server';
/**
 * IMPORTANT – DO NOT CHANGE OUTPUT FORMAT WITHOUT UPDATING UI PARSER
 * The Food Diary UI in `app/food/page.tsx` extracts nutrition via regex from a single line:
 *   Calories: <number>, Protein: <g>, Carbs: <g>, Fat: <g>
 * If you modify prompts or response shapes, ensure this exact line remains present.
 * A server-side fallback below appends this line when missing.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system';
import OpenAI from 'openai';

// Initialize OpenAI client only when API key is available
// Updated: 2025-06-26 - Ensure environment variable is properly loaded
const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

export async function POST(req: NextRequest) {
  try {
    console.log('=== FOOD ANALYZER DEBUG START ===');
    
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // We'll perform trial gating first; if not allowed via trial, then check credits
    let allowViaTrial = false;
    let creditManager: CreditManager | null = null;
    
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API key not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    console.log('✅ OpenAI API key configured');

    const contentType = req.headers.get('content-type');
    console.log('📝 Content-Type:', contentType);
    let messages: any[] = [];
    // Backward-compatible enhancement flags
    let wantStructured = false; // when true, we also return items[] and totals
    let preferMultiDetect = false; // when true, we nudge model to detect multiple foods

    let isReanalysis = false;
    if (contentType?.includes('application/json')) {
      // Handle text-based food analysis
      const body = await req.json();
      const { textDescription, foodType, isReanalysis: reFlag, returnItems, multi } = body as any;
      isReanalysis = !!reFlag;
      wantStructured = !!returnItems;
      preferMultiDetect = !!multi;
      console.log('📝 Text analysis mode:', { textDescription, foodType });

      if (!textDescription) {
        return NextResponse.json(
          { error: 'No food description provided' },
          { status: 400 }
        );
      }

      messages = [
        {
          role: "user",
          content: `Analyze this food description and provide accurate nutrition information based on the EXACT portion size specified. Be precise about size differences. Keep your explanation concise (1-2 sentences) and ALWAYS include a single nutrition line at the end in this exact format:

Calories: [number], Protein: [g], Carbs: [g], Fat: [g]

[Food name] ([portion size])

Food description: ${textDescription}
Food type: ${foodType}

${preferMultiDetect ? `If multiple distinct foods or components are mentioned (e.g., salads/soups/stews/plate with sides), describe them briefly.
` : ''}

IMPORTANT: Different sizes have different nutrition values:
- Large egg: ~70 calories, 6g protein
- Medium egg: ~55 calories, 5g protein  
- Small egg: ~45 calories, 4g protein

Examples:
"Medium banana (1 whole)
Calories: 105, Protein: 1g, Carbs: 27g, Fat: 0g"

"Large egg (1 whole)
Calories: 70, Protein: 6g, Carbs: 1g, Fat: 5g"

"Medium egg (1 whole)
Calories: 55, Protein: 5g, Carbs: 1g, Fat: 4g"

Pay close attention to portion size words like small, medium, large, or specific measurements. Calculate nutrition accordingly. End your response with the nutrition line exactly once as shown.
${wantStructured ? `
After your explanation and the one-line totals above, also include a compact JSON block between <ITEMS_JSON> and </ITEMS_JSON> with this exact shape for any detected foods (use an empty array if only one item):
<ITEMS_JSON>{"items":[{"name":"string","portion":"string","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}</ITEMS_JSON>
` : ''}`
        }
      ];
    } else {
      // Handle image-based food analysis
      console.log('🖼️ Image analysis mode');
      
      const formData = await req.formData();
      const imageFile = formData.get('image') as File;
      
      console.log('📊 Image file info:', {
        hasImageFile: !!imageFile,
        name: imageFile?.name || 'none',
        type: imageFile?.type || 'none',
        size: imageFile?.size || 0
      });

      if (!imageFile) {
        console.log('❌ No image file provided');
        return NextResponse.json(
          { error: 'No image file provided' },
          { status: 400 }
        );
      }

      // Convert image to base64
      console.log('🔄 Converting image to base64...');
      const imageBuffer = await imageFile.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      const imageDataUrl = `data:${imageFile.type};base64,${imageBase64}`;
      
      console.log('✅ Image conversion complete:', {
        bufferSize: imageBuffer.byteLength,
        base64Length: imageBase64.length,
        dataUrlPrefix: imageDataUrl.substring(0, 50) + '...'
      });

      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this food image and provide accurate nutrition information based on the visible portion size. Be precise about size differences. Keep your explanation concise (1-2 sentences) and ALWAYS include a single nutrition line at the end in this exact format:

Calories: [number], Protein: [g], Carbs: [g], Fat: [g]

[Food name] ([portion size])

${preferMultiDetect ? `If the image contains multiple distinct foods or components (e.g., salads/soups/stews/plate with sides), describe them briefly.
` : ''}

IMPORTANT: Different sizes have different nutrition values:
- Large egg: ~70 calories, 6g protein
- Medium egg: ~55 calories, 5g protein  
- Small egg: ~45 calories, 4g protein

Examples:
"Medium banana (1 whole)
Calories: 105, Protein: 1g, Carbs: 27g, Fat: 0g"

"Large egg (1 whole)
Calories: 70, Protein: 6g, Carbs: 1g, Fat: 5g"

"Medium egg (1 whole)
Calories: 55, Protein: 5g, Carbs: 1g, Fat: 4g"

Estimate portion size carefully from the image and calculate nutrition accordingly. End your response with the nutrition line exactly once as shown.
${wantStructured ? `
After your explanation and the one-line totals above, also include a compact JSON block between <ITEMS_JSON> and </ITEMS_JSON> with this exact shape for any detected foods (use an empty array if only one item):
<ITEMS_JSON>{"items":[{"name":"string","portion":"string","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}}</ITEMS_JSON>
` : ''}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
                detail: "high"
              }
            }
          ]
        }
      ];
    }

    // TRIAL/PREMIUM GATING
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true }
    });
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPremium = currentUser.subscription?.plan === 'PREMIUM';
    const now = new Date();
    const lastReset = currentUser.lastAnalysisResetDate;
    const shouldReset = !lastReset || (now.getTime() - lastReset.getTime()) > 24*60*60*1000;
    if (shouldReset) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: ( {
          dailyAnalysisUsed: 0,
          dailyFoodAnalysisUsed: 0,
          dailyFoodReanalysisUsed: 0,
          lastAnalysisResetDate: now,
        } as any )
      });
      (currentUser as any).dailyFoodAnalysisUsed = 0 as any;
      (currentUser as any).dailyFoodReanalysisUsed = 0 as any;
    }

    if (!isPremium && (currentUser as any).trialActive) {
      if (isReanalysis) {
        return NextResponse.json({ error: "You've reached your trial limit. Subscribe to unlock full access." }, { status: 402 });
      }
      const remaining = ((currentUser as any).trialFoodRemaining || 0);
      if (remaining > 0) {
        allowViaTrial = true; // allow without checking credits
      } else {
        // trial active but no remaining – fall through to credits check below
      }
    }

    if (isPremium) {
      // Premium daily limits
      const limit = isReanalysis ? 10 : 30;
      const used = isReanalysis ? (((currentUser as any).dailyFoodReanalysisUsed || 0)) : (((currentUser as any).dailyFoodAnalysisUsed || 0));
      if (used >= limit) {
        return NextResponse.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
      }
    } else if (!allowViaTrial) {
      // Not premium and not allowed via trial → check credit system
      creditManager = new CreditManager(user.id);
      const creditStatus = await creditManager.checkCredits('FOOD_ANALYSIS');
      if (!creditStatus.hasCredits) {
        return NextResponse.json({
          error: 'Insufficient credits',
          creditsRemaining: creditStatus.totalCreditsRemaining,
          dailyCreditsRemaining: creditStatus.dailyCreditsRemaining,
          additionalCredits: creditStatus.additionalCreditsRemaining,
          creditCost: CREDIT_COSTS.FOOD_ANALYSIS,
          featureUsageToday: creditStatus.featureUsageToday,
          dailyLimits: creditStatus.dailyLimits,
          plan: user.subscription?.plan || 'FREE'
        }, { status: 402 });
      }
    }

    // Get OpenAI client
    const openai = getOpenAIClient();
    if (!openai) {
      console.log('❌ Failed to create OpenAI client');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log('🤖 Calling OpenAI API with:', {
      model: 'gpt-4o',
      messageCount: messages.length,
      hasImageContent: messages[0]?.content && Array.isArray(messages[0].content)
    });

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: isReanalysis ? "gpt-4o-mini" : "gpt-4o", // Cheaper model for re-analysis
      messages,
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent food analysis
    });

    console.log('📋 OpenAI Response:', {
      hasResponse: !!response,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0,
      hasContent: !!response.choices?.[0]?.message?.content
    });

    let analysis = response.choices[0]?.message?.content;

    if (!analysis) {
      console.log('❌ No analysis received from OpenAI');
      return NextResponse.json(
        { error: 'No analysis received from OpenAI' },
        { status: 500 }
      );
    }

    console.log('✅ Analysis received:', analysis.substring(0, 100) + '...');

    // Server-side safeguard: ensure nutrition line is present so frontend cards render reliably
    const hasCalories = /calories\s*[:\-]?\s*\d+/i.test(analysis);
    const hasProtein = /protein\s*[:\-]?\s*\d+(?:\.\d+)?\s*g/i.test(analysis);
    const hasCarbs = /carb(?:ohydrate)?s?\s*[:\-]?\s*\d+(?:\.\d+)?\s*g/i.test(analysis);
    const hasFat = /fat\s*[:\-]?\s*\d+(?:\.\d+)?\s*g/i.test(analysis);

    if (!(hasCalories && hasProtein && hasCarbs && hasFat)) {
      try {
        console.log('ℹ️ Nutrition line missing; running compact extractor');
        const extractResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: `From the following text, extract ONLY a single line in this exact format: \n\nCalories: [number], Protein: [g], Carbs: [g], Fat: [g]\n\nIf you cannot infer a value, write 'unknown' for that field. No extra words.\n\nText:\n${analysis}`
            }
          ],
          max_tokens: 60,
          temperature: 0
        });
        const extracted = extractResponse.choices?.[0]?.message?.content?.trim();
        if (extracted && /calories/i.test(extracted)) {
          analysis = `${analysis}\n${extracted}`;
          console.log('✅ Appended nutrition line:', extracted);
        }
      } catch (exErr) {
        console.warn('Nutrition extraction fallback failed:', exErr);
      }
    }
    
    // Update counters after successful analysis
    if (allowViaTrial) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: ( {
          trialFoodRemaining: Math.max(0, (((currentUser as any).trialFoodRemaining || 0) - (isReanalysis ? 0 : 1))),
          trialActive: (((currentUser as any).trialFoodRemaining || 0) - (isReanalysis ? 0 : 1)) > 0 || (((currentUser as any).trialInteractionRemaining || 0) > 0)
        } as any )
      });
    } else if (isPremium) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: ( isReanalysis ? {
          dailyFoodReanalysisUsed: { increment: 1 },
          totalAnalysisCount: { increment: 1 },
        } : {
          dailyFoodAnalysisUsed: { increment: 1 },
          totalFoodAnalysisCount: { increment: 1 },
          totalAnalysisCount: { increment: 1 },
        } ) as any
      });
    } else {
      // Non-premium using credits
      try {
        if (creditManager) {
          await creditManager.consumeCredits('FOOD_ANALYSIS');
        }
      } catch (e) {
        console.warn('Credit consume failed:', e);
      }
    }
    
    console.log('=== FOOD ANALYZER DEBUG END ===');

    const resp: any = {
      success: true,
      analysis: analysis.trim(),
    };
    if (wantStructured) {
      try {
        const m = analysis.match(/<ITEMS_JSON>([\s\S]*?)<\/ITEMS_JSON>/i);
        if (m && m[1]) {
          const parsed = JSON.parse(m[1]);
          if (parsed && typeof parsed === 'object') {
            resp.items = Array.isArray(parsed.items) ? parsed.items : [];
            resp.total = parsed.total || null;
          }
        }
      } catch (e) {
        console.warn('ITEMS_JSON parse failed');
      }
    }
    return NextResponse.json(resp);

  } catch (error) {
    console.error('💥 OpenAI API Error:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof Error) {
      console.log('🔍 Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 200)
      });
      
      if (error.message.includes('insufficient_quota')) {
        return NextResponse.json(
          { error: 'OpenAI API quota exceeded. Please check your billing.' },
          { status: 429 }
        );
      }
      if (error.message.includes('invalid_api_key')) {
        return NextResponse.json(
          { error: 'Invalid OpenAI API key. Please check your configuration.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to analyze food' },
      { status: 500 }
    );
  }
} 