'use client'

import Link from 'next/link'
import PageHeader from '@/components/PageHeader'

const notificationSections = [
  {
    title: 'Notification inbox',
    description: 'View alerts you might have missed.',
    href: '/notifications/inbox',
  },
  {
    title: 'Delivery',
    description: 'Email and push settings for this device.',
    href: '/notifications/delivery',
  },
  {
    title: 'Health reminders',
    description: 'Daily check-in reminder schedule.',
    href: '/notifications/health-reminders',
  },
  {
    title: 'Mood reminders',
    description: 'Mood check-in reminder schedule.',
    href: '/notifications/mood-reminders',
  },
  {
    title: 'AI insights',
    description: 'Health tip schedule and insight alerts.',
    href: '/notifications/ai-insights',
  },
  {
    title: 'Quiet hours',
    description: 'Pause reminders overnight.',
    href: '/notifications/quiet-hours',
  },
  {
    title: 'Account & security',
    description: 'Login and password alerts.',
    href: '/notifications/account-security',
  },
]

export default function Notifications() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Notifications" backHref="/settings" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Notification settings</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Choose a section to manage alerts and reminder schedules.
          </p>

          <div className="space-y-3">
            {notificationSections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-4 hover:border-helfi-green transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{section.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{section.description}</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
