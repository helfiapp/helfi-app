import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    console.log('Testing database connection...')
    
    // Test basic connection
    const dbTest = await prisma.$queryRaw`SELECT 1 as test`
    console.log('Database connection test:', dbTest)
    
    // Check if Waitlist table exists and get count
    const waitlistCount = await prisma.waitlist.count()
    console.log('Waitlist count:', waitlistCount)
    
    // Get all waitlist entries
    const waitlistEntries = await prisma.waitlist.findMany({
      orderBy: { createdAt: 'desc' }
    })
    console.log('Waitlist entries:', waitlistEntries)
    
    // Check all table names
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    console.log('Available tables:', tables)
    
    return NextResponse.json({
      success: true,
      dbConnection: !!dbTest,
      waitlistCount,
      waitlistEntries,
      availableTables: tables
    })
    
  } catch (error) {
    console.error('Database test error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }, { status: 500 })
  }
} 