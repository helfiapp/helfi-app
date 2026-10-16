import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Image, ImageSourcePropType, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native'

import { Feather, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { appleHealthConnectAndReadToday, isAppleHealthSupportedDevice } from '../health/appleHealth'
import { useAppleHealthSync } from '../health/AppleHealthSyncProvider'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'
import { VoiceAssistantIconButton } from '../voice/VoiceAssistantIconButton'

const APPLE_HEALTH_CONNECTED_KEY = 'helfi_apple_health_connected_v1'
const APPLE_HEALTH_MODE_KEY = 'helfi_apple_health_mode_v1' // Ignore legacy sample connections.
const MOOD_REMINDERS_KEY = 'helfi_reminders_mood_v1'
type WearableProvider = 'fitbit' | 'garmin'
type DeviceInterestKey = 'googleFit' | 'oura' | 'polar' | 'huawei'
type HealthSetupChips = {
  medications: boolean
  supplements: boolean
}

const EMPTY_HEALTH_SETUP_CHIPS: HealthSetupChips = {
  medications: false,
  supplements: false,
}

function chipsFromHealthSetupData(data: any): HealthSetupChips {
  return {
    medications: Array.isArray(data?.medications) && data.medications.length > 0,
    supplements: Array.isArray(data?.supplements) && data.supplements.length > 0,
  }
}

export function DashboardScreen() {
  const { mode, session, signOut } = useAppMode()
  const navigation = useNavigation<any>()
  const { width } = useWindowDimensions()

  const layout = useMemo(() => {
    const isTablet = width >= 700
    const horizontalPadding = isTablet ? 32 : 16
    const gap = isTablet ? 14 : 8
    const contentWidth = Math.min(width, 860)
    const cardWidth = Math.floor((contentWidth - horizontalPadding * 2 - gap) / 2)
    return { horizontalPadding, gap, cardWidth, isTablet }
  }, [width])
  const appleHealthAvailable = isAppleHealthSupportedDevice()
  const healthSync = useAppleHealthSync()

  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)
  const [creditsFillPct, setCreditsFillPct] = useState(0)
  const [hasPremiumPlan, setHasPremiumPlan] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [accountName, setAccountName] = useState('User')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountImage, setAccountImage] = useState<string | null>(null)

  // These start as "unknown/false" until we load from the server / app storage.
  const [healthSetupComplete, setHealthSetupComplete] = useState(false)
  const [healthSetupChips, setHealthSetupChips] = useState<HealthSetupChips>(EMPTY_HEALTH_SETUP_CHIPS)
  const [moodRemindersSet, setMoodRemindersSet] = useState(false)

  const [appleHealthConnected, setAppleHealthConnected] = useState(false)
  const [appleHealthBusy, setAppleHealthBusy] = useState(false)
  const [fitbitConnected, setFitbitConnected] = useState(false)
  const [fitbitBusy, setFitbitBusy] = useState(false)
  const [garminConnected, setGarminConnected] = useState(false)
  const [garminBusy, setGarminBusy] = useState(false)
  const [deviceInterest, setDeviceInterest] = useState<Partial<Record<DeviceInterestKey, boolean>>>({})
  const [deviceInterestBusy, setDeviceInterestBusy] = useState(false)

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return {
      ...buildNativeAuthHeaders(session.token, { includeCookie: true }),
    }
  }, [mode, session?.token])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const v = await AsyncStorage.getItem(APPLE_HEALTH_CONNECTED_KEY)
        const storedMode = await AsyncStorage.getItem(APPLE_HEALTH_MODE_KEY)
        if (!cancelled) setAppleHealthConnected(v === '1' && storedMode !== 'sample')
      } catch {}

      // Mood reminder settings are stored locally in the app.
      try {
        const raw = await AsyncStorage.getItem(MOOD_REMINDERS_KEY)
        const parsed: any = raw ? JSON.parse(raw) : null
        if (!cancelled) setMoodRemindersSet(parsed?.enabled !== false && !!raw)
      } catch {}
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setAccountName(String(session?.user?.name || session?.user?.email?.split('@')[0] || 'User'))
    setAccountEmail(String(session?.user?.email || ''))
    setAccountImage(typeof session?.user?.image === 'string' && session.user.image ? session.user.image : null)
  }, [session?.user?.name, session?.user?.email, session?.user?.image])

  const refreshCreditAndPlan = async () => {
    try {
      if (mode !== 'signedIn' || !session?.token) {
        setCreditsRemaining(null)
        setCreditsFillPct(0)
        setHasPremiumPlan(false)
        return
      }

      const res = await fetch(`${API_BASE_URL}/api/credit/status`, {
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
      })

      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) return

      const creditsTotalRaw = Number(data?.credits?.total)
      const safeCreditsTotal = Number.isFinite(creditsTotalRaw) ? Math.max(0, Math.round(creditsTotalRaw)) : 0
      setCreditsRemaining(safeCreditsTotal)

      const percentUsedRaw = Number(data?.percentUsed)
      const percentUsed = Number.isFinite(percentUsedRaw) ? Math.max(0, Math.min(100, percentUsedRaw)) : 0
      setCreditsFillPct(Math.max(0, Math.min(1, 1 - percentUsed / 100)))

      // Fallback source for premium header state: this endpoint is live on helfi.ai.
      setHasPremiumPlan(String(data?.plan || '').toUpperCase() === 'PREMIUM')
    } catch {
      // Keep UI stable if this request fails.
    }
  }

  const refreshNativeAccountStatus = async () => {
    try {
      if (mode !== 'signedIn' || !session?.token) {
        setHasPremiumPlan(false)
        return
      }

      const res = await fetch(`${API_BASE_URL}/api/native-auth/me`, {
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
      })

      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) return

      const user = data?.user || data
      if (typeof user?.name === 'string' && user.name.trim()) setAccountName(user.name.trim())
      if (typeof user?.email === 'string' && user.email.trim()) setAccountEmail(user.email.trim())
      if (typeof user?.image === 'string') setAccountImage(user.image || null)
      if (typeof data?.isPremium === 'boolean') setHasPremiumPlan(data.isPremium)
    } catch {
      // Keep UI stable if this request fails.
    }
  }

  const refreshLocalMoodReminders = async () => {
    try {
      if (authHeaders) {
        const res = await fetch(`${API_BASE_URL}/api/mood/reminders`, { headers: authHeaders })
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}))
          const enabled = typeof data?.enabled === 'boolean' ? data.enabled : true
          setMoodRemindersSet(enabled)
          try {
            await AsyncStorage.setItem(
              MOOD_REMINDERS_KEY,
              JSON.stringify({
                enabled,
                frequency: Number(data?.frequency) || 1,
                time1: String(data?.time1 || '20:00'),
                time2: String(data?.time2 || '12:00'),
                time3: String(data?.time3 || '18:00'),
                time4: String(data?.time4 || '09:00'),
                timezone: String(data?.timezone || 'UTC'),
                updatedAt: new Date().toISOString(),
              }),
            )
          } catch {}
          return
        }
      }

      const raw = await AsyncStorage.getItem(MOOD_REMINDERS_KEY)
      const parsed: any = raw ? JSON.parse(raw) : null
      setMoodRemindersSet(parsed?.enabled !== false && !!raw)
    } catch {
      setMoodRemindersSet(false)
    }
  }

  const checkMoodReminderGate = async () => {
    try {
      if (mode === 'signedIn' && session?.token) {
        const res = await fetch(`${API_BASE_URL}/api/mood/reminders`, {
          headers: {
            authorization: `Bearer ${session.token}`,
            'x-native-token': session.token,
            'cache-control': 'no-store',
          },
        })
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}))
          const enabled = data?.enabled === true
          setMoodRemindersSet(enabled)
          try {
            await AsyncStorage.setItem(
              MOOD_REMINDERS_KEY,
              JSON.stringify({
                enabled,
                frequency: Number(data?.frequency) || 1,
                time1: String(data?.time1 || '20:00'),
                time2: String(data?.time2 || '12:00'),
                time3: String(data?.time3 || '18:00'),
                time4: String(data?.time4 || '09:00'),
                timezone: String(data?.timezone || 'UTC'),
                updatedAt: new Date().toISOString(),
              }),
            )
          } catch {}
          return enabled
        }
      }

      const raw = await AsyncStorage.getItem(MOOD_REMINDERS_KEY)
      const parsed: any = raw ? JSON.parse(raw) : null
      const enabled = parsed?.enabled !== false && !!raw
      setMoodRemindersSet(enabled)
      return enabled
    } catch {
      setMoodRemindersSet(false)
      return false
    }
  }

  const refreshHealthSetupComplete = async () => {
    try {
      if (mode !== 'signedIn' || !session?.token) {
        setHealthSetupComplete(false)
        setHealthSetupChips(EMPTY_HEALTH_SETUP_CHIPS)
        return
      }

      const loadHealthSetupChips = async () => {
        const chipRes = await fetch(`${API_BASE_URL}/api/user-data?scope=health-setup`, {
          headers: {
            authorization: `Bearer ${session.token}`,
            'x-native-token': session.token,
            'cache-control': 'no-store',
          },
        })
        const chipPayload: any = await chipRes.json().catch(() => ({}))
        if (!chipRes.ok) {
          setHealthSetupChips(EMPTY_HEALTH_SETUP_CHIPS)
          return null
        }
        const chipData = chipPayload?.data && typeof chipPayload.data === 'object'
          ? chipPayload.data
          : chipPayload
        setHealthSetupChips(chipsFromHealthSetupData(chipData))
        return chipData
      }

      const res = await fetch(`${API_BASE_URL}/api/health-setup-status`, {
        headers: {
          authorization: `Bearer ${session.token}`,
          'x-native-token': session.token,
          'cache-control': 'no-store',
        },
      })

      const data: any = await res.json().catch(() => ({}))
      if (res.ok && typeof data?.complete === 'boolean') {
        setHealthSetupComplete(data.complete)
        if (data.complete) {
          await loadHealthSetupChips()
        } else {
          setHealthSetupChips(EMPTY_HEALTH_SETUP_CHIPS)
        }
        return
      }

      // Fallback: compute completion from real onboarding profile data.
      const fallbackData = await loadHealthSetupChips()
      if (!fallbackData) {
        setHealthSetupComplete(false)
        return
      }

      const hasBasicProfile = !!(fallbackData?.gender && fallbackData?.weight && fallbackData?.height)
      const hasGoals =
        Array.isArray(fallbackData?.goals) &&
        fallbackData.goals.some((goal: any) => typeof goal === 'string' && goal.trim() && !goal.trim().startsWith('__'))
      setHealthSetupComplete(hasBasicProfile && hasGoals)
    } catch {
      setHealthSetupComplete(false)
      setHealthSetupChips(EMPTY_HEALTH_SETUP_CHIPS)
    }
  }

  const refreshWearableStatus = async () => {
    if (!authHeaders) {
      setFitbitConnected(false)
      setGarminConnected(false)
      return
    }

    try {
      const [fitbitRes, garminRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/fitbit/status`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/garmin/status`, { headers: authHeaders }),
      ])

      if (fitbitRes.ok) {
        const fitbitData: any = await fitbitRes.json().catch(() => ({}))
        setFitbitConnected(fitbitData?.connected === true)
      } else if (fitbitRes.status === 401) {
        setFitbitConnected(false)
      }

      if (garminRes.ok) {
        const garminData: any = await garminRes.json().catch(() => ({}))
        setGarminConnected(garminData?.connected === true)
      } else if (garminRes.status === 401) {
        setGarminConnected(false)
      }
    } catch {
      // Keep current values if network is unstable.
    }
  }

  const refreshDeviceInterest = async () => {
    if (!authHeaders) {
      setDeviceInterest({})
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/user-data`, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (res.ok && data?.data?.deviceInterest && typeof data.data.deviceInterest === 'object') {
        setDeviceInterest(data.data.deviceInterest)
      }
    } catch {
      // Keep the last visible choice during a temporary network problem.
    }
  }

  const toggleDeviceInterest = async (key: DeviceInterestKey) => {
    if (!authHeaders || deviceInterestBusy) return
    const previous = deviceInterest
    const next = { ...previous, [key]: !previous[key] }
    setDeviceInterest(next)
    setDeviceInterestBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/user-data`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ deviceInterest: next }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setDeviceInterest(previous)
      Alert.alert('Could not save', 'Please try again.')
    } finally {
      setDeviceInterestBusy(false)
    }
  }

  const createNativeDeviceOauthTicket = async (provider: WearableProvider) => {
    if (!authHeaders) {
      throw new Error('Not signed in')
    }

    const res = await fetch(`${API_BASE_URL}/api/native-device-oauth-ticket`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider }),
    })

    const data: any = await res.json().catch(() => ({}))
    if (!res.ok || typeof data?.ticket !== 'string' || !data.ticket) {
      throw new Error(String(data?.error || 'Could not start connection'))
    }

    return data.ticket as string
  }

  const handleOauthCompleteUrl = async (url: string) => {
    if (!url || !url.startsWith('helfi://')) return

    let provider: WearableProvider | null = null
    if (!url.includes('oauth-complete')) return
    const match = url.match(/[?&]provider=(fitbit|garmin)\b/i)
    if (match?.[1]) {
      const p = match[1].toLowerCase()
      if (p === 'fitbit' || p === 'garmin') provider = p
    }

    if (!provider) return
    await refreshWearableStatus()
    Alert.alert('Connected', provider === 'fitbit' ? 'Fitbit is now connected.' : 'Garmin Connect is now connected.')
  }

  useEffect(() => {
    let active = true

    Linking.getInitialURL()
      .then((url) => {
        if (!active || !url) return
        void handleOauthCompleteUrl(url)
      })
      .catch(() => {})

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleOauthCompleteUrl(url)
    })

    return () => {
      active = false
      sub.remove()
    }
  }, [authHeaders])

  useFocusEffect(
    React.useCallback(() => {
      // Refresh whenever the dashboard is shown again (ex: coming back from reminders/settings).
      setProfileMenuOpen(false)
      void refreshNativeAccountStatus()
      void refreshLocalMoodReminders()
      void refreshHealthSetupComplete()
      void refreshCreditAndPlan()
      void refreshWearableStatus()
      void refreshDeviceInterest()
      return () => {}
    }, [authHeaders]),
  )

  const goToMore = () => navigation.navigate('More')
  const goToHealthSetup = () => navigation.getParent()?.navigate('HealthSetup')
  const goToDailyCheckIn = () => navigation.getParent()?.navigate('DailyCheckIn', { tab: 'today' })
  const goToMoodTracker = () => navigation.getParent()?.navigate('MoodTracker', { tab: 'checkin' })
  const goToTrackCalories = () => navigation.getParent()?.navigate('TrackCalories')
  const goToWaterIntake = () => navigation.getParent()?.navigate('WaterIntake')
  const goToInsights = () => navigation.navigate('Insights')
  const goToProfile = () => navigation.getParent()?.navigate('Profile')
  const goToProfilePhoto = () => navigation.getParent()?.navigate('ProfilePhoto')
  const goToAccountSettings = () => navigation.getParent()?.navigate('AccountSettings')
  const goToBilling = () => navigation.getParent()?.navigate('Billing')
  const goToNotifications = () => navigation.getParent()?.navigate('Notifications')
  const goToPrivacySettings = () => navigation.getParent()?.navigate('PrivacySettings')
  const goToSupport = () => navigation.getParent()?.navigate('Support')
  const goToPractitioners = () => {
    const parent = navigation.getParent?.()
    if (parent?.navigate) {
      parent.navigate('Practitioners')
      return
    }
    navigation.navigate?.('Practitioners')
  }

  const onPressBilling = () => {
    goToBilling()
  }

  const onPressProfileMenuLogout = () => {
    setProfileMenuOpen(false)
    Alert.alert('Log out?', 'This will take you back to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  const profileInitial = (() => {
    const source = String(accountName || accountEmail || 'U').trim()
    return source ? source.charAt(0).toUpperCase() : 'U'
  })()

  const onDailyCheckIn = () => {
    if (!healthSetupComplete) {
      Alert.alert(
        'Daily Check‑In needs Health Setup',
        'To activate daily check‑ins, please complete your Health Setup first.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Complete Health Setup', onPress: goToHealthSetup },
        ],
      )
      return
    }

    // Health Setup is complete, so open the native Daily Check‑In screen directly.
    goToDailyCheckIn()
  }

  const onMoodTracker = () => {
    // Open instantly first so navigation is never delayed by network.
    goToMoodTracker()
    // Refresh reminder status in the background.
    void checkMoodReminderGate()
  }

  const onAppleHealthConnect = async () => {
    if (!appleHealthAvailable) {
      Alert.alert('Apple Health unavailable', 'Apple Health needs an iPhone or an iPad with iPadOS 17 or later. You can still use food, water, mood, and other tracking.')
      return
    }
    try {
      setAppleHealthBusy(true)
      const summary = await appleHealthConnectAndReadToday()
      // Apple intentionally makes denied read access look like an empty store.
      // Completing the permission dialog is not proof that access was granted.
      if (!((summary.steps ?? 0) > 0 || (summary.distanceKm ?? 0) > 0 || (summary.activeEnergyKcal ?? 0) > 0)) {
        setAppleHealthConnected(false)
        try { await AsyncStorage.setItem(APPLE_HEALTH_CONNECTED_KEY, '0') } catch {}
        Alert.alert('No activity available today', 'There may be no saved activity for today, or Helfi may not have permission to read it. Check Health, Sharing, Apps, Helfi, then try again.')
        return
      }
      setAppleHealthConnected(true)
      try {
        await AsyncStorage.setItem(APPLE_HEALTH_CONNECTED_KEY, '1')
        await AsyncStorage.setItem(APPLE_HEALTH_MODE_KEY, 'real')
      } catch {}
      Alert.alert('Apple Health connected', 'Available activity was read. Import today refreshes it manually; you can also turn on automatic updates below.')
    } catch (e: any) {
      Alert.alert(
        'Apple Health could not connect',
        'Check Helfi’s access in the Health app under Sharing, Apps, then Helfi, and try again. You can keep using ordinary tracking while Health access is unavailable.',
      )
    } finally {
      setAppleHealthBusy(false)
    }
  }

  const onAppleHealthImportToday = async () => {
    if (!appleHealthAvailable) {
      Alert.alert('Apple Health unavailable', 'Apple Health needs an iPhone or an iPad with iPadOS 17 or later. You can still use food, water, mood, and other tracking.')
      return
    }
    if (!session?.token) {
      Alert.alert('Not signed in', 'Please log in again, then try importing.')
      return
    }

    try {
      setAppleHealthBusy(true)
      const result = await healthSync.refresh(true)
      if (!result) return
      const { summary, imported } = result
      if (imported) {
        Alert.alert('Imported', 'Today’s activity was updated in your exercise log.')
      } else if ((summary.steps ?? 0) > 0 || (summary.distanceKm ?? 0) > 0) {
        Alert.alert('Activity read', 'Your steps and distance are available. Apple Health has no active calories available today, so Helfi has not added any exercise calories.')
      } else {
        Alert.alert('No activity available today', 'There may be no saved activity for today, or Helfi may not have permission to read it. Check Health, Sharing, Apps, Helfi, then try again.')
      }
    } catch (e: any) {
      Alert.alert('Import failed', e?.message || 'Please try again.')
    } finally {
      setAppleHealthBusy(false)
    }
  }

  const onFitbitConnect = async () => {
    if (!authHeaders) {
      Alert.alert('Not signed in', 'Please log in again, then try connecting Fitbit.')
      return
    }

    try {
      setFitbitBusy(true)
      const ticket = await createNativeDeviceOauthTicket('fitbit')
      const url = `${API_BASE_URL}/api/auth/fitbit/authorize?nativeTicket=${encodeURIComponent(ticket)}`
      await Linking.openURL(url)
      Alert.alert('Continue in browser', 'Finish Fitbit approval in the browser. You will be returned to the app.')
    } catch (e: any) {
      Alert.alert('Could not connect Fitbit', e?.message || 'Please try again.')
    } finally {
      setFitbitBusy(false)
    }
  }

  const onGarminConnect = async () => {
    if (!authHeaders) {
      Alert.alert('Not signed in', 'Please log in again, then try connecting Garmin Connect.')
      return
    }

    try {
      setGarminBusy(true)
      const ticket = await createNativeDeviceOauthTicket('garmin')
      const url = `${API_BASE_URL}/api/auth/garmin/authorize?nativeTicket=${encodeURIComponent(ticket)}`
      await Linking.openURL(url)
      Alert.alert('Continue in browser', 'Finish Garmin approval in the browser. You will be returned to the app.')
    } catch (e: any) {
      Alert.alert('Could not connect Garmin', e?.message || 'Please try again.')
    } finally {
      setGarminBusy(false)
    }
  }

  const onFitbitDisconnect = () => {
    if (!authHeaders) {
      Alert.alert('Not signed in', 'Please log in again, then try disconnecting.')
      return
    }

    Alert.alert(
      'Disconnect Fitbit?',
      'This will remove your Fitbit connection and synced Fitbit data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              setFitbitBusy(true)
              const res = await fetch(`${API_BASE_URL}/api/fitbit/status`, {
                method: 'DELETE',
                headers: authHeaders,
              })
              const data: any = await res.json().catch(() => ({}))
              if (!res.ok) {
                throw new Error(String(data?.error || 'Could not disconnect Fitbit'))
              }
              setFitbitConnected(false)
              Alert.alert('Fitbit disconnected', 'Your Fitbit account was disconnected.')
            } catch (e: any) {
              Alert.alert('Disconnect failed', e?.message || 'Please try again.')
            } finally {
              setFitbitBusy(false)
            }
          },
        },
      ],
    )
  }

  const onGarminDisconnect = () => {
    if (!authHeaders) {
      Alert.alert('Not signed in', 'Please log in again, then try disconnecting.')
      return
    }

    Alert.alert(
      'Disconnect Garmin Connect?',
      'This will stop Garmin data sync to Helfi.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              setGarminBusy(true)
              const res = await fetch(`${API_BASE_URL}/api/garmin/status`, {
                method: 'DELETE',
                headers: authHeaders,
              })
              const data: any = await res.json().catch(() => ({}))
              if (!res.ok) {
                throw new Error(String(data?.error || 'Could not disconnect Garmin Connect'))
              }
              setGarminConnected(false)
              Alert.alert('Garmin disconnected', 'Your Garmin Connect account was disconnected.')
            } catch (e: any) {
              Alert.alert('Disconnect failed', e?.message || 'Please try again.')
            } finally {
              setGarminBusy(false)
            }
          },
        },
      ],
    )
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: layout.horizontalPadding,
          paddingBottom: theme.spacing.xl,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <VoiceAssistantIconButton size={36} iconSize={18} context={{ section: 'dashboard', title: 'Dashboard' }} />
            <Image source={require('../../assets/helfi-logo.png')} style={{ width: 108, height: 36 }} resizeMode="contain" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Pressable
              onPress={onPressBilling}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              }}
            >
              <Feather name="zap" size={16} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{hasPremiumPlan ? 'Billing' : 'Upgrade'}</Text>
            </Pressable>

            <View style={{ position: 'relative' }}>
              <Pressable
                onPress={() => setProfileMenuOpen((v) => !v)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#EAF5EF',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {accountImage ? (
                  <Image source={{ uri: accountImage }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                ) : (
                  <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{profileInitial}</Text>
                )}
              </Pressable>

              {profileMenuOpen ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 44,
                    right: 0,
                    width: 220,
                    backgroundColor: theme.colors.card,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    zIndex: 30,
                    paddingVertical: 8,
                  }}
                >
                  <View style={{ paddingHorizontal: 12, paddingBottom: 8, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '600' }} numberOfLines={1}>
                      {accountName}
                    </Text>
                    {!!accountEmail ? (
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }} numberOfLines={1}>
                        {accountEmail}
                      </Text>
                    ) : null}
                  </View>

                  <MenuAction label="Profile" onPress={() => { setProfileMenuOpen(false); goToProfile() }} />
                  <MenuAction label="Account Settings" onPress={() => { setProfileMenuOpen(false); goToAccountSettings() }} />
                  <MenuAction label="Upload/Change Profile Photo" onPress={() => { setProfileMenuOpen(false); goToProfilePhoto() }} />
                  <MenuAction label="Subscription & Billing" onPress={() => { setProfileMenuOpen(false); onPressBilling() }} />
                  <MenuAction
                    label="Notifications"
                    onPress={() => {
                      setProfileMenuOpen(false)
                      goToNotifications()
                    }}
                  />
                  <MenuAction label="Privacy Settings" onPress={() => { setProfileMenuOpen(false); goToPrivacySettings() }} />
                  <MenuAction label="Help & Support" onPress={() => { setProfileMenuOpen(false); goToSupport() }} />
                  <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 6 }} />
                  <MenuAction label="Log out" danger onPress={onPressProfileMenuLogout} />
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                flex: 1,
                height: 10,
                borderRadius: 999,
                backgroundColor: '#E6EFEA',
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View style={{ width: `${Math.round(creditsFillPct * 100)}%`, height: '100%', backgroundColor: theme.colors.primary }} />
            </View>

            <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Credits remaining</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 18 }}>{creditsRemaining == null ? '—' : creditsRemaining.toLocaleString()}</Text>
          </View>
        </View>

        <View style={{ marginTop: 22, gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 25, fontWeight: '700', color: theme.colors.text, lineHeight: 31 }}>
            Your health, today
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.muted, lineHeight: 19 }}>
            Decisions today define tomorrow.
          </Text>
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text }}>Daily tools</Text>

            <Pressable accessibilityRole="button" accessibilityLabel="See all daily tools" onPress={goToMore} hitSlop={10} style={{ minHeight: 36, justifyContent: 'center' }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 13 }}>See all</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: layout.gap, marginTop: 6 }}>
            <ToolCard
              title="Daily Check‑In"
              description="Symptoms & habits"
              width={layout.cardWidth}
              icon={<Feather name="check-circle" size={22} color={theme.colors.primary} />}
              accentColor={theme.colors.primary}
              ctaLabel="Start check-in"
              onPress={onDailyCheckIn}
            />
            <ToolCard
              title="Mood Tracker"
              description="Mood, stress & energy"
              width={layout.cardWidth}
              icon={<Feather name="smile" size={22} color="#F59E0B" />}
              accentColor="#E7A83A"
              ctaLabel="Log mood"
              onPress={onMoodTracker}
            />
            <ToolCard
              title="Track Calories"
              description="Meals & daily totals"
              width={layout.cardWidth}
              icon={<MaterialCommunityIcons name="food-apple" size={22} color="#F97316" />}
              accentColor="#E98754"
              ctaLabel="Log food"
              onPress={goToTrackCalories}
            />
            <ToolCard
              title="Water Intake"
              description="Drinks & hydration"
              width={layout.cardWidth}
              // Solid droplet icon (not outline)
              icon={<FontAwesome name="tint" size={20} color="#2563EB" />}
              accentColor="#4F86E6"
              ctaLabel="Add water"
              onPress={goToWaterIntake}
            />
          </View>
        </View>

        {/* Next sections (Dashboard continues below Daily Tools) */}
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text }}>My health</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="See all health tools" onPress={goToMore} hitSlop={10} style={{ minHeight: 36, justifyContent: 'center' }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 13 }}>See all</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 6, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.card, overflow: 'hidden' }}>
            <WideActionCard
              title="Weekly Health Report"
              subtitle="Your weekly health overview"
              icon={<MaterialCommunityIcons name="chart-line" size={18} color={theme.colors.primary} />}
              accentColor={theme.colors.primary}
              actionLabel="View report"
              onPress={goToInsights}
            />

            <WideActionCard
              title="Health Setup"
              subtitle={healthSetupComplete ? 'Review your saved health profile' : 'Unlock check-ins and reports'}
              icon={<Feather name="clipboard" size={18} color="#4F86E6" />}
              accentColor="#4F86E6"
              actionLabel={healthSetupComplete ? 'Review' : 'Continue'}
              onPress={goToHealthSetup}
            />

            <WideActionCard
              title="Find a Practitioner"
              subtitle="Find support that suits you"
              icon={<Feather name="search" size={18} color="#E7A83A" />}
              accentColor="#E7A83A"
              actionLabel="Browse"
              onPress={goToPractitioners}
            />
          </View>
        </View>

        <View style={{ marginTop: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="activity" size={17} color={theme.colors.primary} />
            <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text }}>Your devices</Text>
          </View>
          <Text style={{ marginTop: 5, color: theme.colors.muted, fontSize: 13, lineHeight: 19 }}>Connect activity data for a fuller picture.</Text>
          <View style={{ marginTop: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, backgroundColor: theme.colors.card, overflow: 'hidden' }}>
            {Platform.OS === 'ios' ? (
              <>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingTop: 12,
                    paddingBottom: 4,
                  }}
                >
                  {appleHealthAvailable ? (
                    <Text style={{ color: theme.colors.muted, fontSize: 12, lineHeight: 18 }}>
                      Apple Health uses HealthKit to read steps, walking/running distance and active energy only after your approval. Helfi does not use CareKit.
                    </Text>
                  ) : (
                    <Text style={{ color: theme.colors.muted, fontSize: 12, lineHeight: 18 }}>
                      Apple Health needs an iPhone or an iPad with iPadOS 17 or later. You can still use food, water, mood, check-ins, and reports.
                    </Text>
                  )}
                </View>
                <DeviceRow
                  name="Apple Health"
                  icon={<AppleHealthLogo />}
                  detail={appleHealthAvailable ? (appleHealthConnected ? 'Refresh your activity' : 'Connect with your permission') : 'Requires iPadOS 17 or later.'}
                  rightLabel={!appleHealthAvailable ? 'Unavailable' : appleHealthConnected ? 'Import today' : 'Continue'}
                  rightKind="connect"
                  disabled={appleHealthBusy || healthSync.busy || !appleHealthAvailable}
                  onPress={appleHealthConnected ? onAppleHealthImportToday : onAppleHealthConnect}
                />
                {appleHealthAvailable && (appleHealthConnected || healthSync.enabled) ? (
                  <View style={{ gap: 6, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '700', flex: 1 }}>Update automatically when Helfi opens</Text>
                      <Switch accessibilityLabel="Automatic Apple Health updates" value={healthSync.enabled} onValueChange={value => {
                        if (!value) { void healthSync.setEnabled(false).catch(() => Alert.alert('Could not save setting', 'Automatic updates are stopped for this session. Please try again to save the setting.')); return }
                        Alert.alert('Automatic Apple Health updates', 'Allow Helfi to read your steps, walking/running distance and active calories whenever you open or return to the app, and store daily activity totals in your Helfi account? You can turn this off here or revoke access in Apple Health.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Allow automatic updates', onPress: () => { void healthSync.setEnabled(true).catch(() => Alert.alert('Could not save setting', 'Please try again.')) } },
                        ])
                      }} />
                    </View>
                    <Text style={{ color: theme.colors.muted }}>Refreshes when you open or return to Helfi. Import today remains available for a manual refresh.</Text>
                    <Text style={{ color: theme.colors.muted }}>Activity source: {healthSync.source?.sourceName || 'Apple Health totals'}. Choose a source in Devices.</Text>
                    {healthSync.result ? <Text style={{ color: theme.colors.text }}>
                      {healthSync.result.summary.localDate}: {healthSync.result.summary.steps === null ? 'Steps unavailable' : `${healthSync.result.summary.steps} steps`}
                      {healthSync.result.summary.distanceKm !== null ? ` · ${healthSync.result.summary.distanceKm.toFixed(2)} km` : ''}
                      {healthSync.result.summary.activeEnergyKcal !== null ? ` · ${Number(healthSync.result.summary.activeEnergyKcal.toFixed(2))} active kcal` : ' · No active calories available'}
                    </Text> : null}
                    {healthSync.error ? <Text style={{ color: theme.colors.muted }}>{healthSync.error}</Text> : null}
                  </View>
                ) : null}
              </>
            ) : null}
            <DeviceRow
              name="Fitbit"
              logo={require('../../assets/brands/fitbit.png')}
              rightLabel={fitbitBusy ? 'Working...' : fitbitConnected ? 'Disconnect' : 'Connect'}
              rightKind={fitbitConnected ? 'disconnect' : 'connect'}
              disabled={fitbitBusy}
              onPress={fitbitConnected ? onFitbitDisconnect : onFitbitConnect}
            />
            <DeviceRow
              name="Garmin Connect"
              logo={require('../../assets/brands/garmin-connect.jpg')}
              rightLabel={garminBusy ? 'Working...' : garminConnected ? 'Disconnect' : 'Connect'}
              rightKind={garminConnected ? 'disconnect' : 'connect'}
              disabled={garminBusy}
              onPress={garminConnected ? onGarminDisconnect : onGarminConnect}
            />
            <DeviceRow name="Google Fit" rightLabel={deviceInterest.googleFit ? 'Interested ✓' : "I'm interested"} rightKind="interest" disabled={deviceInterestBusy} onPress={() => void toggleDeviceInterest('googleFit')} />
            <DeviceRow name="Oura Ring" rightLabel={deviceInterest.oura ? 'Interested ✓' : "I'm interested"} rightKind="interest" disabled={deviceInterestBusy} onPress={() => void toggleDeviceInterest('oura')} />
            <DeviceRow name="Polar" rightLabel={deviceInterest.polar ? 'Interested ✓' : "I'm interested"} rightKind="interest" disabled={deviceInterestBusy} onPress={() => void toggleDeviceInterest('polar')} />
            <DeviceRow name="Huawei Health" rightLabel={deviceInterest.huawei ? 'Interested ✓' : "I'm interested"} rightKind="interest" disabled={deviceInterestBusy} onPress={() => void toggleDeviceInterest('huawei')} />
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          {healthSetupComplete ? (
            <StatusCardComplete onPressEdit={goToHealthSetup} chips={healthSetupChips} />
          ) : (
            <StatusCardIncomplete onPressContinue={goToHealthSetup} />
          )}
        </View>

        {mode !== 'signedIn' ? (
          <View style={{ marginTop: theme.spacing.xl, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card }}>
            <Text style={{ fontWeight: '700', color: theme.colors.text }}>You’re signed out</Text>
            <Text style={{ marginTop: 6, color: theme.colors.muted, lineHeight: 20 }}>
              Please go back to the login screen to sign in.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function WideActionCard({
  title,
  subtitle,
  icon,
  accentColor,
  actionLabel,
  onPress,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  accentColor: string
  actionLabel: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${actionLabel}`}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.75 : 1,
        minHeight: 70,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      })}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '600', color: theme.colors.text, fontSize: 15, lineHeight: 21 }}>{title}</Text>
        <Text style={{ marginTop: 2, color: theme.colors.muted, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={accentColor} />
    </Pressable>
  )
}

function MenuAction({
  label,
  onPress,
  danger = false,
}: {
  label: string
  onPress: () => void
  danger?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
      })}
    >
      <Text style={{ color: danger ? '#DC2626' : theme.colors.text, fontWeight: danger ? '800' : '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  )
}

function SmallActionCard({
  title,
  subtitle,
  width,
  icon,
  accentColor,
  onPress,
}: {
  title: string
  subtitle: string
  width: number
  icon: React.ReactNode
  accentColor: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        width,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        padding: 14,
        minHeight: 110,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: '#F1F7F5',
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
        <Text style={{ flex: 1, fontWeight: '700', color: theme.colors.text }} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <Text style={{ marginTop: 10, color: theme.colors.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
        {subtitle}
      </Text>

      <View style={{ marginTop: 'auto', paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontWeight: '700', color: accentColor, fontSize: 12 }}>Open</Text>
        <Feather name="arrow-right" size={14} color={accentColor} />
      </View>
    </Pressable>
  )
}

function DeviceRow({
  name,
  detail,
  logo,
  icon,
  rightLabel,
  rightKind,
  disabled,
  onPress,
}: {
  name: string
  detail?: string
  logo?: ImageSourcePropType
  icon?: React.ReactNode
  rightLabel: string
  rightKind: 'connect' | 'interest' | 'disconnect'
  disabled?: boolean
  onPress: () => void
}) {
  const isConnect = rightKind === 'connect'
  const isDisconnect = rightKind === 'disconnect'
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 8, minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        {icon ? icon : logo ? <Image source={logo} style={{ width: 23, height: 23 }} resizeMode="contain" /> : <Feather name="watch" size={18} color={theme.colors.muted} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '600', color: theme.colors.text, fontSize: 14, lineHeight: 20 }}>{name}</Text>
        {detail ? <Text style={{ marginTop: 2, color: theme.colors.muted, fontSize: 12, lineHeight: 17 }}>{detail}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}: ${rightLabel}`}
        accessibilityState={{ disabled: !!disabled }}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
          minHeight: 44,
          minWidth: 78,
          paddingHorizontal: 10,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 10,
          backgroundColor: isConnect ? theme.colors.primary : isDisconnect ? theme.colors.card : theme.colors.bg,
          borderWidth: isDisconnect ? 1 : 0,
          borderColor: theme.colors.border,
        })}
      >
        <Text style={{ color: isConnect ? '#FFFFFF' : isDisconnect ? theme.colors.danger : theme.colors.muted, fontWeight: '600', fontSize: 12 }}>{rightLabel}</Text>
      </Pressable>
    </View>
  )
}

