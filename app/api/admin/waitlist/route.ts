import { NextRequest, NextResponse } from 'next/server';
import { HealthDatabase } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // Get all waitlist entries from Vercel database
    const result = await HealthDatabase.getWaitlist();
    
    if (result.success) {
      const waitlist = result.data || [];
      return NextResponse.json({ 
        success: true, 
        waitlist,
        count: waitlist.length 
      });
    } else {
      console.error('Failed to fetch waitlist:', result.error);
      return NextResponse.json(
        { 
          error: 'Failed to fetch waitlist data',
          waitlist: [],
          count: 0 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to fetch waitlist:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch waitlist data',
        waitlist: [],
        count: 0 
      },
      { status: 500 }
    );
  }
} 