import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encode } from 'next-auth/jwt'

const ONE_DAY_SECONDS = 24 * 60 * 60
const FOREVER_MAX_AGE_SECONDS = 5 * 365 * 24 * 60 * 60 // ~5 years; treat as "keep me signed in"
const REFRESH_MAX_AGE_SECONDS = FOREVER_MAX_AGE_SECONDS
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // cookies get reissued via refresh token

export async function POST(request: NextRequest) {
  try {
    const { email, password, rememberMe } = await request.json().catch(()=>({}))
    const keepSignedIn = Boolean(rememberMe)
    const sessionMaxAgeSeconds = keepSignedIn ? SESSION_MAX_AGE_SECONDS : ONE_DAY_SECONDS
    
    console.log('🔐 Direct signin called:', { email, rememberMe: keepSignedIn })
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Find or create user in database (staging/test helper)
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user) {
      console.log('👤 Creating test user via signin-direct:', email)
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: email.split('@')[0],
          emailVerified: new Date()
        }
      })
    } else if (!user.emailVerified) {
      // Auto-verify existing user to avoid email flow for staging
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() }
      })
    }

    // For now, allow sign-in based on email (passwordless fallback path)
    console.log('✅ User found for signin:', { id: user.id, email: user.email, verified: !!user.emailVerified })

    // Create NextAuth-compatible JWT token using NextAuth's encode method
    const secret = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
    const sessionExp = Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds
    const token = await encode({
      token: {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        image: user.image,
        iat: Math.floor(Date.now() / 1000),
        exp: sessionExp,
      },
      secret,
      maxAge: keepSignedIn ? SESSION_MAX_AGE_SECONDS : ONE_DAY_SECONDS,
    })
    const refreshExpSeconds = Math.floor(Date.now() / 1000) + REFRESH_MAX_AGE_SECONDS
    const refreshToken = await encode({
      token: {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        image: user.image,
        kind: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: refreshExpSeconds,
      },
      secret,
      maxAge: REFRESH_MAX_AGE_SECONDS,
    })
    const tokenExpiresAtMs = Date.now() + (sessionMaxAgeSeconds * 1000)

    // Create response with session cookie
    const response = NextResponse.json({ 
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: !!user.emailVerified
      },
      message: keepSignedIn ? 'Signin successful (remembered)' : 'Signin successful',
      token: keepSignedIn ? refreshToken : undefined,
      tokenExpiresAtMs: keepSignedIn ? refreshExpSeconds * 1000 : undefined,
      remembered: keepSignedIn
    })

    // Set NextAuth session cookie with proper format
    const secureCookie = '__Secure-next-auth.session-token'
    const legacyCookie = 'next-auth.session-token'
    const rememberCookie = 'helfi-remember-token'
    const refreshCookie = '__Secure-helfi-refresh-token'

    response.cookies.set(secureCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: sessionMaxAgeSeconds,
      path: '/'
    })
    // Also set legacy cookie name for compatibility
    response.cookies.set(legacyCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: sessionMaxAgeSeconds,
      path: '/'
    })
    // HttpOnly refresh cookie so the server always has a restore token even if SW/local storage aren’t ready
    response.cookies.set(refreshCookie, keepSignedIn ? refreshToken : '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: keepSignedIn ? REFRESH_MAX_AGE_SECONDS : 0,
      path: '/',
    })
    // Restore a non-HttpOnly remember cookie so middleware can reissue on resume even if the SW isn't ready.
    response.cookies.set(rememberCookie, keepSignedIn ? refreshToken : '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: keepSignedIn ? REFRESH_MAX_AGE_SECONDS : 0,
      path: '/',
    })

    console.log('✅ Direct signin successful with NextAuth-compatible session created')

    // Best-effort: initialize daily credits so credit gate can't block a fresh user
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "dailyAnalysisCredits" = COALESCE("dailyAnalysisCredits",3), "dailyAnalysisUsed" = 0, "lastAnalysisResetDate" = now() WHERE email = '${user.email}'`
      )
    } catch (e) {
      console.warn('Daily credit init skipped:', e)
    }
    
    return response

  } catch (error) {
    console.error('❌ Direct signin error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Signin failed' }, { status: 500 })
  }
} 

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = (searchParams.get('email') || '').toLowerCase()
    if (!email) return NextResponse.redirect(new URL('/auth/signin?error=CredentialsSignin', request.url))
    const maxAgeSeconds = ONE_DAY_SECONDS

    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name: email.split('@')[0], emailVerified: new Date() } })
    }

    const secret = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
    const token = await encode({
      token: { sub: user.id, id: user.id, email: user.email, name: user.name || user.email.split('@')[0], image: user.image, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+maxAgeSeconds },
      secret,
      maxAge: maxAgeSeconds,
    })
    const response = NextResponse.redirect(new URL('/onboarding', request.url))
    response.cookies.set('__Secure-next-auth.session-token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: maxAgeSeconds, path: '/' })
    response.cookies.set('next-auth.session-token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: maxAgeSeconds, path: '/' })
    return response
  } catch (e) {
    return NextResponse.redirect(new URL('/auth/signin?error=Signin', request.url))
  }
}
