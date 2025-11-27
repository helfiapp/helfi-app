import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getCachedIssueSection } from '@/lib/insights/issue-engine'
import MedicationsShell from './MedicationsShell'

interface MedicationsLayoutProps {
  children: ReactNode
  params: { issueSlug: string }
}

export default async function MedicationsLayout({ children, params }: MedicationsLayoutProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  // Cache-only read - never blocks on LLM during SSR
  const result = await getCachedIssueSection(session.user.id, params.issueSlug, 'medications', { mode: 'latest' })

  return (
    <MedicationsShell initialResult={result} issueSlug={params.issueSlug}>
      {children}
    </MedicationsShell>
  )
}
