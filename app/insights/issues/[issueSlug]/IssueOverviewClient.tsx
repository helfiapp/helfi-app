'use client'

import Link from 'next/link'
import type { IssueSummary, IssueSectionKey } from '@/lib/insights/issue-engine'

const SECTION_ORDER: IssueSectionKey[] = [
  'overview',
  'exercise',
  'supplements',
  'medications',
  'interactions',
  'labs',
  'nutrition',
]

interface IssueOverviewClientProps {
  issue: IssueSummary
  issueSlug: string
}

export default function IssueOverviewClient({ issue, issueSlug }: IssueOverviewClientProps) {
  const sectionDescriptions: Record<string, string> = {
    overview: 'Snapshot of recent trends, blockers, and next actions for this issue.',
    supplements: 'Review current regimen, identify gaps, and spot potential additions.',
    medications: 'Track prescriptions, capture timing, and see what is actually helping.',
    interactions: 'Check supplement and medication combinations for timing or safety flags.',
    labs: 'Track bloodwork targets and know when to upload or re-test.',
    nutrition: 'See how logged meals support this issue and what to tweak next.',
    exercise: 'Understand training patterns and recommended adjustments.',
  }

  const navigationOrder = SECTION_ORDER.filter((section) => section !== 'overview') as IssueSectionKey[]

  return (
    <div className="space-y-6">
      <section className="bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-emerald-700">
            Insights refresh automatically when you click “Update Insights” in Health Setup. Open any section below to view the latest guidance.
          </p>
        </div>
      </section>

      {/* Section Links */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <Link
          href={`/insights/issues/${issueSlug}/overview`}
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
            href={`/insights/issues/${issueSlug}/${section}`}
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
