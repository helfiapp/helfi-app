import { NextRequest, NextResponse } from 'next/server'
import { Resend, getEmailProviderName, isEmailConfigured } from '@/lib/email-client'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { getEmailFooter } from '@/lib/email-footer'

export async function POST(request: NextRequest) {
  try {
    // Verify admin token
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { testEmail } = await request.json()
    
    if (!testEmail) {
      return NextResponse.json({ error: 'Test email address required' }, { status: 400 })
    }

    // Check environment configuration
    if (!isEmailConfigured()) {
      return NextResponse.json({ 
        error: 'Email service not configured',
        details: 'Email service is not properly configured on the server'
      }, { status: 500 })
    }

    console.log(`🧪 [EMAIL TEST] Starting test to: ${testEmail}`)
    const providerName = getEmailProviderName()
    console.log(`📧 [EMAIL TEST] Provider configured: ${providerName}`)

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      
      const emailResponse = await resend.emails.send({
        from: 'Helfi Team <support@helfi.ai>',
        to: testEmail,
        subject: '🧪 Helfi Email Test - ' + new Date().toLocaleString(),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #10b981;">🧪 Helfi Email Test</h2>
            <p>This is a test email to verify your email delivery system is working properly.</p>
            
            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #0369a1;">Test Details:</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Sent At:</strong> ${new Date().toISOString()}</li>
                <li><strong>From:</strong> Helfi Team &lt;support@helfi.ai&gt;</li>
                <li><strong>To:</strong> ${testEmail}</li>
                <li><strong>Service:</strong> ${providerName}</li>
              </ul>
            </div>
            
            <p>If you received this email, your email delivery system is working correctly! ✅</p>
            
            ${getEmailFooter({ recipientEmail: testEmail, emailType: 'admin', reasonText: 'This is an automated test email from the Helfi admin panel.' })}
          </div>
        `
      })

      const messageId = emailResponse.data?.id
      const success = emailResponse.error === null || emailResponse.error === undefined

      console.log(`📧 [EMAIL TEST] Provider response:`, {
        success,
        messageId,
        error: emailResponse.error
      })

      if (success && messageId) {
        console.log(`✅ [EMAIL TEST] Successfully sent to ${testEmail} with ID: ${messageId}`)
        
        return NextResponse.json({
          success: true,
          message: 'Test email sent successfully!',
          details: {
            messageId,
            recipient: testEmail,
            timestamp: new Date().toISOString(),
            providerResponse: emailResponse.data
          }
        })
      } else {
        console.error(`❌ [EMAIL TEST] Failed to send:`, emailResponse.error)
        
        return NextResponse.json({
          success: false,
          error: 'Failed to send test email',
          details: {
            providerError: emailResponse.error,
            recipient: testEmail,
            timestamp: new Date().toISOString()
          }
        }, { status: 500 })
      }

    } catch (providerError: any) {
      console.error(`❌ [EMAIL TEST] Provider error:`, providerError)
      
      return NextResponse.json({
        success: false,
        error: 'Email provider error',
        details: {
          errorMessage: providerError.message,
          errorName: providerError.name,
          recipient: testEmail,
          timestamp: new Date().toISOString()
        }
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('❌ [EMAIL TEST] General Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error.message
    }, { status: 500 })
  }
} 
