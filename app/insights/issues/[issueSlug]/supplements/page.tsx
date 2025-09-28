import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
import SectionRenderer from '../SectionRenderer'

interface IssueSupplementsPageProps {
  params: { issueSlug: string }
}

export default async function IssueSupplementsPage({ params }: IssueSupplementsPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const result = await getIssueSection(session.user.id, params.issueSlug, 'supplements')
  if (!result) {
    notFound()
  }

  const tabs = [
    { label: 'Overview', href: `/insights/issues/${params.issueSlug}/supplements`, active: true },
    { label: "What's Working", href: `/insights/issues/${params.issueSlug}/supplements/working`, active: false },
  ]

  return <SectionRenderer issueSlug={params.issueSlug} section="supplements" initialResult={result} tabs={tabs} view="overview" />
}
