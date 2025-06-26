import { NextRequest, NextResponse } from 'next/server';
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
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const contentType = req.headers.get('content-type');
    let messages: any[] = [];

    if (contentType?.includes('application/json')) {
      // Handle text-based food analysis
      const body = await req.json();
      const { textDescription, foodType } = body;

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
      const formData = await req.formData();
      const imageFile = formData.get('image') as File;

      if (!imageFile) {
        return NextResponse.json(
          { error: 'No image file provided' },
          { status: 400 }
        );
      }

      // Convert image to base64
      const imageBuffer = await imageFile.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      const imageDataUrl = `data:${imageFile.type};base64,${imageBase64}`;

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
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use the cheaper mini model for food analysis
      messages,
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent food analysis
    });

    const analysis = response.choices[0]?.message?.content;

    if (!analysis) {
      return NextResponse.json(
        { error: 'No analysis received from OpenAI' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis: analysis.trim()
    });

  } catch (error) {
    console.error('OpenAI API Error:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof Error) {
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