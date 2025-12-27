import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    // Special setup authentication - only allow if no admin users exist
    const existingAdmins = await prisma.adminUser.count()
    if (existingAdmins > 0) {
      return NextResponse.json({ error: 'Admin users already exist. Setup not allowed.' }, { status: 403 })
    }

    const { email, password, name, setupKey } = await request.json()

    // Special setup key to prevent unauthorized admin creation
    if (setupKey !== 'HelfiAdminSetup2024!') {
      return NextResponse.json({ error: 'Invalid setup key' }, { status: 401 })
    }

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 })
    }

    // Hash the password
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // Create the first admin user
    const adminUser = await prisma.adminUser.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'SUPER_ADMIN'
      }
    })

    return NextResponse.json({ 
      success: true, 
      message: 'First admin user created successfully',
      adminId: adminUser.id 
    })

  } catch (error) {
    console.error('Error creating admin user:', error)
    return NextResponse.json({ error: 'Failed to create admin user' }, { status: 500 })
  }
} 