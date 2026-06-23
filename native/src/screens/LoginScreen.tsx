import React, { useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'react-native'

import { useNavigation, useRoute } from '@react-navigation/native'
import { FontAwesome } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'

import { API_BASE_URL } from '../config'
import { runNativeAppleAuth } from '../lib/nativeSocialAuth'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { HelfiTextField } from '../ui/HelfiTextField'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function LoginScreen() {
  const { signIn } = useAppMode()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const accountType = route?.params?.accountType
  const isPractitionerFlow = accountType === 'practitioner'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<'apple' | null>(null)
  const [rememberMe, setRememberMe] = useState(true)
  const { width: windowWidth } = useWindowDimensions()
  const contentWidth = Math.min(390, Math.max(280, windowWidth - theme.spacing.md * 2))

  const canSubmit = useMemo(
    () => email.trim().length > 3 && password.length > 0 && !loading && !socialLoading,
    [email, password, loading, socialLoading],
  )

  const onLogin = async () => {
    try {
      setLoading(true)
      const payload: Record<string, string> = { email: email.trim(), password }
      if (isPractitionerFlow) {
        payload.accountType = 'practitioner'
      }
      const res = await fetch(`${API_BASE_URL}/api/native-auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        let message = 'Please check your email and password and try again.'
        try {
          const data = await res.json()
          if (data?.error) message = String(data.error)
        } catch {}
        Alert.alert('Login failed', message)
        return
      }

      const data = await res.json().catch(() => ({} as any))
      const token = typeof data?.token === 'string' ? data.token : ''
      const expiresAt = typeof data?.expiresAt === 'number' ? data.expiresAt : Date.now() + 24 * 60 * 60 * 1000
      const user = data?.user && typeof data.user === 'object' ? data.user : null

      if (!token || !user?.id || !user?.email) {
        Alert.alert('Login failed', 'Login worked, but the server did not return the login token. Please try again.')
        return
      }

      await signIn({ rememberMe, session: { token, expiresAt, user } })
      if (navigation?.canGoBack?.()) {
        navigation.goBack()
      }
    } catch {
      Alert.alert('Login failed', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const openSignup = async () => {
    const signupRouteName = route?.params?.signupRouteName || 'Signup'
    navigation.navigate(signupRouteName, isPractitionerFlow ? { accountType: 'practitioner', loginRouteName: 'Login' } : undefined)
  }

  const goBackFromPractitioner = () => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack()
      return
    }
    navigation.navigate('ListYourPracticeStart')
  }

  const goToDashboard = () => {
    navigation.navigate('Tabs', { screen: 'Dashboard' })
  }

  const openForgotPassword = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/auth/forgot-password?helfiNative=1`)
    } catch {
      Alert.alert('Could not open the password reset page', 'Please try again.')
    }
  }

  const openTerms = async () => {
    navigation.navigate('Terms')
  }

  const openPrivacy = async () => {
    navigation.navigate('Privacy')
  }

  const onApple = async () => {
    try {
      setSocialLoading('apple')
      const session = await runNativeAppleAuth('signin')
      if (!session) return
      await signIn({ rememberMe, session })
      if (navigation?.canGoBack?.()) {
        navigation.goBack()
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not open Apple sign in. Please try again.'
      Alert.alert('Apple sign in failed', message)
    } finally {
      setSocialLoading(null)
    }
  }

  return (
    <Screen>
      <LinearGradient colors={['#FFFFFF', '#E9F6F1']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: theme.spacing.md,
              paddingTop: theme.spacing.xl,
              paddingBottom: theme.spacing.xl,
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ width: contentWidth }}>
              {isPractitionerFlow ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.md }}>
                  <Pressable
                    onPress={goBackFromPractitioner}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 8, paddingHorizontal: 4 })}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={goToDashboard}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 8, paddingHorizontal: 4 })}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Back to dashboard</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={{ alignItems: 'center', marginBottom: theme.spacing.xl }}>
                <Image source={require('../../assets/helfi-logo.png')} style={{ width: 92, height: 92 }} resizeMode="contain" />

                <Text style={{ marginTop: theme.spacing.md, fontSize: 26, fontWeight: '900', color: theme.colors.text }}>
                  {isPractitionerFlow ? 'Practitioner portal sign in' : 'Welcome to Helfi'}
                </Text>
                <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 20 }}>
                  {isPractitionerFlow ? 'Sign in to manage your listing and boosts.' : 'Sign in to your account'}
                </Text>
              </View>

              {/* Flat layout (no big white "card" behind everything) */}
              <View>
                <Pressable
                  onPress={onApple}
                  disabled={loading || !!socialLoading}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: theme.radius.md,
                    backgroundColor: '#000000',
                    opacity: loading || socialLoading ? 0.5 : pressed ? 0.85 : 1,
                  })}
                >
                  <FontAwesome name="apple" size={20} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
                    {socialLoading === 'apple' ? 'Opening Apple...' : 'Continue with Apple'}
                  </Text>
                </Pressable>

              <View style={{ marginTop: theme.spacing.md, marginBottom: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
                <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>Or with email</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
              </View>

              <HelfiTextField
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
              <HelfiTextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                textContentType="password"
                autoComplete="password"
                right={
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 2 })}
                  >
                    <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={18} color={theme.colors.muted} />
                  </Pressable>
                }
              />

              <View style={{ marginTop: -6, alignItems: 'flex-end' }}>
                <Pressable onPress={openForgotPassword} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 6, paddingHorizontal: 4 })}>
                  <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '800' }}>Forgot password?</Text>
                </Pressable>
              </View>

              <View style={{ marginTop: theme.spacing.sm }}>
                <Pressable
                  onPress={() => setRememberMe((v) => !v)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    opacity: pressed ? 0.7 : 1,
                    paddingVertical: 4,
                    paddingHorizontal: 2,
                  })}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: rememberMe ? theme.colors.primary : '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {rememberMe ? <FontAwesome name="check" size={12} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700' }}>Keep me signed in</Text>
                </Pressable>

                <Text style={{ marginLeft: 30, marginTop: 2, color: theme.colors.muted, fontSize: 12, lineHeight: 16 }}>
                  If unchecked, you stay signed in for at least 24 hours.
                </Text>
              </View>

              <View style={{ marginTop: theme.spacing.sm }}>
                <HelfiButton label={loading ? 'Logging in...' : isPractitionerFlow ? 'Sign in to practitioner portal' : 'Log in'} onPress={onLogin} disabled={!canSubmit} />
              </View>

                <View style={{ marginTop: theme.spacing.md, alignItems: 'center' }}>
                  <Pressable onPress={openSignup} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 8 })}>
                    <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '700' }}>
                      {isPractitionerFlow ? 'Need a practitioner account? ' : "Don't have an account? "}
                      <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>
                        {isPractitionerFlow ? 'Create practitioner account' : 'Sign up'}
                      </Text>
                    </Text>
                  </Pressable>

                  <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 15 }}>
                    By continuing, you agree to our{' '}
                    <Text onPress={openTerms} style={{ color: theme.colors.primary, fontWeight: '800' }}>
                      Terms of Service
                    </Text>{' '}
                    and{' '}
                    <Text onPress={openPrivacy} style={{ color: theme.colors.primary, fontWeight: '800' }}>
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </Screen>
  )
}
