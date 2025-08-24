import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
      include: { subscription: true }
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const isPremium = user.subscription?.plan === 'PREMIUM';
    if (!isPremium) {
      return NextResponse.json({ error: 'This is a premium feature. Subscribe now to unlock medical analysis.' }, { status: 402 });
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

    // Test with simple image analysis
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
              text: "What do you see in this image? Please describe it in detail."
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
      max_tokens: 500,
      temperature: 0.1
    });

    const analysis = response.choices[0]?.message?.content;
    
    console.log('OpenAI Response:', {
      usage: response.usage,
      analysis: analysis?.substring(0, 100) + '...'
    });

    return NextResponse.json({
      success: true,
      analysis,
      debug: {
        imageType: imageFile.type,
        imageSize: imageFile.size,
        tokensUsed: response.usage
      }
    });

  } catch (error) {
    console.error('Vision API Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      debug: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 });
  }
} 