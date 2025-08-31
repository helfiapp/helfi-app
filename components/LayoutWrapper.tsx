'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ReactNode } from 'react'

// Desktop Sidebar Navigation Component  
function DesktopSidebar() {
  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:w-64 md:flex md:flex-col">
      <div className="flex flex-col flex-grow bg-white border-r border-gray-200 pt-5 pb-4 overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center flex-shrink-0 px-4">
          <img
            className="h-12 w-auto"
            src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
            alt="Helfi"
          />
        </div>
        
        {/* Navigation */}
        <nav className="mt-8 flex-1 px-4 space-y-1">
          <a
            href="/dashboard"
            className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
          >
            <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
            </svg>
            Dashboard
          </a>
          
          <a
            href="/insights"
            className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
          >
            <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Insights
          </a>
          
          <a
            href="/food"
            className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
          >
            <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Food Diary
          </a>
          
          <a
            href="/health-tracking"
            className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
          >
            <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Health Tracking
          </a>
          
          <a
            href="/onboarding?step=1"
            className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
          >
            <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Health Setup
          </a>
          
          <div className="border-t border-gray-200 mt-6 pt-6">
            <a
              href="/check-in/history"
              className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
            >
              <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 19h14M7 11v8m10-8v8" />
              </svg>
              Rating History
            </a>
            <a
              href="/settings"
              className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
            >
              <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </a>
            
            <a
              href="/reports"
              className="text-gray-700 hover:text-helfi-green hover:bg-gray-50 group flex items-center px-2 py-2 text-sm font-medium rounded-md"
            >
              <svg className="text-gray-400 group-hover:text-helfi-green mr-3 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Reports
            </a>
          </div>
        </nav>
      </div>
    </aside>
  )
}

interface LayoutWrapperProps {
  children: ReactNode
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  
  // Pages that should ALWAYS be public (no sidebar regardless of auth status)
  const publicPages = ['/', '/healthapp', '/auth/signin', '/auth/verify', '/auth/check-email', '/onboarding', '/privacy', '/terms', '/help', '/faq']
  
  // Admin panel paths should never show user sidebar
  const isAdminPanelPath = pathname.startsWith('/admin-panel')
  
  // Don't show sidebar while session is loading to prevent flickering
  if (status === 'loading') {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    )
  }
  
  // Check if authenticated user needs email verification
  if (status === 'authenticated' && session?.user?.needsVerification && !publicPages.includes(pathname) && !isAdminPanelPath) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="mb-4">
            <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Email Verification Required</h2>
          <p className="text-gray-600 mb-4">
            Please check your email for a verification link. You must verify your email address before accessing your account.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-blue-700 text-sm">
              📧 Verification email sent to: <strong>{session?.user?.email}</strong>
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/auth/resend-verification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: session?.user?.email })
                  })
                  
                  if (response.ok) {
                    alert('✅ Verification email sent! Please check your inbox.')
                  } else {
                    const error = await response.json()
                    alert(`❌ Failed to send email: ${error.error}`)
                  }
                } catch (error) {
                  alert('❌ Failed to send verification email. Please try again.')
                }
              }}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              📧 Resend Verification Email
            </button>
            <button
              onClick={() => window.location.href = '/auth/signin'}
              className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  // Redirect unauthenticated users away from protected pages
  if (status === 'unauthenticated' && !publicPages.includes(pathname) && !isAdminPanelPath) {
    console.log('🚫 Unauthenticated user on protected page - redirecting to /healthapp');
    window.location.href = '/healthapp';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    )
  }
  
  // Show sidebar only if:
  // 1. User is authenticated (status === 'authenticated') AND
  // 2. Current page is not in publicPages list AND
  // 3. Current page is not an admin panel path
  const shouldShowSidebar = status === 'authenticated' && !publicPages.includes(pathname) && !isAdminPanelPath

  if (shouldShowSidebar) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        {/* Desktop Sidebar - Only for authenticated users on app pages */}
        <DesktopSidebar />
        
        {/* Main Content */}
        <div className="md:pl-64 flex flex-col flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    )
  }

  // Public pages or unauthenticated users - no sidebar
  return (
    <div className="min-h-screen">
      {children}
    </div>
  )
} 