import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { processSupportTicketAutoReply } from '@/lib/support-automation'

function emailAddress(value: unknown): string {
  const raw = typeof value === 'string' ? value : String((value as any)?.email || (value as any)?.address || '')
  if (/[\r\n]/.test(raw)) return ''
  const email = (raw.match(/<([^<>]+)>/)?.[1] || raw).trim().toLowerCase()
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : ''
}

export async function POST(request: NextRequest) {
  const expected = process.env.SUPPORT_INBOUND_WEBHOOK_SECRET || ''
  const supplied = (request.headers.get('authorization') || '').replace(/^Bearer /, '')
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 128000) return NextResponse.json({ error: 'Email is too large' }, { status: 413 })
    const email = JSON.parse(raw)
    const sender = emailAddress(email.from)
    const recipients = (Array.isArray(email.to) ? email.to : [email.to]).map(emailAddress)
    const subject = typeof email.subject === 'string' ? email.subject.trim() : 'Support request'
    const message = typeof email.text === 'string' && email.text.trim()
      ? email.text.trim()
      : typeof email.html === 'string' ? email.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''
    const messageId = typeof email.messageId === 'string' ? email.messageId.trim() : ''
    if (!sender || !recipients.includes('support@helfi.ai') || !message || !messageId || messageId.length > 500 || /[\r\n]/.test(messageId) || subject.length > 200 || message.length > 20000) {
      return NextResponse.json({ error: 'Invalid support email' }, { status: 400 })
    }
    if (sender === 'support@helfi.ai') return NextResponse.json({ success: true, ignored: true })

    const receipt = '[SYSTEM] Email received ' + crypto.createHash('sha256').update(messageId).digest('hex')
    const referenceId = subject.match(/\[Helfi:([a-zA-Z0-9_-]{8,100})\]/)?.[1]
    const replyIds = [email.inReplyTo, ...(Array.isArray(email.references) ? email.references : [])]
      .filter((id): id is string => typeof id === 'string' && id.length <= 500 && !id.startsWith('guest:'))
    const result = await prisma.$transaction(async (tx) => {
      // Serialize duplicate deliveries across server processes without a new table.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${receipt}))`
      const received = await tx.ticketResponse.findFirst({ where: { isAdminResponse: true, message: receipt } })
      if (received) return { ticketId: received.ticketId, duplicate: true, reply: false }
      const prior = await tx.supportTicket.findFirst({ where: { externalMessageId: messageId } })
      if (prior) return { ticketId: prior.id, duplicate: true, reply: false }
      const existing = referenceId || replyIds.length ? await tx.supportTicket.findFirst({
        where: {
          userEmail: { equals: sender, mode: 'insensitive' },
          ...(referenceId ? { id: referenceId } : { externalMessageId: { in: replyIds } }),
        },
      }) : null
      const ticket = existing || await tx.supportTicket.create({
        data: { subject: subject || 'Support request', message, userEmail: sender, userName: sender, status: 'OPEN', priority: 'MEDIUM', category: 'EMAIL', externalMessageId: messageId },
      })
      if (existing) {
        await tx.ticketResponse.create({ data: { ticketId: ticket.id, message, isAdminResponse: false, userEmail: sender } })
        await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: 'AWAITING_RESPONSE', updatedAt: new Date() } })
      }
      await tx.ticketResponse.create({ data: { ticketId: ticket.id, message: receipt, isAdminResponse: true } })
      return { ticketId: ticket.id, duplicate: false, reply: !!existing }
    })
    if (!result.duplicate) {
      try {
        await processSupportTicketAutoReply({ ticketId: result.ticketId, latestUserMessage: message, source: result.reply ? 'email_reply' : 'email_ticket' })
      } catch {
        // Keep the saved ticket for manual follow-up; never replay an uncertain send.
        await prisma.supportTicket.update({ where: { id: result.ticketId }, data: { status: 'IN_PROGRESS' } })
        console.error('[SUPPORT EMAIL] Saved ticket needs follow-up', { ticketId: result.ticketId })
      }
    }
    return NextResponse.json({ success: true, ticketId: result.ticketId, duplicate: result.duplicate })
  } catch {
    return NextResponse.json({ error: 'Support email could not be processed' }, { status: 500 })
  }
}
