import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OpenAI from 'openai';
import { logAiUsageEvent } from '@/lib/ai-usage-logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getImageMetadata } from '@/lib/image-metadata';
import { prisma } from '@/lib/prisma';
import { CreditManager } from '@/lib/credit-system';
import { capMaxTokensToBudget } from '@/lib/cost-meter';
import { chatCompletionWithCost } from '@/lib/metered-openai';

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const imageFile = formData.get('image') as File;

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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true, creditTopUps: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Analyze image to extract supplement name
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    const promptText = `Analyze this supplement/medication bottle or package image and extract the main product name. 

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

Return only the product name, no explanations or additional text.`;

    const model = "gpt-4o";
    const cm = new CreditManager(user.id);
    const wallet = await cm.getWalletStatus();
    const maxTokens = capMaxTokensToBudget(model, promptText, 50, wallet.totalAvailableCents);
    if (maxTokens <= 0) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
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

    const ok = await cm.chargeCents(wrapped.costCents);
    if (!ok) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // Persist usage (vision)
    logAiUsageEvent({
      feature: 'supplements:image-name',
      endpoint: '/api/analyze-supplement-image',
      userId: user.id,
      userLabel: user.email || (clientIp ? `ip:${clientIp}` : null),
      scanId: `supplement-${Date.now()}`,
      model,
      promptTokens: wrapped.promptTokens,
      completionTokens: wrapped.completionTokens,
      costCents: wrapped.costCents,
      image: {
        width: meta.width,
        height: meta.height,
        bytes: imageBuffer.byteLength,
        mime: imageFile.type || null
      },
      success: true,
    }).catch(() => {});

    const supplementName = wrapped.completion.choices?.[0]?.message?.content?.trim() || 'Unknown Supplement';
    
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
