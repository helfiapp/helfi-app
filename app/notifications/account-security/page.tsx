'use client'

import Link from 'next/link'
import PageHeader from '@/components/PageHeader'

export default function AccountSecurityNotificationsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Account & security" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Account alerts</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              These alerts are always on to keep your account safe.
            </p>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Login alerts</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">We email you when a new device signs in.</p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">On</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Password changes</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">We email you after a password update.</p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">On</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Account updates</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">We email you when key profile details change.</p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">On</span>
            </div>
          </div>

          <Link
            href="/account"
            className="inline-flex items-center justify-center w-full rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-helfi-green"
          >
            Manage account settings
          </Link>
        </div>
      </main>
    </div>
  )
}
