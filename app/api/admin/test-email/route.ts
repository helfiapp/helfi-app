import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // Verify admin token
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]

    // Accept temporary admin token used by the admin panel for tests
    if (token !== 'temp-admin-token') {
      // Check admin authentication using raw query
      const adminUsers = await prisma.$queryRaw`
        SELECT * FROM "AdminUser" 
        WHERE email = 'info@sonicweb.com.au' 
        AND "isActive" = true 
        LIMIT 1
      ` as any[]
      
      const adminUser = adminUsers[0]
      if (!adminUser || !bcrypt.compareSync(token, adminUser.password)) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
    }

    const { testEmail } = await request.json()
    
    if (!testEmail) {
      return NextResponse.json({ error: 'Test email address required' }, { status: 400 })
    }

    // Check environment configuration
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      return NextResponse.json({ 
        error: 'RESEND_API_KEY not configured',
        details: 'Email service is not properly configured on the server'
      }, { status: 500 })
    }

    console.log(`🧪 [EMAIL TEST] Starting test to: ${testEmail}`)
    console.log(`🔑 [EMAIL TEST] API Key configured: ${resendApiKey.substring(0, 10)}...`)

    try {
      const resend = new Resend(resendApiKey)
      
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
                <li><strong>Service:</strong> Resend Email API</li>
              </ul>
            </div>
            
            <p>If you received this email, your email delivery system is working correctly! ✅</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #6b7280; font-size: 14px;">
              This is an automated test email from the Helfi admin panel.
            </p>
          </div>
        `
      })

      const messageId = emailResponse.data?.id
      const success = emailResponse.error === null || emailResponse.error === undefined

      console.log(`📧 [EMAIL TEST] Resend Response:`, {
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
            resendResponse: emailResponse.data
          }
        })
      } else {
        console.error(`❌ [EMAIL TEST] Failed to send:`, emailResponse.error)
        
        return NextResponse.json({
          success: false,
          error: 'Failed to send test email',
          details: {
            resendError: emailResponse.error,
            recipient: testEmail,
            timestamp: new Date().toISOString()
          }
        }, { status: 500 })
      }

    } catch (resendError: any) {
      console.error(`❌ [EMAIL TEST] Resend API Error:`, resendError)
      
      return NextResponse.json({
        success: false,
        error: 'Resend API Error',
        details: {
          errorMessage: resendError.message,
          errorName: resendError.name,
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