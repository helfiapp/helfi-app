'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'

function VerifyContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading')
  const [message, setMessage] = useState('')
  const searchParams = useSearchParams()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    
    if (success === 'true') {
      setStatus('success')
      setMessage('Your email has been verified successfully!')
      return
    }
    
    if (error) {
      switch (error) {
        case 'verification_missing_params':
          setStatus('error')
          setMessage('Invalid verification link. Please check your email and try again.')
          break
        case 'verification_invalid_token':
          setStatus('error')
          setMessage('Invalid or expired verification link. Please request a new verification email.')
          break
        case 'verification_expired':
          setStatus('expired')
          setMessage('This verification link has expired. Please request a new one.')
          break
        case 'verification_user_not_found':
          setStatus('error')
          setMessage('Account not found. Please sign up first.')
          break
        case 'verification_server_error':
          setStatus('error')
          setMessage('Server error during verification. Please try again or contact support.')
          break
        default:
          setStatus('error')
          setMessage('An error occurred during verification. Please try again.')
      }
      return
    }
    
    // If no success or error params, this is probably a direct access
    setStatus('error')
    setMessage('Invalid verification link. Please check your email and try again.')
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-4">
      <div className="max-w-md w-full space-y-8 text-center">
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

        <div className="space-y-6">
          {status === 'loading' && (
            <div className="space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-helfi-green mx-auto"></div>
              <h2 className="text-2xl font-bold text-helfi-black">Verifying your email...</h2>
              <p className="text-gray-600">Please wait while we verify your email address.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-helfi-black">Email Verified!</h2>
              <p className="text-gray-600">{message}</p>
              <div className="space-y-3">
                <Link
                  href="/auth/signin"
                  className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green-dark transition-colors font-medium inline-block"
                >
                  Continue to Sign In
                </Link>
                <p className="text-sm text-gray-500">
                  You can now sign in to your Helfi account and start your health journey.
                </p>
              </div>
            </div>
          )}

          {status === 'expired' && (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-helfi-black">Link Expired</h2>
              <p className="text-gray-600">{message}</p>
              <div className="space-y-3">
                <Link
                  href="/auth/signin"
                  className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green-dark transition-colors font-medium inline-block"
                >
                  Get New Verification Link
                </Link>
                <p className="text-sm text-gray-500">
                  Sign up again to receive a new verification email.
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-helfi-black">Verification Failed</h2>
              <p className="text-gray-600">{message}</p>
              <div className="space-y-3">
                <Link
                  href="/auth/signin"
                  className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green-dark transition-colors font-medium inline-block"
                >
                  Try Again
                </Link>
                <p className="text-sm text-gray-500">
                  If this problem persists, please contact our support team.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-helfi-green"></div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
} 