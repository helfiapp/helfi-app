import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import SectionRenderer from '../../SectionRenderer'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'

interface IssueSupplementsWorkingPageProps {
  params: { issueSlug: string }
}

export default async function IssueSupplementsWorkingPage({ params }: IssueSupplementsWorkingPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const result = await getIssueSection(session.user.id, params.issueSlug, 'supplements')
  if (!result) {
    notFound()
  }

  const tabs = [
    { label: 'Overview', href: `/insights/issues/${params.issueSlug}/supplements`, active: false },
    { label: "What's Working", href: `/insights/issues/${params.issueSlug}/supplements/working`, active: true },
  ]

  return (
    <SectionRenderer
      issueSlug={params.issueSlug}
      section="supplements"
      initialResult={result}
      tabs={tabs}
      view="working"
    />
  )
}
