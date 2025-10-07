'use client'

import { useEffect } from 'react'
import type { IssueSectionKey } from '@/lib/insights/issue-engine'

export default function SectionPrefetcher({ issueSlug, sections }: { issueSlug: string; sections: IssueSectionKey[] }) {
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal

    async function prefetch() {
      try {
        await Promise.all(
          sections.map(async (section) => {
            try {
              // Warm the section by forcing a background POST generation.
              await fetch(`/api/insights/issues/${issueSlug}/sections/${section}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'latest' }),
                signal,
              }).catch(() => {})
            } catch {}
          })
        )
      } catch {}
      return () => {
        cancelled = true
      }
    }

    prefetch()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [issueSlug, sections])

  return null
}


