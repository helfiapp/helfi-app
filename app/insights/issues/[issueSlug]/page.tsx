import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSummaries, ISSUE_SECTION_ORDER } from '@/lib/insights/issue-engine'

interface IssueOverviewPageProps {
  params: { issueSlug: string }
}

export default async function IssueOverviewPage({ params }: IssueOverviewPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const summaries = await getIssueSummaries(session.user.id)
  const issue = summaries.find((item) => item.slug === params.issueSlug)
  if (!issue) {
    notFound()
  }

  const sectionDescriptions: Record<string, string> = {
    overview: 'Snapshot of recent trends, blockers, and next actions for this issue.',
    supplements: 'Review current regimen, identify gaps, and spot potential additions.',
    interactions: 'Check supplement and medication combinations for timing or safety flags.',
    labs: 'Track bloodwork targets and know when to upload or re-test.',
    nutrition: 'See how logged meals support this issue and what to tweak next.',
    exercise: 'Understand training patterns and recommended adjustments.',
    lifestyle: 'Sleep, stress, and daily habits that influence this issue.',
  }

  const navigationOrder = ISSUE_SECTION_ORDER.filter((section) => section !== 'overview')

  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <Link
          href={`/insights/issues/${issue.slug}/overview`}
          className="block px-5 py-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Overview report</h2>
              <p className="text-sm text-gray-600 mt-1">Generate a full summary across all data points for {issue.name}.</p>
            </div>
            <span className="text-2xl text-gray-400">›</span>
          </div>
        </Link>
        {navigationOrder.map((section) => (
          <Link
            key={section}
            href={`/insights/issues/${issue.slug}/${section}`}
            className="block px-5 py-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {section === 'interactions' ? 'Supplements × Medications' : section}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {sectionDescriptions[section] || 'Open detailed insights for this area.'}
                </p>
              </div>
              <span className="text-2xl text-gray-400">›</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}
