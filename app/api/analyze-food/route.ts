import { NextRequest, NextResponse } from 'next/server';
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

    // Find user and check credit quota
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check credit availability using new credit system
    const creditManager = new CreditManager(user.id);
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
      }, { status: 402 }); // Payment Required
    }
    
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

    if (contentType?.includes('application/json')) {
      // Handle text-based food analysis
      const body = await req.json();
      const { textDescription, foodType } = body;
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
          content: `Analyze this food description and provide accurate nutrition information based on the EXACT portion size specified. Be precise about size differences:

[Food name] ([portion size])
Calories: [estimate], Protein: [g], Carbs: [g], Fat: [g]

Food description: ${textDescription}
Food type: ${foodType}

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

Pay close attention to portion size words like small, medium, large, or specific measurements. Calculate nutrition accordingly.`
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
              text: `Analyze this food image and provide accurate nutrition information based on the visible portion size. Be precise about size differences:

[Food name] ([portion size])
Calories: [estimate], Protein: [g], Carbs: [g], Fat: [g]

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

Estimate portion size carefully from the image and calculate nutrition accordingly.`
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
      model: "gpt-4o", // Use the more accurate model for food analysis
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

    const analysis = response.choices[0]?.message?.content;

    if (!analysis) {
      console.log('❌ No analysis received from OpenAI');
      return NextResponse.json(
        { error: 'No analysis received from OpenAI' },
        { status: 500 }
      );
    }

    console.log('✅ Analysis received:', analysis.substring(0, 100) + '...');
    
    // Consume credits after successful analysis
    await creditManager.consumeCredits('FOOD_ANALYSIS');
    
    console.log('=== FOOD ANALYZER DEBUG END ===');

    return NextResponse.json({
      success: true,
      analysis: analysis.trim()
    });

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