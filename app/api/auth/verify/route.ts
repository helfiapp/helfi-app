import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// This API route uses dynamic data and should not be statically generated
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const email = url.searchParams.get('email')

    if (!token || !email) {
      return NextResponse.redirect(new URL('/auth/signin?error=verification_missing_params', 'https://helfi.ai'))
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
      return NextResponse.redirect(new URL('/auth/signin?error=verification_invalid_token', 'https://helfi.ai'))
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
      
      return NextResponse.redirect(new URL('/auth/signin?error=verification_expired', 'https://helfi.ai'))
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: email }
    })

    if (!user) {
      console.log('❌ User not found for verification:', email)
      return NextResponse.redirect(new URL('/auth/signin?error=verification_user_not_found', 'https://helfi.ai'))
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
      const { Resend } = await import('resend')
      
      if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const userName = user.name || user.email.split('@')[0]
        
        const welcomeMessage = `Hi ${userName},

Welcome to the Helfi community! We're thrilled to have you on board.

🚀 Getting Started:
• Complete your health profile for personalized insights
• Start logging your meals with AI-powered analysis
• Set your health goals and track your progress
• Explore our medication interaction checker

💡 Pro Tip: The more you use Helfi, the smarter your AI health coach becomes!

Need help getting started? Just reply to this email or contact our support team.

Best regards,
The Helfi Team`

        await resend.emails.send({
          from: 'Helfi Team <support@helfi.ai>',
          to: user.email,
          subject: '🎉 Welcome to Helfi - Your AI Health Journey Begins!',
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
                <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Your AI-Powered Health Coach</p>
              </div>
              
              <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                ${welcomeMessage.split('\n').map((line: string) => 
                  line.trim() ? `<p style="margin: 18px 0; line-height: 1.7; font-size: 16px;">${line}</p>` : '<div style="height: 10px;"></div>'
                ).join('')}
                
                <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center;">
                  <a href="https://helfi.ai/auth/signin" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px 0; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">🚀 Start Your Health Journey</a>
                </div>
                
                <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
                  <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;"><strong>Best regards,<br>The Helfi Team</strong></p>
                  <p style="margin: 20px 0 0 0; font-size: 14px;">
                    <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">🌐 helfi.ai</a> | 
                    <a href="mailto:support@helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">📧 support@helfi.ai</a>
                  </p>
                </div>
              </div>
            </div>
          `
        })
        
        console.log('📧 Welcome email sent to newly verified user:', userName)
      }
    } catch (emailError) {
      console.error('❌ Welcome email failed (non-blocking):', emailError)
    }

    // Redirect to signin with success message
    return NextResponse.redirect(new URL('/auth/signin?message=verification_success', 'https://helfi.ai'))

  } catch (error) {
    console.error('❌ Email verification error:', error)
    return NextResponse.redirect(new URL('/auth/signin?error=verification_server_error', 'https://helfi.ai'))
  }
} 