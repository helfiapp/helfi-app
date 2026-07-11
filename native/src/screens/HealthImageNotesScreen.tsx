import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'

import { API_BASE_URL } from '../config'
import { requestAiDataSharingPermission } from '../lib/aiConsent'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { EntryActionsButton, EntryActionsMenu } from '../ui/EntryActionsMenu'
import { theme } from '../ui/theme'

type TabKey = 'notes' | 'history'

type ImageAsset = {
  uri: string
  fileName: string
  mimeType: string
}

type ImageNoteResult = {
  summary?: string | null
  analysisText?: string | null
  possibleCauses?: Array<{ name?: string; whyLikely?: string; confidence?: string }>
  redFlags?: string[]
  nextSteps?: string[]
  disclaimer?: string | null
}

type ImageHistoryItem = {
  id: string
  summary?: string | null
  analysisText?: string | null
  analysisData?: ImageNoteResult | null
  createdAt?: string | null
  imageUrl?: string | null
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function formatDateTime(value?: string | null) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString()
}

function imageUri(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`
}

const SAFE_IMAGE_NOTE_FALLBACK =
  'Older saved image note. Please review this image with a qualified healthcare professional if you are concerned.'

const riskyMedicalClaimPattern =
  /\b(possibly indicating|may indicate|could indicate|suggests|suggesting|consistent with|likely|viral infection|skin reaction|infection|cancer|melanoma|diagnosis|diagnose|treat|treatment|cure)\b/i

function safeText(value?: string | null, fallback = SAFE_IMAGE_NOTE_FALLBACK) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (riskyMedicalClaimPattern.test(text)) return fallback
  return text
}

function mergeResult(data: any): ImageNoteResult {
  const analysisData = data?.analysisData && typeof data.analysisData === 'object' ? data.analysisData : {}
  return {
    summary: data?.summary ?? analysisData?.summary ?? null,
    analysisText: data?.analysisText ?? data?.analysis ?? null,
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
    disclaimer:
      data?.disclaimer ??
      analysisData?.disclaimer ??
      'These are general image notes only. They are not medical advice, diagnosis, or treatment. A qualified healthcare professional should review any health concern.',
  }
}

export function HealthImageNotesScreen() {
  const { mode, session } = useAppMode()
  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const [activeTab, setActiveTab] = useState<TabKey>('notes')
  const [image, setImage] = useState<ImageAsset | null>(null)
  const [error, setError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [savingHistory, setSavingHistory] = useState(false)
  const [result, setResult] = useState<ImageNoteResult | null>(null)
  const [chatThreadId, setChatThreadId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState('')
  const [hasAnalyzedImage, setHasAnalyzedImage] = useState(false)
  const [historySaved, setHistorySaved] = useState(false)

  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [historyActions, setHistoryActions] = useState<ImageHistoryItem | null>(null)

  const loadHistory = useCallback(async () => {
    if (!authHeaders) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/medical-images/history`, { headers: authHeaders })
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

  const pickImageSource = useCallback(async (source: 'camera' | 'library') => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to add images.')
        return
      }
      const picked =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.85,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.85,
              allowsEditing: false,
            })
      if (picked.canceled || picked.assets.length === 0) {
        if (source === 'camera') {
          Alert.alert(
            'No photo taken',
            'If you are using the simulator, camera capture may not be available. Use Photo Library or test the camera on a real iPhone.',
          )
        }
        return
      }
      const asset = picked.assets[0]
      setImage({
        uri: asset.uri,
        fileName: asset.fileName || asset.uri.split('/').pop() || `health-image-note-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      })
      setError('')
      setResult(null)
      setHasAnalyzedImage(false)
      setHistorySaved(false)
    } catch (e: any) {
      Alert.alert('Photo failed', e?.message || 'Please try again.')
    }
  }, [])

  const pickImage = useCallback(() => {
    Alert.alert('Add health image note', 'Choose where to get the image from.', [
      { text: 'Camera', onPress: () => void pickImageSource('camera') },
      { text: 'Photo Library', onPress: () => void pickImageSource('library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [pickImageSource])

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('helfi:health-image-voice-action', (payload?: any) => {
      if (String(payload?.action || '') !== 'pickImage') return
      setActiveTab('notes')
      void pickImage()
    })
    return () => subscription.remove()
  }, [pickImage])

  const resetImage = () => {
    setImage(null)
    setError('')
    setResult(null)
    setHasAnalyzedImage(false)
    setHistorySaved(false)
  }

  const createImageNotes = async () => {
    if (!authHeaders) {
      setError('Please sign in again.')
      return
    }
    if (!image) {
      setError('Please select an image first')
      return
    }
    if (hasAnalyzedImage) {
      setError('This image already has notes. Reset to create notes for a new image.')
      return
    }

    const allowed = await requestAiDataSharingPermission()
    if (!allowed) return

    setIsAnalyzing(true)
    setError('')
    setResult(null)
    setHistorySaved(false)
    try {
      const form = new FormData()
      form.append('image', { uri: image.uri, name: image.fileName, type: image.mimeType } as any)
      form.append('saveToHistory', 'false')
      const res = await fetch(`${API_BASE_URL}/api/test-vision`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.message || data?.error || 'Failed to create image notes'))
      if (!data?.success) throw new Error('Invalid response from server')
      setResult(mergeResult(data))
      setChatThreadId(null)
      setChatMessages([])
      setChatInput('')
      setChatError('')
      setHasAnalyzedImage(true)
      setHistorySaved(Boolean(data?.historySaved))
    } catch (e: any) {
      setError(e?.message || 'Failed to create image notes')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const sendFollowUp = async () => {
    const message = chatInput.trim()
    if (!message || !authHeaders || !result || chatBusy) return
    setChatMessages((prev) => [...prev, { role: 'user', content: message }])
    setChatInput('')
    setChatError('')
    setChatBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/medical-images/chat`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: chatThreadId || undefined, message, analysisResult: result }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.message || data?.error || 'Could not send this question.'))
      const assistant = String(data?.assistant || '').trim()
      if (assistant) setChatMessages((prev) => [...prev, { role: 'assistant', content: assistant }])
      if (data?.threadId) setChatThreadId(String(data.threadId))
    } catch (e: any) {
      setChatError(e?.message || 'Could not send this question.')
    } finally {
      setChatBusy(false)
    }
  }

  const saveResultToHistory = async () => {
    if (!authHeaders) {
      setError('Please sign in again.')
      return
    }
    if (!image || !result) {
      setError('Create image notes before saving to history.')
      return
    }

    setSavingHistory(true)
    setError('')
    try {
      const form = new FormData()
      form.append('image', { uri: image.uri, name: image.fileName, type: image.mimeType } as any)
      form.append('analysis', JSON.stringify(result))
      const res = await fetch(`${API_BASE_URL}/api/medical-images/history`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.message || data?.error || 'Failed to save image note'))
      }
      setHistorySaved(true)
      if (data?.historyItem) {
        setHistoryItems((prev) => [data.historyItem, ...prev.filter((item) => item.id !== data.historyItem.id)])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save image note')
    } finally {
      setSavingHistory(false)
    }
  }

  const deleteHistoryItem = async (item: ImageHistoryItem) => {
    if (!authHeaders) return
    Alert.alert(
      'Delete this saved image note?',
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
              const res = await fetch(`${API_BASE_URL}/api/medical-images/history/${encodeURIComponent(item.id)}`, {
                method: 'DELETE',
                headers: authHeaders,
              })
              const data: any = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error(String(data?.error || 'Failed to delete saved image note'))
              setHistoryItems((prev) => prev.filter((row) => row.id !== item.id))
              setExpandedId((prev) => (prev === item.id ? null : prev))
            } catch (e: any) {
              setHistoryError(e?.message || 'Failed to delete saved image note')
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
      <Pressable onPress={() => setActiveTab('notes')} style={[styles.tab, activeTab === 'notes' && styles.tabActive]}>
        <Text style={[styles.tabText, activeTab === 'notes' && styles.tabTextActive]}>Health Image Notes</Text>
      </Pressable>
      <Pressable onPress={() => setActiveTab('history')} style={[styles.tab, activeTab === 'history' && styles.tabActive]}>
        <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
      </Pressable>
    </View>
  )

  const renderResult = (data: ImageNoteResult) => (
    <View style={styles.resultBox}>
      <Text style={styles.cardTitle}>Image notes</Text>
      {data.summary ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Summary</Text>
          <Text style={styles.bodyText}>{safeText(data.summary)}</Text>
        </View>
      ) : null}
      {data.analysisText ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Notes</Text>
          <Text style={styles.bodyText}>{safeText(data.analysisText)}</Text>
        </View>
      ) : null}
      {data.possibleCauses?.length ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Topics to discuss with a doctor</Text>
          {data.possibleCauses.map((item, index) => (
            <Text key={index} style={styles.bodyText}>- {safeText(item.name || 'Discussion topic')}</Text>
          ))}
        </View>
      ) : null}
      {data.redFlags?.length ? (
        <View style={styles.block}>
          <Text style={styles.urgentTitle}>When to seek urgent care</Text>
          {data.redFlags.map((item, index) => <Text key={index} style={styles.urgentText}>- {safeText(item, 'Seek urgent care if symptoms feel severe or worrying.')}</Text>)}
        </View>
      ) : null}
      {data.nextSteps?.length ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Tracking notes and doctor questions</Text>
          {data.nextSteps.map((item, index) => <Text key={index} style={styles.bodyText}>- {safeText(item)}</Text>)}
        </View>
      ) : null}
      <Text style={styles.disclaimer}>
        {safeText(data.disclaimer, 'These are general image notes only. They are not medical advice, diagnosis, or treatment. A qualified healthcare professional should review any health concern.') || 'These are general image notes only. They are not medical advice, diagnosis, or treatment. A qualified healthcare professional should review any health concern.'}
      </Text>
    </View>
  )

  const renderNotes = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Health Image Notes</Text>
      <View style={styles.infoBox}>
        <Text style={styles.blockTitle}>What is this feature?</Text>
        <Text style={styles.infoText}>
          Helfi can create simple notes about visible details in a health-related image so you can track changes and discuss them with a qualified healthcare professional.
        </Text>
        <Text style={[styles.infoText, { fontWeight: '700' }]}>Useful for recording:</Text>
        <Text style={styles.infoText}>- Visible skin changes you want to monitor</Text>
        <Text style={styles.infoText}>- Photos you want to discuss with a doctor</Text>
        <Text style={styles.infoText}>- Wound, nail, eye, or skin appearance notes</Text>
        <Text style={styles.infoText}>- Changes over time for your own records</Text>
        <Text style={styles.infoSmall}>This tool provides general image notes only. It does not diagnose, treat, or replace a doctor's examination.</Text>
      </View>

      <View style={styles.sourceBox}>
        <Text style={styles.blockTitle}>General health sources</Text>
        <Text style={styles.bodyText}>Helfi uses public sources as general references. Results are not diagnoses.</Text>
        <Text style={styles.smallText}>MedlinePlus Health Topics</Text>
        <Text style={styles.smallText}>Mayo Clinic Health Information</Text>
        <Text style={styles.smallText}>NHS Health Information</Text>
      </View>

      {!image ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add health image" onPress={pickImage} style={styles.uploadBox}>
          <Text style={styles.uploadTitle}>Add health image</Text>
          <Text style={styles.smallText}>Camera or photo library. PNG, JPG, GIF up to 10MB</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 10 }}>
          <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
          <Pressable onPress={resetImage} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create Image Notes"
        onPress={createImageNotes}
        disabled={!image || isAnalyzing || hasAnalyzedImage}
        style={[styles.primaryButton, (!image || isAnalyzing || hasAnalyzedImage) && { opacity: 0.55 }]}
      >
        {isAnalyzing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Create Image Notes</Text>}
      </Pressable>
      <Text style={styles.costText}>Cost: 2 credits per image notes request</Text>

      {result ? (
        <View style={{ gap: 12 }}>
          {renderResult(result)}
          <View style={styles.card}>
            <Text style={styles.blockTitle}>Ask a follow-up question</Text>
            <Text style={styles.smallText}>Continue the same conversation about these image notes.</Text>
            {chatMessages.map((message, index) => (
              <View
                key={`${message.role}-${index}`}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'stretch',
                  maxWidth: message.role === 'user' ? '86%' : '100%',
                  marginTop: 10,
                  borderRadius: 12,
                  padding: 11,
                  backgroundColor: message.role === 'user' ? '#DCFCE7' : '#F3F4F6',
                }}
              >
                <Text style={styles.bodyText}>{message.content}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask about these notes"
                placeholderTextColor="#9CA3AF"
                multiline
                style={[styles.input, { flex: 1, minHeight: 46, maxHeight: 110 }]}
              />
              <Pressable
                onPress={() => void sendFollowUp()}
                disabled={chatBusy || !chatInput.trim()}
                style={[styles.primaryButton, { minWidth: 72, marginTop: 0 }, (chatBusy || !chatInput.trim()) && { opacity: 0.55 }]}
              >
                {chatBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryButtonText}>Send</Text>}
              </Pressable>
            </View>
            {chatError ? <Text style={styles.errorText}>{chatError}</Text> : null}
          </View>
          <View style={styles.reviewSaveBox}>
            <Text style={styles.bodyText}>Review these notes before saving them to your history.</Text>
            <Text style={styles.smallText}>
              The image is still sent for AI note creation after you approve AI sharing. Saved image notes include the image and notes. You can delete them anytime.
            </Text>
            {historySaved ? (
              <Text style={styles.successText}>Saved to history.</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save image note to history"
                onPress={() => void saveResultToHistory()}
                disabled={savingHistory}
                style={[styles.secondaryButton, savingHistory && { opacity: 0.55 }]}
              >
                <Text style={styles.secondaryButtonText}>{savingHistory ? 'Saving...' : 'Save to history'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  )

  const renderHistory = () => (
    <View style={styles.card}>
      <View style={styles.historyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Health Image Notes History</Text>
          <Text style={styles.smallText}>Only scans you chose to save appear here.</Text>
        </View>
        <Pressable onPress={loadHistory} disabled={historyLoading} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{historyLoading ? 'Loading...' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {historyLoading ? <Text style={styles.smallText}>Loading history...</Text> : null}
      {historyError ? <Text style={styles.errorText}>{historyError}</Text> : null}
      {!historyLoading && !historyError && historyItems.length === 0 ? (
        <Text style={styles.smallText}>No saved image notes yet.</Text>
      ) : null}

      <View style={{ gap: 12, marginTop: 12 }}>
        {historyItems.map((item) => {
          const expanded = expandedId === item.id
          const details = mergeResult({ ...item, ...(item.analysisData || {}) })
          const uri = imageUri(item.imageUrl)
          return (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyTop}>
                <Text style={styles.smallText}>{formatDateTime(item.createdAt)}</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <Pressable onPress={() => setExpandedId(expanded ? null : item.id)}>
                    <Text style={styles.linkText}>{expanded ? 'Hide details' : 'View details'}</Text>
                  </Pressable>
                  <EntryActionsButton label="Image note actions" onPress={() => setHistoryActions(item)} disabled={deletingId === item.id} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                {uri ? <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" /> : null}
                <View style={{ flex: 1 }}>
                  {item.summary ? <Text style={styles.bodyText}>{safeText(item.summary)}</Text> : null}
                  {!item.summary && item.analysisText ? <Text style={styles.bodyText}>{safeText(item.analysisText)}</Text> : null}
                </View>
              </View>
              {expanded ? renderResult(details) : null}
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
        {activeTab === 'notes' ? renderNotes() : renderHistory()}
      </ScrollView>
      <EntryActionsMenu
        visible={historyActions != null}
        onClose={() => setHistoryActions(null)}
        actions={[
          { label: 'Delete entry', icon: 'trash-2', destructive: true, onPress: () => historyActions && void deleteHistoryItem(historyActions) },
        ]}
      />
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
    fontWeight: '600',
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
    fontWeight: '700',
  },
  block: {
    gap: 6,
  },
  blockTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 14,
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
  infoBox: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: theme.radius.sm,
    backgroundColor: '#EFF6FF',
    padding: 12,
    gap: 5,
  },
  infoText: {
    color: '#1E3A8A',
    fontSize: 13,
    lineHeight: 18,
  },
  infoSmall: {
    color: '#1D4ED8',
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    marginTop: 4,
  },
  sourceBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card,
    padding: 12,
    gap: 4,
  },
  uploadBox: {
    minHeight: 220,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
    gap: 6,
  },
  uploadTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  preview: {
    width: '100%',
    height: 300,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  checkboxRow: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
    padding: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
    marginTop: 1,
  },
  checkboxOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    fontWeight: '700',
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
    backgroundColor: theme.colors.card,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  costText: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  successText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
  },
  resultBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg,
    padding: 12,
    gap: 10,
  },
  reviewSaveBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card,
    padding: 12,
    gap: 10,
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
    backgroundColor: theme.colors.card,
    padding: 12,
    gap: 10,
  },
  historyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  urgentTitle: {
    color: '#B91C1C',
    fontWeight: '700',
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
    backgroundColor: theme.colors.card,
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
    padding: 10,
  },
})
