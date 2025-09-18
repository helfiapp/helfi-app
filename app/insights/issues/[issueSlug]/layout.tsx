import Link from 'next/link'
import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSummaries, ISSUE_SECTION_ORDER, type IssueSummary } from '@/lib/insights/issue-engine'
import InsightsTopNav from '../../InsightsTopNav'
import InsightsMobileNav from '../../InsightsMobileNav'
import IssueSectionNav from './IssueSectionNav'

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
  const issue = summaries.find((item) => item.slug === params.issueSlug)
  if (!issue) {
    notFound()
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
            <Link href="/insights" className="inline-flex items-center gap-2 text-helfi-green font-semibold">
              <span className="text-lg">←</span> Back to Insights
            </Link>
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

      <InsightsMobileNav activePath={`/insights/issues/${params.issueSlug}`} />
    </div>
  )
}
