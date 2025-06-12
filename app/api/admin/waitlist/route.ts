import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get all waitlist entries using raw query to handle missing table
    let waitlist = [];
    try {
      waitlist = await prisma.$queryRaw`
        SELECT id, email, name, "createdAt" FROM "Waitlist" 
        ORDER BY "createdAt" DESC
      ` as any[];
    } catch (error) {
      console.log('Waitlist table may not exist yet:', error);
      waitlist = [];
    }

    return NextResponse.json({ 
      success: true, 
      waitlist,
      count: waitlist.length 
    });
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