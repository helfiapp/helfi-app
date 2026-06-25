'use client'

export const AI_CONSENT_STORAGE_KEY = 'helfi_ai_help_consent_v1'

export function hasSavedAiConsent() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(AI_CONSENT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveAiConsent() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AI_CONSENT_STORAGE_KEY, '1')
  } catch {}
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
          To use this AI feature, Helfi may send what you choose to share, such as typed text,
          photos, food logs, health profile details, or lab report text, to OpenAI, LLC.
        </p>
        <p className="mt-4 text-sm text-gray-700 leading-6">
          OpenAI processes it so Helfi can create your AI response. You can say no and still use
          non-AI tracking like food, water, mood, and device logs.
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
