import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSummaries, ISSUE_SECTION_ORDER } from '@/lib/insights/issue-engine'
import type { IssueSummary } from '@/lib/insights/issue-engine'
import dynamic from 'next/dynamic'
const SectionPrefetcher = dynamic(() => import('./SectionPrefetcher'), { ssr: false })
const IssueOverviewClient = dynamic(() => import('./IssueOverviewClient'), { ssr: false })

interface IssueOverviewPageProps {
  params: { issueSlug: string }
}

function fallbackIssue(slug: string): IssueSummary {
  const readable = slug
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return {
    id: `temp:${slug}`,
    slug,
    name: readable || 'Insight',
    polarity: 'negative',
    severityLabel: 'Needs data',
    severityScore: null,
    currentRating: null,
    ratingScaleMax: 6,
    trend: 'inconclusive',
    trendDelta: null,
    lastUpdated: null,
    highlight: 'Needs more data before we can generate trends.',
    blockers: ['Log more recent data so we can generate this report.'],
    status: 'needs-data',
  }
}

export default async function IssueOverviewPage({ params }: IssueOverviewPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const summaries = await getIssueSummaries(session.user.id)
  const issue = summaries.find((item) => item.slug === params.issueSlug) ?? fallbackIssue(params.issueSlug)

  const sectionDescriptions: Record<string, string> = {
    supplements: 'Review current regimen, identify gaps, and spot potential additions.',
    medications: 'Track prescriptions, capture timing, and see what is actually helping.',
    labs: 'Track bloodwork targets and know when to upload or re-test.',
    nutrition: 'See how logged meals support this issue and what to tweak next.',
  }

  const sectionsToPrefetch = ISSUE_SECTION_ORDER

  return (
    <div className="space-y-6">
      {/* Prefetch all sections in the background so opening is instant */}
      <SectionPrefetcher issueSlug={issue.slug} sections={sectionsToPrefetch} />
      <IssueOverviewClient issue={issue} issueSlug={issue.slug} />
    </div>
  )
}
