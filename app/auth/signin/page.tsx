'use client'

import { signIn } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email || !agreed) return
    
    setLoading(true)
    setError('')
    
    try {
      const result = await signIn('email', { 
        email, 
        callbackUrl: '/onboarding',
        redirect: false 
      })
      
      if (result?.error) {
        setError('Failed to send sign-in email. Please try again.')
        console.error('SignIn error:', result.error)
      } else {
        // Redirect to verify request page
        window.location.href = '/auth/verify-request'
      }
    } catch (error) {
      console.error('Email sign in error:', error)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
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
        <h2 className="text-2xl font-bold text-center text-helfi-black mb-8">
          Welcome to Helfi
        </h2>
        <form onSubmit={handleEmailSignIn} className="mb-6">
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input-primary w-full mb-2"
            required
            disabled={loading}
          />
          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              id="agree-terms"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mr-2"
              required
              disabled={loading}
            />
            <label htmlFor="agree-terms" className="text-sm text-gray-700">
              I agree to the <Link href="/terms" target="_blank" className="text-helfi-green underline">Terms and Conditions</Link> and <Link href="/privacy" target="_blank" className="text-helfi-green underline">Privacy Policy</Link>
            </label>
          </div>
          {error && (
            <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {emailSent && (
            <div className="mb-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              ✅ Check your email for a magic link to sign in!
            </div>
          )}
          <button
            type="submit"
            className="w-full btn-secondary mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!email || !agreed || loading}
          >
            {loading ? 'Sending...' : emailSent ? 'Email Sent!' : 'Continue with Email'}
          </button>
        </form>
        <button
          onClick={() => agreed && signIn('google', { callbackUrl: '/onboarding' })}
          className="w-full flex items-center justify-center gap-3 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!agreed || loading}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
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
          Continue with Google
        </button>
        <div className="mt-6 text-center text-sm text-gray-600">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="text-helfi-green hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-helfi-green hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  )
} 