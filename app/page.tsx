import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-white to-helfi-green-light/10">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="relative w-32 h-32">
            <Image
              src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
              alt="Helfi Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Tagline */}
        <h1 className="text-4xl font-bold text-helfi-black">
          Your Personal Health Intelligence
        </h1>
        <p className="text-lg text-gray-600">
          Track, analyze, and optimize your health with AI-powered insights.
        </p>

        {/* Auth Buttons */}
        <div className="space-y-4 pt-8">
          <Link
            href="/auth/signin"
            className="btn-primary w-full flex items-center justify-center"
          >
            Get Started
          </Link>
          <Link
            href="/auth/signin?callbackUrl=/onboarding"
            className="btn-secondary w-full flex items-center justify-center"
          >
            Sign In
          </Link>
        </div>

        {/* Features Preview */}
        <div className="grid grid-cols-2 gap-4 pt-12">
          <div className="card">
            <h3 className="font-semibold text-helfi-black">Track Health</h3>
            <p className="text-sm text-gray-600">Monitor your vital metrics</p>
          </div>
          <div className="card">
            <h3 className="font-semibold text-helfi-black">AI Insights</h3>
            <p className="text-sm text-gray-600">Get personalized recommendations</p>
          </div>
          <div className="card">
            <h3 className="font-semibold text-helfi-black">Smart Logging</h3>
            <p className="text-sm text-gray-600">Easy daily health tracking</p>
          </div>
          <div className="card">
            <h3 className="font-semibold text-helfi-black">Data Sync</h3>
            <p className="text-sm text-gray-600">Connect your health devices</p>
          </div>
        </div>
      </div>
    </main>
  )
} 