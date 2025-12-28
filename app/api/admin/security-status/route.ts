import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

const hasValue = (value?: string | null) => Boolean(value && value.trim().length > 0)

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const items = [
      {
        id: 'session-secret',
        label: 'App session secret',
        status: hasValue(process.env.NEXTAUTH_SECRET) || hasValue(process.env.AUTH_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'admin-secret',
        label: 'Admin login secret',
        status: hasValue(process.env.JWT_SECRET) || hasValue(process.env.NEXTAUTH_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'stripe-secret',
        label: 'Payment secret key',
        status: hasValue(process.env.STRIPE_SECRET_KEY) ? 'set' : 'missing',
      },
      {
        id: 'stripe-webhook',
        label: 'Payment webhook secret',
        status: hasValue(process.env.STRIPE_WEBHOOK_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'openai-key',
        label: 'AI provider key',
        status: hasValue(process.env.OPENAI_API_KEY) ? 'set' : 'missing',
      },
      {
        id: 'email-key',
        label: 'Email sending key',
        status: hasValue(process.env.RESEND_API_KEY) ? 'set' : 'missing',
      },
      {
        id: 'storage-key',
        label: 'File storage key',
        status: hasValue(process.env.VERCEL_BLOB_READ_WRITE_TOKEN) ? 'set' : 'missing',
      },
      {
        id: 'encryption-key',
        label: 'Encryption master key',
        status: hasValue(process.env.ENCRYPTION_MASTER_KEY) ? 'set' : 'missing',
      },
      {
        id: 'scheduler-secret',
        label: 'Background job secret',
        status: hasValue(process.env.SCHEDULER_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'push-key',
        label: 'Push notification key',
        status: hasValue(process.env.VAPID_PRIVATE_KEY) ? 'set' : 'missing',
      },
    ]

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Security status error:', error)
    return NextResponse.json({ error: 'Failed to load security status' }, { status: 500 })
  }
}
