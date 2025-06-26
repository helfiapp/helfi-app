import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    // Check if API key is configured
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    const apiKeyPrefix = process.env.OPENAI_API_KEY ? 
      process.env.OPENAI_API_KEY.substring(0, 10) + '...' : 
      'Not found';

    return NextResponse.json({
      hasApiKey,
      apiKeyPrefix,
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Test API Error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 