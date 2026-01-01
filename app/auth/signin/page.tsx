'use client'

import { signIn, useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

// Separate component for search params handling with Suspense
function SearchParamsHandler({
  setError,
  setMessage,
  setIsSignUp,
  setShowResendVerification,
}: {
  setError: (error: string) => void
  setMessage: (message: string) => void
  setIsSignUp: (value: boolean) => void
  setShowResendVerification: (value: boolean) => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    const messageParam = searchParams.get('message')
    const planParam = searchParams.get('plan')
    const modeParam = searchParams.get('mode')
    
    // If plan parameter exists, show signup form by default
    if (planParam) {
      setIsSignUp(true)
    }

    // If explicitly requested, show signup form by default
    if (modeParam === 'signup') {
      setIsSignUp(true)
    }
    
    if (errorParam) {
      switch (errorParam) {
        case 'CredentialsSignin':
          setError('Invalid email or password. Please try again.')
          break
        case 'EMAIL_NOT_VERIFIED':
          setError('Please verify your email before signing in. Check your inbox or resend the verification email.')
          setShowResendVerification(true)
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
        case 'reset_success':
          setMessage('Your password has been updated. Please sign in.')
          break
        case 'verified':
          setMessage('Your email is verified. Please sign in.')
          setIsSignUp(false)
          break
        default:
          setMessage('Status updated.')
      }
    }
  }, [searchParams, setError, setMessage, setIsSignUp, setShowResendVerification])

  return null
}

type InstallPlatform = 'ios' | 'android' | 'other'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const getInstallPlatform = (): InstallPlatform => {
  if (typeof window === 'undefined') return 'other'
  const ua = window.navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'other'
}

const isIOSSafari = () => {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios|duckduckgo/i.test(ua)
  return isIOS && isSafari
}

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}

const getInstallContext = () => {
  const platform = getInstallPlatform()
  const standalone = isStandaloneMode()
  return {
    platform,
    standalone,
    eligible: platform !== 'other' && !standalone,
  }
}

