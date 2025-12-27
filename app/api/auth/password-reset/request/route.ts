import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import crypto from 'crypto'
import { getEmailFooter } from '@/lib/email-footer'

const RESET_TOKEN_TTL_HOURS = 2

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    // Always return success to avoid revealing which emails exist.
    if (!user) {
      return NextResponse.json({ success: true })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000)

    await prisma.passwordResetToken.deleteMany({ where: { email } })
    await prisma.passwordResetToken.create({
      data: {
        email,
        tokenHash,
        expires,
      },
    })

    const resend = getResend()
    if (!resend) {
      return NextResponse.json({ error: 'Email system not configured' }, { status: 500 })
    }

    const resetUrl = `https://helfi.ai/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`

    await resend.emails.send({
      from: 'Helfi Team <support@helfi.ai>',
      to: email,
      subject: 'Reset your Helfi password',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
            <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Password Reset</p>
          </div>
          
          <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <p style="margin: 0 0 20px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
              We received a request to reset your password. Click the button below to set a new password.
            </p>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⚠️ Security Notice:</strong> This link expires in ${RESET_TOKEN_TTL_HOURS} hours.
              </p>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">
                Reset Password
              </a>
            </div>
            
            <p style="margin: 20px 0 0 0; line-height: 1.7; font-size: 14px; color: #6b7280;">
              If you did not request this, you can ignore this email.
            </p>
            
            ${getEmailFooter({ recipientEmail: email, emailType: 'support' })}
          </div>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Password reset request error:', error)
    return NextResponse.json({ error: 'Failed to request password reset' }, { status: 500 })
  }
}
