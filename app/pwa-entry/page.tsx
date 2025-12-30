import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Paths that should never be used as "last page" destinations
const disallowedPrefixes = ['/auth', '/onboarding', '/privacy', '/terms', '/help', '/faq']
const disallowedExact = ['/', '/healthapp', '/pwa-entry']

function getSafeLastPath(raw?: string | null) {
  if (!raw) return null
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Fall back to raw if decoding fails
  }

  if (!decoded.startsWith('/')) return null
  if (disallowedExact.includes(decoded)) return null
  if (disallowedPrefixes.some((prefix) => decoded.startsWith(prefix))) return null
  return decoded
}

export default async function PwaEntryPage() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    redirect('/auth/signin')
  }

  // Read the last in-app page recorded by the client.
  const lastPathCookie = cookies().get('helfi-last-path')?.value
  const lastPath = getSafeLastPath(lastPathCookie)

  // Guard rail: keep the Health Setup definition identical to HEALTH_SETUP_PROTECTION.md.
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      healthGoals: { select: { name: true } },
      supplements: { select: { id: true } },
      medications: { select: { id: true } },
    },
  })

  if (!user) {
    redirect('/auth/signin')
  }

  const visibleGoals = user.healthGoals.filter((goal) => !goal.name.startsWith('__'))
  const hasBasicProfile = !!(user.gender && user.weight && user.height)
  const hasGoals = visibleGoals.length > 0
  const onboardingComplete = hasBasicProfile && hasGoals

  if (!onboardingComplete) {
    redirect('/onboarding')
  }

  if (lastPath) {
    redirect(lastPath)
  }

  redirect('/dashboard')
}
