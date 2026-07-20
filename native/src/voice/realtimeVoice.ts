import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'

const LIVE_REALTIME_API_BASE_URL = 'https://helfi.ai'

type RealtimeCallbacks = {
  onStatus?: (status: string) => void
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

function sendRealtimeEvent(dataChannel: any, payload: Record<string, unknown>) {
  if (!dataChannel || dataChannel.readyState !== 'open') return
  dataChannel.send(JSON.stringify(payload))
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
  const callbacks = params.callbacks || {}
  const connectStartedAt = Date.now()
  const reportConnectStage = (stage: string, detail = '') => {
    console.info(`[voice realtime timing] ${stage} ${Date.now() - connectStartedAt}ms${detail ? ` ${detail}` : ''}`)
  }
  callbacks.onStatus?.('connecting')
  reportConnectStage('start')

  try {
    inCallManager?.start?.({ media: 'audio', auto: true })
    inCallManager?.setForceSpeakerphoneOn?.(true)
  } catch {
    // WebRTC can still connect if the optional speaker routing helper is unavailable.
  }

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  })
  const localStream = await mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  })
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
  let stopped = false
  const emitStatus = (status: string) => {
    if (stopped && status !== 'closed') return
    callbacks.onStatus?.(status)
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

  dataChannel = pc.createDataChannel('oai-events')
  dataChannel.onopen = () => {
    emitStatus('live')
  }
  dataChannel.onmessage = (event: any) => {
    if (stopped) return
    const payload = parseRealtimeJson(event?.data)
    if (!payload?.type) return
    if (payload.type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = String(payload.transcript || '').trim()
      if (likelyAssistantEcho(transcript, recentAssistantText, recentAssistantTextAt)) {
        sendRealtimeEvent(dataChannel, { type: 'response.cancel' })
        sendRealtimeEvent(dataChannel, { type: 'output_audio_buffer.clear' })
        emitStatus('live')
        return
      }
      callbacks.onTranscript?.(transcript)
      return
    }
    if (payload.type === 'response.created' || payload.type === 'response.output_item.added' || payload.type === 'response.audio.delta') {
      emitStatus('speaking')
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
      flushAssistantText(payload)
      emitStatus('live')
      return
    }
    if (payload.type === 'response.function_call_arguments.done' && payload.name === 'request_helfi_action') {
      const args = parseRealtimeJson(payload.arguments) || {}
      const callId = String(payload.call_id || '').trim()
      if (callId && handledToolCallIds.has(callId)) return
      if (callId) handledToolCallIds.add(callId)
      Promise.resolve(callbacks.onActionRequest?.({
        request: String(args.request || '').trim(),
        action: String(args.action || '').trim(),
        needsReview: Boolean(args.needsReview),
      }))
        .then((result) => {
          if (!callId || stopped) return
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
          if (!callId || stopped) return
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
    }
  }
  dataChannel.onerror = () => emitStatus('failed')
  dataChannel.onclose = () => emitStatus('closed')

  pc.onconnectionstatechange = () => {
    emitStatus(String(pc.connectionState || 'connecting'))
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
    try {
      inCallManager?.setForceSpeakerphoneOn?.(true)
    } catch {
      // Keep the connected stream active even if route selection fails.
    }
    emitStatus('live')
  }

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
