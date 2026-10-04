'use client'

import { AI_SHARING_CONSENT_VERSION, AI_SHARING_DISCLOSURE } from '@/lib/ai-consent-text'

export const AI_CONSENT_STORAGE_KEY = 'helfi_ai_help_consent_v1'

async function consentRequest(granted?: boolean) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    return await fetch('/api/ai-consent', {
      cache: 'no-store', signal: controller.signal,
      ...(granted === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ granted, version: AI_SHARING_CONSENT_VERSION }) }),
    })
  } finally { clearTimeout(timeout) }
}

export async function hasSavedAiConsent() {
  if (typeof window === 'undefined') return false
  try {
    const response = await consentRequest()
    const data = await response.json()
    return response.ok && data.granted === true && data.version === AI_SHARING_CONSENT_VERSION
  } catch {
    return false
  }
}

export async function setAiConsent(granted: boolean) {
  const response = await consentRequest(granted)
  if (!response.ok) throw new Error('Could not save AI permission. Please try again.')
  const data = await response.json()
  if (data.granted !== granted || data.version !== AI_SHARING_CONSENT_VERSION) throw new Error('Could not confirm AI permission. Please try again.')
  try { window.localStorage.removeItem(AI_CONSENT_STORAGE_KEY) } catch {}
  window.dispatchEvent(new Event('helfi:ai-consent-changed'))
}

export async function saveAiConsent() {
  await setAiConsent(true)
}

export default function AiConsentModal({
  open,
  onAgree,
  onCancel,
}: {
  open: boolean
  onAgree: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-gray-200 text-center">
        <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Allow AI help?</h2>
        <p className="text-sm text-gray-700 leading-6">
          {AI_SHARING_DISCLOSURE}
        </p>
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={onAgree}
            className="w-full rounded-lg bg-helfi-green px-4 py-3 font-bold text-white hover:bg-helfi-green/90"
          >
            I agree
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg bg-emerald-50 px-4 py-3 font-bold text-gray-800 hover:bg-emerald-100"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
