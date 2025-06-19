import { NextRequest, NextResponse } from 'next/server';
import { HealthDatabase } from '@/lib/database';

// Add email validation function
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const { name, email } = await request.json();
    
    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Save to Vercel database
    const result = await HealthDatabase.addToWaitlist(email, name);
    
    if (result.success) {
      console.log('✅ Waitlist signup successful:', { name, email });
      return NextResponse.json({ 
        success: true, 
        message: 'Successfully added to waitlist! We\'ll be in touch soon.' 
      });
    } else {
      console.error('❌ Database error:', result.error);
      return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
    }
  } catch (error) {
    console.error('Waitlist error:', error);
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await HealthDatabase.getWaitlist();
    
    if (result.success) {
      return NextResponse.json({ waitlist: result.data });
    } else {
      console.error('❌ Failed to fetch waitlist:', result.error);
      return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 });
    }
  } catch (error) {
    console.error('Waitlist GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 });
  }
} 