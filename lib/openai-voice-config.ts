const DEFAULT_HELFI_VOICE = 'marin'
const BEST_NATURAL_OPENAI_VOICES = new Set(['marin', 'cedar'])

function cleanVoiceName(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function resolveHelfiRealtimeVoice(env: NodeJS.ProcessEnv = process.env) {
  const requested = cleanVoiceName(env.HELFI_VOICE_REALTIME_VOICE)
  return BEST_NATURAL_OPENAI_VOICES.has(requested) ? requested : DEFAULT_HELFI_VOICE
}

export function resolveHelfiTtsVoice(env: NodeJS.ProcessEnv = process.env) {
  const requested = cleanVoiceName(env.HELFI_VOICE_TTS_VOICE)
  return BEST_NATURAL_OPENAI_VOICES.has(requested) ? requested : DEFAULT_HELFI_VOICE
}

export function exactChatGptVoiceAvailable() {
  return false
}
