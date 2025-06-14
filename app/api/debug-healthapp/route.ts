import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      hasSession: !!session,
      sessionUser: session?.user?.email || null,
      url: request.url,
      headers: {
        userAgent: request.headers.get('user-agent'),
        referer: request.headers.get('referer'),
      },
      environment: process.env.NODE_ENV,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      googleClientId: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT_SET',
    };

    return NextResponse.json(debugInfo);
  } catch (error) {
    return NextResponse.json({ 
      error: 'Debug failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 