import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
import SectionRenderer from '../SectionRenderer'

interface IssueNutritionPageProps {
  params: { issueSlug: string }
}

export default async function IssueNutritionPage({ params }: IssueNutritionPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const result = await getIssueSection(session.user.id, params.issueSlug, 'nutrition')
  if (!result) {
    notFound()
  }

  return <SectionRenderer issueSlug={params.issueSlug} section="nutrition" initialResult={result} />
}
