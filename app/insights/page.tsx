import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueLandingPayload } from '@/lib/insights/issue-engine'
import InsightsLandingClient from './InsightLandingClient'

export default async function InsightsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const payload = await getIssueLandingPayload(session.user.id)

  return (
    <InsightsLandingClient
      sessionUser={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      issues={payload.issues}
      generatedAt={payload.generatedAt}
      onboardingComplete={payload.onboardingComplete}
    />
  )
}
