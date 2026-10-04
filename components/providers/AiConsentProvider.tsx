'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import AiConsentModal, { hasSavedAiConsent, saveAiConsent } from '@/components/AiConsentModal'
import { isAiProcessingRequest } from '@/lib/ai-consent-text'

export function AiConsentProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef<{ promise: Promise<boolean>; resolve: (allowed: boolean) => void } | null>(null)

  useEffect(() => {
    let active = true
    const originalFetch = window.fetch
    const guardedFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href)
      const method = init?.method || (input instanceof Request ? input.method : 'GET')
      let body: unknown = init?.body
      if (url.pathname === '/api/reports/weekly/preferences' && body === undefined && input instanceof Request) body = await input.clone().text()
      if (url.origin === window.location.origin && isAiProcessingRequest(url.pathname, method, body)) {
        const saved = await hasSavedAiConsent()
        if (!active) return new Response(JSON.stringify({ error: 'Your account changed. Please try again.', code: 'ai_consent_required' }), { status: 403 })
        if (!saved) {
          if (!pending.current) {
            let resolve!: (allowed: boolean) => void
            const promise = new Promise<boolean>(done => { resolve = done })
            pending.current = { promise, resolve }
            setError('')
            setOpen(true)
          }
          const allowed = await pending.current.promise
          if (!allowed) return new Response(JSON.stringify({ error: 'AI permission was not granted. Your data was not sent to AI.', code: 'ai_consent_required' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
        }
      }
      return originalFetch.call(window, input, init)
    }
    window.fetch = guardedFetch
    return () => {
      active = false
      if (window.fetch === guardedFetch) window.fetch = originalFetch
      pending.current?.resolve(false)
      pending.current = null
      setOpen(false)
    }
  }, [session?.user?.id])

  const finish = (allowed: boolean) => {
    pending.current?.resolve(allowed)
    pending.current = null
    setOpen(false)
  }
  return <>
    {children}
    <AiConsentModal open={open} onAgree={async () => {
      if (saving) return
      const request = pending.current
      setSaving(true)
      try { await saveAiConsent(); if (pending.current === request) finish(true) } catch (e: any) { setError(e.message) } finally { setSaving(false) }
    }} onCancel={() => finish(false)} />
    {open && error ? <div role="alert" className="fixed bottom-4 inset-x-4 z-[10001] rounded-xl bg-red-50 p-3 text-center text-red-800">{error}</div> : null}
  </>
}
