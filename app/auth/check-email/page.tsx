'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function CheckEmailContent() {
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  const handleResendEmail = async () => {
    if (!email) return
    
    setIsResending(true)
    setResendMessage('')
    
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      
      if (response.ok) {
        setResendMessage('✅ Verification email sent! Please check your inbox.')
      } else {
        setResendMessage('❌ Failed to resend email. Please try again.')
      }
    } catch (error) {
      setResendMessage('❌ Something went wrong. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

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
          {/* Email Icon */}
          <div className="w-20 h-20 bg-helfi-green-light/20 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          {/* Main Content */}
          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-helfi-black">Check Your Email</h2>
            <p className="text-gray-600 text-lg">
              We've sent a verification link to:
            </p>
            {email && (
              <div className="bg-helfi-green-light/10 border border-helfi-green-light rounded-lg p-3">
                <p className="font-medium text-helfi-green">{email}</p>
              </div>
            )}
            <p className="text-gray-600">
              Click the verification link in your email to activate your account and start your health journey with Helfi.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-left">
                  <p className="text-sm font-medium text-blue-800">Can't find the email?</p>
                  <p className="text-sm text-blue-700">Check your spam folder or request a new verification email.</p>
                </div>
              </div>
            </div>

            {/* Resend Button */}
            <button
              onClick={handleResendEmail}
              disabled={isResending || !email}
              className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? 'Sending...' : 'Resend Verification Email'}
            </button>

            {resendMessage && (
              <div className={`p-3 rounded-lg text-sm ${
                resendMessage.includes('✅') 
                  ? 'bg-green-50 border border-green-200 text-green-700'  
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {resendMessage}
              </div>
            )}

            {/* Secondary Actions */}
            <div className="space-y-2 pt-4 border-t border-gray-200">
              <Link
                href="/auth/signin"
                className="text-helfi-green hover:text-helfi-green-dark font-medium text-sm inline-block"
              >
                Already verified? Sign in
              </Link>
              <br />
              <Link
                href="/support"
                className="text-gray-500 hover:text-gray-700 text-sm inline-block"
              >
                Need help? Contact support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-helfi-green"></div>
      </div>
    }>
      <CheckEmailContent />
    </Suspense>
  )
} 