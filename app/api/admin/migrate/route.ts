import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { migrationKey } = await request.json()

    // Special migration key to prevent unauthorized table creation
    if (migrationKey !== 'HelfiMigrate2024!SecureSetup') {
      return NextResponse.json({ error: 'Invalid migration key' }, { status: 401 })
    }

    // Create AdminUser table using raw SQL
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "password" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'ADMIN',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastLogin" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT
      );
    `

    return NextResponse.json({ 
      success: true, 
      message: 'AdminUser table created successfully' 
    })

  } catch (error) {
    console.error('Error creating AdminUser table:', error)
    return NextResponse.json({ 
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 