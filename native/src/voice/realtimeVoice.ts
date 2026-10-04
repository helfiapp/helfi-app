import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'

const LIVE_REALTIME_API_BASE_URL = 'https://helfi.ai'

type RealtimeCallbacks = {
  onStatus?: (status: string) => void
  onConnectStage?: (stage: string) => void
  onError?: (message: string) => void
  onAudioRoute?: (route: string) => void
  onTranscript?: (text: string) => void
  onAssistantText?: (text: string) => void
  onActionRequest?: (args: { request?: string; action?: string; needsReview?: boolean }) => Promise<unknown> | unknown
}

type RealtimeSession = {
  stop: () => Promise<void>
  setMicrophoneMuted: (muted: boolean) => void
  promptAssistant: (instruction: string) => void
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
  const heard = normalizeEchoText(input)
  const recentReply = normalizeEchoText(assistant)
  if (!heard || !recentReply || Date.now() - assistantAt > 5000) return false
  if (['stop', 'cancel', 'done', 'save', 'yes', 'no'].includes(heard)) return false
  if (heard.length < 5) return false
  if (recentReply.includes(heard)) return true
  const words = [...new Set(heard.split(' ').filter((word) => word.length > 2))]
  if (!words.length) return false
  const replyWords = new Set(recentReply.split(' '))
  const overlap = words.filter((word) => replyWords.has(word)).length
  return words.length <= 3 ? overlap === words.length : overlap / words.length >= 0.8
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
      headers: buildNativeAuthHeaders(token),
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
  signal?: AbortSignal
  callbacks?: RealtimeCallbacks
}): Promise<RealtimeSession> {
  if (params.signal?.aborted) {
    throw new Error('Live voice session was stopped.')
  }

  const rtc = requireWebRtc()
  if (!rtc?.RTCPeerConnection || !rtc?.mediaDevices || !rtc?.RTCSessionDescription) {
    throw new Error('Live voice is not available in this build yet.')
  }

  const { RTCPeerConnection, RTCSessionDescription, mediaDevices } = rtc
  const inCallManager = requireInCallManager()
  const audioRouteBridge = requireHelfiAudioRoute()
  const callbacks = params.callbacks || {}
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

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  })
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
      callbacks.onError?.(message)
      emitStatus('thinking')
      sendRealtimeEvent(dataChannel, {
        type: 'response.create',
        response: {
          instructions: `Say exactly: ${message} Then listen again.`,
          output_modalities: ['audio'],
        },
      })
    }, 12000)
  }
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
    clearResponseTimers()
    clearSilenceTimer()
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
      sendRealtimeEvent(dataChannel, { type: 'response.cancel' })
      sendRealtimeEvent(dataChannel, { type: 'output_audio_buffer.clear' })
      sendRealtimeEvent(dataChannel, { type: 'input_audio_buffer.clear' })
    }
    stopped = true
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
  const onAbort = () => {
    failReadiness('Live voice session was stopped.')
    closeRealtimeConnection()
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

  const handleToolCall = (toolCall: any) => {
    if (!toolCall || toolCall.name !== 'request_helfi_action') return false
    const args = parseRealtimeJson(toolCall.arguments) || {}
    const callId = cleanText(toolCall.call_id)
    if (!callId || handledToolCallIds.has(callId)) return true
    handledToolCallIds.add(callId)
    clearResponseTimers()
    emitStatus('thinking')
    Promise.resolve(callbacks.onActionRequest?.({
      request: cleanText(args.request),
      action: cleanText(args.action),
      needsReview: Boolean(args.needsReview),
    }))
      .then((result) => {
        if (stopped) return
        sendRealtimeEvent(dataChannel, {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(result || { ok: true }),
          },
        })
        sendRealtimeEvent(dataChannel, { type: 'response.create' })
      })
      .catch((error) => {
        if (stopped) return
        sendRealtimeEvent(dataChannel, {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ ok: false, message: error?.message || 'The app could not complete that action.' }),
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
  dataChannel.onmessage = (event: any) => {
    if (stopped) return
    const payload = parseRealtimeJson(event?.data)
    if (!payload?.type) return
    console.info(`[voice realtime event] ${cleanText(payload.type)} ${Date.now() - connectStartedAt}ms`)
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
      clearResponseTimers()
      clearSilenceTimer()
      silenceReminderSent = false
      assistantAudioPlaying = false
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
      callbacks.onError?.(message)
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
    reportConnectStage('local-offer-ready')
    if (stopped || params.signal?.aborted) {
      closeRealtimeConnection()
      throw new Error('Live voice session was stopped.')
    }

    const res = await fetch(`${realtimeApiBaseUrl()}/api/native/voice-assistant/realtime`, {
      method: 'POST',
      headers: {
        ...buildNativeAuthHeaders(params.token),
        'content-type': 'application/sdp',
        'x-helfi-ai-consent': 'true',
        'x-helfi-voice-session-id': cleanText(params.billingSessionId),
      },
      signal: params.signal,
      body: String(offer.sdp || ''),
    })
    const answerSdp = await res.text()
    reportConnectStage('server-answer-received', res.headers?.get?.('server-timing') || '')
    if (!res.ok) {
      closeRealtimeConnection()
      params.signal?.removeEventListener?.('abort', onAbort)
      let message = 'Live voice session could not start.'
      try {
        const json = JSON.parse(answerSdp)
        message = json?.error || message
      } catch {
        // SDP/error text can stay as the generic user-facing message.
      }
      throw new Error(message)
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
  } catch (error) {
    closeRealtimeConnection()
    params.signal?.removeEventListener?.('abort', onAbort)
    throw error
  }

  return {
    promptAssistant: (instruction: string) => {
      if (stopped || !cleanText(instruction)) return
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
      closeRealtimeConnection()
    },
  }
}
