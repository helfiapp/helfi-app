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
        const response = await fetch(`/api/insights/issues/${issueSlug}/sections/prefetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections, mode: 'latest', concurrency: 4 }),
          signal,
        })
        if (!response.ok && !cancelled) {
          throw new Error('Prefetch batch failed')
        }
      } catch {
        // Fallback: serialize individual POSTs if batch prefetch fails (network or legacy environments).
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
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      }
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

