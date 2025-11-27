'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function StagingSignInPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [googleLoading, setGoogleLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const isAllowed = typeof window !== 'undefined' && window.location.hostname.includes('helfi.ai')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/signin-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Sign-in failed')
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true)
      await signIn('google', { callbackUrl: '/dashboard' })
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-2xl font-semibold text-gray-900 text-center">Staging Sign-in</h1>
        <p className="mt-2 text-sm text-gray-500 text-center">Production shortcut for testing.</p>
        {!isAllowed && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            This page is only intended for helfi.ai.
          </div>
        )}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-800 font-medium rounded-lg px-4 py-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.813 32.661 29.284 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.869 6.053 29.701 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.339 16.246 18.839 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.869 6.053 29.701 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.217 0 9.934-1.994 13.518-5.243l-6.238-5.268C29.196 34.488 26.715 35.5 24 35.5c-5.236 0-9.698-3.507-11.297-8.274l-6.55 5.046C9.463 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-1.095 3.178-3.623 5.754-6.785 7.006l.002-.001 6.238 5.268C37.426 42.173 44 36 44 24c0-1.341-.138-2.651-.389-3.917z"/></svg>
            {googleLoading ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          <div className="flex items-center my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="mx-3 text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              placeholder="Any value for testing"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-xs text-gray-400 text-center">Temporary access for production testing.</p>
      </div>
    </div>
  )
}


