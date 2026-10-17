import { createHash } from 'crypto'

/** Server-derived identity lets the normal journal POST recover a committed
 * write without repeating it. The model never chooses a database record ID. */
export function nativeAssistantJournalEntryId(actorId: string, actionId: string) {
  if (!actorId || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(actionId)) throw new Error('Invalid reviewed action identity.')
  return `assistant-journal-${createHash('sha256').update(JSON.stringify([actorId, actionId])).digest('hex')}`
}

/** Separate namespace preserves existing Health Journal record identities. */
export function nativeAssistantMoodJournalEntryId(actorId: string, actionId: string) {
  if (!actorId || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(actionId)) throw new Error('Invalid reviewed action identity.')
  return `assistant-mood-journal-${createHash('sha256').update(JSON.stringify([actorId, actionId])).digest('hex')}`
}
