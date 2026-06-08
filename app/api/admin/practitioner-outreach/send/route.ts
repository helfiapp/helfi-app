import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { getEmailFooter } from '@/lib/email-footer'

const SEND_GAP_MS = 60 * 1000

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function ensureAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return extractAdminFromHeaders(authHeader)
}

async function ensurePractitionerOutreachSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PractitionerOutreachContact" (
      "id" TEXT NOT NULL,
      "name" TEXT,
      "email" TEXT,
      "practiceName" TEXT NOT NULL,
      "country" TEXT NOT NULL,
      "region" TEXT,
      "city" TEXT,
      "practitionerType" TEXT,
      "website" TEXT,
      "emailType" TEXT,
      "sourceUrl" TEXT,
      "relevanceNotes" TEXT,
      "safetyBasis" TEXT,
      "doNotContactNotice" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
      "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
      "lastSentAt" TIMESTAMP(3),
      "sentCount" INTEGER NOT NULL DEFAULT 0,
      "lastError" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PractitionerOutreachContact_pkey" PRIMARY KEY ("id")
    );
  `)
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function personalize(template: string, contact: any) {
  return template
    .replace(/{name}/g, contact.name || 'there')
    .replace(/{practiceName}/g, contact.practiceName || '')
    .replace(/{country}/g, contact.country || '')
    .replace(/{region}/g, contact.region || '')
    .replace(/{city}/g, contact.city || '')
    .replace(/{practitionerType}/g, contact.practitionerType || '')
}

function renderBody(message: string) {
  return message
    .split('\n')
    .map((line) => line.trim())
    .map((line) =>
      line
        ? `<p style="margin: 16px 0; line-height: 1.7; font-size: 16px;">${escapeHtml(line).replace(
            /(https?:\/\/[^\s<]+)/g,
            '<a href="$1" style="color:#059669;text-decoration:underline;">$1</a>'
          )}</p>`
        : '<div style="height: 8px;"></div>'
    )
    .join('')
}

export async function POST(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resend = getResend()
  if (!resend) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  await ensurePractitionerOutreachSchema()

  const body = await request.json().catch(() => ({}))
  const contactIds = Array.isArray(body?.contactIds) ? body.contactIds.map(String).filter(Boolean) : []
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''

  if (contactIds.length === 0) {
    return NextResponse.json({ error: 'No contacts selected' }, { status: 400 })
  }
  if (!subject || !message) {
    return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 })
  }

  const lastSendRows = await prisma.$queryRaw<Array<{ lastSentAt: Date | null }>>`
    SELECT "lastSentAt"
    FROM "PractitionerOutreachContact"
    WHERE "lastSentAt" IS NOT NULL
    ORDER BY "lastSentAt" DESC
    LIMIT 1
  `
  const lastSentAt = lastSendRows[0]?.lastSentAt ? new Date(lastSendRows[0].lastSentAt) : null
  if (lastSentAt) {
    const elapsed = Date.now() - lastSentAt.getTime()
    if (elapsed < SEND_GAP_MS) {
      return NextResponse.json(
        {
          error: 'Please wait before sending the next practitioner outreach email.',
          waitSeconds: Math.ceil((SEND_GAP_MS - elapsed) / 1000),
        },
        { status: 429 }
      )
    }
  }

  const skipped: Array<{ id: string; reason: string }> = []
  let selectedContact: any = null

  for (const id of contactIds) {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT *
      FROM "PractitionerOutreachContact"
      WHERE "id" = ${id}
      LIMIT 1
    `
    const contact = rows[0]
    if (!contact) {
      skipped.push({ id, reason: 'Contact not found' })
      continue
    }
    if (!contact.email) {
      skipped.push({ id, reason: 'No email address' })
      continue
    }
    if (contact.unsubscribed) {
      skipped.push({ id, reason: 'Unsubscribed' })
      continue
    }
    if (contact.doNotContactNotice || contact.status === 'DO_NOT_CONTACT') {
      skipped.push({ id, reason: 'Do not contact' })
      continue
    }
    if (contact.status !== 'APPROVED') {
      skipped.push({ id, reason: 'Not approved for sending' })
      continue
    }
    selectedContact = contact
    break
  }

  if (!selectedContact) {
    return NextResponse.json({ error: 'No approved contact available to send.', skipped }, { status: 400 })
  }

  const personalizedSubject = personalize(subject, selectedContact)
  const personalizedMessage = personalize(message, selectedContact)

  try {
    const emailResponse = await resend.emails.send({
      from: 'Helfi <support@helfi.ai>',
      to: selectedContact.email,
      subject: personalizedSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #111827;">
          <div style="padding: 24px 0; border-bottom: 1px solid #e5e7eb;">
            <h1 style="margin: 0; color: #059669;">Helfi</h1>
          </div>
          <div style="padding: 24px 0;">
            ${renderBody(personalizedMessage)}
            ${getEmailFooter({
              recipientEmail: selectedContact.email,
              emailType: 'marketing',
              reasonText:
                'You received this one-time email because your public practice contact details appeared relevant to the Helfi practitioner directory.',
            })}
          </div>
        </div>
      `,
    })

    await prisma.$executeRaw`
      UPDATE "PractitionerOutreachContact"
      SET
        "status" = 'SENT',
        "lastSentAt" = NOW(),
        "sentCount" = "sentCount" + 1,
        "lastError" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = ${selectedContact.id}
    `

    return NextResponse.json({
      sent: {
        id: selectedContact.id,
        email: selectedContact.email,
        practiceName: selectedContact.practiceName,
        messageId: emailResponse.data?.id || null,
      },
      skipped,
      rateLimit: '1 email per minute',
    })
  } catch (error: any) {
    await prisma.$executeRaw`
      UPDATE "PractitionerOutreachContact"
      SET
        "lastError" = ${error?.message || 'Unknown email error'},
        "updatedAt" = NOW()
      WHERE "id" = ${selectedContact.id}
    `

    return NextResponse.json({ error: error?.message || 'Failed to send email', skipped }, { status: 500 })
  }
}