function AppleHealthLogo() {
  // Apple Health style: heart + pulse line look (close to the Apple Health vibe).
  // Note: we avoid using Apple's exact app icon artwork.
  return <MaterialCommunityIcons name="heart-pulse" size={22} color="#FF2D55" />
}

function StatusCardIncomplete({ onPressContinue }: { onPressContinue: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Complete your health setup. Continue health setup" onPress={onPressContinue}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, backgroundColor: theme.colors.card, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 })}>
      <Feather name="clipboard" size={22} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>Complete your health setup</Text>
        <Text style={{ marginTop: 4, fontSize: 12, color: theme.colors.muted, lineHeight: 18 }}>Finish your profile to unlock check-ins and weekly reports.</Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.colors.primary} />
    </Pressable>
  )
}

function HealthSetupChip({ label }: { label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: '#BCEFD2',
        borderRadius: 999,
        backgroundColor: theme.colors.card,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: theme.colors.primary, fontWeight: '500', fontSize: 12 }}>{label}</Text>
      <Feather name="check" size={13} color={theme.colors.primary} />
    </View>
  )
}

function StatusCardComplete({ onPressEdit, chips }: { onPressEdit: () => void; chips: HealthSetupChips }) {
  const hasChips = chips.medications || chips.supplements

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Health setup complete. Edit health info" onPress={onPressEdit}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, backgroundColor: theme.colors.card, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 14 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="check" size={17} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>Health setup complete</Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: theme.colors.muted, lineHeight: 18 }}>Your profile is saved and synced.</Text>
        </View>
        <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600' }}>Edit</Text>
        <Feather name="chevron-right" size={16} color={theme.colors.primary} />
      </View>
      {hasChips ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginLeft: 40 }}>
          {chips.medications ? <HealthSetupChip label="Medications" /> : null}
          {chips.supplements ? <HealthSetupChip label="Supplements" /> : null}
        </View>
      ) : null}
    </Pressable>
  )
}

function ToolCard({
  title,
  description,
  width,
  icon,
  accentColor,
  ctaLabel,
  onPress,
}: {
  title: string
  description: string
  width: number
  icon: React.ReactNode
  accentColor: string
  ctaLabel: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${ctaLabel}`}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        minHeight: 108,
        padding: 12,
        borderRadius: 16,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <Feather name="arrow-up-right" size={16} color={accentColor} />
      </View>
      <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 20, fontWeight: '600', color: theme.colors.text }}>{title}</Text>
      <Text style={{ marginTop: 2, color: theme.colors.muted, lineHeight: 17, fontSize: 12 }}>{description}</Text>
    </Pressable>
  )
}
