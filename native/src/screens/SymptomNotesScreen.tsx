import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { requestAiDataSharingPermission } from '../lib/aiConsent'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type TabKey = 'notes' | 'history'

type SymptomResult = {
  summary?: string | null
  analysisText?: string | null
  possibleCauses?: Array<{ name?: string; whyLikely?: string; confidence?: string }>
  redFlags?: string[]
  nextSteps?: string[]
  disclaimer?: string | null
}

type SymptomHistoryItem = {
  id: string
  symptoms: string[] | string | null
  duration?: string | null
  notes?: string | null
  summary?: string | null
  analysisText?: string | null
  analysisData?: SymptomResult | null
  createdAt?: string | null
}

const QUICK_TAGS = [
  'Fever', 'Headache', 'Cough', 'Sore throat', 'Runny nose', 'Nasal congestion',
  'Sneezing', 'Fatigue', 'Body aches', 'Chills', 'Night sweats', 'Shortness of breath',
  'Chest pain', 'Palpitations', 'Dizziness', 'Lightheadedness', 'Confusion', 'Anxiety',
  'Depressed mood', 'Insomnia', 'Nausea', 'Vomiting', 'Diarrhea', 'Constipation',
  'Abdominal pain', 'Bloating', 'Heartburn', 'Indigestion', 'Loss of appetite',
  'Back pain', 'Joint pain', 'Muscle pain', 'Swollen joints', 'Rash', 'Itchy skin',
  'Hives', 'Head pressure', 'Loss of taste', 'Loss of smell', 'Ear pain', 'Tooth pain',
  'Sore gums', 'Swollen glands', 'Frequent urination', 'Burning urination',
  'Blood in urine', 'Blood in stool',
]

function asStringArray(value: SymptomHistoryItem['symptoms']) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString()
}

function mergeResult(data: any): SymptomResult {
  const analysisData = data?.analysisData && typeof data.analysisData === 'object' ? data.analysisData : {}
  return {
    summary: data?.summary ?? analysisData?.summary ?? null,
    analysisText: data?.analysisText ?? null,
    possibleCauses: Array.isArray(data?.possibleCauses)
      ? data.possibleCauses
      : Array.isArray(analysisData?.possibleCauses)
        ? analysisData.possibleCauses
        : [],
    redFlags: Array.isArray(data?.redFlags)
      ? data.redFlags
      : Array.isArray(analysisData?.redFlags)
        ? analysisData.redFlags
        : [],
    nextSteps: Array.isArray(data?.nextSteps)
      ? data.nextSteps
      : Array.isArray(analysisData?.nextSteps)
        ? analysisData.nextSteps
        : [],
    disclaimer: data?.disclaimer ?? analysisData?.disclaimer ?? null,
  }
}

