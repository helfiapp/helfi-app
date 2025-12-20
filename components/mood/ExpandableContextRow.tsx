'use client'

import React from 'react'

export default function ExpandableContextRow({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  children: React.ReactNode
}) {
  return (
    <details className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <summary className="list-none cursor-pointer select-none px-4 py-3 flex items-center gap-3 touch-manipulation">
        <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-200">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{value || 'Optional'}</div>
        </div>
        <svg
          className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="px-4 pb-4 pt-1">
        {children}
      </div>
    </details>
  )
}

