import React, { useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native'
import { Linking } from 'react-native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

const isLikelyEmail = (value: string) => {
  const v = value.trim()
  return v.includes('@') && v.includes('.') && v.length >= 6
}

export function LoginScreen() {
  const { setMode, setUserEmail } = useAppMode()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit = useMemo(() => {
    return isLikelyEmail(email) && password.trim().length >= 6 && !busy
  }, [email, password, busy])

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!isLikelyEmail(normalizedEmail)) {
      Alert.alert('Enter your email', 'Please enter a valid email address.')
      return
    }
    if (password.trim().length < 6) {
      Alert.alert('Enter your password', 'Please enter your password.')
      return
    }

    // First version: we switch the app into “signed in” mode.
    // Next step (next ticket) is wiring this to real Helfi backend login + saving the session.
    setBusy(true)
    try {
      setUserEmail(normalizedEmail)
      setMode('signedIn')
    } finally {
      setBusy(false)
    }
  }

  const openWebSignIn = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/auth/signin`)
    } catch {
      Alert.alert('Could not open the sign-in page', 'Please try again.')
    }
  }

  return (
    <Screen style={{ padding: theme.spacing.lg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 36, fontWeight: '800', color: theme.colors.text, marginBottom: 8 }}>Helfi</Text>
          <Text style={{ fontSize: 16, color: theme.colors.muted, marginBottom: theme.spacing.lg }}>
            Log in to start using the phone app.
          </Text>

          <View
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.muted, fontSize: 12, marginBottom: 6 }}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.muted}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: theme.colors.text,
                marginBottom: theme.spacing.md,
              }}
            />

            <Text style={{ color: theme.colors.muted, fontSize: 12, marginBottom: 6 }}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Your password"
              placeholderTextColor={theme.colors.muted}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: theme.colors.text,
              }}
            />

            <HelfiButton
              label={busy ? 'Logging in...' : 'Log in'}
              onPress={handleLogin}
              disabled={!canSubmit}
              style={{ marginTop: theme.spacing.lg }}
            />

            <HelfiButton
              label="Use website login (opens browser)"
              onPress={openWebSignIn}
              variant="secondary"
              style={{ marginTop: theme.spacing.sm }}
            />
          </View>

          <View style={{ marginTop: theme.spacing.lg }}>
            <HelfiButton label="Continue in demo mode" onPress={() => setMode('demo')} variant="secondary" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

