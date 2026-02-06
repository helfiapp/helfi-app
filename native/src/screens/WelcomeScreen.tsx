import React, { useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { Linking } from 'react-native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function WelcomeScreen() {
  const { setMode } = useAppMode()
  const [opening, setOpening] = useState(false)

  const openWebSignIn = async () => {
    try {
      setOpening(true)
      await Linking.openURL(`${API_BASE_URL}/auth/signin`)
    } catch {
      Alert.alert('Could not open the sign-in page', 'Please try again.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <Screen style={{ padding: theme.spacing.lg }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 36, fontWeight: '800', color: theme.colors.text, marginBottom: 8 }}>Helfi</Text>
        <Text style={{ fontSize: 16, color: theme.colors.muted, marginBottom: theme.spacing.xl }}>
          This is the new phone app. Next we will connect it to your Helfi account.
        </Text>

        <HelfiButton label={opening ? 'Opening sign-in...' : 'Sign in (opens browser)'} onPress={openWebSignIn} />
        <HelfiButton
          label="Continue in demo mode"
          onPress={() => setMode('demo')}
          variant="secondary"
          style={{ marginTop: theme.spacing.sm }}
        />

        <View style={{ marginTop: theme.spacing.lg, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
            Sign-in is not fully wired up yet. Demo mode lets us build and review the screens now.
          </Text>
        </View>
      </View>
    </Screen>
  )
}
