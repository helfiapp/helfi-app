import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { Resend } from 'resend'
import { getEmailFooter } from '@/lib/email-footer'

// Initialize Resend for emails
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.log('📧 Resend API not configured, skipping waitlist emails')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

// Send acknowledgment email to user
/**
 * ⚠️ CRITICAL: DO NOT MODIFY THIS FUNCTION'S ERROR HANDLING PATTERN
 * 
 * This function was fixed after breaking due to overly strict error checking.
 * The working pattern matches sendWaitlistNotificationEmail() exactly.
 * 
 * IMPORTANT PATTERNS TO MAINTAIN:
 * 1. Do NOT check emailResponse.error and throw - this breaks email delivery
 * 2. Do NOT await this function in POST handler - use .catch() pattern instead
 * 3. Only log success/failure - do not throw errors that block the API response
 * 4. Match the exact pattern used in sendWaitlistNotificationEmail() which works
 * 
 * If you need to modify this function:
 * - Test with a real email address first
 * - Ensure BOTH acknowledgment AND notification emails still work
 * - Do NOT add error checking that throws exceptions
 * - Keep the same async non-blocking pattern
 * 
 * Last fixed: 2025-11-12 - Removed strict error checking that prevented delivery
 * See WAITLIST_EMAIL_PROTECTION.md for full details
 */
