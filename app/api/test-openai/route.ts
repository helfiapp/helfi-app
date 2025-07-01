import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET() {
  try {
    // Check if API key exists
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        status: 'error',
        message: 'OpenAI API key not configured',
        hasApiKey: false,
        keyPreview: null
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const keyPreview = `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`;

    // Test OpenAI connection with a simple request
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'OpenAI connection test successful'" }],
      max_tokens: 10,
    });

    return NextResponse.json({
      status: 'success',
      message: 'OpenAI API is working correctly',
      hasApiKey: true,
      keyPreview,
      testResponse: response.choices[0]?.message?.content,
      model: 'gpt-4o-mini'
    });

  } catch (error: any) {
    console.error('OpenAI Test Error:', error);
    
    let errorMessage = 'Unknown error';
    let errorType = 'unknown';
    
    if (error.message?.includes('insufficient_quota')) {
      errorMessage = 'OpenAI API quota exceeded. Please check your billing.';
      errorType = 'quota_exceeded';
    } else if (error.message?.includes('invalid_api_key')) {
      errorMessage = 'Invalid OpenAI API key. Please check your configuration.';
      errorType = 'invalid_key';
    } else if (error.message?.includes('model_not_found')) {
      errorMessage = 'Model gpt-4o-mini not available. Check your subscription.';
      errorType = 'model_unavailable';
    } else {
      errorMessage = error.message || 'OpenAI API connection failed';
      errorType = 'connection_error';
    }

    return NextResponse.json({
      status: 'error',
      message: errorMessage,
      errorType,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      keyPreview: process.env.OPENAI_API_KEY ? 
        `${process.env.OPENAI_API_KEY.substring(0, 7)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}` : 
        null,
      fullError: error.message
    });
  }
} 