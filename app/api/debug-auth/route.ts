import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const config = {
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      googleClientIdLength: process.env.GOOGLE_CLIENT_ID?.length || 0,
      googleClientSecretLength: process.env.GOOGLE_CLIENT_SECRET?.length || 0,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      // Show first/last few chars of sensitive data for debugging
      googleClientIdPreview: process.env.GOOGLE_CLIENT_ID ? 
        process.env.GOOGLE_CLIENT_ID.substring(0, 10) + '...' + process.env.GOOGLE_CLIENT_ID.substring(process.env.GOOGLE_CLIENT_ID.length - 10) : 'NOT_SET',
      googleClientSecretPreview: process.env.GOOGLE_CLIENT_SECRET ? 
        process.env.GOOGLE_CLIENT_SECRET.substring(0, 8) + '...' + process.env.GOOGLE_CLIENT_SECRET.substring(process.env.GOOGLE_CLIENT_SECRET.length - 8) : 'NOT_SET',
      // Check for newlines or other issues
      googleClientIdHasNewline: process.env.GOOGLE_CLIENT_ID?.includes('\n') || false,
      googleClientSecretHasNewline: process.env.GOOGLE_CLIENT_SECRET?.includes('\n') || false,
      nextAuthUrlHasNewline: process.env.NEXTAUTH_URL?.includes('\n') || false,
    };

    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get config', details: error }, { status: 500 });
  }
} 