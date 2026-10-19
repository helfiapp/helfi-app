'use client'

import { useEffect, useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { AiConsentProvider } from './AiConsentProvider'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible')
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  return (
    <SessionProvider
      // Keep remembered mobile sessions and avoid new focus-triggered requests.
      // Pause this tab's heartbeat while hidden; resume its normal interval
      // only when visible. Normal server revocation checks remain unchanged.
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={visible ? 15 * 60 : 0}
    >
      <AiConsentProvider>{children}</AiConsentProvider>
    </SessionProvider>
  )
}
