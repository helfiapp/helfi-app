import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
import ExerciseShell from './ExerciseShell'

interface ExerciseLayoutProps {
  children: ReactNode
  params: { issueSlug: string }
}

export default async function ExerciseLayout({ children, params }: ExerciseLayoutProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const result = await getIssueSection(session.user.id, params.issueSlug, 'exercise')
  if (!result) {
    notFound()
  }

  return (
    <ExerciseShell initialResult={result} issueSlug={params.issueSlug}>
      {children}
    </ExerciseShell>
  )
}
