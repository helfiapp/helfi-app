import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
import SectionRenderer from '../SectionRenderer'

interface IssueExercisePageProps {
  params: { issueSlug: string }
}

export default async function IssueExercisePage({ params }: IssueExercisePageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const result = await getIssueSection(session.user.id, params.issueSlug, 'exercise')
  if (!result) {
    notFound()
  }

  return <SectionRenderer issueSlug={params.issueSlug} section="exercise" initialResult={result} />
}
