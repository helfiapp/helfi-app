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
  const { data: session } = useSession()
  
  // Pages that should ALWAYS be public (no sidebar regardless of auth status)
  const publicPages = ['/', '/healthapp', '/auth/signin', '/privacy', '/terms', '/help', '/admin-panel', '/support', '/faq']
  
  // Show sidebar only if:
  // 1. User is authenticated AND
  // 2. Current page is not in publicPages list
  const shouldShowSidebar = session && !publicPages.includes(pathname)

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