export default function SignIn() {
  const router = useRouter()
  const { status } = useSession()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [showResendVerification, setShowResendVerification] = useState(false)
  const [installPromptVisible, setInstallPromptVisible] = useState(false)
  const [installTarget, setInstallTarget] = useState('/onboarding')
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>('other')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installOutcome, setInstallOutcome] = useState<'accepted' | 'dismissed' | null>(null)
  const [isSafariIOS, setIsSafariIOS] = useState(false)
  const skipAutoRedirectRef = useRef(false)

  // If the user is already logged in and somehow lands on the sign-in page
  // (for example, via the iOS Home Screen icon), immediately send them into
  // the main app instead of making them log in again. Respect Health Setup:
  // - If Health Setup is incomplete, always go to /onboarding (existing behaviour).
  // - If complete, resume last in-app page when possible, otherwise go to dashboard.
  // - If plan parameter exists, redirect to checkout after auth.
  useEffect(() => {
    if (status !== 'authenticated') return
    if (skipAutoRedirectRef.current) return
    if (installPromptVisible) return
    if (typeof window === 'undefined') {
      router.replace('/dashboard')
      return
    }

    const resume = async () => {
      // Check for plan parameter - first from URL, then from sessionStorage (for post-verification flow)
      const searchParams = new URLSearchParams(window.location.search)
      let planParam = searchParams.get('plan')
      
      // If no plan in URL, check sessionStorage (stored during signup)
      if (!planParam) {
        try {
          planParam = sessionStorage.getItem('helfi:signupPlan')
          if (planParam) {
            // Clear it after retrieving
            sessionStorage.removeItem('helfi:signupPlan')
          }
        } catch {}
      }
      
      if (planParam) {
        // User came from homepage with a plan selected - redirect to checkout
        try {
          const res = await fetch('/api/billing/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: planParam }),
          })
          if (res.ok) {
            const { url } = await res.json()
            if (url) {
              window.location.href = url
              return
            }
          }
        } catch (error) {
          console.error('Checkout redirect error:', error)
          // Fall through to normal redirect
        }
      }

      // First, check Health Setup status without changing its existing rules.
      try {
        const res = await fetch('/api/health-setup-status', { method: 'GET' })
        if (res.ok) {
          const data = await res.json()
          const complete = !!data.complete
          if (!complete) {
            router.replace('/onboarding')
            return
          }
        }
      } catch {
        // If this fails, fall back to normal behaviour below.
      }

      // Health Setup complete: try to restore last in-app path.
      let target = '/dashboard'
      try {
        const lastPath = localStorage.getItem('helfi:lastPath')
        if (lastPath && !lastPath.startsWith('/auth') && lastPath !== '/' && !lastPath.startsWith('/healthapp')) {
          target = lastPath
        }
      } catch {
        // Ignore storage errors and use default target.
      }
      if (maybeShowInstallPrompt(target)) {
        return
      }
      router.replace(target)
    }

    void resume()
  }, [status, router, installPromptVisible])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setInstallPlatform(getInstallPlatform())
    setIsSafariIOS(isIOSSafari())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallOutcome('accepted')
      try {
        localStorage.setItem('helfi:pwaInstalled', '1')
      } catch {}
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const maybeShowInstallPrompt = (target: string) => {
    if (typeof window === 'undefined') return false
    if (installPromptVisible) return true

    const { platform, eligible } = getInstallContext()
    if (!eligible) return false

    try {
      if (localStorage.getItem('helfi:pwaInstallPromptSeen') === '1') {
        return false
      }
    } catch {
      // Ignore storage errors
    }

    try {
      localStorage.setItem('helfi:pwaInstallPromptSeen', '1')
    } catch {
      // Ignore storage errors
    }

    setInstallPlatform(platform)
    setInstallTarget(target)
    setInstallPromptVisible(true)
    return true
  }

  const handleContinueToApp = () => {
    setInstallPromptVisible(false)
    try {
      localStorage.setItem('helfi:pwaInstallPromptSeen', '1')
    } catch {
      // Ignore storage errors
    }
    window.location.href = installTarget
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      setInstallOutcome(choice.outcome === 'accepted' ? 'accepted' : 'dismissed')
    } catch {
      setInstallOutcome('dismissed')
    }
  }

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
    // Check for plan parameter to preserve it through OAuth flow
    const searchParams = new URLSearchParams(window.location.search)
    const planParam = searchParams.get('plan')
    const callbackUrl = planParam ? `/auth/signin?plan=${encodeURIComponent(planParam)}` : '/onboarding'
    await signIn('google', { callbackUrl })
  }

  const persistRememberState = (remember: boolean, emailValue: string) => {
    try {
      if (remember && emailValue) {
        localStorage.setItem('helfi:rememberMe', '1')
        localStorage.setItem('helfi:rememberEmail', emailValue.toLowerCase())
        localStorage.removeItem('helfi:lastManualSignOut')
      } else {
        localStorage.removeItem('helfi:rememberMe')
        localStorage.removeItem('helfi:rememberEmail')
      }
    } catch (storageError) {
      console.warn('Remember me storage failed', storageError)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    const normalizedEmail = email.trim().toLowerCase()
    
    setLoading(true)
    setError('')
    setMessage('')
    setShowResendVerification(false)
    
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
          // Success - check for plan parameter to preserve it
          const searchParams = new URLSearchParams(window.location.search)
          const planParam = searchParams.get('plan')
          if (planParam) {
            // Store plan in sessionStorage to retrieve after email verification
            try {
              sessionStorage.setItem('helfi:signupPlan', planParam)
            } catch {}
          }
          // Redirect to check email page
          window.location.href = `/auth/check-email?email=${encodeURIComponent(email)}`
        }
      } catch (error) {
        console.error('Signup error:', error)
        setError('Failed to create account. Please try again.')
      }
    } else {
      // Handle signin via NextAuth credentials
      try {
        skipAutoRedirectRef.current = true
        // Check for plan parameter to preserve it through auth flow
        const searchParams = new URLSearchParams(window.location.search)
        const planParam = searchParams.get('plan')
        const callbackUrl = planParam ? `/auth/signin?plan=${encodeURIComponent(planParam)}` : '/onboarding'
        
        const res = await signIn('credentials', {
          email: normalizedEmail,
          password,
          callbackUrl,
          redirect: false,
        })
        if (res?.ok) {
          persistRememberState(rememberMe, normalizedEmail)
          setLoading(false)
          // Check for plan parameter - first from URL, then from sessionStorage
          let planParamToUse = planParam
          if (!planParamToUse) {
            try {
              planParamToUse = sessionStorage.getItem('helfi:signupPlan')
              if (planParamToUse) {
                sessionStorage.removeItem('helfi:signupPlan')
              }
            } catch {}
          }
          
          // Redirect to checkout if plan parameter exists
          if (planParamToUse) {
            try {
              const checkoutRes = await fetch('/api/billing/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: planParamToUse }),
              })
              if (checkoutRes.ok) {
                const { url } = await checkoutRes.json()
                if (url) {
                  window.location.href = url
                  return
                }
              }
            } catch (error) {
              console.error('Checkout redirect error:', error)
            }
          }
          const nextTarget = '/onboarding'
          if (maybeShowInstallPrompt(nextTarget)) {
            return
          }
          window.location.href = nextTarget
          return
        } else {
          if (res?.error === 'EMAIL_NOT_VERIFIED') {
            setError('Please verify your email before signing in. Check your inbox or resend the verification email.')
            setShowResendVerification(true)
            setLoading(false)
            skipAutoRedirectRef.current = false
            return
          }
          setError('Invalid email or password')
        }
      } catch (error) {
        console.error('Signin error:', error)
        setError('Signin failed. Please try again.')
        skipAutoRedirectRef.current = false
        return
      }
    }
    setLoading(false)
    skipAutoRedirectRef.current = false
  }

  return (
    <>
      {/* Wrap search params handler in Suspense */}
      <Suspense fallback={null}>
        <SearchParamsHandler
          setError={setError}
          setMessage={setMessage}
          setIsSignUp={setIsSignUp}
          setShowResendVerification={setShowResendVerification}
        />
      </Suspense>

      {installPromptVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Add Helfi to your Home Screen</h3>
                <p className="mt-1 text-sm text-gray-600">
                  It opens like an app and keeps you signed in.
                </p>
              </div>
              <button
                onClick={handleContinueToApp}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Skip
              </button>
            </div>

            <div className="mt-5">
              {installPlatform === 'ios' && (
                <div className="space-y-3 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">iPhone or iPad steps</p>
                  <ol className="space-y-2">
                    {!isSafariIOS && (
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">1</span>
                        <span>In Chrome, open the menu and tap Open in Safari.</span>
                      </li>
                    )}
                    <li className="flex gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">{isSafariIOS ? '1' : '2'}</span>
                      <span>Tap the Share button in Safari.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">{isSafariIOS ? '2' : '3'}</span>
                      <span>Scroll and tap Add to Home Screen.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">{isSafariIOS ? '3' : '4'}</span>
                      <span>Tap Add. You are done.</span>
                    </li>
                  </ol>
                  {!isSafariIOS && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      iOS installs only work from Safari.
                    </div>
                  )}
                </div>
              )}

              {installPlatform === 'android' && (
                <div className="space-y-3 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">Android steps</p>
                  <ol className="space-y-2">
                    {deferredPrompt ? (
                      <>
                        <li className="flex gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">1</span>
                          <span>Tap Install below.</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">2</span>
                          <span>Confirm the install prompt.</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">3</span>
                          <span>Open Helfi from your Home Screen.</span>
                        </li>
                      </>
                    ) : (
                      <>
                        <li className="flex gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">1</span>
                          <span>Open the browser menu (three dots).</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">2</span>
                          <span>Tap Install app or Add to Home Screen.</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-helfi-green-light/40 text-xs font-semibold text-helfi-green">3</span>
                          <span>Confirm the install.</span>
                        </li>
                      </>
                    )}
                  </ol>
                </div>
              )}

              {installOutcome === 'accepted' && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  Installed. You can open Helfi from your Home Screen.
                </div>
              )}
              {installOutcome === 'dismissed' && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  No problem. You can install it anytime from your browser menu.
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {installPlatform === 'android' && deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="w-full rounded-lg bg-helfi-green px-4 py-3 text-white transition-colors hover:bg-helfi-green-dark"
                >
                  Install app
                </button>
              )}
              <button
                onClick={handleContinueToApp}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-700 transition-colors hover:bg-gray-50"
              >
                Continue to app
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-4">
        <div className="max-w-md w-full space-y-8">
          {/* Logo */}
          <div className="flex justify-center">
            <Link href="/" className="relative w-24 h-24">
              <Image
                src="/mobile-assets/LOGOS/helfi-01-01.png"
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
                {!isSignUp && (
                  <div className="mt-2 text-right">
                    <Link href="/auth/forgot-password" className="text-sm text-helfi-green hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                )}
              </div>

              {!isSignUp && (
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
              )}

              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}
              {showResendVerification && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/auth/resend-verification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: email.trim().toLowerCase() }),
                      })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        setError(data?.error || 'Failed to resend verification email.')
                        return
                      }
                      setMessage('Verification email sent. Please check your inbox.')
                      setShowResendVerification(false)
                    } catch {
                      setError('Failed to resend verification email. Please try again.')
                    }
                  }}
                  className="text-sm text-helfi-green hover:underline"
                >
                  Resend verification email
                </button>
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
