'use client'

import Link from 'next/link'

export default function IssueBackButton() {
  return (
    <Link
      href="/insights"
      className="inline-flex items-center gap-2 text-helfi-green font-semibold"
    >
      <span className="text-lg">←</span> Back
    </Link>
  )
}