export function SymptomNotesScreen() {
  const { mode, session } = useAppMode()
  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const jsonHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { json: true, includeCookie: true })
  }, [mode, session?.token])

  const [activeTab, setActiveTab] = useState<TabKey>('notes')
  const [symptomInput, setSymptomInput] = useState('')
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<SymptomResult | null>(null)

  const [historyItems, setHistoryItems] = useState<SymptomHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const addSymptom = useCallback((value?: string) => {
    const raw = String(value ?? symptomInput).trim()
    const parts = raw.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
    if (!parts.length) return
    setSelectedSymptoms((prev) => Array.from(new Set([...prev, ...parts])))
    setSymptomInput('')
    setError('')
  }, [symptomInput])

  const removeSymptom = useCallback((value: string) => {
    setSelectedSymptoms((prev) => prev.filter((item) => item !== value))
  }, [])

  const loadHistory = useCallback(async () => {
    if (!authHeaders) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/symptoms/history`, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Failed to load history'))
      setHistoryItems(Array.isArray(data?.history) ? data.history : [])
    } catch (e: any) {
      setHistoryError(e?.message || 'Failed to load history')
      setHistoryItems([])
    } finally {
      setHistoryLoading(false)
    }
  }, [authHeaders])

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'history') void loadHistory()
      return () => {}
    }, [activeTab, loadHistory]),
  )

  const createNotes = async () => {
    if (!jsonHeaders) {
      setError('Please sign in again.')
      return
    }
    const symptoms = selectedSymptoms.length ? selectedSymptoms : symptomInput.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
    if (!symptoms.length) {
      setError('Please enter at least one symptom.')
      return
    }

    const allowed = await requestAiDataSharingPermission()
    if (!allowed) return

    setIsAnalyzing(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/analyze-symptoms`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ symptoms, duration, notes }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.message || data?.error || 'Failed to create symptom notes'))
      setSelectedSymptoms(symptoms)
      setSymptomInput('')
      setResult(mergeResult(data))
    } catch (e: any) {
      setError(e?.message || 'Failed to create symptom notes')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const deleteHistoryItem = async (item: SymptomHistoryItem) => {
    if (!authHeaders) return
    Alert.alert(
      'Delete these symptom notes?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id)
            setHistoryError('')
            try {
              const res = await fetch(`${API_BASE_URL}/api/symptoms/history/${encodeURIComponent(item.id)}`, {
                method: 'DELETE',
                headers: authHeaders,
              })
              const data: any = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error(String(data?.error || 'Failed to delete history item'))
              setHistoryItems((prev) => prev.filter((row) => row.id !== item.id))
              setExpandedId((prev) => (prev === item.id ? null : prev))
            } catch (e: any) {
              setHistoryError(e?.message || 'Failed to delete history item')
            } finally {
              setDeletingId(null)
            }
          },
        },
      ],
    )
  }

  const renderTabs = () => (
    <View style={styles.tabs}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Symptom Notes"
        onPress={() => setActiveTab('notes')}
        style={[styles.tab, activeTab === 'notes' && styles.tabActive]}
      >
        <Text style={[styles.tabText, activeTab === 'notes' && styles.tabTextActive]}>Symptom Notes</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="History"
        onPress={() => setActiveTab('history')}
        style={[styles.tab, activeTab === 'history' && styles.tabActive]}
      >
        <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
      </Pressable>
    </View>
  )

  const renderResult = () => {
    if (!result) return null
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your symptom notes</Text>
        {result.summary ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Summary</Text>
            <Text style={styles.bodyText}>{result.summary}</Text>
          </View>
        ) : null}
        {result.possibleCauses?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Topics to discuss with a doctor</Text>
            {result.possibleCauses.map((item, index) => (
              <View key={`${item.name || 'topic'}-${index}`} style={styles.topicBox}>
                <Text style={styles.topicTitle}>{item.name || 'Discussion topic'}</Text>
                {item.whyLikely ? <Text style={styles.bodyText}>{item.whyLikely}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
        {result.redFlags?.length ? (
          <View style={styles.block}>
            <Text style={styles.urgentTitle}>When to seek urgent care</Text>
            {result.redFlags.map((item, index) => <Text key={index} style={styles.urgentText}>- {item}</Text>)}
          </View>
        ) : null}
        {result.nextSteps?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Tracking notes and doctor questions</Text>
            {result.nextSteps.map((item, index) => <Text key={index} style={styles.bodyText}>- {item}</Text>)}
          </View>
        ) : null}
        <Text style={styles.disclaimer}>
          {result.disclaimer || 'This is not medical advice. Always seek a doctor\'s advice in addition to using this app and before making medical decisions.'}
        </Text>
      </View>
    )
  }

  const renderNotes = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Record symptoms</Text>
      <Text style={styles.bodyText}>List symptoms separated by commas (e.g., headache, fever). Add duration and any notes.</Text>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>Important medical note</Text>
        <Text style={styles.warningText}>
          Helfi is for general health tracking and organisation only. It does not provide medical advice, diagnosis, or treatment. Always seek a doctor's advice in addition to using this app and before making medical decisions.
        </Text>
      </View>

      <View style={styles.sourceBox}>
        <Text style={styles.blockTitle}>General health sources</Text>
        <Text style={styles.bodyText}>Helfi uses public sources as general references. Results are tracking notes, not diagnoses.</Text>
        <Text style={styles.smallText}>MedlinePlus Health Topics</Text>
        <Text style={styles.smallText}>Mayo Clinic Health Information</Text>
        <Text style={styles.smallText}>NHS Health Information</Text>
        <Text style={styles.smallText}>CDC Health Topics</Text>
      </View>

      <Text style={styles.label}>Symptoms</Text>
      <View style={styles.row}>
        <TextInput
          value={symptomInput}
          onChangeText={setSymptomInput}
          onSubmitEditing={() => addSymptom()}
          placeholder="e.g., Headache"
          placeholderTextColor="#9CA3AF"
          style={[styles.input, { flex: 1 }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Add symptom" onPress={() => addSymptom()} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </Pressable>
      </View>

      {selectedSymptoms.length ? (
        <View style={styles.chipWrap}>
          {selectedSymptoms.map((item) => (
            <Pressable key={item} onPress={() => removeSymptom(item)} style={styles.selectedChip}>
              <Text style={styles.selectedChipText}>{item}  x</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.chipWrap}>
        {(tagsExpanded ? QUICK_TAGS : QUICK_TAGS.slice(0, 12)).map((tag) => {
          const selected = selectedSymptoms.includes(tag)
          return (
            <Pressable key={tag} onPress={() => addSymptom(tag)} style={[styles.quickChip, selected && styles.quickChipSelected]}>
              <Text style={[styles.quickChipText, selected && styles.quickChipTextSelected]}>{tag}</Text>
            </Pressable>
          )
        })}
      </View>
      {QUICK_TAGS.length > 12 ? (
        <Pressable onPress={() => setTagsExpanded((value) => !value)} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
          <Text style={styles.linkText}>{tagsExpanded ? 'Show less' : `Show ${QUICK_TAGS.length - 12} more`}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>Duration</Text>
      <TextInput
        value={duration}
        onChangeText={setDuration}
        placeholder="e.g., 2 days, 1 week"
        placeholderTextColor="#9CA3AF"
        style={styles.input}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g., started after travel, any triggers, patterns, etc."
        placeholderTextColor="#9CA3AF"
        multiline
        textAlignVertical="top"
        style={[styles.input, styles.textArea]}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create symptom notes"
        onPress={createNotes}
        disabled={isAnalyzing}
        style={[styles.primaryButton, isAnalyzing && { opacity: 0.65 }]}
      >
        {isAnalyzing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Create symptom notes</Text>}
      </Pressable>
      <Text style={styles.costText}>Cost: 1 credit per symptom notes request</Text>
      <Text style={styles.costText}>Cost: 1 credit per symptom notes request.</Text>
    </View>
  )

  const renderHistory = () => (
    <View style={styles.card}>
      <View style={styles.historyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Symptom History</Text>
          <Text style={styles.smallText}>Review your previous symptom notes. You can delete any entry at any time.</Text>
        </View>
        <Pressable onPress={loadHistory} disabled={historyLoading} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{historyLoading ? 'Loading...' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {historyLoading ? <Text style={styles.smallText}>Loading history...</Text> : null}
      {historyError ? <Text style={styles.errorText}>{historyError}</Text> : null}
      {!historyLoading && !historyError && historyItems.length === 0 ? (
        <Text style={styles.smallText}>No saved symptom notes yet.</Text>
      ) : null}

      <View style={{ gap: 12, marginTop: 12 }}>
        {historyItems.map((item) => {
          const symptoms = asStringArray(item.symptoms)
          const details = mergeResult({ ...item, ...(item.analysisData || {}) })
          const expanded = expandedId === item.id
          return (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyTop}>
                <Text style={styles.smallText}>{formatDateTime(item.createdAt)}</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <Pressable onPress={() => setExpandedId(expanded ? null : item.id)}>
                    <Text style={styles.linkText}>{expanded ? 'Hide details' : 'View details'}</Text>
                  </Pressable>
                  <Pressable onPress={() => deleteHistoryItem(item)} disabled={deletingId === item.id}>
                    <Text style={styles.deleteText}>{deletingId === item.id ? 'Deleting...' : 'Delete'}</Text>
                  </Pressable>
                </View>
              </View>
              {symptoms.length ? <Text style={styles.bodyText}><Text style={styles.boldText}>Symptoms:</Text> {symptoms.join(', ')}</Text> : null}
              {item.duration ? <Text style={styles.bodyText}><Text style={styles.boldText}>Duration:</Text> {item.duration}</Text> : null}
              {item.summary ? <Text style={styles.bodyText}>{item.summary}</Text> : null}

              {expanded ? (
                <View style={{ gap: 8, marginTop: 10 }}>
                  {item.notes ? (
                    <View>
                      <Text style={styles.blockTitle}>Notes</Text>
                      <Text style={styles.bodyText}>{item.notes}</Text>
                    </View>
                  ) : null}
                  {details.possibleCauses?.length ? (
                    <View>
                      <Text style={styles.blockTitle}>Topics to discuss with a doctor</Text>
                      {details.possibleCauses.map((topic, index) => (
                        <Text key={index} style={styles.bodyText}>- {topic.name || 'Discussion topic'}</Text>
                      ))}
                    </View>
                  ) : null}
                  {details.redFlags?.length ? (
                    <View>
                      <Text style={styles.urgentTitle}>When to seek urgent care</Text>
                      {details.redFlags.map((flag, index) => <Text key={index} style={styles.urgentText}>- {flag}</Text>)}
                    </View>
                  ) : null}
                  {details.nextSteps?.length ? (
                    <View>
                      <Text style={styles.blockTitle}>Tracking notes and doctor questions</Text>
                      {details.nextSteps.map((step, index) => <Text key={index} style={styles.bodyText}>- {step}</Text>)}
                    </View>
                  ) : null}
                  {details.disclaimer ? <Text style={styles.disclaimer}>{details.disclaimer}</Text> : null}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        {renderTabs()}
        {activeTab === 'notes' ? (
          <>
            {renderNotes()}
            {renderResult()}
          </>
        ) : renderHistory()}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    paddingBottom: theme.spacing.xl,
    gap: 12,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F2',
    borderRadius: theme.radius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 12,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  bodyText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  smallText: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: theme.radius.sm,
    backgroundColor: '#FFFFFF',
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    minHeight: 112,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
  },
  quickChipSelected: {
    borderColor: '#BBE4C4',
    backgroundColor: '#E8F7EC',
  },
  quickChipText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },
  quickChipTextSelected: {
    color: '#1E6F36',
  },
  selectedChip: {
    borderWidth: 1,
    borderColor: '#BBE4C4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#E8F7EC',
  },
  selectedChipText: {
    color: '#1E6F36',
    fontSize: 12,
    fontWeight: '800',
  },
  warningBox: {
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: theme.radius.sm,
    backgroundColor: '#FFFBEB',
    padding: 12,
    gap: 4,
  },
  warningTitle: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  warningText: {
    color: '#5B4A12',
    fontSize: 12,
    lineHeight: 17,
  },
  sourceBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 4,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  costText: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  deleteText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '900',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  historyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  block: {
    gap: 6,
  },
  blockTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 14,
  },
  topicBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: 10,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  topicTitle: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  urgentTitle: {
    color: '#B91C1C',
    fontWeight: '900',
    fontSize: 14,
  },
  urgentText: {
    color: '#991B1B',
    fontSize: 14,
    lineHeight: 20,
  },
  disclaimer: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: '#F9FAFB',
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
    padding: 10,
  },
  boldText: {
    fontWeight: '900',
    color: theme.colors.text,
  },
})
