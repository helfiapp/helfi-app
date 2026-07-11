import React, { useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'react-native'

import { FontAwesome } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'

import { API_BASE_URL } from '../config'
import { runNativeAppleAuth } from '../lib/nativeSocialAuth'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { HelfiTextField } from '../ui/HelfiTextField'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function SignupScreen({ navigation, route }: { navigation: any; route?: any }) {
  const { signIn } = useAppMode()
  const accountType = route?.params?.accountType
  const isPractitionerSignup = accountType === 'practitioner'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<'apple' | null>(null)
  const { width: windowWidth } = useWindowDimensions()
  const contentWidth = Math.min(390, Math.max(280, windowWidth - theme.spacing.md * 2))

  const canSubmit = useMemo(() => {
    if (loading || !!socialLoading) return false
    if (!acceptTerms) return false
    if (email.trim().length < 4) return false
    if (password.length < 8) return false
    if (password !== confirmPassword) return false
    return true
  }, [acceptTerms, confirmPassword, email, loading, password, socialLoading])

  const onCreateAccount = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    try {
      setLoading(true)

      // Use the same signup endpoint as the website.
      const signupPayload: Record<string, string> = { email: normalizedEmail, password }
      if (isPractitionerSignup) {
        signupPayload.accountType = 'practitioner'
      }
      const signupRes = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signupPayload),
      })

      const signupData = await signupRes.json().catch(() => ({} as any))

      if (!signupRes.ok) {
        const msg = signupData?.error ? String(signupData.error) : 'Failed to create account. Please try again.'
        Alert.alert('Sign up failed', msg)
        return
      }

      // Try logging in right away so the flow feels like a real app.
      const loginRes = await fetch(`${API_BASE_URL}/api/native-auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      })

      if (loginRes.ok) {
        const data = await loginRes.json().catch(() => ({} as any))
        const token = typeof data?.token === 'string' ? data.token : ''
        const expiresAt = typeof data?.expiresAt === 'number' ? data.expiresAt : Date.now() + 24 * 60 * 60 * 1000
        const user = data?.user && typeof data.user === 'object' ? data.user : null

        if (!token || !user?.id || !user?.email) {
          Alert.alert('Account created', 'Your account was created, but the app could not sign you in yet. Please try logging in.')
          goToLogin()
          return
        }

        await signIn({ rememberMe: true, session: { token, expiresAt, user } })
        if (navigation?.canGoBack?.()) {
          navigation.goBack()
        }
        return
      }

      Alert.alert('Account created', 'Your account was created. If you were asked to verify your email, please check your inbox.')
      goToLogin()
    } catch {
      Alert.alert('Sign up failed', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onApple = async () => {
    try {
      setSocialLoading('apple')
      const session = await runNativeAppleAuth('signup')
      if (!session) return
      await signIn({ rememberMe: true, session })
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not open Apple sign up. Please try again.'
      Alert.alert('Apple sign up failed', message)
    } finally {
      setSocialLoading(null)
    }
  }

  const goToLogin = () => {
    const loginRouteName = route?.params?.loginRouteName || 'Login'
    if (navigation?.canGoBack?.()) {
      navigation.goBack()
      return
    }
    navigation.navigate(loginRouteName, isPractitionerSignup ? { accountType: 'practitioner' } : undefined)
  }

  const goToDashboard = () => {
    navigation.navigate('Tabs', { screen: 'Dashboard' })
  }

  return (
    <Screen>
      <LinearGradient colors={['#FFFFFF', '#E9F6F1']} style={{ flex: 1 }}>
        {/* Simple, obvious way back (no swipe-gesture guessing) */}
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md }}>
          <Pressable
            onPress={goToLogin}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 8, paddingRight: 12 })}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 16 }}>Back</Text>
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              marginRight: isPractitionerSignup ? 0 : 44,
              color: theme.colors.text,
              fontWeight: '700',
            }}
          >
            {isPractitionerSignup ? 'Practitioner sign up' : 'Sign up'}
          </Text>
          {isPractitionerSignup ? (
            <Pressable
              onPress={goToDashboard}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 8, paddingLeft: 12 })}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 14 }}>Back to dashboard</Text>
            </Pressable>
          ) : null}
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: theme.spacing.md,
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.xl,
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ width: contentWidth }}>
              <View style={{ alignItems: 'center', marginBottom: theme.spacing.xl }}>
                <Image source={require('../../assets/helfi-logo.png')} style={{ width: 92, height: 92 }} resizeMode="contain" />

                <Text style={{ marginTop: theme.spacing.md, fontSize: 26, fontWeight: '700', color: theme.colors.text }}>
                  {isPractitionerSignup ? 'Practitioner portal - create account' : 'Create Account'}
                </Text>
                <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 20 }}>
                  {isPractitionerSignup ? 'Create your practitioner account to list your practice on Helfi.' : 'Create a new account to get started'}
                </Text>

                {/* Make the "go back to login" link obvious without scrolling */}
                <Pressable onPress={goToLogin} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 10, paddingHorizontal: 8 })}>
                  <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '700' }}>
                    {isPractitionerSignup ? 'Already have a practitioner account? ' : 'Already have an account? '}
                    <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Sign in</Text>
                  </Text>
                </Pressable>
              </View>

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
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
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
                  placeholder="Create a password"
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
                <HelfiTextField
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  secureTextEntry={!showConfirm}
                  textContentType="password"
                  autoComplete="password"
                  right={
                    <Pressable
                      onPress={() => setShowConfirm((v) => !v)}
                      accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 2 })}
                    >
                      <FontAwesome name={showConfirm ? 'eye-slash' : 'eye'} size={18} color={theme.colors.muted} />
                    </Pressable>
                  }
                />

                <View style={{ marginTop: theme.spacing.sm }}>
                  <Pressable
                    onPress={() => setAcceptTerms((v) => !v)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'flex-start',
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
                        marginTop: 2,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      backgroundColor: acceptTerms ? theme.colors.primary : '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                      {acceptTerms ? <FontAwesome name="check" size={12} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={{ flex: 1, color: theme.colors.muted, fontSize: 12, lineHeight: 16 }}>
                      I agree to the{' '}
                      <Text onPress={() => navigation.navigate('Terms')} style={{ color: theme.colors.primary, fontWeight: '600' }}>
                        Terms of Service
                      </Text>{' '}
                      and{' '}
                      <Text onPress={() => navigation.navigate('Privacy')} style={{ color: theme.colors.primary, fontWeight: '600' }}>
                        Privacy Policy
                      </Text>
                      .
                    </Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: theme.spacing.md }}>
                  <HelfiButton
                    label={loading ? 'Creating...' : isPractitionerSignup ? 'Create practitioner account' : 'Create account'}
                    onPress={onCreateAccount}
                    disabled={!canSubmit}
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </Screen>
  )
}
