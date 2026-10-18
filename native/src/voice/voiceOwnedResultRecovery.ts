import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { acceptGeneralAssistantResponse } from './generalAssistantSession'

/** A lost command response is recovered by reading its exact owned version.
 * Never replay a command, request a planner or charge another preparation. */
export async function readOwnedVoiceResult(io: {
  baseUrl: string; token: string; accountId: string; sessionId: string
  pointer: { id: string; actorId: string; revision: number }
  localDate: string; timeZone: string; signal?: AbortSignal; isCurrent: () => boolean
}) {
  const pointer = io.pointer
  if (!io.isCurrent() || io.signal?.aborted || pointer.id !== io.sessionId || pointer.actorId !== io.accountId || !Number.isSafeInteger(pointer.revision) || pointer.revision < 1) return null
  const query = `sessionId=${encodeURIComponent(io.sessionId)}&localDate=${encodeURIComponent(io.localDate)}&timeZone=${encodeURIComponent(io.timeZone)}&revision=${pointer.revision}`
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!io.isCurrent() || io.signal?.aborted) return null
    const controller = new AbortController(), abort = () => controller.abort()
    io.signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, 8000)
    try {
      const response = await fetch(`${io.baseUrl}/api/native/assistant?${query}`, {
        method: 'GET', signal: controller.signal,
        headers: { ...buildNativeAuthHeaders(io.token), 'x-helfi-voice-capabilities': 'report-pdf-v1,report-pdf-inline-v1,additional-actions-v1,symptom-analysis-v1,food-management-v1,manual-action-catalog-v1,general-assistant-v1' },
      })
      if (!response.ok) return null
      const data = await response.json()
      if (!io.isCurrent() || io.signal?.aborted || data?.assistant?.revision !== pointer.revision || !acceptGeneralAssistantResponse(data, io.accountId, io.sessionId)) return null
      return data
    } catch {
      // Only this read may retry. A command is never sent from recovery.
    } finally {
      clearTimeout(timeout)
      io.signal?.removeEventListener('abort', abort)
    }
  }
  return null
}
