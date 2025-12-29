'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HealthApp() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    router.replace('/auth/signin')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-green-50 p-4">
      <div className="text-center text-gray-700">Redirecting…</div>
    </div>
  )
}
