import React from 'react'
import { Alert, Text, View } from 'react-native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'
import { clearSessionToken } from '../auth/session'

export function SettingsScreen() {
  const { mode, setMode, userEmail, setUserEmail } = useAppMode()

  const logOut = () => {
    Alert.alert('Log out?', 'This will take you back to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          clearSessionToken().catch(() => {})
          setUserEmail(null)
          setMode('signedOut')
        },
      },
    ])
  }

  return (
    <Screen style={{ padding: theme.spacing.lg }}>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text }}>Settings</Text>
        <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
          Mode: {mode === 'demo' ? 'Demo' : mode === 'signedIn' ? 'Signed in' : 'Signed out'}
        </Text>
        {userEmail ? (
          <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
            Logged in as: {userEmail}
          </Text>
        ) : null}
        <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
          Connected to: {API_BASE_URL}
        </Text>

        <HelfiButton label="Log out" onPress={logOut} variant="secondary" style={{ marginTop: theme.spacing.lg }} />
      </View>
    </Screen>
  )
}