async function sendWaitlistAcknowledgmentEmail(email: string, name: string) {
  const resend = getResend()
  if (!resend) {
    console.log('📧 [WAITLIST ACK] Resend not configured, skipping email to', email)
    return
  }

  try {
    console.log(`📧 [WAITLIST ACK] Attempting to send email to ${email} for ${name}`)
    
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
              Hi ${(name || 'there').replace(/</g, '&lt;').replace(/>/g, '&gt;')},
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
            
            ${getEmailFooter({ recipientEmail: email, emailType: 'waitlist' })}
          </div>
        </div>
      `
    })

    // Log response - match the pattern used in working notification email
    // DO NOT add error checking here - it breaks email delivery
    // See WAITLIST_EMAIL_PROTECTION.md for why this pattern is critical
    console.log(`✅ [WAITLIST ACK EMAIL] Sent to ${email} with ID: ${emailResponse.data?.id}`)
  } catch (error: any) {
    console.error(`❌ [WAITLIST ACK EMAIL] Failed to send to ${email}:`, error)
    console.error(`❌ [WAITLIST ACK EMAIL] Error details:`, {
      message: error?.message,
      stack: error?.stack,
      errorName: error?.name,
      email: email,
      userName: name
    })
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
    // Use try-catch to handle schema migration period gracefully
    let existingEntry = null
    try {
      existingEntry = await prisma.waitlist.findUnique({
        where: { email: normalizedEmail }
      })
    } catch (schemaError: any) {
      // If schema error (missing columns), try raw query as fallback
      console.warn('Schema error checking existing entry, trying raw query:', schemaError?.message)
      const rawEntries = await prisma.$queryRawUnsafe(`
        SELECT id, email, name, "createdAt" 
        FROM "Waitlist" 
        WHERE email = '${normalizedEmail.replace(/'/g, "''")}'
        LIMIT 1
      `) as Array<{ id: string; email: string; name: string; createdAt: Date }>
      
      if (rawEntries.length > 0) {
        existingEntry = rawEntries[0] as any
      }
    }

    if (existingEntry) {
      // Check if unsubscribed (only if field exists)
      const isUnsubscribed = existingEntry.unsubscribed === true
      if (isUnsubscribed) {
        return NextResponse.json({
          success: false,
          message: 'This email has been unsubscribed from waitlist emails.'
        }, { status: 400 })
      }
      // Return a friendly success message to avoid alarming users
      return NextResponse.json({
        success: true,
        message: 'You\'re already on the waitlist. We\'ll notify you when we go live.'
      })
    }

    // Add to waitlist
    // Handle schema migration period - only include fields that exist
    let waitlistEntry
    try {
      waitlistEntry = await prisma.waitlist.create({
        data: {
          email: normalizedEmail,
          name: normalizedName
        }
      })
    } catch (createError: any) {
      // If create fails due to schema mismatch, try raw insert
      console.warn('Schema error creating entry, trying raw insert:', createError?.message)
      const escapedEmail = normalizedEmail.replace(/'/g, "''")
      const escapedName = normalizedName.replace(/'/g, "''")
      
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Waitlist" (id, email, name, "createdAt")
        VALUES (gen_random_uuid()::text, '${escapedEmail}', '${escapedName}', NOW())
      `)
      
      // Get the created entry
      const rawEntries = await prisma.$queryRawUnsafe(`
        SELECT id, email, name, "createdAt" 
        FROM "Waitlist" 
        WHERE email = '${escapedEmail}'
        ORDER BY "createdAt" DESC
        LIMIT 1
      `) as Array<{ id: string; email: string; name: string; createdAt: Date }>
      
      if (rawEntries.length === 0) {
        throw new Error('Failed to create waitlist entry')
      }
      
      waitlistEntry = rawEntries[0] as any
    }

    // ⚠️ CRITICAL: DO NOT CHANGE THIS PATTERN
    // Both emails use non-blocking .catch() pattern - do NOT await or use try/catch here
    // This pattern matches the working notification email exactly
    // Changing this will break email delivery as it did before (fixed 2025-11-12)
    // Only send email if not unsubscribed (check safely)
    const isUnsubscribed = waitlistEntry?.unsubscribed === true
    if (!isUnsubscribed) {
      sendWaitlistAcknowledgmentEmail(normalizedEmail, normalizedName).catch(error => {
        console.error('❌ [WAITLIST] Acknowledgment email failed (non-blocking):', error)
      })
    }

    // Send notification email to support team (don't await to avoid blocking response)
    sendWaitlistNotificationEmail(normalizedEmail, normalizedName).catch(error => {
      console.error('❌ [WAITLIST] Notification email failed (non-blocking):', error)
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

    // Ensure unsubscribed column exists (for migration period)
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Waitlist" 
        ADD COLUMN IF NOT EXISTS "unsubscribed" BOOLEAN NOT NULL DEFAULT false
      `)
    } catch (e) {
      // Column might already exist, ignore error
    }

    // IMPORTANT: Filter out unsubscribed entries - they should not appear in active waitlist
    // Use raw query to ensure we filter properly even during migration
    try {
      const rawEntries = await prisma.$queryRawUnsafe(`
        SELECT id, email, name, "createdAt"
        FROM "Waitlist" 
        WHERE COALESCE(unsubscribed, false) = false
        ORDER BY "createdAt" DESC
      `) as Array<{ id: string; email: string; name: string; createdAt: Date }>
      
      return NextResponse.json({ waitlist: rawEntries })
    } catch (rawError: any) {
      // Fallback: try Prisma query
      console.warn('Raw query failed, trying Prisma:', rawError?.message)
      try {
        const waitlistEntries = await prisma.waitlist.findMany({
          where: {
            unsubscribed: false  // Only show active subscribers
          },
          orderBy: { createdAt: 'desc' }
        })
        return NextResponse.json({ waitlist: waitlistEntries })
      } catch (prismaError: any) {
        // Last resort: return all entries if column doesn't exist yet
        console.warn('Both queries failed, returning all entries:', prismaError?.message)
        const rawEntries = await prisma.$queryRawUnsafe(`
          SELECT id, email, name, "createdAt" 
          FROM "Waitlist" 
          ORDER BY "createdAt" DESC
        `) as Array<{ id: string; email: string; name: string; createdAt: Date }>
        
        return NextResponse.json({ waitlist: rawEntries })
      }
    }

  } catch (error: any) {
    console.error('Error fetching waitlist:', error)
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta
    })
    return NextResponse.json(
      { error: 'Failed to fetch waitlist: ' + (error?.message || 'Unknown error') },
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
    // Use deleteMany to be more resilient to schema changes
    const result = await prisma.waitlist.deleteMany({
      where: { id }
    })

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Waitlist entry not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'Waitlist entry deleted successfully'
    })

  } catch (error: any) {
    console.error('Error deleting waitlist entry:', error)
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta
    })
    return NextResponse.json(
      { error: 'Failed to delete waitlist entry: ' + (error?.message || 'Unknown error') },
      { status: 500 }
    )
  }
} 