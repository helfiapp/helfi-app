import React, { useEffect, useState } from 'react'
import { Alert, Appearance, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'

import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type ProfileVisibility = 'private' | 'public' | 'friends'

const STORAGE_KEYS = {
  darkMode: 'darkMode',
  hapticsEnabled: 'hapticsEnabled',
  profileVisibility: 'profileVisibility',
  dataAnalytics: 'dataAnalytics',
} as const

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        padding: 14,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sectionTitle, fontWeight: '900', marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  )
}

function LinkRow({
  title,
  subtitle,
  onPress,
}: {
  title: string
  subtitle: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        padding: 12,
        backgroundColor: theme.colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>{title}</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 3 }}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.colors.muted} />
    </Pressable>
  )
}

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { mode, session, signOut } = useAppMode()

  const [darkMode, setDarkMode] = useState(false)
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>('private')
  const [dataAnalytics, setDataAnalytics] = useState(true)
  const [localLoaded, setLocalLoaded] = useState(false)

  const [weeklyReportsEnabled, setWeeklyReportsEnabled] = useState<boolean | null>(null)
  const [weeklyReportsLoading, setWeeklyReportsLoading] = useState(true)
  const [weeklyReportsSaving, setWeeklyReportsSaving] = useState(false)
  const [weeklyReportsError, setWeeklyReportsError] = useState('')

  useEffect(() => {
    let cancelled = false
    const loadLocalPrefs = async () => {
      try {
        const [savedDark, savedHaptics, savedVisibility, savedAnalytics] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.darkMode),
          AsyncStorage.getItem(STORAGE_KEYS.hapticsEnabled),
          AsyncStorage.getItem(STORAGE_KEYS.profileVisibility),
          AsyncStorage.getItem(STORAGE_KEYS.dataAnalytics),
        ])

        if (savedDark !== null) {
          const shouldUseDarkMode = savedDark === 'true'
          setDarkMode(shouldUseDarkMode)
          Appearance.setColorScheme(shouldUseDarkMode ? 'dark' : 'light')
        }
        if (savedHaptics !== null) setHapticsEnabled(savedHaptics === 'true')
        if (savedVisibility === 'private' || savedVisibility === 'public' || savedVisibility === 'friends') {
          setProfileVisibility(savedVisibility)
        }
        if (savedAnalytics !== null) setDataAnalytics(savedAnalytics === 'true')
      } finally {
        if (!cancelled) setLocalLoaded(true)
      }
    }
    void loadLocalPrefs()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!localLoaded) return
    Appearance.setColorScheme(darkMode ? 'dark' : 'light')
    void AsyncStorage.setItem(STORAGE_KEYS.darkMode, darkMode ? 'true' : 'false')
  }, [darkMode, localLoaded])

  useEffect(() => {
    if (!localLoaded) return
    void AsyncStorage.setItem(STORAGE_KEYS.hapticsEnabled, hapticsEnabled ? 'true' : 'false')
  }, [hapticsEnabled, localLoaded])

  useEffect(() => {
    if (!localLoaded) return
    void AsyncStorage.setItem(STORAGE_KEYS.profileVisibility, profileVisibility)
  }, [profileVisibility, localLoaded])

  useEffect(() => {
    if (!localLoaded) return
    void AsyncStorage.setItem(STORAGE_KEYS.dataAnalytics, dataAnalytics ? 'true' : 'false')
  }, [dataAnalytics, localLoaded])

  useEffect(() => {
    let cancelled = false

    const loadWeeklyPreference = async () => {
      if (mode !== 'signedIn' || !session?.token) {
        setWeeklyReportsEnabled(false)
        setWeeklyReportsLoading(false)
        setWeeklyReportsError('Please sign in to manage weekly reports.')
        return
      }

      setWeeklyReportsLoading(true)
      try {
        const res = await fetch(`${API_BASE_URL}/api/reports/weekly/preferences`, {
          headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
        })
        const data = await res.json().catch(() => ({} as any))
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load')
        }
        if (!cancelled) {
          setWeeklyReportsEnabled(data?.reportsEnabled ?? false)
          setWeeklyReportsError('')
        }
      } catch {
        if (!cancelled) {
          setWeeklyReportsEnabled(false)
          setWeeklyReportsError('Could not load weekly report setting.')
        }
      } finally {
        if (!cancelled) setWeeklyReportsLoading(false)
      }
    }

    void loadWeeklyPreference()
    return () => {
      cancelled = true
    }
  }, [mode, session?.token])

  const goToStackScreen = (screen: string, params?: any) => {
    const parent = navigation.getParent?.()
    if (parent?.navigate) {
      parent.navigate(screen, params)
      return
    }
    navigation.navigate(screen, params)
  }

  const onPressSignOut = () => {
    Alert.alert('Log out?', 'This will take you back to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  const toggleWeeklyReports = async (nextValue: boolean) => {
    if (mode !== 'signedIn' || !session?.token) {
      setWeeklyReportsError('Please sign in to manage weekly reports.')
      return
    }

    setWeeklyReportsSaving(true)
    setWeeklyReportsError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/weekly/preferences`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { json: true, includeCookie: true }),
        body: JSON.stringify({ enabled: nextValue }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        if (res.status === 402) {
          setWeeklyReportsError('Weekly reports need a plan or credits. Please use Billing.')
        } else {
          setWeeklyReportsError('Could not update weekly report setting.')
        }
        return
      }
      setWeeklyReportsEnabled(data?.reportsEnabled ?? nextValue)
    } catch {
      setWeeklyReportsError('Could not update weekly report setting.')
    } finally {
      setWeeklyReportsSaving(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl, gap: 12 }}>
        <SectionCard title="General Settings">
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Dark Mode</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 3 }}>Switch to dark theme</Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: '#D1D5DB', true: '#86D2A2' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {Platform.OS !== 'ios' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Haptic Tap Feedback</Text>
                  <Text style={{ color: theme.colors.muted, marginTop: 3 }}>
                    Light vibration on nav taps (Android supported)
                  </Text>
                </View>
                <Switch
                  value={hapticsEnabled}
                  onValueChange={setHapticsEnabled}
                  trackColor={{ false: '#D1D5DB', true: '#86D2A2' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ) : null}

            <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>
                Add Helfi to your Home Screen
              </Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4, lineHeight: 20 }}>
                You are already using the native Helfi app on your phone.
              </Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard title="Weekly health reports">
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>
                  7-day report
                </Text>
                <Text style={{ color: theme.colors.muted, marginTop: 3 }}>
                  Turn on the 7-day report. Reports use credits based on how much you log.
                </Text>
              </View>
              <Switch
                value={!!weeklyReportsEnabled}
                onValueChange={toggleWeeklyReports}
                disabled={weeklyReportsLoading || weeklyReportsSaving || weeklyReportsEnabled === null}
                trackColor={{ false: '#D1D5DB', true: '#86D2A2' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <HelfiButton label="Upgrade or add credits" onPress={() => goToStackScreen('Billing')} variant="secondary" />

            {!weeklyReportsLoading && !weeklyReportsSaving && weeklyReportsEnabled !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={weeklyReportsEnabled ? 'Turn off weekly reports' : 'Turn on weekly reports'}
                onPress={() => void toggleWeeklyReports(!weeklyReportsEnabled)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.8 : 1,
                  alignSelf: 'flex-start',
                  paddingVertical: 8,
                  paddingHorizontal: 2,
                })}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>
                  {weeklyReportsEnabled ? 'Turn off weekly reports' : 'Turn on weekly reports'}
                </Text>
              </Pressable>
            ) : null}

            {weeklyReportsLoading || weeklyReportsSaving ? (
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Saving...</Text>
            ) : null}
            {weeklyReportsEnabled === true && !weeklyReportsLoading && !weeklyReportsSaving ? (
              <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 12 }}>Weekly reports are on.</Text>
            ) : null}
            {weeklyReportsEnabled === false && !weeklyReportsLoading && !weeklyReportsSaving ? (
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Reports are off until you turn them on.</Text>
            ) : null}
            {weeklyReportsError ? <Text style={{ color: '#B91C1C', fontSize: 12 }}>{weeklyReportsError}</Text> : null}
          </View>
        </SectionCard>

        <SectionCard title="Food Diary">
          <LinkRow
            title="Open Food Diary settings"
            subtitle="Frequency, caps, and trigger levels."
            onPress={() => goToStackScreen('FoodDiarySettings')}
          />
        </SectionCard>

        <SectionCard title="Notifications">
          <LinkRow
            title="Open notification settings"
            subtitle="Delivery, reminders, Health Coach, and more."
            onPress={() => goToStackScreen('Notifications')}
          />
        </SectionCard>

        <SectionCard title="Privacy Settings">
          <View style={{ gap: 14 }}>
            <View>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Profile Visibility</Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Make your profile visible to others</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { value: 'private' as const, label: 'Private' },
                { value: 'public' as const, label: 'Public' },
                { value: 'friends' as const, label: 'Friends Only' },
              ].map((option) => {
                const selected = profileVisibility === option.value
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setProfileVisibility(option.value)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.92 : 1,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? '#EAF5EF' : theme.colors.card,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    })}
                  >
                    <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, fontWeight: '800', fontSize: 13 }}>
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Data Analytics</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                  Help us improve by sharing anonymous usage data
                </Text>
              </View>
              <Switch
                value={dataAnalytics}
                onValueChange={setDataAnalytics}
                trackColor={{ false: '#D1D5DB', true: '#86D2A2' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <LinkRow
              title="Download my data (PDF)"
              subtitle="Get a nicely formatted health summary"
              onPress={() => goToStackScreen('NativeWebTool', { title: 'Health summary PDF', path: '/api/export/pdf' })}
            />
          </View>
        </SectionCard>

        <SectionCard title="Account Actions">
          <View style={{ gap: 10 }}>
            <LinkRow
              title="Account Settings"
              subtitle="Manage your account information"
              onPress={() => goToStackScreen('AccountSettings')}
            />
            <LinkRow
              title="Subscription & Billing"
              subtitle="Manage your subscription"
              onPress={() => goToStackScreen('Billing')}
            />
            <LinkRow
              title="Help & Support"
              subtitle="Get help and contact support"
              onPress={() => goToStackScreen('Help', { activeTab: 'Settings' })}
            />
            <HelfiButton label="Log out" onPress={onPressSignOut} variant="secondary" />
          </View>
        </SectionCard>
      </ScrollView>
    </Screen>
  )
}
