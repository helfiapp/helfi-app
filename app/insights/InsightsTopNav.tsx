'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from 'next-auth/react'
import { useUserData } from '@/components/providers/UserDataProvider'
import { UserIcon } from '@heroicons/react/24/outline'

export const DEFAULT_INSIGHTS_AVATAR = '' // no longer used; kept for backward compatibility

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

  const hasProfileImage = useMemo(
    () => !!(providerProfileImage || sessionUser.image),
    [providerProfileImage, sessionUser.image]
  )
  const avatarSrc = useMemo(() => {
    return (providerProfileImage || sessionUser.image || '') as string
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

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Page Title - Mobile only (desktop has sidebar) */}
        <h1 className="md:hidden flex-1 text-center text-lg font-semibold text-gray-900">Insights</h1>
        <div className="hidden md:block"></div>

        {/* Profile Avatar & Dropdown */}
        <div className="relative dropdown-container" id="insights-profile-dropdown">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="focus:outline-none"
            aria-label="Open profile menu"
          >
            {hasProfileImage ? (
              <Image
                src={avatarSrc}
                alt="Profile"
                width={48}
                height={48}
                className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-helfi-green shadow-sm flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-white" aria-hidden="true" />
              </div>
            )}
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100">
              <div className="flex items-center px-4 py-3 border-b border-gray-100">
                {hasProfileImage ? (
                  <Image
                    src={avatarSrc}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover mr-3"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                    <UserIcon className="w-6 h-6 text-white" aria-hidden="true" />
                  </div>
                )}
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
    </nav>
  )
}

