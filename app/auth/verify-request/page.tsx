import Image from 'next/image'
import Link from 'next/link'

export default function VerifyRequest() {
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

        {/* Success Message */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-helfi-black mb-4">
            Check your email
          </h2>
          
          <p className="text-gray-700 mb-4">
            We've sent a magic link to your email address. Click the link in the email to sign in to your account.
          </p>
          
          <div className="bg-white p-4 rounded-lg border border-green-200 mb-4">
            <p className="text-sm text-gray-600">
              <strong>Didn't receive the email?</strong>
              <br />
              Check your spam folder or try signing in again.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/auth/signin"
            className="block w-full btn-secondary text-center"
          >
            Try Again
          </Link>
          
          <Link
            href="/"
            className="block w-full btn-primary text-center"
          >
            Back to Home
          </Link>
        </div>

        {/* Help Text */}
        <div className="text-center text-sm text-gray-600">
          <p>
            Having trouble? Contact us at{' '}
            <a href="mailto:support@helfi.ai" className="text-helfi-green hover:underline">
              support@helfi.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  )
} 