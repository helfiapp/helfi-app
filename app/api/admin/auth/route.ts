import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticator } from 'otplib'

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
authenticator.options = { window: 1 }

export async function POST(request: NextRequest) {
  try {
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'Admin login secret not configured' }, { status: 500 })
    }
    const { email, password, otp } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    // Find admin user by email
    const adminUser = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail }
    })

    if (!adminUser || !adminUser.isActive) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, adminUser.password)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const otpCode = typeof otp === 'string' ? otp.replace(/\s+/g, '') : ''

    if (adminUser.totpEnabled) {
      if (!otpCode) {
        return NextResponse.json({ error: 'Authentication code required', code: 'OTP_REQUIRED' }, { status: 401 })
      }

      const isValid = authenticator.verify({ token: otpCode, secret: adminUser.totpSecret || '' })
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid authentication code', code: 'OTP_INVALID' }, { status: 401 })
      }
    } else {
      let secret = adminUser.totpSecret
      if (!secret) {
        secret = authenticator.generateSecret()
        await prisma.adminUser.update({
          where: { id: adminUser.id },
          data: { totpSecret: secret }
        })
      }

      if (!otpCode) {
        const otpauthUrl = authenticator.keyuri(adminUser.email, 'Helfi Admin', secret)
        return NextResponse.json({
          setupRequired: true,
          message: 'Set up your authenticator app to continue.',
          otpauthUrl
        })
      }

      const isValid = authenticator.verify({ token: otpCode, secret })
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid authentication code', code: 'OTP_INVALID' }, { status: 401 })
      }

      await prisma.adminUser.update({
        where: { id: adminUser.id },
        data: { totpEnabled: true }
      })
    }

    // Update last login
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { lastLogin: new Date() }
    })

    // Create JWT token - extended to 7 days for admin convenience
    const token = jwt.sign(
      { 
        adminId: adminUser.id, 
        email: adminUser.email, 
        role: adminUser.role 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      success: true,
      message: 'Authentication successful',
      token,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      }
    })

  } catch (error) {
    console.error('Error authenticating admin:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
} 
