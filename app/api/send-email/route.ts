import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({ success: true, message: 'Email feature coming soon' });
}

export async function GET() {
  return NextResponse.json({ success: true, message: 'Email test feature coming soon' });
} 