import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { openNativeSubscriptionManagement, restoreNativePurchases, runNativePurchase, type NativeBillingCatalogProduct, type NativePurchaseCode } from '../lib/inAppPurchase'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type CreditState = {
  loading: boolean
  error: string
  planName: string
  creditsRemaining: number
  percentUsed: number
  refreshAt: string | null
}

type SubscriptionData = {
  id: string
  tier: string
  credits: number
  monthlyPriceCents: number | null
  stripeCancelAtPeriodEnd?: boolean
  stripeCurrentPeriodEnd?: string | null
  source?: string | null
}

type RangeKey = '7d' | '1m' | '2m' | '6m' | 'all' | 'custom'

type BillingHistoryItem = {
  id: string
  title: string
  subtitle: string
  amountText: string
  status: string
  occurredAt: string
}

const defaultCredits: CreditState = {
  loading: true,
  error: '',
  planName: 'FREE',
  creditsRemaining: 0,
  percentUsed: 0,
  refreshAt: null,
}

const creditDisplayList = [
  { label: 'Food photo analysis', key: 'foodAnalysis', credits: 10 },
  { label: 'Insights generation', key: 'insightsGeneration', credits: 7 },
  { label: 'Talk to Helfi chat', key: 'chatLight', credits: 10 },
]

const planCards = [
  { plan: 'plan_10_monthly', title: '$10 / month', wallet: 'Monthly wallet: 700 credits', buttonLabel: 'Choose $10 Plan', popular: false, dark: false },
  { plan: 'plan_20_monthly', title: '$20 / month', wallet: 'Monthly wallet: 1,400 credits', buttonLabel: 'Choose $20 Plan', popular: false, dark: false },
  { plan: 'plan_30_monthly', title: '$30 / month', wallet: 'Monthly wallet: 2,100 credits', buttonLabel: 'Choose $30 Plan', popular: true, dark: false },
  { plan: 'plan_50_monthly', title: '$50 / month', wallet: 'Monthly wallet: 3,500 credits', buttonLabel: 'Choose $50 Plan', popular: false, dark: true },
] as const

const topUpCards = [
  { plan: 'credits_250', title: 'Try with $5 (250 credits)', desc: 'One-time top-up. Credits valid for 12 months.', buttonLabel: 'Buy $5 Credits' },
  { plan: 'credits_500', title: '$10 (500 credits)', desc: 'One-time top-up. Credits valid for 12 months.', buttonLabel: 'Buy $10 Credits' },
  { plan: 'credits_1000', title: '$20 (1,000 credits)', desc: 'One-time top-up. Credits valid for 12 months.', buttonLabel: 'Buy $20 Credits' },
] as const

const TERMS_URL = 'https://helfi.ai/terms'
const PRIVACY_URL = 'https://helfi.ai/privacy'

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatHistoryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function openExternalUrl(url: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert('Could not open link', 'Please try again.')
  })
}

