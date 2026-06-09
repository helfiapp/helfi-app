import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio } from 'expo-av'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { API_BASE_URL } from '../config'
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
  summary: string
  confirmationMessage: string
  canConfirm: boolean
  recipe?: { text?: string }
  food?: { entries?: Array<{ name: string; description?: string | null }>; draftText?: string; sourceDate?: string }
}

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | null>(null)
const VOICE_REPLY_KEY = 'helfi_voice_reply_enabled_v1'

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
        const created = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true })
        soundRef.current = created.sound
      } catch {
        // Text is still shown if playback fails.
      }
    },
    [stopPlayback],
  )

  const openVoiceAssistant = useCallback((input?: OpenVoiceAssistantInput) => {
    setDraft(null)
    setChargedCredits(null)
    setTranscript(input?.transcript || '')
    setOpen(true)
    if (input?.autoSubmit && input.transcript) {
      setAutoSubmitToken((value) => value + 1)
    }
  }, [])

  const closePanel = useCallback(() => {
    if (recording) {
      recording.stopAndUnloadAsync().catch(() => {})
      setRecording(null)
    }
    stopPlayback().catch(() => {})
    setOpen(false)
  }, [recording, stopPlayback])

  const sendDraftRequest = useCallback(
    async (options?: { audioUri?: string; durationMillis?: number; transcriptOverride?: string }) => {
      if (!session?.token) return
      const typedTranscript = (options?.transcriptOverride ?? transcript).trim()
      if (!options?.audioUri && !typedTranscript) {
        Alert.alert('Nothing heard', 'Please record or type a request first.')
        return
      }

      setBusy(true)
      setDraft(null)
      setChargedCredits(null)
      try {
        let res: Response
        if (options?.audioUri) {
          const form = new FormData()
          const name = options.audioUri.split('/').pop() || `helfi-voice-${Date.now()}.m4a`
          form.append('audio', { uri: options.audioUri, name, type: audioMimeFromUri(options.audioUri) } as any)
          form.append('durationMillis', String(options.durationMillis || 0))
          form.append('localDate', todayLocalDate())
          form.append('tzOffsetMin', String(new Date().getTimezoneOffset()))
          form.append('voiceReply', voiceReply ? 'true' : 'false')
          res = await fetch(`${API_BASE_URL}/api/native/voice-assistant`, {
            method: 'POST',
            headers: buildNativeAuthHeaders(session.token),
            body: form,
          })
        } else {
          res = await fetch(`${API_BASE_URL}/api/native/voice-assistant`, {
            method: 'POST',
            headers: buildNativeAuthHeaders(session.token, { json: true }),
            body: JSON.stringify({
              transcript: typedTranscript,
              localDate: todayLocalDate(),
              tzOffsetMin: new Date().getTimezoneOffset(),
              voiceReply,
            }),
          })
        }

        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || 'Helfi could not process that request.')
        }
        setTranscript(String(data?.transcript || typedTranscript || '').trim())
        setDraft(data?.draft || null)
        setChargedCredits(Number.isFinite(Number(data?.chargedCredits)) ? Number(data.chargedCredits) : null)
        if (data?.audio) {
          await playAudio(String(data.audio))
        }
      } catch (error: any) {
        Alert.alert('Try again', error?.message || 'Helfi could not process that request.')
      } finally {
        setBusy(false)
      }
    },
    [playAudio, session?.token, transcript, voiceReply],
  )

  useEffect(() => {
    if (!open || !transcript || autoSubmittedRef.current === autoSubmitToken) return
    if (autoSubmitToken <= 0) return
    autoSubmittedRef.current = autoSubmitToken
    void sendDraftRequest({ transcriptOverride: transcript })
  }, [autoSubmitToken, open, sendDraftRequest, transcript])

  const startRecording = useCallback(async () => {
    try {
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
      await created.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await created.startAsync()
      setRecording(created)
      setRecordingStartedAt(Date.now())
    } catch (error: any) {
      Alert.alert('Recording failed', error?.message || 'Please try again.')
    }
  }, [recording])

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
    if (!session?.token || !draft?.canConfirm) return
    setConfirming(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/native/voice-assistant/confirm`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { json: true }),
        body: JSON.stringify({ draft }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not save that.')
      Alert.alert('Saved', data?.result?.message || 'Saved.')
      closePanel()
    } catch (error: any) {
      Alert.alert('Could not save', error?.message || 'Please try again.')
    } finally {
      setConfirming(false)
    }
  }, [closePanel, draft, session?.token])

  const value = useMemo(() => ({ openVoiceAssistant }), [openVoiceAssistant])
  const visibleForUser = mode === 'signedIn' && Boolean(session?.token)

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
      {visibleForUser && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Talk to Helfi"
            onPress={() => openVoiceAssistant({ source: 'button' })}
            style={[styles.floatingButton, { bottom: Math.max(92, insets.bottom + 82) }]}
          >
            <Feather name="mic" size={24} color="#FFFFFF" />
          </Pressable>

          <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={closePanel}>
            <View style={styles.panel}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Talk to Helfi</Text>
                  <Text style={styles.subtitle}>Review before anything saves.</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closePanel} style={styles.iconButton}>
                  <Feather name="x" size={22} color={theme.colors.text} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.replyRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Text only replies"
                    onPress={() => setVoiceReplyPreference(false)}
                    style={[styles.segment, !voiceReply && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, !voiceReply && styles.segmentTextActive]}>Text only</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Voice and text replies"
                    onPress={() => setVoiceReplyPreference(true)}
                    style={[styles.segment, voiceReply && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, voiceReply && styles.segmentTextActive]}>Voice + text</Text>
                  </Pressable>
                </View>

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

                <View style={styles.section}>
                  <Text style={styles.label}>Helfi heard</Text>
                  <TextInput
                    value={transcript}
                    onChangeText={(value) => {
                      setTranscript(value)
                      setDraft(null)
                    }}
                    placeholder="Your spoken request will appear here."
                    multiline
                    style={styles.input}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Review request"
                    onPress={() => sendDraftRequest()}
                    disabled={busy || !transcript.trim()}
                    style={[styles.secondaryButton, (busy || !transcript.trim()) && styles.secondaryDisabled]}
                  >
                    <Text style={styles.secondaryText}>Review request</Text>
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
                          <Text key={`${entry.name}-${index}`} style={styles.entryText}>
                            {index + 1}. {entry.name}
                          </Text>
                        ))}
                      </View>
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
                  accessibilityLabel="Confirm save"
                  onPress={confirmDraft}
                  disabled={!draft?.canConfirm || confirming}
                  style={[styles.confirmButton, (!draft?.canConfirm || confirming) && styles.confirmDisabled]}
                >
                  {confirming ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Confirm save</Text>}
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
  floatingButton: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#41AD49',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
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
  summary: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  message: { color: theme.colors.text, lineHeight: 21 },
  entryList: { gap: 6, paddingTop: 4 },
  entryText: { color: theme.colors.text, fontWeight: '700' },
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
