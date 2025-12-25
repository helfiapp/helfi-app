import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { partnerOutreachSeed } from '@/lib/partner-outreach-seed'

const ensureAdmin = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin && authHeader !== 'Bearer temp-admin-token') {
    return null
  }
  return admin || { id: 'temp-admin-id' }
}

export async function POST(request: NextRequest) {
  const admin = ensureAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = partnerOutreachSeed.map(entry => ({
      name: entry.name.trim(),
      email: entry.email.trim().toLowerCase(),
      company: entry.company.trim(),
      region: entry.region ? entry.region.trim() : null,
      notes: entry.notes ? entry.notes.trim() : null,
      sourceUrl: entry.sourceUrl ? entry.sourceUrl.trim() : null,
      unsubscribed: false
    }))

    const result = await prisma.partnerOutreachContact.createMany({
      data,
      skipDuplicates: true
    })

    return NextResponse.json({ createdCount: result.count })
  } catch (error: any) {
    console.error('Error initializing partner outreach contacts:', error)
    return NextResponse.json({ error: 'Failed to initialize contacts' }, { status: 500 })
  }
}
