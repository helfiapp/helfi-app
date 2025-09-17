'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IssueSectionKey } from '@/lib/insights/issue-engine'

interface IssueSectionNavProps {
  issueSlug: string
  sections: IssueSectionKey[]
}

const LABELS: Record<IssueSectionKey, string> = {
  overview: 'Overview',
  exercise: 'Exercise',
  supplements: 'Supplements',
  interactions: 'Supplements × Meds',
  labs: 'Labs & Bloodwork',
  nutrition: 'Nutrition & Food',
  lifestyle: 'Lifestyle',
}

export default function IssueSectionNav({ issueSlug, sections }: IssueSectionNavProps) {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {sections.map((section) => {
        const href = section === 'overview' ? `/insights/issues/${issueSlug}` : `/insights/issues/${issueSlug}/${section}`
        const isActive = pathname === href
        return (
          <Link
            key={section}
            href={href}
            className={`px-4 py-2 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive ? 'bg-helfi-green text-white border-helfi-green shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-helfi-green hover:text-helfi-green'
            }`}
          >
            {LABELS[section] ?? section}
          </Link>
        )
      })}
    </div>
  )
}

