'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

const sanitizeNextTarget = (value: string | null) => {
  if (!value) return '/onboarding'
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return '/onboarding'
  if (trimmed.startsWith('//')) return '/onboarding'
  if (trimmed.startsWith('/api/')) return '/onboarding'
  return trimmed
}

const SHOULD_SKIP_KEY = 'helfi:skipAppleLinkPrompt'
const SHOULD_SKIP_UNTIL_KEY = 'helfi:skipAppleLinkPromptUntil'

const shouldSkipPrompt = () => {
  try {
    if (localStorage.getItem(SHOULD_SKIP_KEY) === '1') return true
    const untilRaw = localStorage.getItem(SHOULD_SKIP_UNTIL_KEY)
    if (untilRaw) {
      const until = Number(untilRaw)
      if (Number.isFinite(until) && until > Date.now()) return true
    }
  } catch {
    // Ignore storage errors; default to showing prompt.
  }
  return false
}

export default function LinkApplePage() {
  const router = useRouter()
  const { status } = useSession()
  const [nextTarget, setNextTarget] = useState('/onboarding')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Avoid using Next.js search params hooks here.
    // This page must not break static export/prerender.
    try {
      const sp = new URLSearchParams(window.location.search)
      setNextTarget(sanitizeNextTarget(sp.get('next')))
    } catch {
      setNextTarget('/onboarding')
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (status !== 'authenticated') {
      router.replace(`/auth/signin?next=${encodeURIComponent(nextTarget)}`)
      return
    }
    if (shouldSkipPrompt()) {
      router.replace(nextTarget)
      return
    }

    const run = async () => {
      try {
        const res = await fetch('/api/auth/apple/link/status', { method: 'GET' })
        if (!res.ok) throw new Error('status_failed')
        const data = await res.json()
        const isLinked = Boolean(data?.linked)
        if (isLinked) {
          router.replace(nextTarget)
          return
        }
      } catch (e) {
        console.error('Apple link status check failed', e)
        setError('We could not check your Apple link status. You can still continue.')
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [status, router, nextTarget])

  const handleSkip = () => {
    try {
      // Don't keep nagging: skip for 30 days.
      localStorage.setItem(SHOULD_SKIP_UNTIL_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000))
    } catch {
      // Ignore storage errors
    }
    router.replace(nextTarget)
  }

  const handleLink = () => {
    window.location.href = `/api/auth/apple/link/authorize?next=${encodeURIComponent(nextTarget)}`
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-lg font-semibold text-gray-900">Checking your account…</div>
          <div className="mt-2 text-sm text-gray-600">One moment.</div>
        </div>
      </div>
    )
  }

  // If status check failed, we still show the prompt but allow user to continue.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="text-2xl font-bold text-gray-900">Link Apple login?</div>
        <p className="mt-3 text-sm text-gray-700">
          This lets you sign in faster next time using Face ID / Touch ID.
        </p>
        <p className="mt-2 text-sm text-gray-700">
          It also helps avoid accidentally creating a second account later if you tap Apple login.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleLink}
            className="w-full rounded-xl bg-black text-white py-3 text-sm font-semibold hover:bg-gray-900"
          >
            Link Apple login (recommended)
          </button>

          <button
            onClick={handleSkip}
            className="w-full rounded-xl border border-gray-300 bg-white text-gray-900 py-3 text-sm font-semibold hover:bg-gray-50"
          >
            Skip for now
          </button>
        </div>

        <div className="mt-5 text-xs text-gray-500">
          If you prefer, you can still use email or Google login any time.
        </div>

        <div className="mt-2 text-xs text-gray-500">
          <Link href={nextTarget} className="underline">
            Continue without linking
          </Link>
        </div>
      </div>
    </div>
  )
}
