import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { Resend } from 'resend'

// Initialize Resend for emails
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.log('📧 Resend API not configured, skipping waitlist emails')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

// Send acknowledgment email to user
async function sendWaitlistAcknowledgmentEmail(email: string, name: string) {
  const resend = getResend()
  if (!resend) {
    return
  }

  try {
    const emailResponse = await resend.emails.send({
      from: 'Helfi Team <support@helfi.ai>',
      to: email,
      subject: '🎉 Welcome to the Helfi Waitlist!',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
            <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Your AI-Powered Health Coach</p>
          </div>
          
          <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="margin: 0 0 20px 0; color: #374151; font-size: 24px;">🎉 You're on the Waitlist!</h2>
            
            <p style="margin: 18px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
              Hi ${name || 'there'},
            </p>
            
            <p style="margin: 18px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
              Thank you for joining the Helfi waitlist! We're thrilled to have you on board as we prepare to launch our revolutionary AI-powered health intelligence platform.
            </p>
            
            <p style="margin: 18px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
              <strong>What happens next?</strong>
            </p>
            
            <ul style="margin: 18px 0; padding-left: 24px; line-height: 1.8; font-size: 16px; color: #4b5563;">
              <li>You'll be among the first to know when we launch</li>
              <li>We'll send you exclusive early access invitations</li>
              <li>You'll receive health optimization tips and platform updates</li>
              <li>Get special launch pricing and bonuses</li>
            </ul>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 30px 0;">
              <p style="margin: 0; color: #065f46; font-size: 16px; font-weight: 600;">
                🚀 We're building something amazing, and you're going to love it!
              </p>
            </div>
            
            <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center;">
              <a href="https://helfi.ai" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px 0; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">🌐 Visit Helfi.ai</a>
            </div>
            
            <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;"><strong>Best regards,<br>The Helfi Team</strong></p>
              <p style="margin: 20px 0 0 0; font-size: 14px;">
                <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">🌐 helfi.ai</a> | 
                <a href="mailto:support@helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">📧 support@helfi.ai</a>
              </p>
              <p style="margin: 16px 0 0 0; font-size: 12px; color: #9ca3af;">
                You received this email because you joined our waitlist. 
                If you didn't sign up, please ignore this email or contact our support team.
              </p>
            </div>
          </div>
        </div>
      `
    })

    console.log(`✅ [WAITLIST ACK EMAIL] Sent to ${email} with ID: ${emailResponse.data?.id}`)
  } catch (error) {
    console.error(`❌ [WAITLIST ACK EMAIL] Failed to send to ${email}:`, error)
  }
}

// Send notification email to support team
async function sendWaitlistNotificationEmail(email: string, name: string) {
  const resend = getResend()
  if (!resend) {
    return
  }

  try {
    const emailResponse = await resend.emails.send({
      from: 'Helfi Waitlist <support@helfi.ai>',
      to: 'support@helfi.ai',
      subject: `🎉 New Waitlist Signup: ${name}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">New Waitlist Signup</h1>
          </div>
          
          <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="margin: 0 0 20px 0; color: #374151; font-size: 24px;">🎉 Someone Just Joined the Waitlist!</h2>
            
            <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #0c4a6e; font-size: 16px;">
                <strong>Name:</strong> ${name}
              </p>
              <p style="margin: 0; color: #0c4a6e; font-size: 16px;">
                <strong>Email:</strong> ${email}
              </p>
              <p style="margin: 10px 0 0 0; color: #0c4a6e; font-size: 14px;">
                <strong>Signed up:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
            
            <p style="margin: 18px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
              This person has been added to the waitlist and has received a welcome email.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
              <a href="https://helfi.ai/admin-panel" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">View Admin Panel</a>
            </div>
          </div>
        </div>
      `
    })

    console.log(`✅ [WAITLIST NOTIFICATION] Sent to support@helfi.ai for ${email}`)
  } catch (error) {
    console.error(`❌ [WAITLIST NOTIFICATION] Failed to send:`, error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json()
    const normalizedEmail = (email || '').trim().toLowerCase()
    const normalizedName = (name || '').trim()

    if (!normalizedEmail || !normalizedName) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existingEntry = await prisma.waitlist.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingEntry) {
      // Return a friendly success message to avoid alarming users
      return NextResponse.json({
        success: true,
        message: 'You\'re already on the waitlist. We\'ll notify you when we go live.'
      })
    }

    // Add to waitlist
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        email: normalizedEmail,
        name: normalizedName
      }
    })

    // Send acknowledgment email to user (don't await to avoid blocking response)
    sendWaitlistAcknowledgmentEmail(normalizedEmail, normalizedName).catch(error => {
      console.error('❌ Waitlist acknowledgment email failed (non-blocking):', error)
    })

    // Send notification email to support team (don't await to avoid blocking response)
    sendWaitlistNotificationEmail(normalizedEmail, normalizedName).catch(error => {
      console.error('❌ Waitlist notification email failed (non-blocking):', error)
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully added to waitlist',
      id: waitlistEntry.id
    })

  } catch (error) {
    console.error('Error adding to waitlist:', error)
    return NextResponse.json(
      { error: 'Failed to add to waitlist' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // JWT authentication check (with temporary token support)
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const waitlistEntries = await prisma.waitlist.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ waitlist: waitlistEntries })

  } catch (error) {
    console.error('Error fetching waitlist:', error)
    return NextResponse.json(
      { error: 'Failed to fetch waitlist' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // JWT authentication check (with temporary token support)
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'Waitlist entry ID is required' },
        { status: 400 }
      )
    }

    // Delete the waitlist entry
    await prisma.waitlist.delete({
      where: { id }
    })

    return NextResponse.json({ 
      success: true,
      message: 'Waitlist entry deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting waitlist entry:', error)
    return NextResponse.json(
      { error: 'Failed to delete waitlist entry' },
      { status: 500 }
    )
  }
} 