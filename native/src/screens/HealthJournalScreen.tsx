import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Audio } from 'expo-av'
import * as ImagePicker from 'expo-image-picker'
import { Feather } from '@expo/vector-icons'

import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type TabKey = 'entry' | 'history'

type JournalEntry = {
  id: string
  content: string
  localDate: string
  createdAt: string
  updatedAt?: string
}

type MediaItem = {
  id: string
  kind: 'image' | 'audio'
  uri: string
  fileName: string
  summary: string
  processing: boolean
  failed: boolean
}

const MAX_MEDIA_ITEMS = 6

function todayIso() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

function shiftIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(year, Math.max(0, month - 1), day || 1, 12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatDayLabel(iso: string) {
  if (iso === todayIso()) return 'Today'
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(year, Math.max(0, month - 1), day || 1)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatEntryTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function trimSummary(value: string, fallback: string) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  return (clean || fallback).slice(0, 320)
}

function mediaId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function audioMimeFromUri(uri: string) {
  const lower = String(uri || '').toLowerCase()
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.aac')) return 'audio/aac'
  return 'audio/m4a'
}

function mergeContentWithMediaNotes(content: string, summaries: string[]) {
  const base = String(content || '').trim()
  const clean = summaries.map((item) => trimSummary(item, '')).filter(Boolean)
  if (!clean.length) return base
  const list = clean.map((item, index) => `${index + 1}. ${item}`).join('\n')
  return [base, `Media notes (auto-summarized):\n${list}`].filter(Boolean).join('\n\n').trim()
}

export function HealthJournalScreen() {
  const { mode, session } = useAppMode()
  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const [activeTab, setActiveTab] = useState<TabKey>('entry')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [mediaBusy, setMediaBusy] = useState(false)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)

  const [selectedDate, setSelectedDate] = useState(todayIso())
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [editingSaving, setEditingSaving] = useState(false)

  const mediaProcessing = media.some((item) => item.processing)

  const requestJson = useCallback(async (path: string, init?: RequestInit) => {
    if (!authHeaders) throw new Error('Please sign in again.')
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers || {}),
      },
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(data?.error || 'Please try again.'))
    return data
  }, [authHeaders])

  const loadHistory = useCallback(async () => {
    if (!authHeaders) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const data = await requestJson(`/api/health-journal?date=${encodeURIComponent(selectedDate)}`)
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch (e: any) {
      setHistoryError(e?.message || 'Could not load notes')
      setEntries([])
    } finally {
      setHistoryLoading(false)
    }
  }, [authHeaders, requestJson, selectedDate])

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'history') void loadHistory()
      return () => {}
    }, [activeTab, loadHistory]),
  )

  const extractMedia = async (kind: 'image' | 'audio', uri: string, fileName: string, mimeType: string) => {
    if (!authHeaders) throw new Error('Please sign in again.')
    const fallback = kind === 'image'
      ? 'Image summarized for health journal context.'
      : 'Voice note summarized for health journal context.'

    const form = new FormData()
    form.append('kind', kind)
    form.append('file', { uri, name: fileName, type: mimeType } as any)
    const res = await fetch(`${API_BASE_URL}/api/health-journal/extract-media`, {
      method: 'POST',
      headers: authHeaders,
      body: form,
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) throw new Error('Please sign in again.')
      return fallback
    }
    return trimSummary(String(data?.summary || ''), fallback)
  }

  const addMediaItem = async (kind: 'image' | 'audio', uri: string, fileName: string, mimeType: string) => {
    if (media.filter((item) => item.kind === kind).length >= MAX_MEDIA_ITEMS) {
      setError(kind === 'image' ? 'You can add up to 6 photos.' : 'You can add up to 6 voice notes.')
      return
    }

    const id = mediaId()
    setError('')
    setMedia((prev) => [
      ...prev,
      { id, kind, uri, fileName, summary: '', processing: true, failed: false },
    ])

    try {
      const summary = await extractMedia(kind, uri, fileName, mimeType)
      setMedia((prev) =>
        prev.map((item) => item.id === id ? { ...item, summary, processing: false, failed: false } : item),
      )
    } catch (e: any) {
      setMedia((prev) =>
        prev.map((item) => item.id === id ? { ...item, processing: false, failed: true } : item),
      )
      setError(e?.message || (kind === 'image' ? 'Photo summary failed.' : 'Voice note summary failed.'))
    }
  }

  const pickPhoto = async () => {
    try {
      setMediaBusy(true)
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to add images.')
        return
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      })
      if (picked.canceled || picked.assets.length === 0) return
      const asset = picked.assets[0]
      const fileName = asset.fileName || asset.uri.split('/').pop() || `health-journal-image-${Date.now()}.jpg`
      await addMediaItem('image', asset.uri, fileName, asset.mimeType || 'image/jpeg')
    } catch (e: any) {
      Alert.alert('Photo failed', e?.message || 'Please try again.')
    } finally {
      setMediaBusy(false)
    }
  }

  const startRecording = async () => {
    if (recording) return
    try {
      setMediaBusy(true)
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to record voice notes.')
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      })
      const created = new Audio.Recording()
      await created.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await created.startAsync()
      setRecording(created)
    } catch (e: any) {
      Alert.alert('Recording failed', e?.message || 'Please try again.')
    } finally {
      setMediaBusy(false)
    }
  }

  const stopRecording = async () => {
    if (!recording) return
    try {
      setMediaBusy(true)
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {})
      const uri = recording.getURI()
      setRecording(null)
      if (uri) {
        const fileName = uri.split('/').pop() || `health-journal-audio-${Date.now()}.m4a`
        await addMediaItem('audio', uri, fileName, audioMimeFromUri(uri))
      }
    } catch (e: any) {
      Alert.alert('Recording failed', e?.message || 'Please try again.')
    } finally {
      setMediaBusy(false)
    }
  }

  const submitNote = async () => {
    if (recording) {
      setError('Please stop recording first.')
      return
    }
    if (mediaProcessing) {
      setError('Please wait for photo and voice summaries to finish.')
      return
    }
    const summaries = media.filter((item) => !item.failed).map((item) => item.summary).filter(Boolean)
    const content = mergeContentWithMediaNotes(note, summaries)
    if (!content.trim()) {
      setError('Please add a note, photo, or voice note first.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      await requestJson('/api/health-journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, localDate: todayIso() }),
      })
      setNote('')
      setMedia([])
      setNotice('Saved. Media was summarized and only summary text was kept.')
      if (activeTab === 'history' && selectedDate === todayIso()) void loadHistory()
    } catch (e: any) {
      setError(e?.message || 'Could not save note')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editingText.trim()) {
      setHistoryError('Please enter a note before saving.')
      return
    }
    setEditingSaving(true)
    setHistoryError('')
    try {
      const data = await requestJson(`/api/health-journal/${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: editingText }),
      })
      setEntries((prev) => prev.map((item) => item.id === editingId ? data.entry : item))
      setEditingId(null)
      setEditingText('')
    } catch (e: any) {
      setHistoryError(e?.message || 'Could not update note')
    } finally {
      setEditingSaving(false)
    }
  }

  const deleteEntry = (entry: JournalEntry) => {
    Alert.alert('Delete this note?', 'This removes the note from Health Journal.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await requestJson(`/api/health-journal/${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
              setEntries((prev) => prev.filter((item) => item.id !== entry.id))
            } catch (e: any) {
              setHistoryError(e?.message || 'Could not delete note')
            }
          })()
        },
      },
    ])
  }

  if (mode !== 'signedIn') {
    return (
      <Screen>
        <View style={styles.centerCard}>
          <Text style={styles.cardTitle}>Please sign in</Text>
          <Text style={styles.muted}>Health Journal is available after sign-in.</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.segment}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New entry"
            onPress={() => setActiveTab('entry')}
            style={[styles.segmentButton, activeTab === 'entry' ? styles.segmentActive : styles.segmentInactive]}
          >
            <Text style={[styles.segmentText, activeTab === 'entry' ? styles.segmentTextActive : null]}>New entry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="History"
            onPress={() => {
              setActiveTab('history')
              void loadHistory()
            }}
            style={[styles.segmentButton, activeTab === 'history' ? styles.segmentActive : styles.segmentInactive]}
          >
            <Text style={[styles.segmentText, activeTab === 'history' ? styles.segmentTextActive : null]}>History</Text>
          </Pressable>
        </View>

        {activeTab === 'entry' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>How are you feeling right now?</Text>
            <Text style={styles.muted}>Write a quick note about pain, symptoms, supplements, food, or anything health-related.</Text>
            <Text style={styles.smallMuted}>Photos and voice notes are summarized straight away. Raw files are not kept on our server.</Text>

            <View style={styles.mediaRow}>
              <Pressable onPress={pickPhoto} disabled={mediaBusy || saving} style={[styles.mediaButton, styles.photoButton, mediaBusy || saving ? styles.disabled : null]}>
                <Feather name="camera" size={15} color={theme.colors.primary} />
                <Text style={styles.photoButtonText}>{mediaBusy ? 'Working...' : 'Add photo'}</Text>
              </Pressable>
              <Pressable
                onPress={recording ? stopRecording : startRecording}
                disabled={mediaBusy || saving}
                style={[styles.mediaButton, recording ? styles.recordingButton : styles.voiceButton, mediaBusy || saving ? styles.disabled : null]}
              >
                <Feather name={recording ? 'square' : 'mic'} size={15} color={recording ? '#FFFFFF' : '#1D4ED8'} />
                <Text style={[styles.voiceButtonText, recording ? styles.recordingButtonText : null]}>
                  {recording ? 'Stop recording' : 'Record voice note'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.audioSettings}>
              <View style={styles.audioHeader}>
                <Text style={styles.audioTitle}>Audio settings</Text>
                <Text style={styles.audioPill}>Device default</Text>
              </View>
              <Text style={styles.smallMuted}>Microphone and playback use your iPhone or iPad audio settings.</Text>
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Example: 3:30pm - really tired after lunch. Took magnesium an hour ago and feel dizzy."
              placeholderTextColor="#8AA39D"
              multiline
              style={styles.textArea}
            />

            {media.length > 0 ? (
              <View style={styles.mediaList}>
                {media.map((item) => (
                  <View key={item.id} style={styles.mediaCard}>
                    {item.kind === 'image' ? (
                      <Image source={{ uri: item.uri }} style={styles.mediaImage} />
                    ) : (
                      <View style={styles.audioIconWrap}>
                        <Feather name="mic" size={22} color={theme.colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mediaName} numberOfLines={1}>{item.fileName}</Text>
                      <Text style={styles.smallMuted}>
                        {item.processing
                          ? item.kind === 'image' ? 'Summarizing photo...' : 'Summarizing voice note...'
                          : item.failed
                          ? item.kind === 'image' ? 'Could not summarize photo.' : 'Could not summarize voice note.'
                          : item.kind === 'image' ? 'Photo summarized' : 'Voice note summarized'}
                      </Text>
                    </View>
                    <Pressable onPress={() => setMedia((prev) => prev.filter((next) => next.id !== item.id))} style={styles.removeButton}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {mediaProcessing ? <Text style={styles.warning}>Media summary is in progress. Please wait before submitting.</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <View style={styles.submitRow}>
              <Text style={styles.smallMuted}>{mediaProcessing ? 'Media is still summarizing...' : "Saved with today's date and time."}</Text>
              <Pressable onPress={() => void submitNote()} disabled={saving || mediaProcessing || !!recording} style={[styles.primaryButton, saving || mediaProcessing || recording ? styles.disabled : null]}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryText}>Submit note</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={styles.dateRow}>
              <Pressable onPress={() => setSelectedDate((prev) => shiftIsoDate(prev, -1))} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>Previous</Text>
              </Pressable>
              <Pressable onPress={() => setSelectedDate(todayIso())} style={styles.dateCenter}>
                <Text style={styles.dateCenterText}>{formatDayLabel(selectedDate)}</Text>
              </Pressable>
              <Pressable onPress={() => setSelectedDate((prev) => shiftIsoDate(prev, 1))} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>Next</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => void loadHistory()} disabled={historyLoading} style={styles.refreshButton}>
              <Text style={styles.refreshText}>{historyLoading ? 'Refreshing' : 'Refresh'}</Text>
            </Pressable>

            {historyLoading ? <Text style={styles.emptyBox}>Loading notes...</Text> : null}
            {historyError ? <Text style={styles.historyError}>{historyError}</Text> : null}
            {!historyLoading && entries.length === 0 && !historyError ? <Text style={styles.emptyBox}>No notes for this day.</Text> : null}
            {entries.map((entry) => (
              <View key={entry.id} style={styles.card}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>{formatDayLabel(entry.localDate)} - {formatEntryTime(entry.createdAt)}</Text>
                  <View style={styles.historyActions}>
                    <Pressable onPress={() => {
                      setEditingId(entry.id)
                      setEditingText(entry.content)
                    }}>
                      <Text style={styles.editText}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteEntry(entry)}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
                {editingId === entry.id ? (
                  <View style={{ gap: 10, marginTop: 12 }}>
                    <TextInput
                      value={editingText}
                      onChangeText={setEditingText}
                      multiline
                      style={styles.textArea}
                    />
                    <View style={styles.editRow}>
                      <Pressable onPress={() => void saveEdit()} disabled={editingSaving} style={[styles.primaryButton, editingSaving ? styles.disabled : null]}>
                        <Text style={styles.primaryText}>{editingSaving ? 'Saving...' : 'Save'}</Text>
                      </Pressable>
                      <Pressable onPress={() => {
                        setEditingId(null)
                        setEditingText('')
                      }} style={styles.secondaryButton}>
                        <Text style={styles.secondaryText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.entryContent}>{entry.content}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    paddingBottom: theme.spacing.xl,
    gap: 14,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
    borderRadius: theme.radius.md,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentInactive: {
    backgroundColor: '#EEF4F1',
  },
  segmentText: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  centerCard: {
    margin: 16,
    padding: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    gap: 6,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  muted: {
    color: theme.colors.muted,
    marginTop: 6,
    lineHeight: 20,
  },
  smallMuted: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  photoButton: {
    backgroundColor: '#ECFDF3',
    borderColor: '#B7E4C7',
  },
  voiceButton: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  recordingButton: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  photoButtonText: {
    color: theme.colors.primary,
    fontWeight: '900',
  },
  voiceButtonText: {
    color: '#1D4ED8',
    fontWeight: '900',
  },
  recordingButtonText: {
    color: '#FFFFFF',
  },
  audioSettings: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  audioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  audioTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  audioPill: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  textArea: {
    minHeight: 132,
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    color: theme.colors.text,
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
  },
  mediaList: {
    gap: 8,
    marginTop: 12,
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 10,
    backgroundColor: '#F8FAFC',
  },
  mediaImage: {
    width: 58,
    height: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  audioIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#B7E4C7',
  },
  mediaName: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  warning: {
    marginTop: 10,
    color: '#92400E',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    marginTop: 10,
    color: theme.colors.danger,
    fontWeight: '700',
  },
  notice: {
    marginTop: 10,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  submitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryText: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.6,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dateButton: {
    borderRadius: 10,
    backgroundColor: '#EEF4F1',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateButtonText: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  dateCenter: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    paddingVertical: 10,
  },
  dateCenterText: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshText: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: theme.radius.md,
    padding: 14,
    color: theme.colors.muted,
    backgroundColor: '#F8FAFC',
  },
  historyError: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: theme.radius.md,
    padding: 14,
    color: theme.colors.danger,
    backgroundColor: '#FEF2F2',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  historyTitle: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '900',
  },
  historyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editText: {
    color: theme.colors.primary,
    fontWeight: '900',
  },
  deleteText: {
    color: theme.colors.danger,
    fontWeight: '900',
  },
  entryContent: {
    marginTop: 12,
    color: theme.colors.text,
    lineHeight: 21,
  },
  editRow: {
    flexDirection: 'row',
    gap: 10,
  },
})