function ActionButton({
  label,
  onPress,
  disabled,
  kind = 'primary',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  kind?: 'primary' | 'secondary' | 'danger' | 'dark'
}) {
  const colors = {
    primary: { bg: theme.colors.primary, fg: theme.colors.primaryText, border: theme.colors.primary },
    secondary: { bg: '#F3F4F6', fg: '#374151', border: '#D1D5DB' },
    danger: { bg: '#EF4444', fg: '#FFFFFF', border: '#EF4444' },
    dark: { bg: '#111827', fg: '#FFFFFF', border: '#111827' },
  }[kind]

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: colors.bg,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
        paddingVertical: 11,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text style={{ color: colors.fg, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  )
}

function PlanCard({
  title,
  wallet,
  buttonLabel,
  loading,
  popular,
  dark,
  onPress,
}: {
  title: string
  wallet: string
  buttonLabel: string
  loading: boolean
  popular?: boolean
  dark?: boolean
  onPress: () => void
}) {
  return (
    <View
      style={{
        borderWidth: popular ? 2 : 1,
        borderColor: popular ? theme.colors.primary : theme.colors.border,
        borderRadius: 16,
        backgroundColor: theme.colors.card,
        padding: 16,
      }}
    >
      {popular ? (
        <View style={{ alignSelf: 'center', marginBottom: 8, backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>Most Popular</Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>{title}</Text>
      <Text style={{ marginTop: 8, color: theme.colors.text, fontWeight: '800' }}>{wallet}</Text>
      <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>Credits refresh monthly. No rollover.</Text>

      <View style={{ marginTop: 12, gap: 6 }}>
        <Text style={{ color: theme.colors.muted }}>- All features unlocked</Text>
        <Text style={{ color: theme.colors.muted }}>- Percentage-based usage meter</Text>
        <Text style={{ color: theme.colors.muted }}>- Top-ups valid 12 months</Text>
      </View>

      <View style={{ marginTop: 14 }}>
        <ActionButton label={loading ? 'Processing...' : buttonLabel} onPress={onPress} disabled={loading} kind={dark ? 'dark' : 'primary'} />
      </View>
    </View>
  )
}

function TopUpCard({
  title,
  desc,
  buttonLabel,
  loading,
  onPress,
}: {
  title: string
  desc: string
  buttonLabel: string
  loading: boolean
  onPress: () => void
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.card,
        padding: 12,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>{title}</Text>
      <Text style={{ marginTop: 6, color: theme.colors.muted }}>{desc}</Text>
      <View style={{ marginTop: 12 }}>
        <ActionButton label={loading ? 'Processing...' : buttonLabel} onPress={onPress} disabled={loading} kind="primary" />
      </View>
    </View>
  )
}

export function BillingScreen() {
  const { mode, session } = useAppMode()
  const [credits, setCredits] = useState<CreditState>(defaultCredits)
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [loadingSubscription, setLoadingSubscription] = useState(true)

  const [isCreatingPortalSession, setIsCreatingPortalSession] = useState(false)
  const [isManagingSubscription, setIsManagingSubscription] = useState(false)
  const [isCreatingCheckout, setIsCreatingCheckout] = useState<string | null>(null)
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false)
  const [nativeProducts, setNativeProducts] = useState<NativeBillingCatalogProduct[]>([])

  const [usageRange, setUsageRange] = useState<RangeKey>('7d')
  const [usageStart, setUsageStart] = useState('')
  const [usageEnd, setUsageEnd] = useState('')
  const [usageStats, setUsageStats] = useState<Record<string, number> | null>(null)
  const [usageStatsLoading, setUsageStatsLoading] = useState(false)
  const [usageStatsError, setUsageStatsError] = useState('')
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([])
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(false)
  const [billingHistoryError, setBillingHistoryError] = useState('')

  const authHeaders = useMemo(() => {
    if (!session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [session?.token])

  const fetchCreditStatus = useCallback(async () => {
    if (mode !== 'signedIn' || !authHeaders) {
      setCredits({ ...defaultCredits, loading: false, error: 'Please log in again.' })
      return
    }

    const res = await fetch(`${API_BASE_URL}/api/credit/status`, { headers: authHeaders })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error || 'Could not load billing')
    }

    setCredits({
      loading: false,
      error: '',
      planName: String(data?.plan || 'FREE').toUpperCase(),
      creditsRemaining: Number.isFinite(Number(data?.credits?.total)) ? Math.max(0, Number(data.credits.total)) : 0,
      percentUsed: Number.isFinite(Number(data?.percentUsed)) ? Math.max(0, Math.min(100, Number(data.percentUsed))) : 0,
      refreshAt: typeof data?.refreshAt === 'string' ? data.refreshAt : null,
    })
  }, [authHeaders, mode])

  const fetchSubscription = useCallback(async () => {
    if (mode !== 'signedIn' || !authHeaders) {
      setLoadingSubscription(false)
      setHasActiveSubscription(false)
      setSubscription(null)
      return
    }

    setLoadingSubscription(true)
    const res = await fetch(`${API_BASE_URL}/api/billing/subscription`, { headers: authHeaders })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.message || data?.error || 'Could not load subscription')
    }

    const isActive = !!data?.hasSubscription && !!data?.isActive
    setHasActiveSubscription(isActive)
    setSubscription(isActive ? (data?.subscription as SubscriptionData) : null)
    setLoadingSubscription(false)
  }, [authHeaders, mode])

  const fetchBillingHistory = useCallback(async () => {
    if (mode !== 'signedIn' || !authHeaders) {
      setBillingHistory([])
      setBillingHistoryLoading(false)
      return
    }

    setBillingHistoryLoading(true)
    setBillingHistoryError('')
    const res = await fetch(`${API_BASE_URL}/api/native-billing/history`, { headers: authHeaders })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.message || data?.error || 'Could not load billing history')
    }
    setBillingHistory(Array.isArray(data?.history) ? data.history : [])
    setBillingHistoryLoading(false)
  }, [authHeaders, mode])

  const fetchNativeCatalog = useCallback(async () => {
    if (mode !== 'signedIn' || !authHeaders) {
      setNativeProducts([])
      return []
    }

    const res = await fetch(`${API_BASE_URL}/api/native-billing/catalog`, { headers: authHeaders })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.message || data?.error || 'Could not load store products')
    }

    const products = Array.isArray(data?.products) ? (data.products as NativeBillingCatalogProduct[]) : []
    setNativeProducts(products)
    return products
  }, [authHeaders, mode])

  const loadBillingData = useCallback(async () => {
    try {
      setCredits((prev) => ({ ...prev, loading: true, error: '' }))
      await Promise.all([
        fetchCreditStatus(),
        fetchSubscription(),
        fetchBillingHistory(),
        fetchNativeCatalog().catch(() => []),
      ])
    } catch (error: any) {
      setCredits((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || 'Could not load billing.',
      }))
      setLoadingSubscription(false)
      setBillingHistoryLoading(false)
      setBillingHistoryError(error?.message || 'Could not load billing history.')
    }
  }, [fetchBillingHistory, fetchCreditStatus, fetchNativeCatalog, fetchSubscription])

  useFocusEffect(
    useCallback(() => {
      void loadBillingData()
      return () => {}
    }, [loadBillingData]),
  )

  useEffect(() => {
    if (mode !== 'signedIn' || !authHeaders) return
    let cancelled = false

    const loadUsage = async () => {
      try {
        setUsageStatsLoading(true)
        setUsageStatsError('')
        if (usageRange === 'custom' && (!usageStart || !usageEnd)) {
          const now = new Date()
          const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          if (!usageStart) setUsageStart(toDateInputValue(start))
          if (!usageEnd) setUsageEnd(toDateInputValue(now))
          setUsageStatsLoading(false)
          return
        }

        const params = new URLSearchParams()
        params.set('range', usageRange)
        if (usageRange === 'custom') {
          params.set('start', usageStart)
          params.set('end', usageEnd)
        }

        const res = await fetch(`${API_BASE_URL}/api/credit/feature-usage-stats?${params.toString()}`, {
          headers: authHeaders,
        })
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || 'Could not load usage stats')
        }
        if (!cancelled) setUsageStats(data?.usage || null)
      } catch (error: any) {
        if (!cancelled) {
          setUsageStats(null)
          setUsageStatsError(error?.message || 'Could not load usage stats')
        }
      } finally {
        if (!cancelled) setUsageStatsLoading(false)
      }
    }

    void loadUsage()
    return () => {
      cancelled = true
    }
  }, [authHeaders, mode, usageEnd, usageRange, usageStart])

  const openExternalUrl = async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Could not open', 'Please try again.')
    }
  }

  const startCheckout = async (plan: NativePurchaseCode) => {
    try {
      if (mode !== 'signedIn' || !session?.token) {
        Alert.alert('Not signed in', 'Please log in again and try.')
        return
      }
      setIsCreatingCheckout(plan)
      const kind = plan.startsWith('credits_') ? 'topup' : 'subscription'
      const result = await runNativePurchase({
        code: plan,
        kind,
        token: session.token,
      })
      Alert.alert('Purchase complete', result.message)
      await loadBillingData()
    } catch (error: any) {
      const storeName = Platform.OS === 'ios' ? 'App Store' : Platform.OS === 'android' ? 'Google Play' : 'store'
      Alert.alert(`${storeName} purchase error`, error?.message || 'Please try again.')
    } finally {
      setIsCreatingCheckout(null)
    }
  }

  const handleManagePortal = async () => {
    try {
      if (mode !== 'signedIn' || !authHeaders) {
        Alert.alert('Not signed in', 'Please log in again and try.')
        return
      }
      setIsCreatingPortalSession(true)
      if (Platform.OS === 'ios') {
        try {
          await openNativeSubscriptionManagement()
          const products = nativeProducts.length > 0 ? nativeProducts : await fetchNativeCatalog()
          if (session?.token) {
            await restoreNativePurchases({
              token: session.token,
              products,
            }).catch(() => null)
          }
          await loadBillingData()
        } catch (error: any) {
          Alert.alert(
            'Apple subscription settings',
            error?.message ||
              'Open iPhone Settings, go to Developer, then Sandbox Apple Account to manage TestFlight sandbox subscriptions.',
          )
        }
        return
      }
      const res = await fetch(`${API_BASE_URL}/api/billing/portal`, {
        method: 'POST',
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        throw new Error(data?.message || data?.error || 'Could not open subscription management')
      }
      await openExternalUrl(String(data.url))
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not open subscription management.')
    } finally {
      setIsCreatingPortalSession(false)
    }
  }

  const handleChangePlan = async (newPlan: string, action: 'upgrade' | 'downgrade') => {
    try {
      if (mode !== 'signedIn' || !authHeaders) {
        Alert.alert('Not signed in', 'Please log in again and try.')
        return
      }
      if (Platform.OS === 'ios') {
        await startCheckout(newPlan as NativePurchaseCode)
        return
      }
      setIsManagingSubscription(true)
      const res = await fetch(`${API_BASE_URL}/api/billing/subscription`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action, newPlan }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Failed to ${action} subscription`)
      }
      Alert.alert('Success', data?.message || `Subscription ${action} completed.`)
      await loadBillingData()
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Please try again.')
    } finally {
      setIsManagingSubscription(false)
    }
  }

  const confirmCancelSubscription = async () => {
    try {
      if (mode !== 'signedIn' || !authHeaders) {
        Alert.alert('Not signed in', 'Please log in again and try.')
        return
      }

      setIsManagingSubscription(true)
      const res = await fetch(`${API_BASE_URL}/api/billing/subscription`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to cancel subscription')
      }

      let message = String(data?.message || 'Subscription canceled successfully')
      if (data?.cancellationDate) {
        const d = new Date(String(data.cancellationDate))
        message = `Your subscription stays active until ${d.toLocaleDateString()}.`
      }
      Alert.alert('Subscription canceled', message)
      await loadBillingData()
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to cancel subscription')
    } finally {
      setIsManagingSubscription(false)
    }
  }

  const handleCancelSubscription = () => {
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Cancel in App Store',
        'Use Apple subscription settings to cancel this plan.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open App Store', onPress: () => void handleManagePortal() },
        ],
      )
      return
    }

    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel? It will stay active until the end of your current billing period.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: () => void confirmCancelSubscription() },
      ],
    )
  }

  const handleRestorePurchases = async () => {
    try {
      if (mode !== 'signedIn' || !session?.token) {
        Alert.alert('Not signed in', 'Please log in again and try.')
        return
      }
      setIsRestoringPurchases(true)
      const products = nativeProducts.length > 0 ? nativeProducts : await fetchNativeCatalog()
      const result = await restoreNativePurchases({
        token: session.token,
        products,
      })
      Alert.alert('Restore purchases', result.message)
      await loadBillingData()
    } catch (error: any) {
      const storeName = Platform.OS === 'ios' ? 'App Store' : Platform.OS === 'android' ? 'Google Play' : 'store'
      Alert.alert(`${storeName} restore error`, error?.message || 'Please try again.')
    } finally {
      setIsRestoringPurchases(false)
    }
  }

  const currentPrice = Number(subscription?.monthlyPriceCents || 0)
  const fillPct = Math.max(0, Math.min(1, 1 - credits.percentUsed / 100))
  const isPremium = credits.planName === 'PREMIUM'

  const rangeButton = (key: RangeKey, label: string) => (
    <Pressable
      key={key}
      onPress={() => setUsageRange(key)}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: usageRange === key ? theme.colors.primary : theme.colors.border,
        backgroundColor: usageRange === key ? '#EAF5EF' : theme.colors.card,
      }}
    >
      <Text style={{ color: usageRange === key ? theme.colors.primary : theme.colors.muted, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
  )

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
          <Text style={{ fontSize: theme.fontSize.pageTitle, fontWeight: '900', color: theme.colors.text }}>Subscription & Billing</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>Matches your web account billing.</Text>

          {credits.loading ? (
            <View style={{ marginTop: 18, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading billing...</Text>
            </View>
          ) : null}

          {!credits.loading && credits.error ? (
            <View style={{ marginTop: 14, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 12 }}>
              <Text style={{ color: '#991B1B', fontWeight: '700' }}>{credits.error}</Text>
            </View>
          ) : null}

          {!credits.loading && !credits.error ? (
            <>
              <View style={{ marginTop: 16, backgroundColor: '#F6FAF7', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Current plan</Text>
                <Text style={{ marginTop: 4, fontSize: 20, fontWeight: '900', color: theme.colors.text }}>{isPremium ? 'Premium' : 'Free'}</Text>
                <Text style={{ marginTop: 2, color: theme.colors.muted }}>Credits remaining: {credits.creditsRemaining.toLocaleString()}</Text>
                {credits.refreshAt ? (
                  <Text style={{ marginTop: 2, color: theme.colors.muted }}>
                    Resets: {new Date(credits.refreshAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>

              <View style={{ marginTop: 14 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: '700', marginBottom: 8 }}>Usage</Text>
                <View
                  style={{
                    height: 12,
                    borderRadius: 999,
                    backgroundColor: '#E6EFEA',
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <View style={{ height: '100%', width: `${Math.round(fillPct * 100)}%`, backgroundColor: theme.colors.primary }} />
                </View>
                <Text style={{ marginTop: 6, color: theme.colors.muted }}>{credits.percentUsed}% used this cycle</Text>
              </View>
            </>
          ) : null}
        </View>

        {loadingSubscription ? (
          <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : null}

        {hasActiveSubscription && subscription ? (
          <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 2, borderColor: theme.colors.primary, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text }}>Current Subscription</Text>
                <Text style={{ marginTop: 6, color: theme.colors.muted }}>
                  {subscription.tier}
                  {subscription.credits > 0 ? ` - ${subscription.credits.toLocaleString()} credits/month` : ''}
                </Text>
                {subscription.source ? (
                  <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>
                    Billed through {subscription.source === 'apple_iap' ? 'Apple App Store' : subscription.source === 'google_iap' ? 'Google Play' : subscription.source === 'stripe' ? 'Stripe' : 'Helfi'}
                  </Text>
                ) : null}
              </View>
              <View>
                <Text style={{ color: theme.colors.muted, fontSize: 12, textAlign: 'right' }}>Status</Text>
                <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'right' }}>Active</Text>
              </View>
            </View>

            {subscription.stripeCurrentPeriodEnd ? (
              <Text style={{ marginTop: 10, color: theme.colors.muted }}>
                Next billing date: {new Date(subscription.stripeCurrentPeriodEnd).toLocaleDateString()}
              </Text>
            ) : null}

            {subscription.stripeCancelAtPeriodEnd ? (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#D7DEE8',
                  borderLeftWidth: 4,
                  borderLeftColor: theme.colors.primary,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Cancellation scheduled</Text>
                <Text style={{ marginTop: 4, color: theme.colors.muted, lineHeight: 20 }}>
                  Your subscription remains active until the end of this billing period.
                </Text>
              </View>
            ) : null}

            <View style={{ marginTop: 12, gap: 10 }}>
              <ActionButton
                label={isCreatingPortalSession ? 'Opening...' : Platform.OS === 'ios' ? 'Manage in App Store' : 'Manage subscription'}
                onPress={handleManagePortal}
                disabled={isCreatingPortalSession}
                kind="primary"
              />

              <ActionButton
                label={isRestoringPurchases ? 'Restoring...' : 'Restore purchases'}
                onPress={handleRestorePurchases}
                disabled={isRestoringPurchases}
                kind="secondary"
              />

              {!subscription.stripeCancelAtPeriodEnd ? (
                <ActionButton
                  label={isManagingSubscription ? 'Processing...' : 'Cancel Subscription'}
                  onPress={handleCancelSubscription}
                  disabled={isManagingSubscription}
                  kind="danger"
                />
              ) : null}

              {currentPrice !== 1000 ? (
                <ActionButton
                  label={currentPrice > 1000 ? 'Downgrade to $10/month' : 'Switch to $10/month'}
                  onPress={() => void handleChangePlan('plan_10_monthly', currentPrice > 1000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  kind="secondary"
                />
              ) : null}
              {currentPrice !== 2000 ? (
                <ActionButton
                  label={currentPrice > 2000 ? 'Downgrade to $20/month' : 'Switch to $20/month'}
                  onPress={() => void handleChangePlan('plan_20_monthly', currentPrice > 2000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  kind="secondary"
                />
              ) : null}
              {currentPrice !== 3000 ? (
                <ActionButton
                  label={currentPrice > 3000 ? 'Downgrade to $30/month' : 'Switch to $30/month'}
                  onPress={() => void handleChangePlan('plan_30_monthly', currentPrice > 3000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  kind="secondary"
                />
              ) : null}
              {currentPrice !== 5000 ? (
                <ActionButton
                  label={currentPrice > 5000 ? 'Downgrade to $50/month' : 'Switch to $50/month'}
                  onPress={() => void handleChangePlan('plan_50_monthly', currentPrice > 5000 ? 'downgrade' : 'upgrade')}
                  disabled={isManagingSubscription}
                  kind="secondary"
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {!loadingSubscription && !hasActiveSubscription ? (
          <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Previous purchases</Text>
            <Text style={{ marginTop: 6, marginBottom: 12, color: theme.colors.muted }}>
              Restore subscriptions or credits bought with this {Platform.OS === 'ios' ? 'Apple ID' : Platform.OS === 'android' ? 'Google Play account' : 'store account'}.
            </Text>
            <ActionButton
              label={isRestoringPurchases ? 'Restoring...' : 'Restore purchases'}
              onPress={handleRestorePurchases}
              disabled={isRestoringPurchases}
              kind="secondary"
            />
          </View>
        ) : null}

        <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Plans</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>
            Choose a monthly subscription plan. Subscriptions renew monthly until cancelled.
          </Text>
          <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Pressable onPress={() => openExternalUrl(TERMS_URL)}>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Terms of Use</Text>
            </Pressable>
            <Pressable onPress={() => openExternalUrl(PRIVACY_URL)}>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Privacy Policy</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 12, gap: 10 }}>
            {planCards.map((item) => (
              <PlanCard
                key={item.plan}
                title={item.title}
                wallet={item.wallet}
                buttonLabel={item.buttonLabel}
                loading={isCreatingCheckout === item.plan}
                popular={item.popular}
                dark={item.dark}
                onPress={() => void startCheckout(item.plan)}
              />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Buy Extra Credits</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>One-time credit top-ups.</Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            {topUpCards.map((item) => (
              <TopUpCard
                key={item.plan}
                title={item.title}
                desc={item.desc}
                buttonLabel={item.buttonLabel}
                loading={isCreatingCheckout === item.plan}
                onPress={() => void startCheckout(item.plan)}
              />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Billing History</Text>
          <View style={{ marginTop: 16, gap: 10 }}>
            {billingHistoryLoading ? <Text style={{ color: theme.colors.muted }}>Loading...</Text> : null}
            {!billingHistoryLoading && !!billingHistoryError ? <Text style={{ color: '#B91C1C' }}>{billingHistoryError}</Text> : null}
            {!billingHistoryLoading && !billingHistoryError && billingHistory.length === 0 ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: theme.colors.muted }}>No billing history available.</Text>
                <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>
                  Your billing history will appear after your first payment.
                </Text>
              </View>
            ) : null}
            {!billingHistoryLoading && !billingHistoryError
              ? billingHistory.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '800', flex: 1 }}>{item.title}</Text>
                      <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{item.amountText}</Text>
                    </View>
                    <Text style={{ color: theme.colors.muted }}>{item.subtitle}</Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                      {item.status}
                      {formatHistoryDate(item.occurredAt) ? ` - ${formatHistoryDate(item.occurredAt)}` : ''}
                    </Text>
                  </View>
                ))
              : null}
          </View>
        </View>

        <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Your usage</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>See how many times you used each feature.</Text>

          <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {rangeButton('7d', 'Last 7 days')}
            {rangeButton('1m', 'Last month')}
            {rangeButton('2m', 'Last 2 months')}
            {rangeButton('6m', 'Last 6 months')}
            {rangeButton('all', 'All time')}
            {rangeButton('custom', 'Custom')}
          </View>

          {usageRange === 'custom' ? (
            <View style={{ marginTop: 10, gap: 8 }}>
              <TextInput
                value={usageStart}
                onChangeText={setUsageStart}
                placeholder="Start (YYYY-MM-DD)"
                placeholderTextColor="#8AA39D"
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.card,
                  color: theme.colors.text,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
              <TextInput
                value={usageEnd}
                onChangeText={setUsageEnd}
                placeholder="End (YYYY-MM-DD)"
                placeholderTextColor="#8AA39D"
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.card,
                  color: theme.colors.text,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
            </View>
          ) : null}

          <View style={{ marginTop: 12 }}>
            {usageStatsLoading ? <Text style={{ color: theme.colors.muted }}>Loading...</Text> : null}
            {!usageStatsLoading && !!usageStatsError ? <Text style={{ color: '#B91C1C' }}>{usageStatsError}</Text> : null}
            {!usageStatsLoading && !usageStatsError && usageStats ? (
              <View style={{ gap: 8 }}>
                {creditDisplayList.map((item) => {
                  const count = Number(usageStats?.[item.key] || 0)
                  return (
                    <View
                      key={item.key}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.label}</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                        {count.toLocaleString()} {count === 1 ? 'time' : 'times'}
                      </Text>
                    </View>
                  )
                })}
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>AI feature credit costs</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>Each AI action deducts credits from your wallet.</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {creditDisplayList.map((item) => (
              <View
                key={item.key}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.label}</Text>
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{item.credits} credits</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}
