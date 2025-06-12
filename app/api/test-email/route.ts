import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY || "re_Q2Ty3J2n_6TrpJB9dKxky37hbm8i7c4d3")
    
    console.log('Attempting to send test email to:', email)
    console.log('Using API key:', process.env.RESEND_API_KEY ? 'Set' : 'Using fallback')
    
    const result = await resend.emails.send({
      from: "Helfi Health <noreply@helfi.ai>",
      to: email,
      subject: "Test Email from Helfi",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #10b981;">Test Email</h1>
          <p>This is a test email to verify that email sending is working properly.</p>
          <p>Email sent to: ${email}</p>
          <p>Time: ${new Date().toISOString()}</p>
        </div>
      `,
    })

    console.log('Email send result:', result)
    
    return NextResponse.json({ 
      success: true, 
      result,
      message: 'Test email sent successfully' 
    })
    
  } catch (error) {
    console.error('Test email error:', error)
    return NextResponse.json({ 
      error: 'Failed to send test email',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 