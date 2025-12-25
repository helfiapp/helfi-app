import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { getEmailFooter } from '@/lib/email-footer'
import { prisma } from '@/lib/prisma'

// Initialize Resend only when needed to avoid build-time errors
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export async function POST(request: NextRequest) {
  try {
    // JWT authentication check (with temporary token support)
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    // Allow temporary admin token during transition
    if (!admin && authHeader !== 'Bearer temp-admin-token') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emails, subject, message, waitlistData, emailType, reasonText } = await request.json()

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'No recipients provided' }, { status: 400 })
    }

    if (!subject.trim() || !message.trim()) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 })
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }
    
    const results = []
    
    for (const email of emails) {
      try {
        // Check if email is unsubscribed
        const waitlistEntry = await prisma.waitlist.findUnique({
          where: { email: email.toLowerCase() }
        })
        
        if (waitlistEntry?.unsubscribed) {
          results.push({
            email,
            status: 'skipped',
            reason: 'Email address has unsubscribed from marketing emails'
          })
          console.log(`⏭️ [EMAIL SKIPPED] ${email} has unsubscribed`)
          continue
        }
        
        // Find the corresponding waitlist entry to get the name
        const recipient = waitlistData?.find((entry: any) => entry.email === email)
        const name = recipient?.name || 'there'
        const company = recipient?.company || ''
        const region = recipient?.region || ''
        const notes = recipient?.notes || ''
        
        // Personalize the message
        const personalizedMessage = message
          .replace(/{name}/g, name)
          .replace(/{company}/g, company)
          .replace(/{region}/g, region)
          .replace(/{notes}/g, notes)
        
        // Send real email using Resend
        const resend = getResend()
        if (!resend) {
          throw new Error('Resend API key not configured')
        }
        
        const emailResponse = await resend.emails.send({
          from: 'Helfi Team <support@helfi.ai>',
          to: email,
          subject: subject,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
                <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Your AI-Powered Health Coach</p>
              </div>
              
              <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                                 ${personalizedMessage.split('\n').map((line: string) => 
                   line.trim() ? `<p style="margin: 18px 0; line-height: 1.7; font-size: 16px;">${line}</p>` : '<div style="height: 10px;"></div>'
                 ).join('')}
                
                <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center;">
                  <a href="https://helfi.ai" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px 0; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">🚀 Get Started with Helfi</a>
                </div>
                
                ${getEmailFooter({
                  recipientEmail: email,
                  emailType: emailType || 'marketing',
                  reasonText: reasonText || 'You received this email because you joined our waitlist.'
                })}
              </div>
            </div>
          `
        })
        
        results.push({
          email,
          status: 'sent',
          messageId: emailResponse.data?.id || 'unknown',
          personalizedMessage
        })
        
        console.log(`✅ [EMAIL SENT] To: ${email}, Subject: ${subject}, ID: ${emailResponse.data?.id}`)
        
      } catch (emailError: any) {
        console.error(`❌ Failed to send email to ${email}:`, emailError)
        results.push({
          email,
          status: 'failed',
          error: emailError.message || 'Unknown error'
        })
      }
    }

    const successCount = results.filter(r => r.status === 'sent').length
    const failCount = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: failCount === 0,
      message: failCount === 0 
        ? `🎉 Successfully sent ${successCount} emails!` 
        : `📊 Sent ${successCount} emails, ${failCount} failed`,
      results,
      summary: {
        total: emails.length,
        sent: successCount,
        failed: failCount
      }
    })

  } catch (error: any) {
    console.error('❌ Email sending error:', error)
    return NextResponse.json(
      { error: 'Failed to send emails: ' + (error.message || 'Unknown error') },
      { status: 500 }
    )
  }
} 
