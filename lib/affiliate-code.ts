import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

function generateCandidateCode(): string {
  const raw = crypto.randomBytes(10).toString('base64url')
  return raw.replace(/[-_]/g, '').slice(0, 10).toLowerCase()
}

export async function createUniqueAffiliateCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCandidateCode()
    const existing = await prisma.affiliate.findUnique({ where: { code }, select: { id: true } })
    if (!existing) return code
  }
  throw new Error('Failed to generate unique affiliate code')
}

