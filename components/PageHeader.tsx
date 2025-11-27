'use client'

import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import { useState } from 'react'
import Link from 'next/link'
import { useUserData } from '@/components/providers/UserDataProvider'
import { UserIcon } from '@heroicons/react/24/outline'

interface PageHeaderProps {
  title: string
  backHref?: string // Optional custom back destination, defaults to router.back()
}

export default function PageHeader({ title, backHref }: PageHeaderProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const { profileImage } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const hasProfileImage = !!(profileImage || session?.user?.image)
  const userImage = (profileImage || session?.user?.image || '') as string
  const userName = session?.user?.name || 'User'

  const handleBack = () => {
    if (backHref) {
      router.push(backHref)
    } else {
      router.back()
    }
  }

  const handleSignOut = async () => {
    // Clear user-specific localStorage before signing out
    if (session?.user?.id) {
      localStorage.removeItem(`profileImage_${session.user.id}`)
      localStorage.removeItem(`cachedProfileImage_${session.user.id}`)
    }
    await signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Back Button */}
        <button
          onClick={handleBack}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors touch-manipulation"
          aria-label="Go back"
        >
          <svg
            className="w-6 h-6 text-gray-700 dark:text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Page Title - Centered */}
        <h1 className="flex-1 text-center text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h1>

        {/* Profile Avatar & Dropdown */}
        <div className="relative dropdown-container" id="profile-dropdown">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="focus:outline-none"
            aria-label="Open profile menu"
          >
            {hasProfileImage ? (
              <Image
                src={userImage}
                alt="Profile"
                width={40}
                height={40}
                className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-helfi-green shadow-sm flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-white" aria-hidden="true" />
              </div>
            )}
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg py-2 z-50 border border-gray-100 dark:border-gray-700 animate-fade-in">
              <div className="flex items-center px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                {hasProfileImage ? (
                  <Image
                    src={userImage}
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
                  <div className="font-semibold text-gray-900 dark:text-white">{userName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {session?.user?.email || 'user@email.com'}
                  </div>
                </div>
              </div>
              <Link
                href="/profile"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Profile
              </Link>
              <Link
                href="/account"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Account Settings
              </Link>
              <Link
                href="/profile/image"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Upload/Change Profile Photo
              </Link>
              <Link
                href="/billing"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Subscription & Billing
              </Link>
              <Link
                href="/notifications"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Notifications
              </Link>
              <Link
                href="/privacy"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Privacy Settings
              </Link>
              <Link
                href="/support"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Help & Support
              </Link>
              <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
              <Link
                href="/reports"
                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setDropdownOpen(false)}
              >
                Reports
              </Link>
              <button
                onClick={handleSignOut}
                className="block w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold"
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




