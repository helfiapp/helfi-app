export const HELFI_ANALYSIS_MODEL = 'gpt-5.6-sol'

export function isSpecialistOpenAIModel(model: string): boolean {
  const normalized = String(model || '').trim().toLowerCase()
  return (
    normalized.includes('realtime') ||
    normalized.includes('transcribe') ||
    normalized.includes('tts') ||
    normalized.includes('whisper') ||
    normalized.startsWith('text-embedding-') ||
    normalized.includes('moderation') ||
    normalized.startsWith('gpt-image-')
  )
}
