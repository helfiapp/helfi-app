import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSummaries, ISSUE_SECTION_ORDER, type IssueSummary } from '@/lib/insights/issue-engine'
import InsightsTopNav from '../../InsightsTopNav'
import InsightsBottomNav from '../../InsightsBottomNav'
import IssueSectionNav from './IssueSectionNav'
import IssueBackButton from './IssueBackButton'

interface IssueLayoutProps {
  children: ReactNode
  params: { issueSlug: string }
}

export default async function IssueLayout({ children, params }: IssueLayoutProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const summaries = await getIssueSummaries(session.user.id)
  let issue = summaries.find((item) => item.slug === params.issueSlug)
  if (!issue) {
    const name = params.issueSlug
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
      .join(' ')
    issue = {
      id: `temp:${params.issueSlug}`,
      slug: params.issueSlug,
      name,
      polarity: 'negative',
      severityLabel: 'Needs data',
      severityScore: null,
      currentRating: null,
      ratingScaleMax: 6,
      trend: 'inconclusive',
      trendDelta: null,
      lastUpdated: null,
      highlight: 'Add logs to unlock personalised insights.',
      blockers: [],
      status: 'needs-data',
    } as IssueSummary
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <InsightsTopNav sessionUser={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }} />

      <header className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <IssueBackButton issueSlug={issue.slug} />
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-helfi-green font-semibold mb-1">Issue workspace</p>
              <h1 className="text-3xl font-bold text-gray-900">{issue.name}</h1>
              <p className="text-sm text-gray-600 mt-2">{issue.highlight}</p>
            </div>
            <div className="inline-flex flex-col md:items-end bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <span className="text-xs uppercase text-gray-500 tracking-wide">Current rating</span>
              <span className="text-2xl font-semibold text-gray-900 mt-1">
                {issue.currentRating !== null ? `${issue.currentRating}/${issue.ratingScaleMax ?? 6}` : 'Not logged'}
              </span>
              <span className="text-xs text-gray-500 mt-1">
                {issue.severityLabel} • {issue.trend.charAt(0).toUpperCase() + issue.trend.slice(1)}
              </span>
            </div>
          </div>
          <IssueSectionNav issueSlug={issue.slug} sections={ISSUE_SECTION_ORDER} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 pb-24 md:pb-12">
        {children}
      </main>

      <InsightsBottomNav />
    </div>
  )
}
