import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { getToken } from 'next-auth/jwt'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { getEmailFooter } from '@/lib/email-footer'

const getResend = () => {
  if (!process.env.RESEND_API_KEY) {
    console.log('📧 Resend not configured, skipping missing food email')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

const getSupportEmail = () => process.env.MISSING_FOOD_EMAIL_TO || 'support@helfi.ai'

async function sendMissingFoodEmail(payload: {
  name: string
  brand?: string | null
  size?: string | null
  country?: string | null
  kind?: string | null
  query?: string | null
  source?: string | null
  notes?: string | null
  userEmail?: string | null
}) {
  const resend = getResend()
  if (!resend) return

  try {
    const supportEmail = getSupportEmail()
    const emailResponse = await resend.emails.send({
      from: 'Helfi Food Requests <support@helfi.ai>',
      to: supportEmail,
      subject: `Missing food item: ${payload.name}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 28px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.3px;">Missing Food Item</h1>
          </div>
          <div style="padding: 28px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
            <p style="margin: 0 0 16px 0; font-size: 16px;"><strong>Item:</strong> ${payload.name}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Brand/Chain:</strong> ${payload.brand || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Size:</strong> ${payload.size || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Country:</strong> ${payload.country || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Type:</strong> ${payload.kind || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Search:</strong> ${payload.query || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Screen:</strong> ${payload.source || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>User:</strong> ${payload.userEmail || '—'}</p>
            <div style="margin-top: 16px; padding: 14px; background: #f8fafc; border-radius: 8px;">
              <p style="margin: 0; font-size: 14px;"><strong>Notes:</strong></p>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #4b5563;">${payload.notes || '—'}</p>
            </div>
            ${getEmailFooter({ recipientEmail: supportEmail, emailType: 'support' })}
          </div>
        </div>
      `,
    })

    console.log(`✅ [MISSING FOOD EMAIL] Sent to ${supportEmail} with ID: ${emailResponse.data?.id}`)
  } catch (error) {
    console.error('❌ [MISSING FOOD EMAIL] Failed to send:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Missing item name' }, { status: 400 })
    }

    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) userEmail = String(token.email)
      } catch {}
    }

    const user = userEmail ? await prisma.user.findUnique({ where: { email: userEmail } }) : null

    const report = await prisma.foodMissingReport.create({
      data: {
        userId: user?.id ?? null,
        userEmail: userEmail ?? null,
        name,
        brand: body?.brand ? String(body.brand).trim() : null,
        chain: body?.chain ? String(body.chain).trim() : null,
        size: body?.size ? String(body.size).trim() : null,
        country: body?.country ? String(body.country).trim().toUpperCase() : null,
        kind: body?.kind ? String(body.kind).trim() : null,
        query: body?.query ? String(body.query).trim() : null,
        source: body?.source ? String(body.source).trim() : null,
        notes: body?.notes ? String(body.notes).trim() : null,
      },
    })

    // Fire-and-forget email (do not await)
    sendMissingFoodEmail({
      name,
      brand: report.brand,
      size: report.size,
      country: report.country,
      kind: report.kind,
      query: report.query,
      source: report.source,
      notes: report.notes,
      userEmail: report.userEmail,
    }).catch((error) => {
      console.error('❌ [MISSING FOOD EMAIL] Error:', error)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Missing food report failed:', error)
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
  }
}
