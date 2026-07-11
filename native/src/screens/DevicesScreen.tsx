import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, ImageSourcePropType, Linking, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'

import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type WearableProvider = 'fitbit' | 'garmin'
type InterestKey = 'googleFit' | 'oura' | 'polar' | 'huawei'

type DeviceInterest = Partial<Record<InterestKey | 'garmin', boolean>>

function StatusPill({ connected }: { connected: boolean }) {
  if (!connected) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' }} />
      <Text style={{ color: '#17803A', fontWeight: '600', fontSize: 12 }}>Connected</Text>
    </View>
  )
}

function ActionButton({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string
  onPress: () => void
  kind?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}) {
  const backgroundColor = kind === 'primary' ? theme.colors.primary : kind === 'danger' ? '#FEE2E2' : '#F1F5F3'
  const borderColor = kind === 'danger' ? '#FCA5A5' : kind === 'secondary' ? theme.colors.border : theme.colors.primary
  const color = kind === 'primary' ? theme.colors.primaryText : kind === 'danger' ? theme.colors.danger : theme.colors.text

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        paddingVertical: 11,
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  )
}

function WearableCard({
  title,
  subtitle,
  disconnectedText,
  connectedText,
  logo,
  icon,
  connected,
  busy,
  onConnect,
  onDisconnect,
}: {
  title: string
  subtitle: string
  disconnectedText: string
  connectedText: string
  logo?: ImageSourcePropType
  icon?: React.ReactNode
  connected: boolean
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', flex: 1, gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F7F5', overflow: 'hidden' }}>
            {logo ? <Image source={logo} style={{ width: 44, height: 44 }} resizeMode="cover" /> : icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '700' }}>{title}</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 3, lineHeight: 19 }}>{subtitle}</Text>
          </View>
        </View>
        <StatusPill connected={connected} />
      </View>

      <View style={{ backgroundColor: '#F6F8F7', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 13 }}>
        <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
          {connected ? connectedText : disconnectedText}
        </Text>
      </View>

      <ActionButton
        label={busy ? (connected ? 'Disconnect' : 'Connecting...') : connected ? 'Disconnect' : `Connect ${title}`}
        kind={connected ? 'danger' : 'primary'}
        disabled={busy}
        onPress={connected ? onDisconnect : onConnect}
      />
    </View>
  )
}

