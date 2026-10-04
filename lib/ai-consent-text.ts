export const AI_SHARING_CONSENT_VERSION = '2026-10-04'
export const AI_SHARING_DISCLOSURE = 'To use AI features, Helfi may send what you choose to share, such as typed text, voice audio, photos, notes, food logs, health profile details, or lab report text, to OpenAI, LLC. OpenAI processes it so Helfi can create your AI response. You can say no and still use non-AI tracking like food, water, mood, and device logs. You can withdraw this permission in Settings at any time. Withdrawal stops future AI processing, including weekly AI reports.'

// Only requests that create new AI output need permission. Reading saved notes,
// searching nutrition databases, and saving ordinary tracking remain available.
export function isAiProcessingRequest(path: string, method: string, body?: unknown) {
  if (method.toUpperCase() !== 'POST') return false
  if (path === '/api/reports/weekly/preferences') {
    try {
      const value = typeof body === 'string' ? JSON.parse(body) : body
      return (value as any)?.enabled === true
    } catch { return false }
  }
  return /^\/api\/(?:analyze-(?:food|supplement-image|symptoms|interactions)(?:\/chat)?|test-vision|medical-images\/chat|(?:health-journal|mood\/journal)\/extract-media|chat\/(?:voice|fridge)|native\/voice-assistant(?:\/(?:tts|realtime))?|insights\/(?:generate|ask|regenerate|regenerate-targeted|issues\/[^/]+\/(?:regenerate-all|sections\/prefetch|sections\/[^/]+(?:\/chat)?))|reports\/weekly\/(?:trigger|run))\/?$/.test(path)
}
