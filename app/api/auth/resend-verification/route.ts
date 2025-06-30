import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

// Initialize Resend
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

// Function to generate verification token
function generateVerificationToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

// Function to send verification email
async function sendVerificationEmail(email: string, token: string) {
  const resend = getResend()
  if (!resend) {
    console.log('📧 Resend API not configured, skipping verification email')
    return false
  }

  try {
    const verificationUrl = `https://helfi.ai/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`
    
    const emailResponse = await resend.emails.send({
      from: 'Helfi Team <support@helfi.ai>',
      to: email,
      subject: '🔐 Verify Your Helfi Account - Action Required',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
            <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Account Verification Required</p>
          </div>
          
          <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="margin: 0 0 20px 0; color: #374151; font-size: 24px;">🔐 Verify Your Email Address</h2>
            
            <p style="margin: 0 0 20px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
              Please verify your email address by clicking the button below to complete your account setup.
            </p>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⚠️ Security Notice:</strong> This link expires in 24 hours for your protection.
              </p>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">
                ✅ Verify Email Address
              </a>
            </div>
            
            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 30px 0;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;"><strong>Can't click the button?</strong></p>
              <p style="margin: 0; font-size: 14px; color: #6b7280; word-break: break-all;">
                Copy and paste this link: ${verificationUrl}
              </p>
            </div>
            
            <p style="margin: 30px 0 0 0; line-height: 1.7; font-size: 14px; color: #6b7280;">
              If you didn't create a Helfi account, please ignore this email or contact our support team.
            </p>
            
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

    console.log(`✅ [VERIFICATION EMAIL RESENT] Sent to ${email} with ID: ${emailResponse.data?.id}`)
    return true
  } catch (error) {
    console.error(`❌ [VERIFICATION EMAIL RESEND] Failed to send to ${email}:`, error)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 })
    }

    console.log('📧 Resend verification request for:', email)

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Check if user is already verified
    if (user.emailVerified) {
      return NextResponse.json({ error: 'Email is already verified' }, { status: 400 })
    }

    // Delete any existing verification tokens for this user
    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email }
    })

    // Generate new verification token
    const verificationToken = generateVerificationToken()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Save new verification token
    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token: verificationToken,
        expires: expiresAt
      }
    })

    // Send verification email
    const emailSent = await sendVerificationEmail(user.email, verificationToken)

    if (!emailSent) {
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Verification email sent successfully' 
    })

  } catch (error) {
    console.error('❌ Resend verification error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
} 