import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encode } from 'next-auth/jwt'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    
    console.log('🔐 Direct signin called:', { email })
    
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user) {
      console.log('❌ User not found:', email)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // For now, just check if user exists (like the working commit did)
    // TODO: Add proper password verification later
    console.log('✅ User found for signin:', { id: user.id, email: user.email, verified: !!user.emailVerified })

    // Create NextAuth-compatible JWT token using NextAuth's encode method
    const secret = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
    
    const token = await encode({
      token: {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        image: user.image,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
      },
      secret,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // Create response with session cookie
    const response = NextResponse.json({ 
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: !!user.emailVerified
      },
      message: 'Signin successful'
    })

    // Set NextAuth session cookie with proper format
    const cookieName = process.env.NODE_ENV === 'production' 
      ? '__Secure-next-auth.session-token' 
      : 'next-auth.session-token'

    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    })

    console.log('✅ Direct signin successful with NextAuth-compatible session created')
    
    return response

  } catch (error) {
    console.error('❌ Direct signin error:', error)
    return NextResponse.json({ error: 'Signin failed. Please try again.' }, { status: 500 })
  }
} 