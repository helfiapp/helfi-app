import React, { useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'react-native'

import { FontAwesome } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { HelfiTextField } from '../ui/HelfiTextField'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function LoginScreen() {
  const { setMode } = useAppMode()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const { width: windowWidth } = useWindowDimensions()
  const contentWidth = Math.min(390, Math.max(280, windowWidth - theme.spacing.md * 2))

  const canSubmit = useMemo(() => email.trim().length > 3 && password.length > 0 && !loading, [email, password, loading])

  const onLogin = async () => {
    // UI-first: this will be wired to the real login endpoint next.
    try {
      setLoading(true)
      // Placeholder call so the button behaves realistically.
      // If this fails right now, we show a clean error message.
      const res = await fetch(`${API_BASE_URL}/api/native-auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      if (!res.ok) {
        Alert.alert('Login failed', 'Please check your email and password and try again.')
        return
      }

      setMode('signedIn')
    } catch {
      Alert.alert('Login failed', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const openWebLogin = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/auth/signin?helfiNative=1`)
    } catch {
      Alert.alert('Could not open the login page', 'Please try again.')
    }
  }

  const openWebSignup = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/auth/signin?mode=signup&helfiNative=1`)
    } catch {
      Alert.alert('Could not open the sign-up page', 'Please try again.')
    }
  }

  const openForgotPassword = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/auth/forgot-password?helfiNative=1`)
    } catch {
      Alert.alert('Could not open the password reset page', 'Please try again.')
    }
  }

  const openTerms = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/terms?helfiNative=1`)
    } catch {
      Alert.alert('Could not open the terms page', 'Please try again.')
    }
  }

  const openPrivacy = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/privacy?helfiNative=1`)
    } catch {
      Alert.alert('Could not open the privacy policy page', 'Please try again.')
    }
  }

  const onGoogle = async () => {
    // For now, this opens the same login page you already use on the website.
    // Later we can make this return you to the app automatically after Google login.
    await openWebLogin()
  }

  const onApple = async () => {
    // Apple login is enabled on staging; for now we open the same sign-in page
    // so the user can choose "Continue with Apple" there.
    await openWebLogin()
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
              <View style={{ alignItems: 'center', marginBottom: theme.spacing.xl }}>
                <Image source={require('../../assets/helfi-logo.png')} style={{ width: 92, height: 92 }} resizeMode="contain" />

                <Text style={{ marginTop: theme.spacing.md, fontSize: 26, fontWeight: '900', color: theme.colors.text }}>Welcome to Helfi</Text>
                <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 20 }}>Sign in to your account</Text>
              </View>

              {/* Flat layout (no big white "card" behind everything) */}
              <View>
                <Pressable
                  onPress={onGoogle}
                  disabled={loading}
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
                    opacity: loading ? 0.5 : pressed ? 0.85 : 1,
                  })}
                >
                  {/* Match the official Google "G" used on the web login */}
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
                  <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>Continue with Google</Text>
                </Pressable>

                <Pressable
                  onPress={onApple}
                  disabled={loading}
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
                    opacity: loading ? 0.5 : pressed ? 0.85 : 1,
                  })}
                >
                  <FontAwesome name="apple" size={20} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Continue with Apple</Text>
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
                    {rememberMe ? <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#FFFFFF' }} /> : null}
                  </View>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700' }}>Keep me signed in</Text>
                </Pressable>

                <Text style={{ marginLeft: 30, marginTop: 2, color: theme.colors.muted, fontSize: 12, lineHeight: 16 }}>
                  If unchecked, you stay signed in for at least 24 hours.
                </Text>
              </View>

              <View style={{ marginTop: theme.spacing.sm }}>
                <HelfiButton label={loading ? 'Logging in...' : 'Log in'} onPress={onLogin} disabled={!canSubmit} />
              </View>

                <View style={{ marginTop: theme.spacing.md, alignItems: 'center' }}>
                  <Pressable onPress={openWebSignup} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 8 })}>
                    <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '700' }}>
                      Don&apos;t have an account? <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Sign up</Text>
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
