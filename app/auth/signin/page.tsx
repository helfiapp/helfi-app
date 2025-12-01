'use client'

import { signIn } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// Separate component for search params handling with Suspense
function SearchParamsHandler({ setError, setMessage }: { setError: (error: string) => void, setMessage: (message: string) => void }) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    const messageParam = searchParams.get('message')
    
    if (errorParam) {
      switch (errorParam) {
        case 'CredentialsSignin':
          setError('Invalid email or password. Please try again.')
          break
        case 'OAuthSignin':
          setError('Error signing in with Google. Please try again.')
          break
        case 'OAuthCallback':
          setError('Error during authentication. Please try again.')
          break
        default:
          setError('An error occurred during sign in. Please try again.')
      }
    }
    
    if (messageParam) {
      switch (messageParam) {
        case 'signout':
          setMessage('You have been signed out successfully.')
          break
        default:
          setMessage('Status updated.')
      }
    }
  }, [searchParams, setError, setMessage])

  return null
}

export default function SignIn() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  useEffect(() => {
    try {
      const storedRemember = localStorage.getItem('helfi:rememberMe')
      const storedEmail = localStorage.getItem('helfi:rememberEmail')
      if (storedRemember === null) {
        // Default to remembered on first load so PWA sessions don't evaporate
        localStorage.setItem('helfi:rememberMe', '1')
      } else {
        setRememberMe(storedRemember === '1')
      }
      if (storedEmail) {
        setEmail(storedEmail)
      }
    } catch (storageError) {
      console.warn('Remember me restore failed', storageError)
    }
  }, [])

  const handleGoogleAuth = async () => {
    setLoading(true)
    await signIn('google', { callbackUrl: '/onboarding' })
  }

  const persistRememberState = (remember: boolean, emailValue: string, token?: string, tokenExpiresAtMs?: number) => {
    try {
      if (remember && emailValue) {
        localStorage.setItem('helfi:rememberMe', '1')
        localStorage.setItem('helfi:rememberEmail', emailValue.toLowerCase())
        localStorage.removeItem('helfi:lastManualSignOut')
        localStorage.removeItem('helfi:rememberToken')
        if (token) {
          localStorage.setItem('helfi:refreshToken', token)
        }
        if (tokenExpiresAtMs) {
          localStorage.setItem('helfi:rememberTokenExp', tokenExpiresAtMs.toString())
        }
        // Best-effort: also send to service worker so it can restore cookies if iOS drops them.
        try {
          const post = () => navigator.serviceWorker?.controller?.postMessage({ type: 'SET_REFRESH_TOKEN', token, exp: tokenExpiresAtMs || 0 })
          if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then((reg) => {
              reg.active?.postMessage({ type: 'SET_REFRESH_TOKEN', token, exp: tokenExpiresAtMs || 0 })
            }).catch(() => post())
            post()
          }
        } catch {
          // ignore message errors
        }
      } else {
        localStorage.removeItem('helfi:rememberMe')
        localStorage.removeItem('helfi:rememberEmail')
        localStorage.removeItem('helfi:refreshToken')
        localStorage.removeItem('helfi:rememberTokenExp')
        try {
          navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_REFRESH_TOKEN' })
        } catch {}
      }
    } catch (storageError) {
      console.warn('Remember me storage failed', storageError)
    }
  }

  const attemptDirectSignin = async (remember: boolean, emailOverride?: string) => {
    const normalizedEmail = (emailOverride ?? email).trim().toLowerCase()
    try {
      const response = await fetch('/api/auth/signin-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password, rememberMe: remember })
      })
      const data = await response.json().catch(()=>({}))
      if (response.ok) {
        return { success: true, token: data?.token, tokenExpiresAtMs: data?.tokenExpiresAtMs }
      }
      return { success: false, message: data?.error || data?.message || 'Sign in failed. Please try again.' }
    } catch (err) {
      console.error('Signin-direct error:', err)
      return { success: false, message: 'Sign in failed. Please try again.' }
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    const normalizedEmail = email.trim().toLowerCase()
    
    setLoading(true)
    setError('')
    setMessage('')
    
    if (isSignUp) {
      // Handle signup via direct API (no NextAuth flash)
      try {
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        })

        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Failed to create account. Please try again.')
        } else {
          // Success - redirect to check email page
          window.location.href = `/auth/check-email?email=${encodeURIComponent(email)}`
        }
      } catch (error) {
        console.error('Signup error:', error)
        setError('Failed to create account. Please try again.')
      }
    } else {
      // Handle signin - Try NextAuth credentials first (most stable), then direct API
      try {
        // Try direct sign-in first so we can honor the "keep me signed in" setting immediately
        const directResult = await attemptDirectSignin(rememberMe)
        if (directResult.success) {
          persistRememberState(true, normalizedEmail, directResult.token, directResult.tokenExpiresAtMs)
          setLoading(false)
          window.location.href = '/onboarding'
          return
        }
        if (directResult.message) {
          setError(directResult.message)
        }

        const res = await signIn('credentials', { email, password, callbackUrl: '/onboarding', redirect: false })
        if (res?.ok) {
          // If they wanted a longer session, reissue via direct path to extend the cookie, but don't block redirect
          const extendResult = await attemptDirectSignin(true, normalizedEmail)
          persistRememberState(true, normalizedEmail, extendResult.token, extendResult.tokenExpiresAtMs)
          setLoading(false)
          window.location.href = '/onboarding'
          return
        } else {
          const fallback = await attemptDirectSignin(false)
          if (fallback.success) {
            persistRememberState(true, normalizedEmail, fallback.token, fallback.tokenExpiresAtMs)
            setLoading(false)
            window.location.href = '/onboarding'
            return
          } else {
            setError(fallback.message || 'Invalid email or password')
          }
        }
      } catch (error) {
        console.error('Signin error:', error)
        setError('Signin failed. Please try again.')
        return
      }
    }
    setLoading(false)
  }

  return (
    <>
      {/* Wrap search params handler in Suspense */}
      <Suspense fallback={null}>
        <SearchParamsHandler setError={setError} setMessage={setMessage} />
      </Suspense>
      
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-4">
        <div className="max-w-md w-full space-y-8">
          {/* Logo */}
          <div className="flex justify-center">
            <Link href="/" className="relative w-24 h-24">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                fill
                className="object-contain"
                priority
              />
            </Link>
          </div>

          {/* Sign In Form */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-helfi-black mb-4">
              {isSignUp ? 'Create Account' : 'Welcome to Helfi'}
            </h2>
            <p className="text-gray-600 mb-8">
              {isSignUp ? 'Create a new account to get started' : 'Sign in to your account'}
            </p>
          </div>

          <div className="space-y-4">
            {/* Google Sign In - PRESERVED UNTOUCHED */}
            <button
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or with email</span>
              </div>
            </div>

            {/* Email/Password Form - RESTORED FROM COMMIT 89581b3 */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="Enter your email"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-3 pr-12 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-helfi-green focus:ring-helfi-green"
                  />
                  Keep me signed in
                </label>
                <span className="text-xs text-gray-500 leading-5">
                  If unchecked, you stay signed in for at least 24 hours.
                </span>
              </div>

              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}

              {message && (
                <div className="text-green-600 text-sm">{message}</div>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full bg-helfi-green text-white px-4 py-3 rounded-lg hover:bg-helfi-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            {/* Sign Up / Sign In Toggle - RESTORED */}
            <div className="text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-helfi-green hover:underline text-sm"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-sm text-gray-600">
            <p>
              By continuing, you agree to our{' '}
              <Link href="/terms" className="text-helfi-green hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-helfi-green hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
} 
