import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

type SearchParams = Record<string, string | string[] | undefined>

const readParam = (searchParams: SearchParams, key: string) => {
  const raw = searchParams[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return String(value || '').trim()
}

const safeDecode = (value: string) => {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function OAuthErrorPage({ searchParams }: { searchParams: SearchParams }) {
  const error = readParam(searchParams, 'error') || 'OAuthCallback'
  const callbackRaw = readParam(searchParams, 'callbackUrl')
  const callbackUrl = safeDecode(callbackRaw)
  const hasNativeCookie = cookies().get('helfi_native_oauth')?.value === '1'
  const nativeCallback = callbackUrl.includes('/api/native-auth/oauth/complete')

  if (hasNativeCookie || nativeCallback) {
    redirect(`/api/native-auth/oauth/complete?error=${encodeURIComponent(error)}`)
  }

  const params = new URLSearchParams()
  if (error) params.set('error', error)

  const message = readParam(searchParams, 'message')
  if (message) params.set('message', message)

  if (callbackRaw) params.set('callbackUrl', callbackRaw)

  redirect(`/auth/signin${params.toString() ? `?${params.toString()}` : ''}`)
}
