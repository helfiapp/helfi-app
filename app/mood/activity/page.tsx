'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MoodActivityRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    try {
      sessionStorage.setItem('moodInfluencesExpanded', '1')
    } catch {}
    router.replace('/mood')
  }, [router])

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-gray-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 rounded-2xl p-6 text-center">
        <div className="text-lg font-bold text-slate-800 dark:text-white">One moment…</div>
        <div className="mt-2 text-sm text-slate-500 dark:text-gray-300">
          Taking you back to your mood check‑in.
        </div>
      </div>
    </div>
  )
}

