'use client'

import Link from 'next/link'

type AppFlowHeaderProps = {
  fallbackHref?: string
  dashboardHref?: string
  maxWidthClassName?: string
}

export default function AppFlowHeader({
  fallbackHref = '/dashboard',
  dashboardHref = '/dashboard',
  maxWidthClassName = 'max-w-6xl',
}: AppFlowHeaderProps) {
  return (
    <header className="px-6 pt-6">
      <div className={`${maxWidthClassName} mx-auto flex items-center justify-between`}>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back()
              return
            }
            window.location.href = fallbackHref
          }}
          className="inline-flex items-center justify-center px-5 py-2 rounded-full border border-emerald-200 text-emerald-800 font-semibold hover:border-emerald-300 hover:text-emerald-900 transition-colors"
        >
          ← Back
        </button>
        <Link
          href={dashboardHref}
          className="inline-flex items-center justify-center px-5 py-2 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </header>
  )
}
