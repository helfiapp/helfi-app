import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
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

  const result = await getIssueSection(session.user.id, params.issueSlug, 'supplements')
  if (!result) {
    notFound()
  }

  return (
    <SupplementsShell initialResult={result} issueSlug={params.issueSlug}>
      {children}
    </SupplementsShell>
  )
}
