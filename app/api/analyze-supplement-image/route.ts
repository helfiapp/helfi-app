import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Convert image to base64
    const imageBuffer = await imageFile.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    
    console.log('Analyzing supplement image:', {
      name: imageFile.name,
      type: imageFile.type,
      size: imageFile.size
    });

    // Analyze image to extract supplement name
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this supplement/medication bottle or package image and extract the main product name. 

CRITICAL INSTRUCTIONS:
1. Look for the PRIMARY product name on the label (e.g., "Vitamin E", "Magnesium", "Omega-3", "Ibuprofen")
2. Ignore brand names, dosage amounts, and marketing text
3. Return ONLY the supplement/medication name, nothing else
4. If you can't clearly identify the product name, return "Unknown Supplement"
5. Be specific - if it says "Vitamin E 400 IU", return "Vitamin E"
6. If it's a medication, return the generic name if visible

Examples of good responses:
- "Vitamin E"
- "Magnesium"
- "Omega-3"
- "Multivitamin"
- "Ibuprofen"
- "Fish Oil"

Return only the product name, no explanations or additional text.`
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
      max_tokens: 50,
      temperature: 0.1
    });

    const supplementName = response.choices[0]?.message?.content?.trim() || 'Unknown Supplement';
    
    console.log('Extracted supplement name:', supplementName);

    return NextResponse.json({
      success: true,
      supplementName: supplementName
    });

  } catch (error) {
    console.error('Error analyzing supplement image:', error);
    return NextResponse.json(
      { error: 'Failed to analyze supplement image', supplementName: 'Analysis Error' },
      { status: 500 }
    );
  }
} 