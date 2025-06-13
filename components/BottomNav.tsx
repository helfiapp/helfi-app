'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    {
      href: '/dashboard',
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-helfi-green' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
        </svg>
      ),
      label: 'Dashboard',
      paths: ['/dashboard']
    },
    {
      href: '/profile',
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-helfi-green' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      label: 'Profile',
      paths: ['/profile', '/profile/image']
    },
    {
      href: '/onboarding',
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-helfi-green' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      label: 'Health',
      paths: ['/onboarding']
    },
    {
      href: '/notifications',
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-helfi-green' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.868 19.462A17.173 17.173 0 003 12C3 5.373 8.373 0 15 0s12 5.373 12 12-5.373 12-12 12a11.99 11.99 0 01-8.132-3.538z" />
        </svg>
      ),
      label: 'Alerts',
      paths: ['/notifications']
    },
    {
      href: '/account',
      icon: (active: boolean) => (
        <svg className={`w-6 h-6 ${active ? 'text-helfi-green' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      label: 'Settings',
      paths: ['/account', '/billing', '/privacy', '/help']
    }
  ]

  const isActive = (paths: string[]) => {
    return paths.some(path => pathname === path || pathname.startsWith(path + '/'))
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 safe-area-inset-bottom md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const active = isActive(item.paths)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
                active ? 'bg-helfi-green/10' : 'hover:bg-gray-50'
              }`}
            >
              {item.icon(active)}
              <span className={`text-xs mt-1 ${active ? 'text-helfi-green font-medium' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
} 