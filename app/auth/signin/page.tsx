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
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)

  const handleGoogleAuth = async () => {
    setLoading(true)
    await signIn('google', { callbackUrl: '/onboarding' })
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

          {/* Header */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-helfi-black mb-4">
              {isNewUser ? 'Join Helfi Today' : 'Welcome to Helfi'}
            </h2>
            <p className="text-gray-600 mb-8 text-lg">
              {isNewUser 
                ? 'Start your AI-powered health journey in seconds with secure Google authentication'
                : 'Sign in to your account to continue your personalized health journey'
              }
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Success Message */}
          {message && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{message}</span>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Google Authentication - Primary Method */}
            <button
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-helfi-green text-white px-6 py-4 rounded-lg hover:bg-helfi-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {loading ? 'Connecting...' : (isNewUser ? '🚀 Sign Up with Google' : '🔐 Sign In with Google')}
            </button>

            {/* Security Benefits */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <h3 className="font-medium text-blue-800 mb-1">Secure Google Authentication</h3>
                  <p className="text-sm text-blue-700">
                    Your data is protected by Google's enterprise-grade security. No passwords to remember, no security breaches to worry about.
                  </p>
                </div>
              </div>
            </div>

            {/* Toggle between Sign In and Sign Up */}
            <div className="text-center">
              <button
                onClick={() => setIsNewUser(!isNewUser)}
                className="text-helfi-green hover:text-helfi-green-dark font-medium text-sm transition-colors"
              >
                {isNewUser ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>

            {/* Additional Info for New Users */}
            {isNewUser && (
              <div className="bg-helfi-green-light/10 border border-helfi-green-light rounded-lg p-4">
                <h3 className="font-medium text-helfi-green mb-2">What happens next?</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>✅ Instant account creation with Google</li>
                  <li>✅ Email verification for security</li>
                  <li>✅ Personalized health profile setup</li>
                  <li>✅ Start your AI-powered health journey</li>
                </ul>
              </div>
            )}
          </div>

          {/* Footer Links */}
          <div className="text-center text-sm text-gray-500 space-y-2">
            <p>
              By signing {isNewUser ? 'up' : 'in'}, you agree to our{' '}
              <Link href="/terms" className="text-helfi-green hover:text-helfi-green-dark">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-helfi-green hover:text-helfi-green-dark">
                Privacy Policy
              </Link>
            </p>
            <p>
              Need help?{' '}
              <Link href="/support" className="text-helfi-green hover:text-helfi-green-dark">
                Contact Support
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
} 