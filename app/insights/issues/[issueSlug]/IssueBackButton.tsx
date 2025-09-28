'use client'

import Link from 'next/link'

interface IssueBackButtonProps {
  issueSlug: string
}

export default function IssueBackButton({ issueSlug }: IssueBackButtonProps) {
  return (
    <Link
      href={`/insights/issues/${issueSlug}`}
      className="inline-flex items-center gap-2 text-helfi-green font-semibold"
    >
      <span className="text-lg">←</span> Back
    </Link>
  )
}
