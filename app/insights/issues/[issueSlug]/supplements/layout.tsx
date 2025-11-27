import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getCachedIssueSection } from '@/lib/insights/issue-engine'
import SupplementsShell from './SupplementsShell'

interface SupplementsLayoutProps {
  children: ReactNode
  params: { issueSlug: string }
}

export default async function SupplementsLayout({ children, params }: SupplementsLayoutProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  // Cache-only read - never blocks on LLM during SSR
  const result = await getCachedIssueSection(session.user.id, params.issueSlug, 'supplements', { mode: 'latest' })

  return (
    <SupplementsShell initialResult={result} issueSlug={params.issueSlug}>
      {children}
    </SupplementsShell>
  )
}
