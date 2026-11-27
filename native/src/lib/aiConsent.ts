import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from './nativeAuthHeaders'
import { getCurrentNativeAuthSession } from './nativeAuthSession'

const AI_DATA_SHARING_PERMISSION_KEY = 'helfi_ai_data_sharing_permission_v1'
const AI_CONSENT_VERSION = '2026-10-04'
export const AI_SHARING_DISCLOSURE = 'To use AI features, Helfi may send what you choose to share, such as typed text, voice audio, photos, notes, food logs, health profile details, or lab report text, to OpenAI, LLC. OpenAI processes it so Helfi can create your AI response. You can say no and still use non-AI tracking like food, water, mood, and device logs. You can withdraw this permission in Settings at any time. Withdrawal stops future AI processing, including weekly AI reports.'

async function consentRequest(token: string, granted?: boolean) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${API_BASE_URL}/api/ai-consent`, {
      headers: buildNativeAuthHeaders(token, { json: granted !== undefined, includeCookie: true }),
      signal: controller.signal,
      ...(granted === undefined ? {} : { method: 'POST', body: JSON.stringify({ granted, version: AI_CONSENT_VERSION }) }),
    })
    return { ok: response.ok, data: await response.json() }
  } finally { clearTimeout(timeout) }
}

export async function hasAiDataSharingPermission() {
  try {
    const session = getCurrentNativeAuthSession()
    if (!session) return false
    const { ok, data } = await consentRequest(session.token)
    return getCurrentNativeAuthSession() === session && ok && data.granted === true && data.version === AI_CONSENT_VERSION
  } catch {
    return false
  }
}

async function setAiDataSharingPermission(granted: boolean, expectedToken?: string) {
  try {
    const session = getCurrentNativeAuthSession()
    if (!session || (expectedToken && expectedToken !== session.token)) return false
    const { ok, data } = await consentRequest(session.token, granted)
    if (!ok) return false
    if (data.granted !== granted || data.version !== AI_CONSENT_VERSION || getCurrentNativeAuthSession() !== session) return false
    await AsyncStorage.removeItem(AI_DATA_SHARING_PERMISSION_KEY).catch(() => {})
    return getCurrentNativeAuthSession() === session
  } catch {
    return false
  }
}

export async function grantAiDataSharingPermission(expectedToken?: string) {
  return setAiDataSharingPermission(true, expectedToken)
}

export async function revokeAiDataSharingPermission() {
  return setAiDataSharingPermission(false)
}

let permissionRequest: { session: NonNullable<ReturnType<typeof getCurrentNativeAuthSession>>; promise: Promise<boolean> } | null = null
export async function requestAiDataSharingPermission() {
  const session = getCurrentNativeAuthSession()
  if (!session) return false
  if (permissionRequest?.session === session) return permissionRequest.promise
  const promise = (async () => {
    if (await hasAiDataSharingPermission()) return getCurrentNativeAuthSession() === session
    if (getCurrentNativeAuthSession() !== session) return false
    return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Allow AI help?',
      AI_SHARING_DISCLOSURE,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'I agree',
          onPress: () => {
            if (getCurrentNativeAuthSession() !== session) { resolve(false); return }
            grantAiDataSharingPermission(session.token).then(allowed => {
              if (!allowed) Alert.alert('Permission was not saved', 'Your data was not sent to AI. Please try again.')
              resolve(allowed && getCurrentNativeAuthSession() === session)
            }).catch(() => resolve(false))
          },
        },
      ], { cancelable: true, onDismiss: () => resolve(false) },
    )
    })
  })()
  permissionRequest = { session, promise }
  try { return await promise } finally { if (permissionRequest?.promise === promise) permissionRequest = null }
}
