import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'

import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type SectionKey = 'overview' | 'supplements' | 'medications' | 'labs' | 'nutrition'

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'medications', label: 'Medications' },
  { key: 'labs', label: 'Labs' },
  { key: 'nutrition', label: 'Nutrition' },
]

const hiddenKeys = new Set(['id', 'slug', '_meta', 'pipelineVersion', 'cacheHit', 'quickUsed'])

function readableLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
}

function ValueBlock({ label, value, depth = 0 }: { label?: string; value: any; depth?: number }) {
  if (value == null || value === '' || value === false) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return (
      <View style={{ gap: 4 }}>
        {label ? <Text style={{ color: theme.colors.text, fontWeight: depth === 0 ? '700' : '600', fontSize: depth === 0 ? 16 : 14 }}>{readableLabel(label)}</Text> : null}
        <Text style={{ color: theme.colors.muted, lineHeight: 21 }}>{String(value)}</Text>
      </View>
    )
  }
  if (Array.isArray(value)) {
    if (!value.length) return null
    return (
      <View style={{ gap: 8 }}>
        {label ? <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 16 }}>{readableLabel(label)}</Text> : null}
        {value.map((item, index) =>
          typeof item === 'string' || typeof item === 'number' ? (
            <Text key={index} style={{ color: theme.colors.muted, lineHeight: 21 }}>• {String(item)}</Text>
          ) : (
            <View key={index} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, backgroundColor: theme.colors.bg }}>
              <ValueBlock value={item} depth={depth + 1} />
            </View>
          ),
        )}
      </View>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([key, item]) => !hiddenKeys.has(key) && item != null && item !== '')
    if (!entries.length) return null
    return (
      <View style={{ gap: 12 }}>
        {label ? <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 16 }}>{readableLabel(label)}</Text> : null}
        {entries.map(([key, item]) => <ValueBlock key={key} label={key} value={item} depth={depth + 1} />)}
      </View>
    )
  }
  return null
}

export function InsightIssueScreen({ route }: { route: { params: { issue: any } } }) {
  const issue = route.params.issue || {}
  const { session } = useAppMode()
  const [section, setSection] = useState<SectionKey>('overview')
  const [sectionData, setSectionData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const authHeaders = useMemo(
    () => (session?.token ? buildNativeAuthHeaders(session.token, { includeCookie: true }) : null),
    [session?.token],
  )

  const loadSection = useCallback(async () => {
    if (section === 'overview' || !authHeaders || !issue.slug) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/insights/issues/${encodeURIComponent(issue.slug)}/sections/${encodeURIComponent(section)}`,
        { headers: authHeaders },
      )
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.message || data?.error || 'Could not load this insight.'))
      setSectionData(data)
    } catch (e: any) {
      setError(e?.message || 'Could not load this insight.')
    } finally {
      setLoading(false)
    }
  }, [authHeaders, issue.slug, section])

  useEffect(() => {
    setSectionData(null)
    void loadSection()
  }, [loadSection])

  const overview = {
    status: issue.severityLabel,
    currentRating: issue.currentRating == null ? null : `${issue.currentRating}/${issue.ratingScaleMax || 6}`,
    latestUpdate: issue.highlight,
    whatNeedsAttention: issue.blockers,
    lastUpdated: issue.lastUpdated ? new Date(issue.lastUpdated).toLocaleString() : null,
  }

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadSection()} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 36, gap: 14 }}
      >
        <View>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.pageTitle, fontWeight: '700' }}>{issue.name || 'Insight'}</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 5 }}>Insights update automatically as your health data changes.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {SECTIONS.map((item) => {
            const selected = section === item.key
            return (
              <Pressable
                key={item.key}
                onPress={() => setSection(item.key)}
                style={{ borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : theme.colors.card, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }}
              >
                <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontWeight: '600' }}>{item.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>

        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: theme.colors.card, padding: 15 }}>
          {loading && !sectionData ? <ActivityIndicator color={theme.colors.primary} /> : null}
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          {!loading && !error ? <ValueBlock value={section === 'overview' ? overview : sectionData} /> : null}
        </View>
      </ScrollView>
    </Screen>
  )
}
