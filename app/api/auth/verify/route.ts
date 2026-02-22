import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/welcome-email'

// This API route uses dynamic data and should not be statically generated
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const email = url.searchParams.get('email')

    if (!token || !email) {
      return NextResponse.redirect(new URL('/auth/verify?error=verification_missing_params', 'https://helfi.ai'))
    }

    console.log('🔐 Email verification attempt:', { email, token: token.substring(0, 8) + '...' })

    // Find verification token in database
    const verificationRecord = await prisma.verificationToken.findUnique({
      where: {
        identifier_token: {
          identifier: email,
          token: token
        }
      }
    })

    if (!verificationRecord) {
      console.log('❌ Invalid verification token:', { email, token: token.substring(0, 8) + '...' })
      return NextResponse.redirect(new URL('/auth/verify?error=verification_invalid_token', 'https://helfi.ai'))
    }

    // Check if token has expired
    if (verificationRecord.expires < new Date()) {
      console.log('⏰ Verification token expired:', { email, expires: verificationRecord.expires })
      
      // Clean up expired token
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: email,
            token: token
          }
        }
      })
      
      return NextResponse.redirect(new URL('/auth/verify?error=verification_expired', 'https://helfi.ai'))
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: email }
    })

    if (!user) {
      console.log('❌ User not found for verification:', email)
      return NextResponse.redirect(new URL('/auth/verify?error=verification_user_not_found', 'https://helfi.ai'))
    }

    // Verify the user's email
    await prisma.user.update({
      where: { email: email },
      data: {
        emailVerified: new Date()
      }
    })

    // Clean up the verification token
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email,
          token: token
        }
      }
    })

    console.log('✅ Email verification successful:', email)

    // Send welcome email now that user is verified
    try {
      const userName = user.name || user.email.split('@')[0]
      await sendWelcomeEmail({
        email: user.email,
        name: userName,
        ctaHref: 'https://helfi.ai/auth/signin',
        ctaLabel: 'Sign in to Helfi',
      })
      console.log('📧 Welcome email sent to newly verified user:', userName)
    } catch (emailError) {
      console.error('❌ Welcome email failed (non-blocking):', emailError)
    }

    // Redirect to verification success page
    return NextResponse.redirect(new URL('/auth/verify?success=true', 'https://helfi.ai'))

  } catch (error) {
    console.error('❌ Email verification error:', error)
    return NextResponse.redirect(new URL('/auth/verify?error=verification_server_error', 'https://helfi.ai'))
  }
} 
