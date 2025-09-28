'use client'

import { useRouter } from 'next/navigation'

export default function IssueBackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-helfi-green font-semibold"
    >
      <span className="text-lg">←</span> Back
    </button>
  )
}
