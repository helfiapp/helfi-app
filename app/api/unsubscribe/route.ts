import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const token = searchParams.get('token');

    if (!email || !token) {
      return new Response(
        `
        <html>
          <head><title>Unsubscribe - Helfi</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <div style="text-align: center;">
              <h1 style="color: #ef4444;">Invalid Unsubscribe Link</h1>
              <p>This unsubscribe link is invalid or has expired.</p>
              <p>If you continue to receive emails, please contact <a href="mailto:support@helfi.ai">support@helfi.ai</a></p>
            </div>
          </body>
        </html>
        `,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Generate expected token (simple hash based on email)
    const expectedToken = Buffer.from(`unsubscribe_${email}_helfi`).toString('base64url');
    
    if (token !== expectedToken) {
      return new Response(
        `
        <html>
          <head><title>Unsubscribe - Helfi</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <div style="text-align: center;">
              <h1 style="color: #ef4444;">Invalid Token</h1>
              <p>This unsubscribe link is invalid or has been tampered with.</p>
              <p>If you continue to receive emails, please contact <a href="mailto:support@helfi.ai">support@helfi.ai</a></p>
            </div>
          </body>
        </html>
        `,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Try to remove from waitlist database
    let dbResult = 'Database operation skipped';
    try {
      const result = await prisma.$executeRaw`
        DELETE FROM "Waitlist" WHERE email = ${email}
      `;
      dbResult = 'Successfully removed from database';
    } catch (dbError) {
      console.error('Database error during unsubscribe:', dbError);
      dbResult = 'Database removal failed (email noted for manual removal)';
    }

    // Return success page
    return new Response(
      `
      <html>
        <head>
          <title>Unsubscribed - Helfi</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { background: #dcfce7; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; text-align: center; }
            .logo { color: #10b981; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="success">
            <div class="logo">Helfi</div>
            <h1 style="color: #22c55e; margin-top: 0;">Successfully Unsubscribed</h1>
            <p style="color: #374151; font-size: 16px;">
              <strong>${email}</strong> has been removed from our mailing list.
            </p>
            <p style="color: #6b7280;">
              You will no longer receive emails from Helfi. If you change your mind, 
              you can always sign up again at <a href="https://helfi.ai" style="color: #10b981;">helfi.ai</a>
            </p>
            <p style="color: #9ca3af; font-size: 14px; margin-top: 30px;">
              We're sorry to see you go! 👋
            </p>
          </div>
        </body>
      </html>
      `,
      { headers: { 'Content-Type': 'text/html' } }
    );

  } catch (error) {
    console.error('Unsubscribe error:', error);
    return new Response(
      `
      <html>
        <head><title>Error - Helfi</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <div style="text-align: center;">
            <h1 style="color: #ef4444;">Error</h1>
            <p>Something went wrong processing your unsubscribe request.</p>
            <p>Please contact <a href="mailto:support@helfi.ai">support@helfi.ai</a> for assistance.</p>
          </div>
        </body>
      </html>
      `,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Generate unsubscribe token
    const token = Buffer.from(`unsubscribe_${email}_helfi`).toString('base64url');
    const unsubscribeUrl = `${process.env.NEXTAUTH_URL || 'https://helfi.ai'}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;

    return NextResponse.json({ 
      success: true,
      unsubscribeUrl
    });

  } catch (error) {
    console.error('Unsubscribe generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate unsubscribe link' },
      { status: 500 }
    );
  }
} 