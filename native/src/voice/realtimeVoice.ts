import { validatedVoiceCapability, type VoiceCapabilityRequest } from './voiceCapabilityManifest'
import { sanitizeGeneralAssistantCommand, type GeneralAssistantCommand } from './generalAssistantActions'
import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { createLocalVoiceWelcome, LOCAL_VOICE_WELCOME_TEXT } from './localVoiceWelcome'
import { createLiveVoiceUsageTracker } from './liveVoiceUsage'
import { createLiveVoiceToolTurn } from './liveVoiceToolTurn'
import { startVoiceSessionJobs, type VoiceJobRecovery } from './voiceSessionJobs'

const LIVE_REALTIME_API_BASE_URL = 'https://helfi.ai'

type RealtimeCallbacks = {
  onStatus?: (status: string) => void
  onConnectStage?: (stage: string) => void
  onError?: (message: string) => void
  onNotice?: (message: string) => void
  onAudioRoute?: (route: string) => void
  onTranscript?: (text: string) => void
  /** Actual human transcript evidence, separate from display caption batches. */
  onHumanTranscript?: (text: string) => void
  onAssistantText?: (text: string) => void
  onUserSpeech?: () => void
  onActionRequest?: (args: { request?: string; action?: string; needsReview?: boolean; capability?: VoiceCapabilityRequest; assistantCommand?: GeneralAssistantCommand }) => Promise<unknown> | unknown
  onActionRecovery?: (recovery: VoiceJobRecovery) => Promise<void> | void
  /** Server-owned billing identity, available before the media handshake. */
  onMeteredSession?: (sessionId: string) => void
}

type RealtimeSession = {
  stop: () => Promise<void>
  setMicrophoneMuted: (muted: boolean) => void
  promptAssistant: (instruction: string) => void
  flushTranscript: () => void
}

