import React, { useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'react-native'

import { FontAwesome } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'

import { API_BASE_URL } from '../config'
import { parseNativeSocialCompleteUrl, runNativeSocialAuth } from '../lib/nativeSocialAuth'
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
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null)
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

  const handleSocialCompleteUrl = async (url: string) => {
    if (!url.startsWith('helfi://auth-complete')) return

    const result = parseNativeSocialCompleteUrl(url)
    if (!result.ok) {
      Alert.alert('Sign up failed', result.error)
      return
    }

    await signIn({ rememberMe: true, session: result.session })
  }

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

  const onGoogle = async () => {
    try {
      setSocialLoading('google')
      const url = await runNativeSocialAuth('google', 'signup')
      if (!url) return
      await handleSocialCompleteUrl(url)
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not open Google sign up. Please try again.'
      Alert.alert('Google sign up failed', message)
    } finally {
      setSocialLoading(null)
    }
  }

  const onApple = async () => {
    try {
      setSocialLoading('apple')
      const url = await runNativeSocialAuth('apple', 'signup')
      if (!url) return
      await handleSocialCompleteUrl(url)
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
            <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 16 }}>Back</Text>
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              marginRight: isPractitionerSignup ? 0 : 44,
              color: theme.colors.text,
              fontWeight: '900',
            }}
          >
            {isPractitionerSignup ? 'Practitioner sign up' : 'Sign up'}
          </Text>
          {isPractitionerSignup ? (
            <Pressable
              onPress={goToDashboard}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 8, paddingLeft: 12 })}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 14 }}>Back to dashboard</Text>
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

                <Text style={{ marginTop: theme.spacing.md, fontSize: 26, fontWeight: '900', color: theme.colors.text }}>
                  {isPractitionerSignup ? 'Practitioner portal - create account' : 'Create Account'}
                </Text>
                <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 20 }}>
                  {isPractitionerSignup ? 'Create your practitioner account to list your practice on Helfi.' : 'Create a new account to get started'}
                </Text>

                {/* Make the "go back to login" link obvious without scrolling */}
                <Pressable onPress={goToLogin} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 10, paddingHorizontal: 8 })}>
                  <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '700' }}>
                    {isPractitionerSignup ? 'Already have a practitioner account? ' : 'Already have an account? '}
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Sign in</Text>
                  </Text>
                </Pressable>
              </View>

              <View>
                <Pressable
                  onPress={onGoogle}
                  disabled={loading || !!socialLoading}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: theme.radius.md,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    opacity: loading || socialLoading ? 0.5 : pressed ? 0.85 : 1,
                  })}
                >
                  <Svg width={18} height={18} viewBox="0 0 24 24">
                    <Path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <Path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <Path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <Path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </Svg>
                  <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
                    {socialLoading === 'google' ? 'Opening Google...' : 'Continue with Google'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={onApple}
                  disabled={loading || !!socialLoading}
                  style={({ pressed }) => ({
                    marginTop: theme.spacing.sm,
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
                      <Text onPress={() => navigation.navigate('Terms')} style={{ color: theme.colors.primary, fontWeight: '800' }}>
                        Terms of Service
                      </Text>{' '}
                      and{' '}
                      <Text onPress={() => navigation.navigate('Privacy')} style={{ color: theme.colors.primary, fontWeight: '800' }}>
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
