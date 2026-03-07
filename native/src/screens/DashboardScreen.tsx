import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Image, ImageSourcePropType, Linking, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'

import { Feather, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { API_BASE_URL } from '../config'
import { NATIVE_WEB_PAGES, type NativeWebPageRoute } from '../config/nativePageRoutes'
import { useAppMode } from '../state/AppModeContext'
import { appleHealthConnectAndReadToday } from '../health/appleHealth'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

function localDateYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const APPLE_HEALTH_CONNECTED_KEY = 'helfi_apple_health_connected_v1'
const APPLE_HEALTH_MODE_KEY = 'helfi_apple_health_mode_v1' // 'real' | 'sample'
const MOOD_REMINDERS_KEY = 'helfi_reminders_mood_v1'
type WearableProvider = 'fitbit' | 'garmin'

export function DashboardScreen() {
  const { mode, session, signOut } = useAppMode()
  const navigation = useNavigation<any>()
  const { width } = useWindowDimensions()

  const layout = useMemo(() => {
    // Use more of the screen like a real phone app (closer to edges).
    const horizontalPadding = 14
    const gap = 10
    const cardWidth = Math.floor((width - horizontalPadding * 2 - gap) / 2)
    return { horizontalPadding, gap, cardWidth }
  }, [width])

  const [creditsRemaining, setCreditsRemaining] = useState(0)
  const [creditsFillPct, setCreditsFillPct] = useState(0)
  const [hasPremiumPlan, setHasPremiumPlan] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [accountName, setAccountName] = useState('User')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountImage, setAccountImage] = useState<string | null>(null)

  // These start as "unknown/false" until we load from the server / app storage.
  const [healthSetupComplete, setHealthSetupComplete] = useState(false)
  const [moodRemindersSet, setMoodRemindersSet] = useState(false)

  const [appleHealthConnected, setAppleHealthConnected] = useState(false)
  const [appleHealthMode, setAppleHealthMode] = useState<'real' | 'sample'>('real')
  const [appleHealthBusy, setAppleHealthBusy] = useState(false)
  const [fitbitConnected, setFitbitConnected] = useState(false)
  const [fitbitBusy, setFitbitBusy] = useState(false)
  const [garminConnected, setGarminConnected] = useState(false)
  const [garminBusy, setGarminBusy] = useState(false)

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return {
      authorization: `Bearer ${session.token}`,
      'cache-control': 'no-store',
    }
  }, [mode, session?.token])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const v = await AsyncStorage.getItem(APPLE_HEALTH_CONNECTED_KEY)
        if (!cancelled) setAppleHealthConnected(v === '1')
        const mode = await AsyncStorage.getItem(APPLE_HEALTH_MODE_KEY)
        if (!cancelled && (mode === 'real' || mode === 'sample')) setAppleHealthMode(mode)
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
        setCreditsRemaining(0)
        setCreditsFillPct(0)
        setHasPremiumPlan(false)
        return
      }

      const res = await fetch(`${API_BASE_URL}/api/credit/status`, {
        headers: {
          authorization: `Bearer ${session.token}`,
          'cache-control': 'no-store',
        },
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

      const res = await fetch(`${API_BASE_URL}/api/native-account-status`, {
        headers: {
          authorization: `Bearer ${session.token}`,
          'cache-control': 'no-store',
        },
      })

      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) return

      if (typeof data?.name === 'string' && data.name.trim()) setAccountName(data.name.trim())
      if (typeof data?.email === 'string' && data.email.trim()) setAccountEmail(data.email.trim())
      if (typeof data?.image === 'string') setAccountImage(data.image || null)
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
        return
      }

      const res = await fetch(`${API_BASE_URL}/api/native-health-setup-status`, {
        headers: {
          authorization: `Bearer ${session.token}`,
          'x-native-token': session.token,
          'cache-control': 'no-store',
        },
      })

      const data: any = await res.json().catch(() => ({}))
      if (res.ok && typeof data?.complete === 'boolean') {
        setHealthSetupComplete(data.complete)
        return
      }

      // Fallback: compute completion from real onboarding profile data.
      const fallbackRes = await fetch(`${API_BASE_URL}/api/user-data?scope=health-setup`, {
        headers: {
          authorization: `Bearer ${session.token}`,
          'x-native-token': session.token,
          'cache-control': 'no-store',
        },
      })
      const fallbackPayload: any = await fallbackRes.json().catch(() => ({}))
      if (!fallbackRes.ok) {
        setHealthSetupComplete(false)
        return
      }

      const fallbackData = fallbackPayload?.data && typeof fallbackPayload.data === 'object'
        ? fallbackPayload.data
        : fallbackPayload

      const hasBasicProfile = !!(fallbackData?.gender && fallbackData?.weight && fallbackData?.height)
      const hasGoals =
        Array.isArray(fallbackData?.goals) &&
        fallbackData.goals.some((goal: any) => typeof goal === 'string' && goal.trim() && !goal.trim().startsWith('__'))
      setHealthSetupComplete(hasBasicProfile && hasGoals)
    } catch {
      setHealthSetupComplete(false)
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
      return () => {}
    }, [authHeaders]),
  )

  const goToMore = () => navigation.navigate('More')
  const goToHealthSetup = () => navigation.getParent()?.navigate('HealthSetup')
  const openNativeTool = (page: NativeWebPageRoute) => {
    navigation.getParent()?.navigate('NativeWebTool', {
      title: page.title,
      path: page.path,
    })
  }
  const goToDailyCheckIn = () => openNativeTool(NATIVE_WEB_PAGES.dailyCheckIn)
  const goToMoodTracker = () => openNativeTool(NATIVE_WEB_PAGES.moodTracker)
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

  const onPressPlaceholder = (label: string) => {
    Alert.alert(label, 'This will be wired up next.')
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
    if (Platform.OS !== 'ios') return
    try {
      setAppleHealthBusy(true)
      // This triggers the permission prompt. We don’t need the values yet.
      await appleHealthConnectAndReadToday()
      setAppleHealthConnected(true)
      setAppleHealthMode('real')
      try {
        await AsyncStorage.setItem(APPLE_HEALTH_CONNECTED_KEY, '1')
        await AsyncStorage.setItem(APPLE_HEALTH_MODE_KEY, 'real')
      } catch {}
      Alert.alert('Apple Health connected', 'Great. You can now import today’s steps and calories.')
    } catch (e: any) {
      // Simulator usually can’t read real Apple Health data. Offer a sample-data test.
      Alert.alert(
        'Apple Health not available here',
        'This is normal on the simulator. Do you want to use sample data to test the import button?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Use sample data',
            onPress: async () => {
              setAppleHealthMode('sample')
              setAppleHealthConnected(true)
              try {
                await AsyncStorage.setItem(APPLE_HEALTH_CONNECTED_KEY, '1')
                await AsyncStorage.setItem(APPLE_HEALTH_MODE_KEY, 'sample')
              } catch {}
              await onAppleHealthImportSample()
            },
          },
        ],
      )
    } finally {
      setAppleHealthBusy(false)
    }
  }

  const onAppleHealthImportSample = async () => {
    if (Platform.OS !== 'ios') return
    if (!session?.token) {
      Alert.alert('Not signed in', 'Please log in again, then try importing.')
      return
    }

    try {
      setAppleHealthBusy(true)
      const date = localDateYYYYMMDD(new Date())

      const res = await fetch(`${API_BASE_URL}/api/native-exercise-import`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          source: 'APPLE_HEALTH',
          date,
          // Sample data just for testing on simulator:
          steps: 4321,
          distanceKm: 3.2,
          caloriesKcal: 210,
        }),
      })

      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        Alert.alert('Import failed', data?.error ? String(data.error) : 'Please try again.')
        return
      }

      Alert.alert('Imported (sample data)', 'Sample activity was added to your exercise log.')
    } catch (e: any) {
      Alert.alert('Import failed', e?.message || 'Please try again.')
    } finally {
      setAppleHealthBusy(false)
    }
  }

  const onAppleHealthImportToday = async () => {
    if (Platform.OS !== 'ios') return
    if (!session?.token) {
      Alert.alert('Not signed in', 'Please log in again, then try importing.')
      return
    }

    if (appleHealthMode === 'sample') {
      await onAppleHealthImportSample()
      return
    }

    try {
      setAppleHealthBusy(true)
      const summary = await appleHealthConnectAndReadToday()
      const date = localDateYYYYMMDD(new Date())

      const res = await fetch(`${API_BASE_URL}/api/native-exercise-import`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          source: 'APPLE_HEALTH',
          date,
          steps: summary.steps,
          distanceKm: summary.distanceKm,
          caloriesKcal: summary.activeEnergyKcal,
        }),
      })

      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        Alert.alert('Import failed', data?.error ? String(data.error) : 'Please try again.')
        return
      }

      Alert.alert('Imported', 'Today’s activity was added to your exercise log.')
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
          <Image source={require('../../assets/helfi-logo.png')} style={{ width: 108, height: 36 }} resizeMode="contain" />

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
              <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{hasPremiumPlan ? 'Billing' : 'Upgrade'}</Text>
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
                  <Text style={{ fontWeight: '900', color: theme.colors.primary }}>{profileInitial}</Text>
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
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }} numberOfLines={1}>
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

        <View style={{ marginTop: theme.spacing.lg }}>
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
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>{creditsRemaining.toLocaleString()}</Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', marginTop: 22 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>Dashboard</Text>

          {/* Keep this to two lines on phone */}
          <Text style={{ marginTop: 14, fontSize: 32, fontWeight: '900', color: theme.colors.text, textAlign: 'center', lineHeight: 36 }}>
            Welcome to Your
          </Text>
          <Text style={{ fontSize: 32, fontWeight: '900', color: theme.colors.primary, textAlign: 'center', lineHeight: 36 }}>
            Health Dashboard
          </Text>

          <Text style={{ marginTop: 8, fontSize: 16, fontWeight: '800', color: theme.colors.muted, textAlign: 'center' }}>
            Decisions Today Define Tomorrow!
          </Text>
        </View>

        <View style={{ marginTop: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Daily Tools</Text>

            <Pressable onPress={goToMore}>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>See all</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: layout.gap, marginTop: theme.spacing.md }}>
            <ToolCard
              title="Daily Check‑In"
              description="Rate your health issues and track symptoms for today."
              width={layout.cardWidth}
              icon={<Feather name="check-circle" size={22} color={theme.colors.primary} />}
              accentColor={theme.colors.primary}
              ctaLabel="Start check-in"
              onPress={onDailyCheckIn}
            />
            <ToolCard
              title="Mood Tracker"
              description="Track your mood, stress, and energy."
              width={layout.cardWidth}
              icon={<Feather name="smile" size={22} color="#F59E0B" />}
              accentColor="#E7A83A"
              ctaLabel="Log mood"
              onPress={onMoodTracker}
            />
            <ToolCard
              title="Track Calories"
              description="Log meals and view your daily totals."
              width={layout.cardWidth}
              icon={<MaterialCommunityIcons name="food-apple" size={22} color="#F97316" />}
              accentColor="#E98754"
              ctaLabel="Log food"
              onPress={goToTrackCalories}
            />
            <ToolCard
              title="Water Intake"
              description="Log water and stay hydrated today."
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
        <View style={{ marginTop: theme.spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>My Health</Text>
            <Pressable onPress={goToMore}>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>See all</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: theme.spacing.md, gap: 10 }}>
            <WideActionCard
              title="Weekly Health Report"
              subtitle="Generated every 7 days after Health Setup."
              icon={<MaterialCommunityIcons name="chart-line" size={18} color={theme.colors.primary} />}
              accentColor={theme.colors.primary}
              actionLabel="View report"
              onPress={goToInsights}
            />

            <WideActionCard
              title="Health Setup"
              subtitle="Required to unlock daily check-ins and reports."
              icon={<Feather name="clipboard" size={18} color="#4F86E6" />}
              accentColor="#4F86E6"
              actionLabel="Continue"
              onPress={goToHealthSetup}
            />

            <WideActionCard
              title="Find a Practitioner"
              subtitle="Browse practitioners based on your needs."
              icon={<Feather name="search" size={18} color="#E7A83A" />}
              accentColor="#E7A83A"
              actionLabel="Browse"
              onPress={goToPractitioners}
            />
          </View>
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Connect Your Devices</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted, lineHeight: 20 }}>
            Sync activity and sleep data from your favorite wearables.
          </Text>

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="trending-up" size={18} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Enhanced Analytics Available</Text>
          </View>

          <View style={{ marginTop: theme.spacing.md, gap: 10 }}>
            {Platform.OS === 'ios' ? (
              <DeviceRow
                name="Apple Health"
                icon={<AppleHealthLogo />}
                rightLabel={appleHealthConnected ? 'Import today' : 'Connect'}
                rightKind="connect"
                disabled={appleHealthBusy}
                onPress={appleHealthConnected ? onAppleHealthImportToday : onAppleHealthConnect}
              />
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
            <DeviceRow name="Google Fit" rightLabel="I'm interested" rightKind="interest" onPress={() => onPressPlaceholder('Google Fit')} />
            <DeviceRow name="Oura Ring" rightLabel="I'm interested" rightKind="interest" onPress={() => onPressPlaceholder('Oura Ring')} />
            <DeviceRow name="Polar" rightLabel="I'm interested" rightKind="interest" onPress={() => onPressPlaceholder('Polar')} />
            <DeviceRow name="Huawei Health" rightLabel="I'm interested" rightKind="interest" onPress={() => onPressPlaceholder('Huawei Health')} />
          </View>
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          {healthSetupComplete ? (
            <StatusCardComplete onPressEdit={goToHealthSetup} />
          ) : (
            <StatusCardIncomplete onPressContinue={goToHealthSetup} />
          )}
        </View>

        {mode !== 'signedIn' ? (
          <View style={{ marginTop: theme.spacing.xl, padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card }}>
            <Text style={{ fontWeight: '900', color: theme.colors.text }}>You’re signed out</Text>
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
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#F1F7F5',
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '900', color: theme.colors.text, fontSize: 15 }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>

      <View
        style={{
          height: 32,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: `${accentColor}66`,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: '900', color: accentColor, fontSize: 12 }} numberOfLines={1}>
          {actionLabel}
        </Text>
        <Feather name="chevron-right" size={16} color={accentColor} />
      </View>
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
        <Text style={{ flex: 1, fontWeight: '900', color: theme.colors.text }} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <Text style={{ marginTop: 10, color: theme.colors.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
        {subtitle}
      </Text>

      <View style={{ marginTop: 'auto', paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontWeight: '900', color: accentColor, fontSize: 12 }}>Open</Text>
        <Feather name="arrow-right" size={14} color={accentColor} />
      </View>
    </Pressable>
  )
}

function DeviceRow({
  name,
  logo,
  icon,
  rightLabel,
  rightKind,
  disabled,
  onPress,
}: {
  name: string
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
    <View
      style={{
        backgroundColor: '#F3F6F5',
        borderRadius: theme.radius.lg,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon ? (
            icon
          ) : logo ? (
            <Image source={logo} style={{ width: 22, height: 22 }} resizeMode="contain" />
          ) : (
            <Feather name="watch" size={18} color={theme.colors.muted} />
          )}
        </View>
        <Text style={{ fontWeight: '900', color: theme.colors.text, fontSize: 16 }} numberOfLines={1}>
          {name}
        </Text>
      </View>

      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 999,
          backgroundColor: isConnect ? theme.colors.primary : isDisconnect ? '#DC2626' : '#D8DEE4',
        })}
      >
        <Text style={{ color: isConnect || isDisconnect ? '#FFFFFF' : '#485563', fontWeight: '900' }}>{rightLabel}</Text>
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
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>Complete Your Health Setup</Text>
      <Text style={{ marginTop: 8, color: theme.colors.muted, lineHeight: 20 }}>
        Finish your health profile to unlock daily check-ins and weekly health reports.
      </Text>

      <Pressable
        onPress={onPressContinue}
        style={({ pressed }) => ({
          marginTop: 14,
          backgroundColor: theme.colors.primary,
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Continue Health Setup</Text>
      </Pressable>
    </View>
  )
}

function StatusCardComplete({ onPressEdit }: { onPressEdit: () => void }) {
  return (
    <View
      style={{
        backgroundColor: '#E9FBF1',
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: '#BCEFD2',
        padding: 16,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="check" size={28} color="#FFFFFF" />
      </View>

      <Text style={{ marginTop: 14, fontSize: 26, fontWeight: '900', color: theme.colors.text, textAlign: 'center' }}>
        Onboarding Complete
      </Text>
      <Text style={{ marginTop: 8, color: theme.colors.muted, lineHeight: 20, textAlign: 'center' }}>
        Your health profile has been successfully created and synced across your connected devices.
      </Text>

      <Pressable
        onPress={onPressEdit}
        style={({ pressed }) => ({
          marginTop: 16,
          backgroundColor: theme.colors.primary,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 16,
          width: '100%',
          alignItems: 'center',
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Edit Health Info</Text>
      </Pressable>
    </View>
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
      onPress={onPress}
      style={{
        width,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 12,
        minHeight: 164,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 18,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#F1F7F5',
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '900', color: theme.colors.text }} numberOfLines={2}>
          {title}
        </Text>
      </View>

      <Text style={{ marginTop: 8, color: theme.colors.muted, lineHeight: 16, fontSize: 12 }} numberOfLines={2}>
        {description}
      </Text>

      <Pressable
        onPress={onPress}
        style={{
          marginTop: 'auto',
          height: 32,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: `${accentColor}66`,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Text
          style={{ fontWeight: '900', color: accentColor, fontSize: 12, letterSpacing: 0.2 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {ctaLabel}
        </Text>
        <Feather name="arrow-right" size={14} color={accentColor} />
      </Pressable>
    </Pressable>
  )
}
