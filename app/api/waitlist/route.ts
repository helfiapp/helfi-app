import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY || 're_Q2Ty3J2n_6TrpJB9dKxky37hbm8i7c4d3');

// Add email validation function
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json();

    if (!email || !name) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // Try to ensure the Waitlist table exists and handle database operations
    let existingEntry = null;
    let dbSuccess = false;
    
    try {
      // First, try to create the table if it doesn't exist
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "Waitlist" (
            "id" TEXT NOT NULL,
            "email" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
        )
      `;
      
      // Create unique index if it doesn't exist
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "Waitlist_email_key" ON "Waitlist"("email")
      `;
      
      // Check if email already exists
      const existingResult = await prisma.$queryRaw`
        SELECT email FROM "Waitlist" WHERE email = ${email} LIMIT 1
      ` as any[];
      
      if (existingResult.length > 0) {
        return NextResponse.json(
          { message: 'You\'re already on our waitlist!' },
          { status: 200 }
        );
      }

      // Generate a unique ID and add to waitlist
      const id = `waitlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await prisma.$executeRaw`
        INSERT INTO "Waitlist" ("id", "email", "name", "createdAt") 
        VALUES (${id}, ${email}, ${name}, CURRENT_TIMESTAMP)
      `;
      
      dbSuccess = true;
      console.log('Successfully saved to database:', email, 'with ID:', id);
    } catch (dbError) {
      // Continue even if database fails - we'll still send emails
      console.error('Database error (continuing anyway):', dbError);
      dbSuccess = false;
    }

    // Generate unsubscribe link
    const unsubscribeToken = Buffer.from(`unsubscribe_${email}_helfi`).toString('base64url');
    const unsubscribeUrl = `${process.env.NEXTAUTH_URL || 'https://helfi.ai'}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken}`;

    // Send welcome email to the user
    let userEmailSuccess = false;
    try {
      console.log('Attempting to send welcome email to:', email);
      const userEmailResult = await resend.emails.send({
        from: 'Helfi Health <noreply@helfi.ai>',
        to: email,
        subject: 'Welcome to the Helfi Waitlist! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #10b981; font-size: 32px; margin-bottom: 10px;">Welcome to Helfi!</h1>
            <p style="color: #6b7280; font-size: 18px;">You're on the waitlist 🎉</p>
          </div>
          
          <div style="background: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
            <h2 style="color: #374151; margin-top: 0;">Hi ${name}!</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              Thanks for joining our exclusive waitlist! You'll be among the first to experience 
              Helfi's AI-powered health intelligence platform when we launch.
            </p>
          </div>
          
          <div style="margin-bottom: 25px;">
            <h3 style="color: #374151;">What to expect:</h3>
            <ul style="color: #6b7280; line-height: 1.8;">
              <li>🚀 <strong>Early access</strong> before public launch</li>
              <li>🎯 <strong>Personalized health insights</strong> powered by AI</li>
              <li>💊 <strong>Smart supplement tracking</strong> with photo recognition</li>
              <li>📊 <strong>Health trend analysis</strong> and recommendations</li>
              <li>🔔 <strong>Launch updates</strong> and health tips</li>
            </ul>
          </div>
          
          <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 16px; font-weight: 600;">
              Stay tuned - we're building something amazing! 🚀
            </p>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
            <p style="color: #9ca3af; font-size: 14px; margin: 0;">
              This email was sent to ${email}<br>
              Helfi Health Intelligence Platform<br>
              <a href="https://www.helfi.ai" style="color: #10b981;">www.helfi.ai</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
              Don't want to receive these emails? 
              <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
            </p>
          </div>
        </div>
      `,
      });
      userEmailSuccess = true;
      console.log('Welcome email sent successfully to:', email, 'ID:', userEmailResult.data?.id);
    } catch (emailError) {
      console.error('Failed to send welcome email to', email, ':', emailError);
      userEmailSuccess = false;
    }

        // Send notification to you about new waitlist signup
    let adminEmailSuccess = false;
    try {
      console.log('Attempting to send admin notification for:', email);
      const adminEmailResult = await resend.emails.send({
        from: 'Helfi Health <noreply@helfi.ai>',
      to: ['helfiweb@gmail.com'],
      subject: `New Waitlist Signup: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">New Waitlist Signup! 🎉</h2>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Signed up:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p style="margin-top: 20px;">Your waitlist is growing! 🚀</p>
        </div>
      `,
      });
      adminEmailSuccess = true;
      console.log('Admin notification sent successfully:', adminEmailResult.data?.id);
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
      adminEmailSuccess = false;
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully joined waitlist!',
      debug: {
        dbSuccess,
        userEmailSuccess,
        adminEmailSuccess
      }
    });
  } catch (error) {
    console.error('Waitlist signup error:', error);
    return NextResponse.json(
      { error: 'Failed to join waitlist. Please try again.' },
      { status: 500 }
    );
  }
} 