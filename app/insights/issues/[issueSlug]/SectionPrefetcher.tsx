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
        // Serialize with a small delay to avoid thundering herd and rate spikes.
        for (const section of sections) {
          if (cancelled) break
          try {
            await fetch(`/api/insights/issues/${issueSlug}/sections/${section}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'latest' }),
              signal,
            }).catch(() => {})
          } catch {}
          // 250ms spacing between requests
          await new Promise((r) => setTimeout(r, 250))
        }
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


