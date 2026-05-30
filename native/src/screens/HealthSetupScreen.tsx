import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { API_BASE_URL } from '../config'
import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { NativeWebToolScreen } from './NativeWebToolScreen'
import { useAppMode } from '../state/AppModeContext'
import { theme } from '../ui/theme'

const START_HEALTH_INTAKE_PATH = '/onboarding?step=1'
const REVIEW_HEALTH_INTAKE_PATH = '/onboarding?step=11'

export function HealthSetupScreen() {
  const { mode, session } = useAppMode()
  const [path, setPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadHealthSetupPath = async () => {
      if (mode !== 'signedIn' || !session?.token) {
        if (!cancelled) setPath(START_HEALTH_INTAKE_PATH)
        return
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/health-setup-status`, {
          headers: {
            authorization: `Bearer ${session.token}`,
            'x-native-token': session.token,
            'cache-control': 'no-store',
          },
        })
        const data: any = await res.json().catch(() => ({}))
        if (!cancelled) {
          setPath(data?.complete === true ? REVIEW_HEALTH_INTAKE_PATH : START_HEALTH_INTAKE_PATH)
        }
      } catch {
        if (!cancelled) setPath(START_HEALTH_INTAKE_PATH)
      }
    }

    setPath(null)
    void loadHealthSetupPath()

    return () => {
      cancelled = true
    }
  }, [mode, session?.token])

  if (!path) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.colors.bg }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Opening Health Intake...</Text>
      </View>
    )
  }

  return (
    <NativeWebToolScreen
      route={{
        params: {
          ...NATIVE_WEB_PAGES.healthIntake,
          path,
        },
      }}
    />
  )
}
