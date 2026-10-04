import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from './nativeAuthHeaders'

const AI_DATA_SHARING_PERMISSION_KEY = 'helfi_ai_data_sharing_permission_v1'
const AI_CONSENT_VERSION = '2026-10-04'
export const AI_SHARING_DISCLOSURE = 'To use AI features, Helfi may send what you choose to share, such as typed text, voice audio, photos, notes, food logs, health profile details, or lab report text, to OpenAI, LLC. OpenAI processes it so Helfi can create your AI response. You can say no and still use non-AI tracking like food, water, mood, and device logs. You can withdraw this permission in Settings at any time. Withdrawal stops future AI processing, including weekly AI reports.'

async function currentToken() {
  const raw = await AsyncStorage.getItem('helfi_auth_session_v1')
  if (!raw) return null
  return String(JSON.parse(raw)?.token || '') || null
}

async function consentRequest(token: string, granted?: boolean) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    return await fetch(`${API_BASE_URL}/api/ai-consent`, {
      headers: buildNativeAuthHeaders(token, { json: granted !== undefined, includeCookie: true }),
      signal: controller.signal,
      ...(granted === undefined ? {} : { method: 'POST', body: JSON.stringify({ granted, version: AI_CONSENT_VERSION }) }),
    })
  } finally { clearTimeout(timeout) }
}

export async function hasAiDataSharingPermission() {
  try {
    const token = await currentToken()
    if (!token) return false
    const response = await consentRequest(token)
    const data = await response.json()
    return response.ok && data.granted === true && data.version === AI_CONSENT_VERSION
  } catch {
    return false
  }
}

async function setAiDataSharingPermission(granted: boolean, expectedToken?: string) {
  try {
    const token = await currentToken()
    if (!token || (expectedToken && expectedToken !== token)) return false
    const response = await consentRequest(token, granted)
    if (!response.ok) return false
    const data = await response.json()
    if (data.granted !== granted || data.version !== AI_CONSENT_VERSION || await currentToken() !== token) return false
    await AsyncStorage.removeItem(AI_DATA_SHARING_PERMISSION_KEY).catch(() => {})
    return true
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

let permissionRequest: Promise<boolean> | null = null
export async function requestAiDataSharingPermission() {
  if (permissionRequest) return permissionRequest
  permissionRequest = (async () => {
    if (await hasAiDataSharingPermission()) return true
    const token = await currentToken().catch(() => null)
    if (!token) return false
    return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Allow AI help?',
      AI_SHARING_DISCLOSURE,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'I agree',
          onPress: () => {
            grantAiDataSharingPermission(token).then(allowed => {
              if (!allowed) Alert.alert('Permission was not saved', 'Your data was not sent to AI. Please try again.')
              resolve(allowed)
            }).catch(() => resolve(false))
          },
        },
      ], { cancelable: true, onDismiss: () => resolve(false) },
    )
    })
  })()
  try { return await permissionRequest } finally { permissionRequest = null }
}
