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

function sendRealtimeEvent(dataChannel: any, payload: Record<string, unknown>) {
  if (!dataChannel || dataChannel.readyState !== 'open') return
  dataChannel.send(JSON.stringify(payload))
}

function realtimeApiBaseUrl() {
  const isLocalDevHost = __DEV__ && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL)
  return isLocalDevHost ? LIVE_REALTIME_API_BASE_URL : API_BASE_URL
}

export function hasNativeRealtimeVoiceSupport() {
  const rtc = requireWebRtc()
  return Boolean(rtc?.RTCPeerConnection && rtc?.mediaDevices)
}

export async function fetchHelfiRealtimeVoiceStatus(token: string): Promise<{
  available: boolean
  message?: string
  code?: string
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
  callbacks?: RealtimeCallbacks
}): Promise<RealtimeSession> {
  const rtc = requireWebRtc()
  if (!rtc?.RTCPeerConnection || !rtc?.mediaDevices || !rtc?.RTCSessionDescription) {
    throw new Error('Live voice is not available in this build yet.')
  }

  const { RTCPeerConnection, RTCSessionDescription, mediaDevices } = rtc
  const callbacks = params.callbacks || {}
  callbacks.onStatus?.('connecting')

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  })
  const localStream = await mediaDevices.getUserMedia({ audio: true, video: false })
  localStream.getTracks().forEach((track: any) => pc.addTrack(track, localStream))

  let dataChannel: any = null
  dataChannel = pc.createDataChannel('oai-events')
  dataChannel.onopen = () => {
    callbacks.onStatus?.('live')
  }
  dataChannel.onmessage = (event: any) => {
    const payload = parseRealtimeJson(event?.data)
    if (!payload?.type) return
    if (payload.type === 'conversation.item.input_audio_transcription.completed') {
      callbacks.onTranscript?.(String(payload.transcript || '').trim())
      return
    }
    if (payload.type === 'response.audio_transcript.done' || payload.type === 'response.output_text.done') {
      callbacks.onAssistantText?.(String(payload.transcript || payload.text || '').trim())
      return
    }
    if (payload.type === 'response.function_call_arguments.done' && payload.name === 'request_helfi_action') {
      const args = parseRealtimeJson(payload.arguments) || {}
      const callId = String(payload.call_id || '').trim()
      Promise.resolve(callbacks.onActionRequest?.({
        request: String(args.request || '').trim(),
        action: String(args.action || '').trim(),
        needsReview: Boolean(args.needsReview),
      }))
        .then((result) => {
          if (!callId) return
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
          if (!callId) return
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
  dataChannel.onerror = () => callbacks.onStatus?.('failed')
  dataChannel.onclose = () => callbacks.onStatus?.('closed')

  pc.onconnectionstatechange = () => {
    callbacks.onStatus?.(String(pc.connectionState || 'connecting'))
  }
  pc.ontrack = () => {
    callbacks.onStatus?.('live')
  }

  const offer = await pc.createOffer({})
  await pc.setLocalDescription(offer)

  const res = await fetch(`${realtimeApiBaseUrl()}/api/native/voice-assistant/realtime`, {
    method: 'POST',
    headers: {
      ...buildNativeAuthHeaders(params.token),
      'content-type': 'application/sdp',
      'x-helfi-ai-consent': 'true',
    },
    body: String(offer.sdp || ''),
  })
  const answerSdp = await res.text()
  if (!res.ok) {
    localStream.getTracks().forEach((track: any) => track.stop())
    pc.close()
    let message = 'Live voice session could not start.'
    try {
      const json = JSON.parse(answerSdp)
      message = json?.error || message
    } catch {
      // SDP/error text can stay as the generic user-facing message.
    }
    throw new Error(message)
  }

  await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }))

  return {
    stop: async () => {
      callbacks.onStatus?.('closed')
      try {
        dataChannel?.close?.()
      } catch {
        // Already closed.
      }
      localStream.getTracks().forEach((track: any) => track.stop())
      pc.close()
    },
  }
}
