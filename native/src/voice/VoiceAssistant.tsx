import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, DeviceEventEmitter, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { API_BASE_URL } from '../config'
import { requestAiDataSharingPermission } from '../lib/aiConsent'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { theme } from '../ui/theme'

type OpenVoiceAssistantInput = {
  transcript?: string
  source?: 'siri' | 'button'
  autoSubmit?: boolean
}

type VoiceAssistantContextValue = {
  openVoiceAssistant: (input?: OpenVoiceAssistantInput) => void
}

type VoiceDraft = {
  action: string
  transcript: string
  localDate?: string
  summary: string
  confirmationMessage: string
  canConfirm: boolean
  autoSave?: boolean
  recipe?: { text?: string }
  appTarget?: {
    title?: string
    path?: string
    buttonLabel?: string
    nativeTarget?: any
  }
  food?: {
    entries?: Array<{ name: string; description?: string | null }>
    draftText?: string
    sourceDate?: string
    mealName?: string
    nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number }
  }
}

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | null>(null)
const VOICE_REPLY_KEY = 'helfi_voice_reply_enabled_v1'
const FOOD_FAVORITES_KEY = 'helfi_native_food_favorites_v2'
const MAX_VOICE_FAVORITES = 120
const VOICE_ASSISTANT_OPENING_EVENT = 'helfi:voice-assistant-opening'

function audioMimeFromUri(uri: string) {
  const lower = uri.toLowerCase()
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  return 'audio/mp4'
}

function todayLocalDate() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fallbackNativeTargetForAppTarget(appTarget?: VoiceDraft['appTarget'] | null) {
  const title = cleanFavoriteText(appTarget?.title || appTarget?.buttonLabel || '', 120).toLowerCase()
  const path = cleanFavoriteText(appTarget?.path || '', 200).toLowerCase()

  const foodActionTarget = (action: string) => ({
    type: 'stack',
    route: 'TrackCalories',
    params: { voiceAction: action, voiceMeal: 'breakfast', voiceActionNonce: Date.now() },
  })

  if (title.includes('add food entry')) return foodActionTarget('openAddFoodEntry')
  if (path.startsWith('/food/build-meal')) return null
  if (title.includes('build a meal')) return foodActionTarget('openBuildMeal')
  if (title.includes('favorites') || title.includes('favourites')) return foodActionTarget('openFavorites')
  if (title.includes('exercise')) return foodActionTarget('openExercise')
  if (title.includes('food diary') || path === '/food') return { type: 'tab', tab: 'Food' }
  if (title.includes('dashboard') || path === '/dashboard') return { type: 'tab', tab: 'Dashboard' }
  if (title.includes('insights') || path.startsWith('/insights')) return { type: 'tab', tab: 'Insights' }
  if (title.includes('settings') || path.startsWith('/settings')) return { type: 'tab', tab: 'Settings' }
  if (title.includes('water')) return { type: 'stack', route: 'WaterIntake' }
  if (title.includes('mood journal')) return { type: 'stack', route: 'MoodTracker', params: { tab: 'journal' } }
  if (title.includes('mood tracker') || title === 'mood') return { type: 'stack', route: 'MoodTracker', params: { tab: 'checkin' } }
  if (title.includes('billing') || path === '/billing') return { type: 'stack', route: 'Billing' }
  if (title.includes('practitioner')) return { type: 'stack', route: 'Practitioners' }
  return null
}

function cleanFavoriteText(value: unknown, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function playableAudioUri(audioUri: string) {
  const match = /^data:(audio\/[^;]+);base64,(.+)$/s.exec(audioUri)
  if (!match) return audioUri
  const mime = match[1].toLowerCase()
  const ext = mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : 'm4a'
  const file = new FileSystem.File(FileSystem.Paths.cache, `helfi-voice-${Date.now()}.${ext}`)
  file.write(match[2], { encoding: 'base64' })
  return file.uri
}

function normalizeVoiceFavorite(raw: any, source: 'saved' | 'library') {
  if (!raw || typeof raw !== 'object') return null
  const label = cleanFavoriteText(raw?.label || raw?.name || raw?.description || raw?.raw?.label || raw?.raw?.name)
  if (!label) return null
  const description = cleanFavoriteText(raw?.description || raw?.raw?.description || label, 500)
  const meal = cleanFavoriteText(raw?.meal || raw?.category || raw?.persistedCategory || raw?.raw?.meal || raw?.raw?.category, 40).toLowerCase()
  const nutrition = raw?.nutrition || raw?.nutrients || raw?.total || raw?.raw?.nutrition || raw?.raw?.nutrients || raw?.raw?.total || null
  return {
    id: source === 'saved' ? cleanFavoriteText(raw?.id, 120) : '',
    label,
    description: description || label,
    meal,
    nutrition,
    total: raw?.total || nutrition,
    items: Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.raw?.items) ? raw.raw.items : null,
  }
}

