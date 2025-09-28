import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
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

  const result = await getIssueSection(session.user.id, params.issueSlug, 'medications')
  if (!result) {
    notFound()
  }

  return (
    <MedicationsShell initialResult={result} issueSlug={params.issueSlug}>
      {children}
    </MedicationsShell>
  )
}
