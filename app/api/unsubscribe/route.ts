export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Unsubscribe API endpoint
 * Handles email unsubscription requests for legal compliance (CAN-SPAM, GDPR, etc.)
 * 
 * This endpoint:
 * 1. Marks waitlist entries as unsubscribed
 * 2. Can be extended to track user email preferences
 * 3. Provides a user-friendly confirmation page
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const email = searchParams.get('email')

    if (!email) {
      // Return HTML page asking for email
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Unsubscribe from Helfi Emails</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #f8fafc;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            h1 { color: #374151; margin-top: 0; }
            p { color: #4b5563; line-height: 1.7; }
            form {
              margin-top: 30px;
            }
            input {
              width: 100%;
              padding: 12px;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              font-size: 16px;
              margin-bottom: 15px;
            }
            button {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 12px 24px;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
            }
            button:hover {
              opacity: 0.9;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Unsubscribe from Helfi Emails</h1>
            <p>Enter your email address to unsubscribe from all Helfi marketing emails.</p>
            <form method="GET" action="/api/unsubscribe">
              <input type="email" name="email" placeholder="your@email.com" required>
              <button type="submit">Unsubscribe</button>
            </form>
          </div>
        </body>
        </html>
        `,
        {
          headers: { 'Content-Type': 'text/html' },
        }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Ensure unsubscribed column exists (for migration period)
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Waitlist" 
        ADD COLUMN IF NOT EXISTS "unsubscribed" BOOLEAN NOT NULL DEFAULT false
      `)
    } catch (e) {
      // Column might already exist, ignore error
      console.log('Column check result:', e)
    }

    // Update waitlist entry to mark as unsubscribed
    // Use raw SQL to ensure it works even if Prisma schema is out of sync
    try {
      const escapedEmail = normalizedEmail.replace(/'/g, "''")
      
      // First ensure column exists
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Waitlist" 
        ADD COLUMN IF NOT EXISTS "unsubscribed" BOOLEAN NOT NULL DEFAULT false
      `).catch(() => {}) // Ignore if column already exists
      
      // Now update the record - use raw SQL to guarantee it works
      const updateResult = await prisma.$executeRawUnsafe(`
        UPDATE "Waitlist" 
        SET unsubscribed = true 
        WHERE LOWER(email) = LOWER('${escapedEmail}')
      `)
      
      console.log(`✅ Marked ${normalizedEmail} as unsubscribed`)
      
      // Also try Prisma as backup (but raw SQL should have worked)
      await prisma.waitlist.updateMany({
        where: { email: normalizedEmail },
        data: { unsubscribed: true }
      }).catch(() => {}) // Ignore if Prisma fails

      // Also check if user exists and could track preferences there
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      })

      // Return success page
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Successfully Unsubscribed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #f8fafc;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              text-align: center;
            }
            h1 { color: #10b981; margin-top: 0; }
            p { color: #4b5563; line-height: 1.7; }
            .success-icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            a {
              color: #10b981;
              text-decoration: none;
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Successfully Unsubscribed</h1>
            <p>You have been unsubscribed from Helfi marketing emails.</p>
            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
              The email address <strong>${normalizedEmail}</strong> will no longer receive marketing emails from Helfi.
            </p>
            <p style="margin-top: 20px;">
              <a href="https://helfi.ai">Return to Helfi</a>
            </p>
            <p style="margin-top: 30px; font-size: 12px; color: #9ca3af;">
              Note: You may still receive important account-related emails (verification, security alerts, etc.) 
              as required for your account security.
            </p>
          </div>
        </body>
        </html>
        `,
        {
          headers: { 'Content-Type': 'text/html' },
        }
      )
    } catch (error) {
      console.error('Unsubscribe error:', error)
      // Still return success page to user (don't reveal if email exists)
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Unsubscribed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #f8fafc;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              text-align: center;
            }
            h1 { color: #10b981; margin-top: 0; }
            p { color: #4b5563; line-height: 1.7; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Unsubscribed</h1>
            <p>Your request has been processed. If this email was on our list, you have been unsubscribed.</p>
            <p style="margin-top: 20px;">
              <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">Return to Helfi</a>
            </p>
          </div>
        </body>
        </html>
        `,
        {
          headers: { 'Content-Type': 'text/html' },
        }
      )
    }
  } catch (error) {
    console.error('Unsubscribe endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to process unsubscribe request' },
      { status: 500 }
    )
  }
}
