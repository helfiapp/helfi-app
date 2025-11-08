'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from 'next-auth/react'
import { useUserData } from '@/components/providers/UserDataProvider'
import UsageMeter from '@/components/UsageMeter'

export const DEFAULT_INSIGHTS_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNjQiIGN5PSI2NCIgcj0iNjQiIGZpbGw9IiMxMEI5ODEiLz48Y2lyY2xlIGN4PSI2NCIgY3k9IjQ4IiByPSIyMCIgZmlsbD0id2hpdGUiLz48cGF0aCBkPSJNNjQgNzZjLTEzLjMzIDAtMjQgNS4zNC0yNCAxMnYxNmMwIDguODQgNy4xNiAxNiAxNiAxNmgxNmM4Ljg0IDAgMTYtNy4xNiAxNi0xNlY4OGMwLTYuNjYtMTAuNjctMTItMjQtMTJ6IiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg=='

interface InsightsTopNavProps {
  sessionUser: {
    name: string | null
    email: string | null
    image: string | null
  }
}

export default function InsightsTopNav({ sessionUser }: InsightsTopNavProps) {
  const { profileImage: providerProfileImage } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const avatarSrc = useMemo(() => {
    return providerProfileImage || sessionUser.image || DEFAULT_INSIGHTS_AVATAR
  }, [providerProfileImage, sessionUser.image])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [dropdownOpen])

  // Refresh UsageMeter when credits are updated
  useEffect(() => {
    const h = () => setRefresh((r) => r + 1)
    try { window.addEventListener('helfiCreditsUpdated', h as any) } catch {}
    return () => { try { window.removeEventListener('helfiCreditsUpdated', h as any) } catch {} }
  }, [])

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
          <Image
            src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
            alt="Helfi Logo"
            width={80}
            height={80}
            className="w-full h-full object-contain"
            priority
          />
        </Link>

        <div className="flex items-center gap-4">
          {/* Inline credits meter */}
          <div className="hidden md:block min-w-[220px]">
            <UsageMeter inline={true} refreshTrigger={refresh} />
          </div>
          <div className="relative dropdown-container" id="insights-profile-dropdown">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="focus:outline-none"
            aria-label="Open profile menu"
          >
            <Image
              src={avatarSrc}
              alt="Profile"
              width={48}
              height={48}
              className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm object-cover"
            />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100">
              <div className="flex items-center px-4 py-3 border-b border-gray-100">
                <Image
                  src={avatarSrc}
                  alt="Profile"
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full object-cover mr-3"
                />
                <div>
                  <div className="font-semibold text-gray-900">{sessionUser.name || 'User'}</div>
                  <div className="text-xs text-gray-500">{sessionUser.email || 'user@email.com'}</div>
                </div>
              </div>
              <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
              <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
              <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
              <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
              <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
              <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
              <button
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
              >
                Logout
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </nav>
  )
}

