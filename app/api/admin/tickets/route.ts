import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    tickets: [],
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalTickets: 0,
      hasNext: false,
      hasPrev: false
    }
  })
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    success: false, 
    error: 'Ticketing system is being set up. Please check back soon!' 
  })
} 