function InterestCard({
  title,
  detail,
  icon,
  selected,
  busy,
  onPress,
}: {
  title: string
  detail: string
  icon: React.ReactNode
  selected: boolean
  busy: boolean
  onPress: () => void
}) {
  return (
    <View style={{ flex: 1, minWidth: 190, backgroundColor: selected ? '#EEF9F0' : '#F6F8F7', borderRadius: theme.radius.md, borderWidth: 1, borderColor: selected ? '#A7DDB0' : theme.colors.border, padding: 14, gap: 9 }}>
      <View style={{ alignItems: 'center', gap: 5 }}>
        <View style={{ height: 34, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <Text style={{ color: theme.colors.text, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
        <Text style={{ color: theme.colors.muted, fontSize: 12, textAlign: 'center' }}>{detail}</Text>
      </View>
      <ActionButton label={selected ? 'Interested' : "I'm interested"} kind={selected ? 'primary' : 'secondary'} disabled={busy} onPress={onPress} />
    </View>
  )
}

export function DevicesScreen() {
  const { mode, session } = useAppMode()
  const { width } = useWindowDimensions()
  const [loading, setLoading] = useState(true)
  const [fitbitConnected, setFitbitConnected] = useState(false)
  const [garminConnected, setGarminConnected] = useState(false)
  const [fitbitBusy, setFitbitBusy] = useState(false)
  const [garminBusy, setGarminBusy] = useState(false)
  const [interest, setInterest] = useState<DeviceInterest>({})
  const [savingInterest, setSavingInterest] = useState(false)

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const contentPadding = width >= 700 ? 32 : 14

  const loadDeviceStatus = useCallback(async () => {
    if (!authHeaders) {
      setFitbitConnected(false)
      setGarminConnected(false)
      setInterest({})
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [fitbitRes, garminRes, userDataRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/fitbit/status`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/garmin/status`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/user-data`, { headers: authHeaders }),
      ])

      if (fitbitRes.ok) {
        const data: any = await fitbitRes.json().catch(() => ({}))
        setFitbitConnected(data?.connected === true)
      }

      if (garminRes.ok) {
        const data: any = await garminRes.json().catch(() => ({}))
        setGarminConnected(data?.connected === true)
      }

      if (userDataRes.ok) {
        const data: any = await userDataRes.json().catch(() => ({}))
        if (data?.data?.deviceInterest && typeof data.data.deviceInterest === 'object') {
          setInterest(data.data.deviceInterest)
        }
      }
    } catch {
      // Keep the last visible state if the network is unstable.
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  useFocusEffect(
    useCallback(() => {
      void loadDeviceStatus()
      return () => {}
    }, [loadDeviceStatus]),
  )

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (String(url || '').includes('oauth-complete')) {
        void loadDeviceStatus()
      }
    })
    return () => sub.remove()
  }, [loadDeviceStatus])

  const createNativeDeviceOauthTicket = async (provider: WearableProvider) => {
    if (!authHeaders) throw new Error('Not signed in')

    const res = await fetch(`${API_BASE_URL}/api/native-device-oauth-ticket`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    })

    const data: any = await res.json().catch(() => ({}))
    if (!res.ok || typeof data?.ticket !== 'string' || !data.ticket) {
      throw new Error(String(data?.error || 'Could not start connection'))
    }
    return data.ticket as string
  }

  const connectProvider = async (provider: WearableProvider) => {
    if (!authHeaders) {
      Alert.alert('Not signed in', `Please log in again, then try connecting ${provider === 'fitbit' ? 'Fitbit' : 'Garmin Connect'}.`)
      return
    }

    const setBusy = provider === 'fitbit' ? setFitbitBusy : setGarminBusy
    try {
      setBusy(true)
      const ticket = await createNativeDeviceOauthTicket(provider)
      const path = provider === 'fitbit' ? 'fitbit' : 'garmin'
      const url = `${API_BASE_URL}/api/auth/${path}/authorize?nativeTicket=${encodeURIComponent(ticket)}`
      await Linking.openURL(url)
      Alert.alert('Continue in browser', `Finish ${provider === 'fitbit' ? 'Fitbit' : 'Garmin Connect'} approval in the browser. You will be returned to Helfi.`)
    } catch (e: any) {
      Alert.alert('Could not connect', e?.message || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const disconnectProvider = (provider: WearableProvider) => {
    if (!authHeaders) {
      Alert.alert('Not signed in', 'Please log in again, then try disconnecting.')
      return
    }

    const label = provider === 'fitbit' ? 'Fitbit' : 'Garmin Connect'
    Alert.alert(
      `Disconnect ${label}?`,
      provider === 'fitbit' ? 'This will remove your Fitbit connection and synced Fitbit data.' : 'This will stop Garmin data sync to Helfi.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            const setBusy = provider === 'fitbit' ? setFitbitBusy : setGarminBusy
            try {
              setBusy(true)
              const endpoint = provider === 'fitbit' ? 'fitbit' : 'garmin'
              const res = await fetch(`${API_BASE_URL}/api/${endpoint}/status`, { method: 'DELETE', headers: authHeaders })
              const data: any = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error(String(data?.error || `Could not disconnect ${label}`))
              if (provider === 'fitbit') setFitbitConnected(false)
              else setGarminConnected(false)
              Alert.alert(`${label} disconnected`, `Your ${label} account was disconnected.`)
            } catch (e: any) {
              Alert.alert('Disconnect failed', e?.message || 'Please try again.')
            } finally {
              setBusy(false)
            }
          },
        },
      ],
    )
  }

  const toggleInterest = async (key: InterestKey) => {
    if (!authHeaders) {
      Alert.alert('Not signed in', 'Please log in again, then try saving interest.')
      return
    }
    const next = { ...interest, [key]: !interest[key] }
    setInterest(next)
    try {
      setSavingInterest(true)
      const res = await fetch(`${API_BASE_URL}/api/user-data`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ deviceInterest: next }),
      })
      if (!res.ok) throw new Error('Device interest update failed')
    } catch (e: any) {
      setInterest(interest)
      Alert.alert('Could not save interest', e?.message || 'Please try again.')
    } finally {
      setSavingInterest(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: contentPadding, paddingBottom: theme.spacing.xl }}>
        <Text style={{ color: theme.colors.muted, lineHeight: 21, marginBottom: theme.spacing.md }}>
          Connect your fitness devices to sync activity, sleep, and health data into Helfi.
        </Text>

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 18 }}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={{ marginTop: 8, color: theme.colors.muted }}>Loading devices...</Text>
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.md }}>
          <WearableCard
            title="Fitbit"
            subtitle="Activity, heart rate, sleep, and weight tracking"
            disconnectedText="Connect your Fitbit account to automatically sync your activity, heart rate, sleep, and weight data."
            connectedText="Your Fitbit account is connected. Data will sync automatically, or you can manually sync below."
            logo={require('../../assets/brands/fitbit.png')}
            connected={fitbitConnected}
            busy={fitbitBusy}
            onConnect={() => connectProvider('fitbit')}
            onDisconnect={() => disconnectProvider('fitbit')}
          />

          <WearableCard
            title="Garmin Connect"
            subtitle="Connect Garmin Connect to start receiving wellness data via secure webhooks."
            disconnectedText="Connect your Garmin Connect account to allow Helfi to receive daily, sleep, and activity data directly from Garmin Connect."
            connectedText="Garmin Connect is connected. Data will be delivered automatically via webhooks and logged for processing."
            logo={require('../../assets/brands/garmin-connect.jpg')}
            connected={garminConnected}
            busy={garminBusy}
            onConnect={() => connectProvider('garmin')}
            onDisconnect={() => disconnectProvider('garmin')}
          />

          <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 14 }}>Other devices under review</Text>
            <View style={{ flexDirection: width >= 700 ? 'row' : 'column', gap: 12 }}>
              <InterestCard
                title="Google Fit"
                detail="Android fitness"
                icon={<MaterialCommunityIcons name="run" size={30} color={theme.colors.muted} />}
                selected={interest.googleFit === true}
                busy={savingInterest}
                onPress={() => toggleInterest('googleFit')}
              />
              <InterestCard
                title="Oura Ring"
                detail="Recovery & sleep"
                icon={<MaterialCommunityIcons name="ring" size={30} color={theme.colors.muted} />}
                selected={interest.oura === true}
                busy={savingInterest}
                onPress={() => toggleInterest('oura')}
              />
              <InterestCard
                title="Polar"
                detail="Training insights"
                icon={<Feather name="compass" size={30} color={theme.colors.muted} />}
                selected={interest.polar === true}
                busy={savingInterest}
                onPress={() => toggleInterest('polar')}
              />
              <InterestCard
                title="Huawei Health"
                detail="Activity & wellness"
                icon={<MaterialCommunityIcons name="heart-pulse" size={30} color={theme.colors.muted} />}
                selected={interest.huawei === true}
                busy={savingInterest}
                onPress={() => toggleInterest('huawei')}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}
