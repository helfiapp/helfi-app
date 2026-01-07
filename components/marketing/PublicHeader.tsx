'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function PublicHeader() {
  const { data: session, status } = useSession()
  const loginHref = '/auth/signin'
  const signupHref = '/auth/signin?mode=signup'

  const scrollToSection = (id: string) => {
    if (typeof window === 'undefined') return
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      return
    }
    window.location.href = `/#${id}`
  }

  return (
    <nav className="relative z-10 px-6 py-1">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/'
              }
            }}
            className="w-28 h-28 md:w-40 md:h-40 cursor-pointer hover:opacity-80 transition-opacity"
            aria-label="Go to homepage"
          >
            <Image
              src="/mobile-assets/LOGOS/helfi-01-01.png"
              alt="Helfi Logo"
              width={160}
              height={160}
              className="w-full h-full object-contain"
              priority
            />
          </button>
        </div>

        <div className="hidden md:flex items-center space-x-8">
          <button
            type="button"
            onClick={() => scrollToSection('features')}
            className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('pricing')}
            className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('why-helfi')}
            className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
          >
            Why Helfi
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('faq')}
            className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
          >
            FAQ
          </button>
          {status === 'authenticated' ? (
            <Link
              href="/dashboard"
              className="btn-primary text-lg px-6 py-3 bg-helfi-green hover:bg-green-600 text-white"
            >
              Go to Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href={loginHref}
                className="btn-secondary text-lg px-6 py-3 text-helfi-green hover:bg-helfi-green hover:text-white transition-colors"
              >
                Log in
              </Link>
              <Link
                href={signupHref}
                className="btn-primary text-lg px-6 py-3 bg-helfi-green hover:bg-green-600 text-white"
              >
                Create account
              </Link>
            </div>
          )}
        </div>

        <div className="md:hidden flex items-center space-x-3">
          {status === 'authenticated' ? (
            <Link
              href="/dashboard"
              className="btn-primary text-base px-3 py-2 bg-helfi-green hover:bg-green-600 text-white"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href={loginHref}
                className="btn-secondary text-base px-3 py-2 text-helfi-green hover:bg-helfi-green hover:text-white transition-colors"
              >
                Log in
              </Link>
              <Link
                href={signupHref}
                className="btn-primary text-base px-3 py-2 bg-helfi-green hover:bg-green-600 text-white"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