async function loadVoiceFavorites(sessionToken?: string | null) {
  const byLabel = new Map<string, any>()
  const add = (favorite: any) => {
    const normalized = normalizeVoiceFavorite(favorite, favorite?.__voiceSource === 'library' ? 'library' : 'saved')
    if (!normalized?.label) return
    const key = normalized.label.toLowerCase()
    if (!byLabel.has(key)) byLabel.set(key, normalized)
  }

  try {
    const raw = await AsyncStorage.getItem(FOOD_FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const list = Array.isArray(parsed) ? parsed : []
    list.forEach(add)
  } catch {
    // Recent foods from the server can still make voice matching useful.
  }

  if (sessionToken) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/food-log/library?limit=200`, {
        headers: buildNativeAuthHeaders(sessionToken, { includeCookie: true }),
      })
      const data: any = await res.json().catch(() => ({}))
      const logs = Array.isArray(data?.logs) ? data.logs : []
      logs.forEach((entry: any) => add({ ...entry, __voiceSource: 'library' }))
    } catch {
      // Voice still works for directly named foods if the recent-food list is unavailable.
    }
  }

  return Array.from(byLabel.values()).slice(0, MAX_VOICE_FAVORITES)
}

export function VoiceAssistantProvider({ children }: { children: React.ReactNode }) {
  const { mode, session } = useAppMode()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<VoiceDraft | null>(null)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [recordingStartedAt, setRecordingStartedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [voiceReply, setVoiceReply] = useState(false)
  const [chargedCredits, setChargedCredits] = useState<number | null>(null)
  const [autoSubmitToken, setAutoSubmitToken] = useState(0)
  const autoSubmittedRef = useRef(0)
  const soundRef = useRef<Audio.Sound | null>(null)
  const voiceRecordingSupported = !(Platform.OS === 'ios' && (Platform as any).isPad === true)

  useEffect(() => {
    AsyncStorage.getItem(VOICE_REPLY_KEY)
      .then((value) => setVoiceReply(value === '1'))
      .catch(() => {})
  }, [])

  const setVoiceReplyPreference = useCallback((value: boolean) => {
    setVoiceReply(value)
    AsyncStorage.setItem(VOICE_REPLY_KEY, value ? '1' : '0').catch(() => {})
  }, [])

  const stopPlayback = useCallback(async () => {
    const sound = soundRef.current
    soundRef.current = null
    if (sound) {
      await sound.unloadAsync().catch(() => {})
    }
  }, [])

  const playAudio = useCallback(
    async (audioUri?: string | null) => {
      if (!audioUri) return
      try {
        await stopPlayback()
        const uri = await playableAudioUri(audioUri)
        const created = await Audio.Sound.createAsync({ uri }, { shouldPlay: true })
        soundRef.current = created.sound
      } catch {
        // Text is still shown if playback fails.
      }
    },
    [stopPlayback],
  )

  const requestVoiceReply = useCallback(
    async (text: string) => {
      if (!session?.token || !text.trim()) return
      try {
        const res = await fetch(`${API_BASE_URL}/api/native-voice-assistant-tts`, {
          method: 'POST',
          headers: buildNativeAuthHeaders(session.token, { json: true }),
          body: JSON.stringify({ text }),
        })
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) return
        setChargedCredits((current) => {
          const extra = Number(data?.chargedCredits)
          if (!Number.isFinite(extra)) return current
          return (current || 0) + extra
        })
        if (data?.audio) {
          void playAudio(String(data.audio))
        }
      } catch {
        // The written review stays available even if spoken playback fails.
      }
    },
    [playAudio, session?.token],
  )

  const openVoiceAssistant = useCallback((input?: OpenVoiceAssistantInput) => {
    DeviceEventEmitter.emit(VOICE_ASSISTANT_OPENING_EVENT)
    setDraft(null)
    setChargedCredits(null)
    setTranscript(input?.transcript || '')
    const shouldAutoSubmit = Boolean(input?.autoSubmit && input.transcript)
    setTimeout(() => {
      setOpen(true)
      if (shouldAutoSubmit) setAutoSubmitToken((value) => value + 1)
    }, 140)
  }, [])

  const closePanel = useCallback(() => {
    if (recording) {
      recording.stopAndUnloadAsync().catch(() => {})
      setRecording(null)
    }
    stopPlayback().catch(() => {})
    setOpen(false)
  }, [recording, stopPlayback])

  const saveDraft = useCallback(
    async (targetDraft: VoiceDraft | null, options?: { automatic?: boolean }) => {
      if (!session?.token || !targetDraft?.canConfirm) return null
      setConfirming(true)
      try {
        const res = await fetch(`${API_BASE_URL}/api/native-voice-assistant-confirm`, {
          method: 'POST',
          headers: buildNativeAuthHeaders(session.token, { json: true }),
          body: JSON.stringify({ draft: targetDraft }),
        })
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Could not save that.')
        const resultKind = String(data?.result?.kind || '').toLowerCase()
        if (resultKind === 'food' || resultKind === 'exercise' || resultKind === 'water') {
          DeviceEventEmitter.emit('helfi:food-log-changed', {
            localDate: targetDraft.localDate || todayLocalDate(),
            source: 'voice-assistant',
            kind: resultKind,
          })
        }
        const message = data?.result?.message || 'Done.'
        if (options?.automatic && voiceReply) {
          void requestVoiceReply(String(message))
        }
        Alert.alert(options?.automatic ? 'Done' : 'Saved', message)
        closePanel()
        return data
      } catch (error: any) {
        Alert.alert('Could not save', error?.message || 'Please try again.')
        return null
      } finally {
        setConfirming(false)
      }
    },
    [closePanel, requestVoiceReply, session?.token, voiceReply],
  )

  const sendDraftRequest = useCallback(
    async (options?: { audioUri?: string; durationMillis?: number; transcriptOverride?: string }) => {
      if (!session?.token) return
      const typedTranscript = (options?.transcriptOverride ?? transcript).trim()
      if (!options?.audioUri && !typedTranscript) {
        Alert.alert('Nothing heard', 'Please record or type a request first.')
        return
      }

      const aiAllowed = await requestAiDataSharingPermission()
      if (!aiAllowed) {
        Alert.alert('AI request not sent', 'No data was sent. You can still use non-AI tracking in Helfi.')
        return
      }

      setBusy(true)
      setDraft(null)
      setChargedCredits(null)
      try {
        let res: Response
        const favorites = await loadVoiceFavorites(session.token)
        if (options?.audioUri) {
          const form = new FormData()
          const name = options.audioUri.split('/').pop() || `helfi-voice-${Date.now()}.m4a`
          form.append('audio', { uri: options.audioUri, name, type: audioMimeFromUri(options.audioUri) } as any)
          form.append('durationMillis', String(options.durationMillis || 0))
          form.append('localDate', todayLocalDate())
          form.append('tzOffsetMin', String(new Date().getTimezoneOffset()))
          form.append('voiceReply', 'false')
          form.append('favorites', JSON.stringify(favorites))
          res = await fetch(`${API_BASE_URL}/api/native-voice-assistant`, {
            method: 'POST',
            headers: buildNativeAuthHeaders(session.token),
            body: form,
          })
        } else {
          res = await fetch(`${API_BASE_URL}/api/native-voice-assistant`, {
            method: 'POST',
            headers: buildNativeAuthHeaders(session.token, { json: true }),
            body: JSON.stringify({
              transcript: typedTranscript,
              localDate: todayLocalDate(),
              tzOffsetMin: new Date().getTimezoneOffset(),
              voiceReply: false,
              favorites,
            }),
          })
        }

        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || 'Helfi could not process that request.')
        }
        setTranscript(String(data?.transcript || typedTranscript || '').trim())
        const nextDraft = data?.draft || null
        setDraft(nextDraft)
        setChargedCredits(Number.isFinite(Number(data?.chargedCredits)) ? Number(data.chargedCredits) : null)
        if (nextDraft?.autoSave && nextDraft?.canConfirm) {
          await saveDraft(nextDraft, { automatic: true })
          return
        }
        if (voiceReply && nextDraft) {
          const speechText = nextDraft?.recipe?.text || nextDraft?.confirmationMessage || nextDraft?.summary || ''
          void requestVoiceReply(String(speechText))
        }
      } catch (error: any) {
        Alert.alert('Try again', error?.message || 'Helfi could not process that request.')
      } finally {
        setBusy(false)
      }
    },
    [requestVoiceReply, saveDraft, session?.token, transcript, voiceReply],
  )

  useEffect(() => {
    if (!open || !transcript || autoSubmittedRef.current === autoSubmitToken) return
    if (autoSubmitToken <= 0) return
    autoSubmittedRef.current = autoSubmitToken
    void sendDraftRequest({ transcriptOverride: transcript })
  }, [autoSubmitToken, open, sendDraftRequest, transcript])

  const startRecording = useCallback(async () => {
    try {
      if (!voiceRecordingSupported) {
        Alert.alert('Type your request instead', 'Voice recording is iPhone only for now. You can type your request here on iPad.')
        return
      }
      if (recording) return
      setDraft(null)
      setChargedCredits(null)
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to use Helfi voice.')
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      })
      const created = new Audio.Recording()
      await created.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY)
      await created.startAsync()
      setRecording(created)
      setRecordingStartedAt(Date.now())
    } catch (error: any) {
      Alert.alert('Recording failed', error?.message || 'Please try again.')
    }
  }, [recording, voiceRecordingSupported])

  const stopRecording = useCallback(async () => {
    if (!recording) return
    try {
      setBusy(true)
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {})
      const uri = recording.getURI()
      const durationMillis = Math.max(0, Date.now() - recordingStartedAt)
      setRecording(null)
      if (uri) {
        await sendDraftRequest({ audioUri: uri, durationMillis })
      }
    } catch (error: any) {
      Alert.alert('Recording failed', error?.message || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }, [recording, recordingStartedAt, sendDraftRequest])

  const confirmDraft = useCallback(async () => {
    await saveDraft(draft)
  }, [draft, saveDraft])

  const openAppTarget = useCallback(() => {
    const path = draft?.appTarget?.path
    if (!path) return
    const nativeTarget = draft.appTarget?.nativeTarget || fallbackNativeTargetForAppTarget(draft.appTarget) || null
    DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
      title: draft.appTarget?.title || 'Helfi',
      path,
      nativeTarget,
    })
    if (nativeTarget?.type === 'foodAction' && typeof nativeTarget.action === 'string') {
      const emitFoodAction = () => {
        DeviceEventEmitter.emit('helfi:food-voice-action', {
          action: nativeTarget.action,
          meal: typeof nativeTarget.meal === 'string' ? nativeTarget.meal : 'breakfast',
        })
      }
      setTimeout(emitFoodAction, 500)
      setTimeout(emitFoodAction, 1100)
    }
    closePanel()
  }, [closePanel, draft])

  const value = useMemo(() => ({ openVoiceAssistant }), [openVoiceAssistant])
  const visibleForUser = mode === 'signedIn' && Boolean(session?.token)

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
      {visibleForUser && (
        <>
          <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={closePanel}>
            <View style={styles.panel}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Talk to Helfi</Text>
                  <Text style={styles.subtitle}>Tell Helfi what you want done.</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closePanel} style={styles.iconButton}>
                  <Feather name="x" size={22} color={theme.colors.text} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.replyRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Text reply"
                    onPress={() => setVoiceReplyPreference(false)}
                    style={[styles.segment, !voiceReply && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, !voiceReply && styles.segmentTextActive]}>Text reply</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Spoken reply"
                    onPress={() => setVoiceReplyPreference(true)}
                    style={[styles.segment, voiceReply && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, voiceReply && styles.segmentTextActive]}>Spoken reply</Text>
                  </Pressable>
                </View>

                {voiceRecordingSupported ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={recording ? 'Stop recording' : 'Record command'}
                    onPress={recording ? stopRecording : startRecording}
                    disabled={busy}
                    style={[styles.recordButton, recording && styles.recordingButton, busy && styles.disabled]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Feather name={recording ? 'square' : 'mic'} size={22} color="#FFFFFF" />
                        <Text style={styles.recordText}>{recording ? 'Stop recording' : 'Record command'}</Text>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.noticeBox}>
                    <Text style={styles.noticeTitle}>Type-only on iPad</Text>
                    <Text style={styles.noticeText}>Voice recording is iPhone only for now. Type your request below.</Text>
                  </View>
                )}

                <View style={styles.section}>
                  <Text style={styles.label}>Helfi heard</Text>
                  <TextInput
                    value={transcript}
                    onChangeText={(value) => {
                      setTranscript(value)
                      setDraft(null)
                    }}
                    placeholder={voiceRecordingSupported ? 'Your spoken request will appear here.' : 'Type your request here.'}
                    multiline
                    style={styles.input}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send request"
                    onPress={() => sendDraftRequest()}
                    disabled={busy || !transcript.trim()}
                    style={[styles.secondaryButton, (busy || !transcript.trim()) && styles.secondaryDisabled]}
                  >
                    <Text style={styles.secondaryText}>Send request</Text>
                  </Pressable>
                </View>

                {draft && (
                  <View style={styles.section}>
                    <Text style={styles.label}>Review</Text>
                    <Text style={styles.summary}>{draft.summary}</Text>
                    <Text style={styles.message}>{draft.recipe?.text || draft.confirmationMessage}</Text>
                    {draft.food?.entries?.length ? (
                      <View style={styles.entryList}>
                        {draft.food.entries.map((entry, index) => (
                          <View key={`${entry.name}-${index}`} style={styles.entryRow}>
                            <Text style={styles.entryText}>
                              {index + 1}. {entry.name}
                            </Text>
                            {entry.description ? <Text style={styles.entrySubtext}>{entry.description}</Text> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {draft.food?.nutrition?.calories ? (
                      <Text style={styles.creditText}>
                        Estimate: {Math.round(Number(draft.food.nutrition.calories) || 0)} kcal
                      </Text>
                    ) : null}
                    {draft.food?.draftText ? <Text style={styles.message}>{draft.food.draftText}</Text> : null}
                    {draft.appTarget?.path ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={draft.appTarget.buttonLabel || 'Open Helfi tool'}
                        onPress={openAppTarget}
                        style={styles.handoffButton}
                      >
                        <Text style={styles.handoffText}>{draft.appTarget.buttonLabel || 'Open Helfi tool'}</Text>
                      </Pressable>
                    ) : null}
                    {chargedCredits !== null && (
                      <Text style={styles.creditText}>Charged: {chargedCredits} credits</Text>
                    )}
                  </View>
                )}
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={closePanel} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save now"
                  onPress={confirmDraft}
                  disabled={!draft?.canConfirm || confirming}
                  style={[styles.confirmButton, (!draft?.canConfirm || confirming) && styles.confirmDisabled]}
                >
                  {confirming ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Save now</Text>}
                </Pressable>
              </View>
            </View>
          </Modal>
        </>
      )}
    </VoiceAssistantContext.Provider>
  )
}

export function useVoiceAssistant() {
  const ctx = useContext(VoiceAssistantContext)
  if (!ctx) {
    throw new Error('useVoiceAssistant must be used inside VoiceAssistantProvider')
  }
  return ctx
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: '#F7FAF9' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCE8DF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: 24, fontWeight: '900', color: theme.colors.text },
  subtitle: { marginTop: 4, color: theme.colors.muted, fontWeight: '700' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF5F1' },
  content: { padding: 18, gap: 16 },
  replyRow: { flexDirection: 'row', backgroundColor: '#E8F2EA', borderRadius: 8, padding: 4 },
  segment: { flex: 1, minHeight: 42, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#FFFFFF' },
  segmentText: { color: theme.colors.muted, fontWeight: '800' },
  segmentTextActive: { color: theme.colors.text },
  recordButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: '#41AD49',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  recordingButton: { backgroundColor: '#B42318' },
  disabled: { opacity: 0.65 },
  recordText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  noticeBox: { borderRadius: 8, borderWidth: 1, borderColor: '#CFE8D4', backgroundColor: '#F2FBF4', padding: 12, gap: 4 },
  noticeTitle: { color: theme.colors.text, fontWeight: '900' },
  noticeText: { color: theme.colors.muted, lineHeight: 20 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#DDE8E1', padding: 14, gap: 10 },
  label: { color: theme.colors.text, fontSize: 14, fontWeight: '900' },
  input: {
    minHeight: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6E4DA',
    padding: 12,
    color: theme.colors.text,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 21,
    backgroundColor: '#FBFDFC',
  },
  secondaryButton: { minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F2EA' },
  secondaryDisabled: { opacity: 0.5 },
  secondaryText: { color: '#226B2C', fontWeight: '900' },
  handoffButton: { minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#41AD49' },
  handoffText: { color: '#FFFFFF', fontWeight: '900' },
  summary: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  message: { color: theme.colors.text, lineHeight: 21 },
  entryList: { gap: 8, paddingTop: 4 },
  entryRow: { gap: 2 },
  entryText: { color: theme.colors.text, fontWeight: '700' },
  entrySubtext: { color: theme.colors.muted, fontSize: 12 },
  creditText: { color: theme.colors.muted, fontWeight: '700' },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCE8DF',
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF3F0' },
  cancelText: { color: theme.colors.text, fontWeight: '900' },
  confirmButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#41AD49' },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { color: '#FFFFFF', fontWeight: '900' },
})
