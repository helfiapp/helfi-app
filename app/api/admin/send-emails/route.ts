import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const authHeader = request.headers.get('authorization')
    if (authHeader !== 'Bearer HelfiAdmin2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emails, subject, message, waitlistData } = await request.json()

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'No recipients provided' }, { status: 400 })
    }

    if (!subject.trim() || !message.trim()) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 })
    }

    // For now, we'll simulate email sending
    // In a real implementation, you'd integrate with an email service like:
    // - Resend (recommended for developers)
    // - SendGrid 
    // - AWS SES
    // - Mailgun
    // - Postmark

    const results = []
    
    for (const email of emails) {
      try {
        // Find the corresponding waitlist entry to get the name
        const recipient = waitlistData.find((entry: any) => entry.email === email)
        const name = recipient?.name || 'there'
        
        // Personalize the message
        const personalizedMessage = message.replace(/{name}/g, name)
        
        // Simulate email sending delay
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // In a real implementation, you'd send the email here:
        /*
        const emailResult = await emailService.send({
          to: email,
          subject: subject,
          html: personalizedMessage.replace(/\n/g, '<br>'),
          from: 'info@helfi.ai' // Your verified sender
        })
        */
        
        results.push({
          email,
          status: 'sent',
          messageId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })
        
        console.log(`[EMAIL SIMULATION] To: ${email}, Subject: ${subject}`)
        console.log(`[EMAIL SIMULATION] Message: ${personalizedMessage.substring(0, 100)}...`)
        
      } catch (error) {
        console.error(`Failed to send email to ${email}:`, error)
        results.push({
          email,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const successCount = results.filter(r => r.status === 'sent').length
    const failCount = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: true,
      message: `Email campaign completed: ${successCount} sent, ${failCount} failed`,
      results,
      summary: {
        total: emails.length,
        sent: successCount,
        failed: failCount
      }
    })

  } catch (error) {
    console.error('Error sending emails:', error)
    return NextResponse.json(
      { error: 'Failed to send emails' },
      { status: 500 }
    )
  }
} 