function parseRealtimeJson(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function requireWebRtc() {
  try {
    return require('react-native-webrtc')
  } catch {
    return null
  }
}

function requireInCallManager() {
  try {
    const module = require('react-native-incall-manager')
    return module?.default || module
  } catch {
    return null
  }
}

function requireHelfiAudioRoute() {
  try {
    const reactNative = require('react-native')
    const module = reactNative?.NativeModules?.HelfiAudioRoute
    if (!module?.configureForVoice || !reactNative?.NativeEventEmitter) return null
    return {
      module,
      emitter: new reactNative.NativeEventEmitter(module),
    }
  } catch {
    return null
  }
}

type VoiceMediaStats = {
  outboundPackets: number
  outboundBytes: number
  inboundPackets: number
  inboundBytes: number
  audioLevel: number
  totalAudioEnergy: number
  totalSamplesDuration: number
  outputAudioLevel: number
  outputAudioEnergy: number
  roundTripTime: number
}

function sendRealtimeEvent(dataChannel: any, payload: Record<string, unknown>) {
  if (!dataChannel || dataChannel.readyState !== 'open') return
  dataChannel.send(JSON.stringify(payload))
}

function realtimeErrorMessage(payload: any) {
  return cleanText(payload?.error?.message || payload?.message || 'The live voice service reported an error.')
}

function isNonFatalRealtimeError(payload: any) {
  const code = cleanText(payload?.error?.code || payload?.code).toLowerCase()
  return code === 'response_cancel_not_active' || code === 'input_audio_buffer_clear_empty' || code === 'output_audio_buffer_clear_empty'
}

async function readVoiceMediaStats(pc: any): Promise<VoiceMediaStats> {
  const summary: VoiceMediaStats = {
    outboundPackets: 0,
    outboundBytes: 0,
    inboundPackets: 0,
    inboundBytes: 0,
    audioLevel: 0,
    totalAudioEnergy: 0,
    totalSamplesDuration: 0,
    outputAudioLevel: 0,
    outputAudioEnergy: 0,
    roundTripTime: 0,
  }
  try {
    const report = await pc.getStats?.()
    const inspect = (stat: any) => {
      if (!stat || stat.isRemote) return
      const kind = cleanText(stat.kind || stat.mediaType).toLowerCase()
      if (stat.type === 'outbound-rtp' && kind === 'audio') {
        summary.outboundPackets += Math.max(0, Number(stat.packetsSent || 0))
        summary.outboundBytes += Math.max(0, Number(stat.bytesSent || 0))
      }
      if (stat.type === 'inbound-rtp' && kind === 'audio') {
        summary.inboundPackets += Math.max(0, Number(stat.packetsReceived || 0))
        summary.inboundBytes += Math.max(0, Number(stat.bytesReceived || 0))
        summary.outputAudioLevel = Math.max(summary.outputAudioLevel, Number(stat.audioLevel || 0))
        summary.outputAudioEnergy = Math.max(summary.outputAudioEnergy, Number(stat.totalAudioEnergy || 0))
      }
      if (stat.type === 'media-source' && (kind === 'audio' || stat.audioLevel !== undefined)) {
        summary.audioLevel = Math.max(summary.audioLevel, Number(stat.audioLevel || 0))
        summary.totalAudioEnergy = Math.max(summary.totalAudioEnergy, Number(stat.totalAudioEnergy || 0))
        summary.totalSamplesDuration = Math.max(summary.totalSamplesDuration, Number(stat.totalSamplesDuration || 0))
      }
      if ((stat.type === 'candidate-pair' && stat.nominated) || stat.type === 'remote-inbound-rtp') {
        summary.roundTripTime = Math.max(summary.roundTripTime, Number(stat.currentRoundTripTime || stat.roundTripTime || 0))
      }
    }
    if (typeof report?.forEach === 'function') {
      report.forEach(inspect)
    } else if (Array.isArray(report)) {
      report.forEach(inspect)
    } else if (report && typeof report === 'object') {
      Object.values(report).forEach(inspect)
    }
    return summary
  } catch {
    return summary
  }
}

function safeVoiceStatsText(stats: VoiceMediaStats) {
  return `out=${stats.outboundPackets}/${stats.outboundBytes} in=${stats.inboundPackets}/${stats.inboundBytes} level=${stats.audioLevel.toFixed(4)} energy=${stats.totalAudioEnergy.toFixed(4)} samples=${stats.totalSamplesDuration.toFixed(3)} rtt=${stats.roundTripTime.toFixed(3)}`
}

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeEchoText(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function likelyAssistantEcho(input: unknown, assistant: unknown, assistantAt: number) {
  // Matching text cannot distinguish microphone echo from a real repetition or
  // correction. WebRTC handles acoustic echo; genuine user text must reach review.
  void input
  void assistant
  void assistantAt
  return false
}

async function waitForVoiceIceGathering(pc: any, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Live voice session was stopped.')
  if (!pc.iceGatheringState || pc.iceGatheringState === 'complete') return
  await new Promise<void>((resolve, reject) => {
    const previous = pc.onicegatheringstatechange
    const cleanup = () => {
      clearTimeout(timeout)
      pc.onicegatheringstatechange = previous
      signal?.removeEventListener?.('abort', abort)
    }
    const abort = () => { cleanup(); reject(new Error('Live voice session was stopped.')) }
    const changed = () => {
      if (pc.iceGatheringState !== 'complete') return
      cleanup()
      resolve()
    }
    const timeout = setTimeout(() => { cleanup(); reject(new Error('The voice media connection took too long. Please try again.')) }, 10000)
    pc.onicegatheringstatechange = changed
    signal?.addEventListener?.('abort', abort)
    changed()
  })
}

function enableRemoteAudioTrack(track: any) {
  if (!track || track.kind !== 'audio') return
  try {
    track.enabled = true
  } catch {
    // Some native track wrappers expose this as read-only.
  }
  try {
    track._setVolume?.(1)
  } catch {
    // Volume control is best-effort on react-native-webrtc.
  }
}

function stopMediaStreamTracks(stream: any) {
  stream?.getTracks?.().forEach((track: any) => {
    try {
      track.stop?.()
    } catch {
      // Already stopped.
    }
  })
}

function realtimeEventId(payload: any) {
  return cleanText(payload?.response_id || payload?.response?.id || payload?.item_id || payload?.item?.id || payload?.id || payload?.event_id)
}

function collectTextFromContent(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(collectTextFromContent)
  const item = value as Record<string, unknown>
  const text = cleanText(item.text || item.transcript)
  const nested = collectTextFromContent(item.content || item.output)
  return text ? [text, ...nested] : nested
}

function extractAssistantText(payload: any) {
  const part = payload?.part && typeof payload.part === 'object' ? payload.part : null
  const direct = cleanText(payload?.delta || payload?.transcript || payload?.text || part?.transcript || part?.text)
  if (direct) return direct
  const fromResponse = collectTextFromContent(payload?.response?.output)
  if (fromResponse.length) return fromResponse.join(' ')
  const fromItem = collectTextFromContent(payload?.item)
  if (fromItem.length) return fromItem.join(' ')
  return ''
}

function localRealtimeApiBaseUrl() {
  const raw = String(process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '')
  const isLocalDevHost = __DEV__ && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(raw)
  const useLocalRealtime = process.env.EXPO_PUBLIC_USE_LOCAL_REALTIME === 'true'
  return isLocalDevHost && useLocalRealtime ? raw : ''
}

function realtimeApiBaseUrl() {
  const localRealtimeBaseUrl = localRealtimeApiBaseUrl()
  if (localRealtimeBaseUrl) return localRealtimeBaseUrl
  const isLocalDevHost = __DEV__ && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL)
  const useLocalRealtime = process.env.EXPO_PUBLIC_USE_LOCAL_REALTIME === 'true'
  return isLocalDevHost && !useLocalRealtime ? LIVE_REALTIME_API_BASE_URL : API_BASE_URL
}

export function hasNativeRealtimeVoiceSupport() {
  const rtc = requireWebRtc()
  return Boolean(rtc?.RTCPeerConnection && rtc?.mediaDevices)
}

export async function fetchHelfiRealtimeVoiceStatus(token: string): Promise<{
  available: boolean
  message?: string
  code?: string
  voice?: string
  model?: string
}> {
  try {
    const res = await fetch(`${realtimeApiBaseUrl()}/api/native/voice-assistant/realtime`, {
      method: 'GET',
      headers: { ...buildNativeAuthHeaders(token), 'x-helfi-voice-protocol': 'live-v1' },
    })
    const data = await res.json().catch(() => ({}))
    return {
      available: Boolean(res.ok && data?.available),
      message: typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : undefined,
      code: typeof data?.code === 'string' ? data.code : undefined,
      voice: typeof data?.voice === 'string' ? data.voice : undefined,
      model: typeof data?.model === 'string' ? data.model : undefined,
    }
  } catch {
    return {
      available: false,
      code: 'network_unavailable',
      message: 'Live voice cannot reach the server. Text and camera still work.',
    }
  }
}

export async function startHelfiRealtimeVoiceSession(params: {
  token: string
  billingSessionId: string
  assistantSessionId?: string
  localDate?: string
  timeZone?: string
  greetOnConnect?: boolean
  signal?: AbortSignal
  callbacks?: RealtimeCallbacks
}): Promise<RealtimeSession> {
  if (params.signal?.aborted) {
    throw new Error('Live voice session was stopped.')
  }
  const generalHeaders: Record<string, string> = {}
  try {
    const day = params.localDate || '', zone = params.timeZone || ''
    if (/^[A-Za-z0-9_-]{1,120}$/.test(params.assistantSessionId || '') && /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T12:00:00Z`).toISOString().slice(0,10) === day && zone && zone.length <= 100) {
      const timeZone = new Intl.DateTimeFormat('en-GB', { timeZone: zone }).resolvedOptions().timeZone
      Object.assign(generalHeaders, { 'x-helfi-voice-capabilities': 'general-assistant-v1,symptom-analysis-v1', 'x-helfi-assistant-session-id': params.assistantSessionId!, 'x-helfi-assistant-local-date': day, 'x-helfi-assistant-time-zone': timeZone })
    }
  } catch { /* Invalid optional context retains the installed legacy handshake. */ }

  const rtc = requireWebRtc()
  if (!rtc?.RTCPeerConnection || !rtc?.mediaDevices || !rtc?.RTCSessionDescription) {
    throw new Error('Live voice is not available in this build yet.')
  }

  const { RTCPeerConnection, RTCSessionDescription, mediaDevices } = rtc
  const inCallManager = requireInCallManager()
  const audioRouteBridge = requireHelfiAudioRoute()
  const callbacks = params.callbacks || {}
  const liveUsage = createLiveVoiceUsageTracker({ voiceModel: 'gpt-live-1', backendModel: 'gpt-6-luna' })
  let voiceProtocol: 'live-v1' | 'realtime' = 'live-v1'
  let meteredSessionId = ''
  let voiceJobs: ReturnType<typeof startVoiceSessionJobs> | null = null
  let userHasSpoken = false
  const connectStartedAt = Date.now()
  let nativeAudioConfigured = false
  const reportConnectStage = (stage: string, detail = '') => {
    console.info(`[voice realtime timing] ${stage} ${Date.now() - connectStartedAt}ms${detail ? ` ${detail}` : ''}`)
    callbacks.onConnectStage?.(stage)
  }
  callbacks.onStatus?.('connecting')
  reportConnectStage('start')

  const applyPreferredAudioRoute = async () => {
    if (audioRouteBridge) {
      const route = nativeAudioConfigured
        ? ''
        : cleanText(await audioRouteBridge.module.configureForVoice())
      nativeAudioConfigured = true
      if (route) callbacks.onAudioRoute?.(route)
      const state = await audioRouteBridge.module.getVoiceAudioState?.()
      console.info('[voice realtime audio]', JSON.stringify(state || {}))
      return
    }
    inCallManager?.start?.({ media: 'audio', auto: true })
    inCallManager?.setForceSpeakerphoneOn?.(true)
    inCallManager?.setSpeakerphoneOn?.(true)
    callbacks.onAudioRoute?.('iPhone speaker')
  }
  try {
    await applyPreferredAudioRoute()
  } catch {
    // WebRTC can still connect if the optional route helper cannot be applied.
  }

  if (params.signal?.aborted) {
    try { inCallManager?.stop?.() } catch {}
    throw new Error('Live voice session was stopped.')
  }

  // OpenAI supplies the remote media candidates in its SDP answer. Its Live
  // WebRTC setup needs no external STUN server; an unreachable extra server can
  // otherwise hold local candidate gathering open before Helfi is even called.
  const pc = new RTCPeerConnection({ iceServers: [] })
  let localStream: any
  try {
    localStream = await mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
    })
  } catch (error) {
    try { pc.close() } catch {}
    try { inCallManager?.stop?.() } catch {}
    throw error
  }
  reportConnectStage('microphone-ready')
  if (params.signal?.aborted) {
    stopMediaStreamTracks(localStream)
    try {
      pc.close()
    } catch {
      // Already closed.
    }
    throw new Error('Live voice session was stopped.')
  }
  const remoteStreams: any[] = []
  localStream.getTracks().forEach((track: any) => pc.addTrack(track, localStream))

  let dataChannel: any = null
  let audioRouteSubscription: any = null
  let stopped = false
  let liveCloseSent = false
  let gracefulClosePromise: Promise<void> | null = null
  let finishGracefulClose: (() => void) | null = null
  let dataChannelOpen = false
  let peerConnected = false
  let sessionReady = false
  let microphoneSending = false
  let remoteAudioReady = false
  let assistantAudioPlaying = false
  let statsTimer: ReturnType<typeof setInterval> | null = null
  let evidenceTimer: ReturnType<typeof setInterval> | null = null
  let responseRecoveryTimer: ReturnType<typeof setTimeout> | null = null
  let responseFailureTimer: ReturnType<typeof setTimeout> | null = null
  let silenceTimer: ReturnType<typeof setTimeout> | null = null
  let captionTimer: ReturnType<typeof setTimeout> | null = null
  let playbackTimer: ReturnType<typeof setInterval> | null = null
  let outputEnergy = 0
  let lastOutputActivityAt = 0
  let localWelcome: ReturnType<typeof createLocalVoiceWelcome> | null = null
  let welcomeCaptionCandidate = ''
  const liveCaptionFragments: { speaker: 'user' | 'assistant'; delta: string; start_ms: number; end_ms: number }[] = []
  let liveUserText = ''
  let humanCommandText = ''
  let humanCommandTooLarge = false
  let liveAssistantText = ''
  const seenLiveEvents = new Set<string>()
  let silenceReminderSent = false
  let readinessSettled = false
  let readinessError = ''
  let resolveReadiness: (() => void) | null = null
  const readinessPromise = new Promise<void>((resolve) => {
    resolveReadiness = resolve
  })
  const emitStatus = (status: string) => {
    if (stopped && status !== 'closed') return
    callbacks.onStatus?.(status)
  }
  if (audioRouteBridge) {
    audioRouteSubscription = audioRouteBridge.emitter.addListener('HelfiAudioRouteChanged', (event: any) => {
      if (stopped) return
      if (event?.interrupted) {
        const message = 'iPhone audio was interrupted. Please tap Try again when you are ready.'
        callbacks.onError?.(message)
        emitStatus('failed')
        return
      }
      const route = cleanText(event?.route)
      if (route) callbacks.onAudioRoute?.(route)
    })
  }
  const clearResponseTimers = () => {
    if (responseRecoveryTimer) {
      clearTimeout(responseRecoveryTimer)
      responseRecoveryTimer = null
    }
    if (responseFailureTimer) {
      clearTimeout(responseFailureTimer)
      responseFailureTimer = null
    }
  }
  const clearSilenceTimer = () => {
    if (!silenceTimer) return
    clearTimeout(silenceTimer)
    silenceTimer = null
  }
  const armSilenceReminder = () => {
    clearSilenceTimer()
    if (stopped || silenceReminderSent || !readinessSettled || !dataChannelOpen) return
    silenceTimer = setTimeout(() => {
      if (stopped || silenceReminderSent || !dataChannelOpen) return
      silenceReminderSent = true
      const message = "I didn't hear anything. Please try speaking again."
      callbacks.onNotice?.(message)
      emitStatus('live')
      if (voiceProtocol === 'live-v1') {
        sendRealtimeEvent(dataChannel, { type: 'session.instructions.append', delegation_id: null, content: `Say briefly: ${message} Then listen again.` })
        return
      }
      sendRealtimeEvent(dataChannel, {
        type: 'response.create',
        response: {
          instructions: `Say exactly: ${message} Then listen again.`,
          output_modalities: ['audio'],
        },
      })
    }, 12000)
  }
  const stopOpeningWelcome = (reason: string) => {
    welcomeCaptionCandidate = ''
    if (!params.greetOnConnect) return Promise.resolve()
    return localWelcome?.stop(reason) || Promise.resolve()
  }
  const callerCaptionInterruptsWelcome = (text: string) => {
    if (!localWelcome?.isPlaying()) return true
    // A microphone can pick up the exact bundled clip. Defer interruption
    // while its captions match that clip's prefix. Preserve all caller text;
    // the first differing word still interrupts normally ("Hi, log water").
    welcomeCaptionCandidate = (welcomeCaptionCandidate + text).slice(0, LOCAL_VOICE_WELCOME_TEXT.length * 2)
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
    const candidate = normalize(welcomeCaptionCandidate)
    return !candidate || !normalize(LOCAL_VOICE_WELCOME_TEXT).startsWith(candidate)
  }
  // A bundled, verified recording is deterministic; provider startup messages
  // alone do not guarantee an opening spoken turn. Keep WebRTC's audio session.
  localWelcome = createLocalVoiceWelcome({
    playbackId: `welcome-${params.billingSessionId}`.slice(0, 100),
    isCurrent: () => !stopped && !params.signal?.aborted,
    assetUri: async () => {
      const { Asset } = require('expo-asset')
      const asset = Asset.fromModule(require('../../assets/audio/helfi-welcome.mp3'))
      await asset.downloadAsync()
      return asset.localUri || asset.uri || ''
    },
    player: audioRouteBridge?.module,
    listen: listener => audioRouteBridge?.emitter.addListener('HelfiVoiceWelcomePlayback', listener) || { remove: () => {} },
    onStage: stage => {
      reportConnectStage(stage)
    },
    onPlaying: playing => {
      welcomeCaptionCandidate = ''
      if (stopped || params.signal?.aborted) return
      if (playing) { clearSilenceTimer(); emitStatus('speaking') }
      else if (!assistantAudioPlaying) { emitStatus('live'); armSilenceReminder() }
    },
    onComplete: text => {
      if (stopped || params.signal?.aborted) return
      callbacks.onAssistantText?.(text)
      recentAssistantText = text
      recentAssistantTextAt = Date.now()
      if (voiceProtocol === 'live-v1') sendRealtimeEvent(dataChannel, { type: 'session.instructions.append', delegation_id: null, content: 'The application has played its opening welcome: Hi, I’m Helfi. What can I help you with? Do not repeat the welcome. Listen to the caller. The recording is not a user request or an app action.' })
    },
    onUnavailable: message => { callbacks.onNotice?.(message); armSilenceReminder() },
  })
  const failReadiness = (message: string) => {
    if (readinessSettled) return
    readinessSettled = true
    readinessError = message
    resolveReadiness?.()
  }
  const maybeFinishReadiness = () => {
    if (readinessSettled || stopped) return
    if (!dataChannelOpen || !peerConnected || !sessionReady || !microphoneSending || !remoteAudioReady) return
    readinessSettled = true
    if (statsTimer) {
      clearInterval(statsTimer)
      statsTimer = null
    }
    reportConnectStage('microphone-sending')
    emitStatus('live')
    armSilenceReminder()
    resolveReadiness?.()
  }
  const startStatsVerification = () => {
    if (statsTimer) return
    const check = async () => {
      if (stopped || microphoneSending) return
      const stats = await readVoiceMediaStats(pc)
      if (stats.outboundPackets <= 0 || stats.outboundBytes <= 0 || stopped) return
      microphoneSending = true
      console.info('[voice realtime media] first-outbound', safeVoiceStatsText(stats))
      maybeFinishReadiness()
    }
    statsTimer = setInterval(() => {
      void check()
    }, 150)
    void check()
  }
  const startMediaEvidence = () => {
    if (evidenceTimer) return
    evidenceTimer = setInterval(() => {
      if (stopped) return
      void readVoiceMediaStats(pc).then((stats) => {
        if (!stopped) console.info('[voice realtime media] sample', safeVoiceStatsText(stats))
      })
    }, 1000)
  }
  const armMissingResponseRecovery = () => {
    clearResponseTimers()
    // Live owns continuous conversation; response.create would start delegated
    // backend work rather than recover a spoken turn.
    if (voiceProtocol === 'live-v1') return
    responseRecoveryTimer = setTimeout(() => {
      if (stopped || !dataChannelOpen) return
      reportConnectStage('response-recovery')
      sendRealtimeEvent(dataChannel, { type: 'response.create' })
      responseFailureTimer = setTimeout(() => {
        if (stopped) return
        const message = 'Helfi heard you but the voice service did not answer. Please tap Try again.'
        callbacks.onError?.(message)
        emitStatus('failed')
      }, 5000)
    }, 3500)
  }
  const stopTracks = () => {
    stopMediaStreamTracks(localStream)
    remoteStreams.forEach((stream: any) => {
      stopMediaStreamTracks(stream)
    })
    pc.getSenders?.().forEach((sender: any) => {
      try {
        sender.track?.stop?.()
      } catch {
        // Already stopped.
      }
    })
    pc.getReceivers?.().forEach((receiver: any) => {
      try {
        receiver.track?.stop?.()
      } catch {
        // Already stopped.
      }
    })
    pc.getTransceivers?.().forEach((transceiver: any) => {
      try {
        transceiver.stop?.()
      } catch {
        // Already stopped.
      }
    })
  }
  const closeRealtimeConnection = () => {
    voiceJobs?.stop()
    void stopOpeningWelcome('ended')
    clearResponseTimers()
    clearSilenceTimer()
    if (captionTimer) clearTimeout(captionTimer)
    captionTimer = null
    if (playbackTimer) clearInterval(playbackTimer)
    playbackTimer = null
    liveUserText = ''
    liveAssistantText = ''
    liveCaptionFragments.length = 0
    if (statsTimer) {
      clearInterval(statsTimer)
      statsTimer = null
    }
    if (evidenceTimer) {
      clearInterval(evidenceTimer)
      evidenceTimer = null
    }
    failReadiness('Live voice did not finish connecting to the microphone and speaker.')
    try {
      audioRouteSubscription?.remove?.()
    } catch {
      // The native audio observer may already be removed.
    }
    audioRouteSubscription = null
    if (dataChannel?.readyState === 'open') {
      if (voiceProtocol === 'live-v1' && !liveCloseSent) {
        liveCloseSent = true
        sendRealtimeEvent(dataChannel, { type: 'session.close' })
      } else if (voiceProtocol !== 'live-v1') {
        sendRealtimeEvent(dataChannel, { type: 'response.cancel' })
        sendRealtimeEvent(dataChannel, { type: 'output_audio_buffer.clear' })
        sendRealtimeEvent(dataChannel, { type: 'input_audio_buffer.clear' })
      }
    }
    stopped = true
    liveToolTurn.stop()
    voiceJobs?.stop()
    try {
      if (dataChannel) {
        dataChannel.onopen = null
        dataChannel.onmessage = null
        dataChannel.onerror = null
        dataChannel.onclose = null
      }
      dataChannel?.close?.()
    } catch {
      // Already closed.
    }
    pc.ontrack = null
    pc.onconnectionstatechange = null
    stopTracks()
    try {
      pc.close()
    } catch {
      // Already closed.
    }
    try {
      inCallManager?.setForceSpeakerphoneOn?.(null)
      inCallManager?.stop?.()
    } catch {
      // The audio route may already be released.
    }
  }
  const stopWithFinalUsage = () => {
    if (gracefulClosePromise) return gracefulClosePromise
    if (stopped || voiceProtocol !== 'live-v1' || dataChannel?.readyState !== 'open' || !sessionReady) {
      closeRealtimeConnection()
      return Promise.resolve()
    }
    // End microphone/speaker use immediately. Retain only the data channel for
    // a bounded final usage receipt; no late app action is allowed to run.
    stopped = true
    liveToolTurn.stop()
    voiceJobs?.stop()
    void stopOpeningWelcome('ended')
    stopTracks()
    gracefulClosePromise = new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timeout)
        finishGracefulClose = null
        console.info('[voice realtime usage]', JSON.stringify(liveUsage.summary()))
        closeRealtimeConnection()
        resolve()
      }
      const timeout = setTimeout(finish, 2500)
      finishGracefulClose = finish
      liveCloseSent = true
      sendRealtimeEvent(dataChannel, { type: 'session.close' })
    })
    return gracefulClosePromise
  }
  const onAbort = () => {
    failReadiness('Live voice session was stopped.')
    void stopWithFinalUsage()
    callbacks.onStatus?.('closed')
  }
  params.signal?.addEventListener?.('abort', onAbort)
  const assistantTextById = new Map<string, string>()
  const completedAssistantIds = new Set<string>()
  const handledToolCallIds = new Set<string>()
  let recentAssistantText = ''
  let recentAssistantTextAt = 0
  const rememberAssistantText = (payload: any, append = false) => {
    const id = realtimeEventId(payload) || `response-${Date.now()}`
    const text = extractAssistantText(payload)
    if (!text) return
    const next = append ? cleanText(`${assistantTextById.get(id) || ''} ${text}`) : text
    assistantTextById.set(id, next)
    recentAssistantText = next
    recentAssistantTextAt = Date.now()
    if (!append && !completedAssistantIds.has(id)) {
      completedAssistantIds.add(id)
      callbacks.onAssistantText?.(next)
    }
  }
  const flushAssistantText = (payload: any) => {
    const id = realtimeEventId(payload)
    const text = extractAssistantText(payload) || (id ? assistantTextById.get(id) : '')
    if (!text || completedAssistantIds.has(id || text)) return
    completedAssistantIds.add(id || text)
    recentAssistantText = text
    recentAssistantTextAt = Date.now()
    callbacks.onAssistantText?.(text)
  }

  const executeToolCall = (toolCall: any) => {
    if (voiceProtocol === 'live-v1') flushLiveCaptions()
    if (!toolCall || toolCall.name !== 'request_helfi_action') return Promise.resolve({ ok: false, saved: false, safeToClaimSaved: false, message: 'That voice action is unavailable.' })
    const args = parseRealtimeJson(toolCall.arguments) || {}
    const callId = cleanText(toolCall.call_id)
    if (!callId || handledToolCallIds.has(callId)) return Promise.resolve({ ok: false, saved: false, safeToClaimSaved: false, message: 'That voice action has already been handled.' })
    handledToolCallIds.add(callId)
    clearResponseTimers()
    emitStatus('thinking')
    return Promise.resolve().then(async () => {
      await stopOpeningWelcome('tool')
      if (stopped || params.signal?.aborted) return { ok: false, saved: false, safeToClaimSaved: false, message: 'Live voice has stopped.' }
      const assistantCommand = args.action === 'assistant_plan' ? sanitizeGeneralAssistantCommand(args.assistantCommand) : null
      if (args.action === 'assistant_plan' && (!assistantCommand || Object.keys(args).some(key => !['action', 'request', 'needsReview', 'assistantCommand'].includes(key)) || args.request !== undefined && (typeof args.request !== 'string' || args.request.length > 20000) || args.needsReview !== undefined && typeof args.needsReview !== 'boolean')) {
        return { ok: false, saved: false, safeToClaimSaved: false, message: 'The assistant action needs valid structured details. Nothing was submitted.' }
      }
      if (args.action === 'assistant_plan') {
        // Display batches may have flushed many times during one utterance.
        // Consume only the separate actual-caption snapshot, never model text.
        const actualHumanText = humanCommandText.trim(), oversized = humanCommandTooLarge
        humanCommandText = ''; humanCommandTooLarge = false
        if (oversized) return { ok: false, saved: false, safeToClaimSaved: false, message: 'Please split that long request into smaller parts. Nothing was submitted.' }
        callbacks.onHumanTranscript?.(actualHumanText)
      }
      return callbacks.onActionRequest?.({
      request: args.action === 'assistant_plan' ? args.request || '' : cleanText(args.request),
      action: cleanText(args.action),
      needsReview: Boolean(args.needsReview),
      ...(args.action === 'capability_action' ? { capability: validatedVoiceCapability(args.capability) || undefined } : {}),
      ...(assistantCommand ? { assistantCommand } : {}),
      })
    })
  }
  const liveToolTurn = createLiveVoiceToolTurn({
    isCurrent: () => !stopped && !params.signal?.aborted,
    executeToolCall,
    send: event => {
      if (dataChannel?.readyState !== 'open') return false
      sendRealtimeEvent(dataChannel, event)
      return true
    },
    onError: message => { callbacks.onError?.(message); emitStatus('failed') },
  })
  const handleToolCall = (toolCall: any) => {
    if (meteredSessionId) return false
    if (!toolCall || toolCall.name !== 'request_helfi_action') return false
    const callId = cleanText(toolCall.call_id)
    if (!callId || handledToolCallIds.has(callId)) return true
    executeToolCall(toolCall).then((result) => {
        if (stopped) return
        sendRealtimeEvent(dataChannel, {
          type: voiceProtocol === 'live-v1' ? 'response.item.create' : 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(result || { ok: false, saved: false, safeToClaimSaved: false, message: 'The app returned no completed result.' }),
          },
        })
        sendRealtimeEvent(dataChannel, { type: 'response.create' })
      })
      .catch((error) => {
        if (stopped) return
        sendRealtimeEvent(dataChannel, {
          type: voiceProtocol === 'live-v1' ? 'response.item.create' : 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ ok: false, saved: false, safeToClaimSaved: false, message: error?.message || 'The app could not complete that action.' }),
          },
        })
        sendRealtimeEvent(dataChannel, { type: 'response.create' })
      })
    return true
  }

  dataChannel = pc.createDataChannel('oai-events')
  dataChannel.onopen = () => {
    dataChannelOpen = true
    void applyPreferredAudioRoute().catch(() => {})
    reportConnectStage('data-channel-ready')
    maybeFinishReadiness()
  }
  const flushLiveCaptions = () => {
    if (captionTimer) clearTimeout(captionTimer)
    captionTimer = null
    if (stopped) return
    if (liveUserText.trim()) callbacks.onTranscript?.(liveUserText.trim())
    if (liveAssistantText.trim()) callbacks.onAssistantText?.(liveAssistantText.trim())
    liveUserText = ''
    liveAssistantText = ''
  }
  const receiveLiveCaption = (payload: any, speaker: 'user' | 'assistant') => {
    const delta = typeof payload.delta === 'string' ? payload.delta : ''
    if (!delta) return
    const id = cleanText(payload.event_id)
    if (id && seenLiveEvents.has(id)) return
    if (id) seenLiveEvents.add(id)
    // Live fragments can arrive after the backend has already requested the same
    // action. They are captions, not turn-start/cancel events. The next complete
    // delegated action supersedes pending preparation through onActionRequest.
    liveCaptionFragments.push({ speaker, delta, start_ms: Number(payload.start_ms || 0), end_ms: Number(payload.end_ms || 0) })
    if (liveCaptionFragments.length > 1000) liveCaptionFragments.splice(0, 500)
    if (speaker === 'user') {
      // Microphone levels include startup noise and the speaker's own clip.
      // Only a real speech event or recognized caller words interrupt it.
      if (delta.trim() && callerCaptionInterruptsWelcome(delta)) {
        userHasSpoken = true
        void stopOpeningWelcome('user-first')
      }
      liveUserText += delta
      if (humanCommandText.length + delta.length > 20000) humanCommandTooLarge = true
      else if (!humanCommandTooLarge) humanCommandText += delta
      clearSilenceTimer()
    } else liveAssistantText += delta
    // This groups captions for display only, never for consent or app execution.
    if (captionTimer) clearTimeout(captionTimer)
    captionTimer = setTimeout(flushLiveCaptions, 1000)
  }
  dataChannel.onmessage = (event: any) => {
    const payload = parseRealtimeJson(event?.data)
    if (!payload?.type) return
    if (voiceProtocol === 'live-v1') liveUsage.record(payload)
    if (stopped) {
      if (payload.type === 'session.closed') finishGracefulClose?.()
      return
    }
    console.info(`[voice realtime event] ${cleanText(payload.type)} ${Date.now() - connectStartedAt}ms`)
    if (voiceProtocol === 'live-v1') {
      if (payload.type === 'response.event') console.info('[voice realtime response]', cleanText(payload.event?.type), payload.event?.item?.type === 'function_call' ? 'function-call' : '')
      // Metered calls execute only the immutable jobs verified by our server.
      // A direct media-channel tool event must never become a second action.
      if (!meteredSessionId && liveToolTurn.handleEvent(payload)) return
      if (payload.type === 'session.started') {
        if (sessionReady) return
        sessionReady = true
        reportConnectStage('session-ready')
        maybeFinishReadiness()
        // Realtime native media exposes no audio-player completion callback.
        // Use received audio energy, never captions/packet counts, as evidence.
        playbackTimer = setInterval(() => {
          void readVoiceMediaStats(pc).then((stats) => {
            if (stopped) return
            const active = stats.outputAudioLevel > 0.005 || stats.outputAudioEnergy - outputEnergy > 0.00001
            outputEnergy = stats.outputAudioEnergy
            if (active) {
              void stopOpeningWelcome('remote-output')
              lastOutputActivityAt = Date.now()
              assistantAudioPlaying = true
              emitStatus('speaking')
            } else if (assistantAudioPlaying && Date.now() - lastOutputActivityAt > 500) {
              assistantAudioPlaying = false
              emitStatus('live')
            }
          })
        }, 250)
        return
      }
      if (payload.type === 'session.input_transcript.delta' || payload.type === 'session.output_transcript.delta') {
        receiveLiveCaption(payload, payload.type === 'session.input_transcript.delta' ? 'user' : 'assistant')
        return
      }
      if (payload.type === 'response.event') {
        const nested = payload.event
        if (nested?.type === 'response.failed' || nested?.type === 'response.incomplete') {
          callbacks.onError?.('Helfi could not complete that app request. Nothing is confirmed saved. Please check your diary before retrying.')
          emitStatus('live')
        }
        return
      }
      if (payload.type === 'session.closed') {
        console.info('[voice realtime usage]', JSON.stringify(liveUsage.summary()))
        closeRealtimeConnection()
        callbacks.onStatus?.('closed')
        return
      }
    }
    if (payload.type === 'session.created' || payload.type === 'session.updated') {
      sessionReady = true
      reportConnectStage('session-ready')
      maybeFinishReadiness()
      return
    }
    if (payload.type === 'error') {
      const message = realtimeErrorMessage(payload)
      console.warn('[voice realtime] server event error', cleanText(payload?.error?.code || payload?.code), message)
      if (!isNonFatalRealtimeError(payload)) {
        clearResponseTimers()
        callbacks.onError?.(message)
        emitStatus('failed')
      }
      return
    }
    if (payload.type === 'input_audio_buffer.speech_started') {
      userHasSpoken = true
      void stopOpeningWelcome('user-first')
      clearResponseTimers()
      clearSilenceTimer()
      silenceReminderSent = false
      assistantAudioPlaying = false
      humanCommandText = ''; humanCommandTooLarge = false
      callbacks.onUserSpeech?.()
      emitStatus('hearing')
      return
    }
    if (payload.type === 'input_audio_buffer.speech_stopped') {
      clearSilenceTimer()
      emitStatus('thinking')
      armMissingResponseRecovery()
      return
    }
    if (payload.type === 'conversation.item.input_audio_transcription.failed') {
      const message = 'I could not understand that audio. Please try speaking again.'
      callbacks.onNotice?.(message)
      emitStatus('live')
      return
    }
    if (payload.type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = String(payload.transcript || '').trim()
      if (likelyAssistantEcho(transcript, recentAssistantText, recentAssistantTextAt)) {
        sendRealtimeEvent(dataChannel, { type: 'response.cancel' })
        sendRealtimeEvent(dataChannel, { type: 'output_audio_buffer.clear' })
        emitStatus('live')
        return
      }
      if (transcript && callerCaptionInterruptsWelcome(transcript)) {
        userHasSpoken = true
        void stopOpeningWelcome('user-first')
      }
      humanCommandText = transcript.length <= 20000 ? transcript : ''; humanCommandTooLarge = transcript.length > 20000
      callbacks.onHumanTranscript?.(transcript)
      callbacks.onTranscript?.(transcript)
      emitStatus('thinking')
      return
    }
    if (payload.type === 'response.created' || payload.type === 'response.output_item.added') {
      clearResponseTimers()
      emitStatus('thinking')
      return
    }
    if (payload.type === 'response.audio.delta' || payload.type === 'response.output_audio.delta' || payload.type === 'output_audio_buffer.started') {
      clearResponseTimers()
      clearSilenceTimer()
      assistantAudioPlaying = true
      emitStatus('speaking')
      return
    }
    if (payload.type === 'output_audio_buffer.stopped' || payload.type === 'output_audio_buffer.cleared') {
      assistantAudioPlaying = false
      emitStatus('live')
      armSilenceReminder()
      return
    }
    if (
      payload.type === 'response.audio_transcript.delta' ||
      payload.type === 'response.output_audio_transcript.delta' ||
      payload.type === 'response.output_text.delta'
    ) {
      rememberAssistantText(payload, true)
      emitStatus('speaking')
      return
    }
    if (
      payload.type === 'response.audio_transcript.done' ||
      payload.type === 'response.output_audio_transcript.done' ||
      payload.type === 'response.output_text.done' ||
      payload.type === 'response.content_part.done' ||
      payload.type === 'response.output_item.done'
    ) {
      rememberAssistantText(payload)
      emitStatus('live')
      return
    }
    if (payload.type === 'response.done') {
      clearResponseTimers()
      const toolCalls = Array.isArray(payload?.response?.output)
        ? payload.response.output.filter((item: any) => item?.type === 'function_call')
        : []
      if (toolCalls.some(handleToolCall)) return
      const responseStatus = cleanText(payload?.response?.status).toLowerCase()
      if (responseStatus && responseStatus !== 'completed') {
        const reason = cleanText(payload?.response?.status_details?.reason).toLowerCase()
        if (responseStatus === 'cancelled' && (reason === 'turn_detected' || reason === 'client_cancelled')) {
          emitStatus(reason === 'turn_detected' ? 'hearing' : 'live')
          return
        }
        const message = cleanText(payload?.response?.status_details?.error?.message || reason)
          || 'Helfi could not finish that reply. Please try again.'
        callbacks.onError?.(message)
        emitStatus('failed')
        return
      }
      flushAssistantText(payload)
      if (!assistantAudioPlaying) {
        emitStatus('live')
        armSilenceReminder()
      }
      return
    }
    if (payload.type === 'response.function_call_arguments.done' && payload.name === 'request_helfi_action') {
      handleToolCall(payload)
    }
  }
  dataChannel.onerror = () => {
    failReadiness('The live voice data connection failed.')
    callbacks.onError?.('The live voice data connection failed. Please tap Try again.')
    emitStatus('failed')
  }
  dataChannel.onclose = () => {
    dataChannelOpen = false
    failReadiness('The live voice data connection closed before it was ready.')
    emitStatus('closed')
  }

  pc.onconnectionstatechange = () => {
    const connectionState = cleanText(pc.connectionState || 'connecting').toLowerCase()
    peerConnected = connectionState === 'connected'
    if (peerConnected) {
      reportConnectStage('peer-connected')
      startStatsVerification()
      startMediaEvidence()
      maybeFinishReadiness()
      return
    }
    if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
      failReadiness('The live voice media connection failed before microphone audio was ready.')
      emitStatus(connectionState)
      return
    }
    emitStatus('connecting')
  }
  pc.ontrack = (event: any) => {
    if (stopped) return
    enableRemoteAudioTrack(event?.track)
    if (event?.track) {
      event.track.onended = () => {
        if (!stopped) emitStatus('failed')
      }
    }
    const stream = event?.streams?.[0]
    if (stream && !remoteStreams.includes(stream)) {
      remoteStreams.push(stream)
      stream.getAudioTracks?.().forEach(enableRemoteAudioTrack)
    }
    remoteAudioReady = Boolean(event?.track?.kind === 'audio' || stream?.getAudioTracks?.().length)
    if (remoteAudioReady) reportConnectStage('remote-audio-ready')
    void applyPreferredAudioRoute().catch(() => {})
    maybeFinishReadiness()
  }

  try {
    const offer = await pc.createOffer({})
    if (stopped || params.signal?.aborted) {
      closeRealtimeConnection()
      throw new Error('Live voice session was stopped.')
    }
    await pc.setLocalDescription(offer)
    await waitForVoiceIceGathering(pc, params.signal)
    reportConnectStage('local-offer-ready')
    if (stopped || params.signal?.aborted) {
      closeRealtimeConnection()
      throw new Error('Live voice session was stopped.')
    }

    const res = await fetch(`${realtimeApiBaseUrl()}/api/native/voice-assistant/realtime`, {
      method: 'POST',
      headers: {
        ...buildNativeAuthHeaders(params.token),
        ...generalHeaders,
        'content-type': 'application/sdp',
        'x-helfi-ai-consent': 'true',
        'x-helfi-voice-session-id': cleanText(params.billingSessionId),
        'x-helfi-voice-protocol': 'live-v1',
        'x-helfi-voice-metering': 'server-v1',
        'x-helfi-voice-attempt-id': `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`,
        ...(params.greetOnConnect ? { 'x-helfi-voice-greeting': 'bundled-clip' } : {}),
      },
      signal: params.signal,
      body: String(pc.localDescription?.sdp || offer.sdp || ''),
    })
    const responseText = await res.text()
    voiceProtocol = res.headers?.get?.('x-helfi-voice-protocol') === 'live-v1' ? 'live-v1' : 'realtime'
    let answerSdp = responseText
    reportConnectStage('server-answer-received', res.headers?.get?.('server-timing') || '')
    if (!res.ok) {
      closeRealtimeConnection()
      params.signal?.removeEventListener?.('abort', onAbort)
      let message = 'Live voice session could not start.'
      try {
        const json = JSON.parse(responseText)
        message = json?.error || message
      } catch {
        // SDP/error text can stay as the generic user-facing message.
      }
      throw new Error(message)
    }
    if (voiceProtocol === 'live-v1') {
      const result = parseRealtimeJson(responseText)
      if (typeof result?.transport?.sdp !== 'string' || !result.transport.sdp.trim() || !result?.session?.id) {
        throw new Error('The voice service returned an incomplete connection.')
      }
      answerSdp = result.transport.sdp
      liveUsage.markAllocated()
      if (result.delegation === 'server') {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(result.helfiSession?.id || '')) throw new Error('The voice spending monitor returned no session.')
        meteredSessionId = result.helfiSession.id
        try { callbacks.onMeteredSession?.(meteredSessionId) } catch { /* A display refresh must not restart an allocated call. */ }
        liveUsage.markBackendExternallyMetered()
      }
    }

    if (stopped) {
      closeRealtimeConnection()
      params.signal?.removeEventListener?.('abort', onAbort)
      throw new Error('Live voice session was stopped.')
    }

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }))
    reportConnectStage('remote-answer-applied')
    if (stopped || params.signal?.aborted) {
      closeRealtimeConnection()
      params.signal?.removeEventListener?.('abort', onAbort)
      throw new Error('Live voice session was stopped.')
    }

    startStatsVerification()
    startMediaEvidence()
    await readinessPromise
    if (readinessError) {
      closeRealtimeConnection()
      params.signal?.removeEventListener?.('abort', onAbort)
      throw new Error(readinessError)
    }
    if (meteredSessionId && !stopped) {
      voiceJobs = startVoiceSessionJobs({ baseUrl: realtimeApiBaseUrl(), sessionId: meteredSessionId, token: params.token,
        isCurrent: () => !stopped && !params.signal?.aborted,
        onJob: async job => {
          if (stopped || params.signal?.aborted) return { ok: false, saved: false, safeToClaimSaved: false }
          humanCommandText = job.actualHumanText
          humanCommandTooLarge = false
          return executeToolCall({ type: 'function_call', name: 'request_helfi_action', call_id: job.callId, arguments: JSON.stringify(job.args) })
        },
        onRecovery: recovery => { if (!stopped && !params.signal?.aborted) return callbacks.onActionRecovery?.(recovery) },
        onError: message => { callbacks.onError?.(message); void stopWithFinalUsage(); callbacks.onStatus?.('failed') },
        onClosed: () => { void stopWithFinalUsage(); callbacks.onStatus?.('closed') },
      })
    }
  } catch (error) {
    closeRealtimeConnection()
    params.signal?.removeEventListener?.('abort', onAbort)
    throw error
  }

  if (params.greetOnConnect && !userHasSpoken && !stopped && !params.signal?.aborted) {
    clearSilenceTimer()
    void localWelcome.start()
  }

  return {
    flushTranscript: flushLiveCaptions,
    promptAssistant: (instruction: string) => {
      if (stopped || !cleanText(instruction)) return
      if (voiceProtocol === 'live-v1') {
        sendRealtimeEvent(dataChannel, { type: 'session.instructions.append', delegation_id: null, content: cleanText(instruction).slice(0, 1500) })
        return
      }
      sendRealtimeEvent(dataChannel, {
        type: 'response.create',
        response: {
          instructions: cleanText(instruction),
          output_modalities: ['audio'],
        },
      })
    },
    setMicrophoneMuted: (muted: boolean) => {
      localStream.getAudioTracks?.().forEach((track: any) => {
        try {
          track.enabled = !muted
        } catch {
          // Some native track wrappers expose this as read-only.
        }
      })
    },
    stop: async () => {
      params.signal?.removeEventListener?.('abort', onAbort)
      callbacks.onStatus?.('closed')
      await stopWithFinalUsage()
    },
  }
}
