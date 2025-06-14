'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return {
          title: 'Server Configuration Error',
          message: 'There is a problem with the server configuration. Please try again later or contact support.',
          suggestion: 'Our team has been notified and is working to resolve this issue.'
        }
      case 'AccessDenied':
        return {
          title: 'Access Denied',
          message: 'You do not have permission to sign in.',
          suggestion: 'Please contact support if you believe this is an error.'
        }
      case 'Verification':
        return {
          title: 'Verification Error',
          message: 'The verification token has expired or is invalid.',
          suggestion: 'Please try signing in again.'
        }
      case 'OAuthSignin':
      case 'OAuthCallback':
      case 'OAuthCreateAccount':
      case 'EmailCreateAccount':
      case 'Callback':
        return {
          title: 'Authentication Error',
          message: 'There was a problem signing you in with your chosen provider.',
          suggestion: 'Please try again or use a different sign-in method.'
        }
      case 'OAuthAccountNotLinked':
        return {
          title: 'Account Not Linked',
          message: 'To confirm your identity, sign in with the same account you used originally.',
          suggestion: 'Try signing in with your original provider.'
        }
      case 'EmailSignin':
        return {
          title: 'Email Sign-in Error',
          message: 'The email could not be sent.',
          suggestion: 'Please check your email address and try again.'
        }
      case 'CredentialsSignin':
        return {
          title: 'Invalid Credentials',
          message: 'The credentials you provided are incorrect.',
          suggestion: 'Please check your email and password and try again.'
        }
      case 'SessionRequired':
        return {
          title: 'Session Required',
          message: 'You must be signed in to view this page.',
          suggestion: 'Please sign in to continue.'
        }
      default:
        return {
          title: 'Authentication Error',
          message: 'An unexpected error occurred during authentication.',
          suggestion: 'Please try again or contact support if the problem persists.'
        }
    }
  }

  const errorInfo = getErrorMessage(error)

  return (
    <div className="min-h-screen bg-gradient-to-br from-helfi-green/5 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {errorInfo.title}
          </h1>
          
          <p className="text-gray-600 mb-4">
            {errorInfo.message}
          </p>
          
          <p className="text-sm text-gray-500 mb-8">
            {errorInfo.suggestion}
          </p>
          
          <div className="space-y-3">
            <Link 
              href="/auth/signin"
              className="block w-full bg-helfi-green text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              Try Again
            </Link>
            
            <Link 
              href="/"
              className="block w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              Back to Home
            </Link>
          </div>
          
          {error && (
            <div className="mt-6 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">
                Error Code: {error}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-helfi-green/5 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-helfi-green mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
} 