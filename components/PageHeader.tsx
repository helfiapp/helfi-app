'use client'

import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUserData } from '@/components/providers/UserDataProvider'
import { UserIcon } from '@heroicons/react/24/outline'
import { isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'

const AFFILIATE_CACHE_TTL_MS = 10 * 60_000

interface PageHeaderProps {
  title: string
  backHref?: string // Optional custom back destination, defaults to router.back()
}

export default function PageHeader({ title, backHref }: PageHeaderProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const { profileImage } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [affiliateMenu, setAffiliateMenu] = useState<{ label: string; href: string } | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const affiliateCacheKey = session?.user?.email ? `affiliate-menu:${session.user.email}` : ''

  const hasProfileImage = !!(profileImage || session?.user?.image)
  const userImage = (profileImage || session?.user?.image || '') as string
  const userName = session?.user?.name || 'User'

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    if (backHref) {
      router.push(backHref)
      return
    }
    router.push('/dashboard')
  }

  const handleSignOut = async () => {
    // Clear user-specific localStorage before signing out
    if (session?.user?.id) {
      localStorage.removeItem(`profileImage_${session.user.id}`)
      localStorage.removeItem(`cachedProfileImage_${session.user.id}`)
    }
    await signOut({ callbackUrl: '/auth/signin' })
  }

  useEffect(() => {
    if (!session?.user?.id) return
    let mounted = true
    const loadUnread = async () => {
      try {
        const res = await fetch('/api/notifications/unread-count', { cache: 'no-store' as any })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (mounted) {
          const count = typeof data?.count === 'number' ? data.count : 0
          setUnreadCount(Number.isFinite(count) ? count : 0)
        }
      } catch {
        // ignore
      }
    }
    loadUnread()

    const handleRefresh = () => loadUnread()
    window.addEventListener('focus', handleRefresh)
    window.addEventListener('notifications:refresh', handleRefresh)
    return () => {
      mounted = false
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener('notifications:refresh', handleRefresh)
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!affiliateCacheKey) {
      setAffiliateMenu(null)
      return
    }
    let cancelled = false
    setAffiliateMenu({ label: 'Become an Affiliate', href: '/affiliate/apply' })
    const cached = affiliateCacheKey ? readClientCache<{ label: string; href: string }>(affiliateCacheKey) : null
    if (cached?.data) {
      setAffiliateMenu(cached.data)
    }
    if (cached && isCacheFresh(cached, AFFILIATE_CACHE_TTL_MS)) {
      return () => {
        cancelled = true
      }
    }
    const load = async () => {
      try {
        const res = await fetch('/api/affiliate/application', { cache: 'no-store' })
        const data = await res.json().catch(() => ({} as any))
        if (!res.ok) return

        const hasAffiliate = !!data?.affiliate
        const hasApplication = !!data?.application

        const menu = hasAffiliate
          ? { label: 'Affiliate Portal', href: '/affiliate' }
          : hasApplication
            ? { label: 'Affiliate Application', href: '/affiliate/apply' }
            : { label: 'Become an Affiliate', href: '/affiliate/apply' }

        if (!cancelled) {
          setAffiliateMenu(menu)
          if (affiliateCacheKey) {
            writeClientCache(affiliateCacheKey, menu)
          }
        }
      } catch {
        // ignore
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [affiliateCacheKey])

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
            <div className="relative">
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
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] px-1 h-[18px] rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center shadow">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
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
              {affiliateMenu && (
                <Link
                  href={affiliateMenu.href}
                  className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  onClick={() => setDropdownOpen(false)}
                >
                  {affiliateMenu.label}
                </Link>
              )}
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
