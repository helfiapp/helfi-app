import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token'

export async function getAffiliateUser(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionEmail = session?.user?.email?.toLowerCase() || null
  const sessionId = (session?.user as any)?.id as string | undefined

  if (sessionEmail) {
    return prisma.user.findUnique({ where: { email: sessionEmail }, select: { id: true, email: true } })
  }

  if (sessionId) {
    return prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, email: true } })
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024',
    cookieName: SESSION_COOKIE_NAME,
  })
  const tokenEmail = token?.email ? String(token.email).toLowerCase() : null
  const tokenId = token?.id ? String(token.id) : null

  if (tokenEmail) {
    return prisma.user.findUnique({ where: { email: tokenEmail }, select: { id: true, email: true } })
  }

  if (tokenId) {
    return prisma.user.findUnique({ where: { id: tokenId }, select: { id: true, email: true } })
  }

  return null
}
