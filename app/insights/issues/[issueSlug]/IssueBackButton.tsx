'use client'

import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'

interface IssueBackButtonProps {
  issueSlug: string
}

export default function IssueBackButton({ issueSlug }: IssueBackButtonProps) {
  const segments = useSelectedLayoutSegments()
  const isNestedRoute = segments.length > 0
  const href = isNestedRoute ? `/insights/issues/${issueSlug}` : '/insights'

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-helfi-green font-semibold"
    >
      <span className="text-lg">←</span> Back
    </Link>
  )
}
