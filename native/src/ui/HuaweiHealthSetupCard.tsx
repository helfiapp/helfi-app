import React, { useEffect, useRef, useState } from 'react'
import { Alert, Platform, Pressable, Text, View } from 'react-native'
import { HUAWEI_HEALTH_GUIDE as guide } from '../content/huawei-health-guide'
import type { AppleHealthSource } from '../health/appleHealth'
import { useAppleHealthSync } from '../health/AppleHealthSyncProvider'
import { useAppMode } from '../state/AppModeContext'
import { theme } from './theme'

export function HuaweiHealthSetupCard({ onAppleHealthSetup, actionLabel = 'Open Helfi Dashboard', busy = false }: {
  onAppleHealthSetup: () => void
  actionLabel?: string
  busy?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [sources, setSources] = useState<AppleHealthSource[]>([])
  const [finding, setFinding] = useState(false)
  const health = useAppleHealthSync()
  const { mode, session } = useAppMode()
  const userId = mode === 'signedIn' ? session?.user.id || '' : ''
  const owner = useRef(userId)
  owner.current = userId
  useEffect(() => { setSources([]); setFinding(false) }, [userId])
  const onIPhone = Platform.OS === 'ios' && Platform.isPad !== true
  const busyNow = busy || health.busy || finding
  const findSources = async () => {
    setFinding(true)
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
      const todaySources = await health.readSources()
      if (owner.current !== userId) return
      const earlierSources = await health.readSources(date)
      if (owner.current !== userId) return
      setSources([...new Map([...todaySources, ...earlierSources].map(item => [item.sourceId, item])).values()])
    } catch (error: any) {
      if (owner.current === userId) Alert.alert('Could not find activity sources', error?.message || 'Check Helfi’s access in Apple Health and try again.')
    } finally { if (owner.current === userId) setFinding(false) }
  }
  const chooseSource = async (next: AppleHealthSource | null) => {
    try { await health.setSource(next) } catch {
      Alert.alert('Could not save activity source', 'Please try again. Your previous activity source is still selected.')
    }
  }
  return (
    <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 10 }}>
      <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{guide.title}</Text>
      <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>{onIPhone ? 'Via Apple Health on iPhone' : guide.unsupported}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide Huawei Health setup' : 'Set up Huawei Health'} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ paddingVertical: 10 }}>
        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{expanded ? 'Hide setup steps' : 'Set up on iPhone'}</Text>
      </Pressable>
      {expanded ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.text, lineHeight: 20 }}>{guide.introduction}</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>{guide.route}</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>{guide.privacy}</Text>
          {onIPhone ? <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Activity source: {health.source?.sourceName || 'Apple Health totals'}</Text>
            <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>Choose Huawei Health from the sources found below. This uses its exported readings instead of adding them to the phone’s total. Huawei Health may combine phone and watch data itself.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Find activity sources in Apple Health" disabled={busyNow} onPress={findSources} style={{ padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, opacity: busyNow ? 0.5 : 1 }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{finding ? 'Finding sources…' : 'Find activity sources'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Use Apple Health totals" disabled={busyNow || health.source === null} onPress={() => chooseSource(null)} style={{ padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.text }}>{health.source === null ? '✓ ' : ''}Apple Health totals</Text>
            </Pressable>
            {sources.map(item => <Pressable key={item.sourceId} accessibilityRole="button" accessibilityLabel={`Use ${item.sourceName} readings`} disabled={busyNow || health.source?.sourceId === item.sourceId} onPress={() => chooseSource(item)} style={{ padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.text }}>{health.source?.sourceId === item.sourceId ? '✓ ' : ''}{item.sourceName}</Text>
            </Pressable>)}
            <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>Sources are checked for today and yesterday. Automatic updates use your choice. Food’s import button uses the same choice for its selected date. One daily entry is updated; calories are not added twice.</Text>
            {health.result ? <Text style={{ color: theme.colors.text, lineHeight: 20 }}>
              Latest reading: {health.result.summary.selectedSource?.sourceName || 'Apple Health totals'} · {health.result.summary.localDate}{'\n'}
              Steps: {health.result.summary.steps === null ? '—' : health.result.summary.steps} · Distance: {health.result.summary.distanceKm === null ? '—' : `${health.result.summary.distanceKm.toFixed(2)} km`} · Active calories: {health.result.summary.activeEnergyKcal === null ? '—' : Number(health.result.summary.activeEnergyKcal.toFixed(2))}
            </Text> : null}
            {health.error ? <Text style={{ color: theme.colors.muted }}>{health.error}</Text> : null}
          </View> : null}
          {guide.steps.map((step, index) => (
            <View key={step.title} style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{index + 1}. {step.title}</Text>
              <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>{step.detail}</Text>
            </View>
          ))}
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>{guide.calories}</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>{guide.totals}</Text>
          {onIPhone ? (
            <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ disabled: busyNow }} disabled={busyNow} onPress={onAppleHealthSetup} style={{ borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, padding: 12, alignItems: 'center', opacity: busyNow ? 0.55 : 1 }}>
              <Text style={{ color: theme.colors.primaryText, fontWeight: '700' }}>{actionLabel}</Text>
            </Pressable>
          ) : <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>{guide.unsupported}</Text>}
        </View>
      ) : null}
    </View>
  )
}
