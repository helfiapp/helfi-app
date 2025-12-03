import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getImageMetadata } from '@/lib/image-metadata';

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
    const formData = await req.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown';
    const rateCheck = consumeRateLimit('supplement-image', `ip:${clientIp}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
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

    // Analyze image to extract supplement name
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    const response: any = await runChatCompletionWithLogging(openai, {
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
    }, { feature: 'supplements:image-name' }, {
      feature: 'supplements:image-name',
      endpoint: '/api/analyze-supplement-image',
      image: {
        width: meta.width,
        height: meta.height,
        bytes: imageBuffer.byteLength,
        mime: imageFile.type || null
      }
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
