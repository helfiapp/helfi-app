import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_Q2Ty3J2n_6TrpJB9dKxky37hbm8i7c4d3');

export async function POST(request: NextRequest) {
  try {
    const { to, subject, html, text } = await request.json();

    if (!to || !subject || (!html && !text)) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, and html or text' },
        { status: 400 }
      );
    }

    const data = await resend.emails.send({
      from: 'Helfi Health <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || `<p>${text}</p>`,
      text: text || '',
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Email sending error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}

// Test endpoint - GET request for quick testing
export async function GET() {
  try {
    const data = await resend.emails.send({
      from: 'Helfi Health <onboarding@resend.dev>',
      to: ['helfiweb@gmail.com'],
      subject: 'Helfi Email Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Welcome to Helfi! 🎉</h1>
          <p>Congratulations! Your email service is now working perfectly.</p>
          <p>This test email confirms that:</p>
          <ul>
            <li>✅ Resend integration is successful</li>
            <li>✅ Authentication emails will work</li>
            <li>✅ Welcome emails will be delivered</li>
            <li>✅ Custom notifications are ready</li>
          </ul>
          <p style="margin-top: 30px;">
            <strong>Next steps:</strong><br>
            Your users can now sign up with email addresses and receive magic links instantly!
          </p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">
              This email was sent from your Helfi health platform.<br>
              Powered by Resend API
            </p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Test email sent successfully!',
      data 
    });
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { error: 'Failed to send test email', details: error },
      { status: 500 }
    );
  }
} 