import React from 'react'
import { Text, View } from 'react-native'

import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function DashboardScreen() {
  const { mode, userEmail } = useAppMode()

  return (
    <Screen style={{ padding: theme.spacing.lg }}>
      <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text }}>Dashboard</Text>
        <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
          Mode: {mode === 'demo' ? 'Demo' : mode === 'signedIn' ? 'Signed in' : 'Signed out'}
        </Text>
        {userEmail ? (
          <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
            Logged in as: {userEmail}
          </Text>
        ) : null}
        <Text style={{ marginTop: theme.spacing.md, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
          Next step: connect the app to your Helfi account so this screen can show your real data.
        </Text>
      </View>
    </Screen>
  )
}
