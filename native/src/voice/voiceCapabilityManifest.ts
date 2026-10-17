/** Installed native handlers only. The server remains the authority for each
 * action's fields, account, permission, review and cost. */
export type VoiceCapabilityRequest = { id: string; values: Record<string, unknown> }
export function validatedVoiceCapability(value: unknown): VoiceCapabilityRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2) return null
  const request = value as Record<string, unknown>
  if (typeof request.id !== 'string' || !/^[a-z][a-z0-9_.]{0,119}$/.test(request.id) || !request.values || typeof request.values !== 'object' || Array.isArray(request.values)) return null
  const forbidden = /^(?:__proto__|prototype|constructor|endpoint|method|headers|authorization|auth|userId|accountId|apiKey|accessToken|refreshToken|password|secret)$/i
  let remaining = 10000
  const plain = (entry: unknown, depth: number): boolean => {
    if (--remaining < 0 || depth > 8) return false
    if (entry === null || typeof entry === 'boolean') return true
    if (typeof entry === 'number') return Number.isFinite(entry)
    if (typeof entry === 'string') return entry.length <= 100000 && !entry.includes('\0')
    if (Array.isArray(entry)) return entry.length <= 1000 && entry.every(item => plain(item, depth + 1))
    return Boolean(entry && typeof entry === 'object' && Object.keys(entry).length <= 100 && Object.entries(entry).every(([key, item]) => /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(key) && !forbidden.test(key) && plain(item, depth + 1)))
  }
  if (!plain(request.values, 0)) return null
  try { return JSON.stringify(value).length <= 200000 ? { id: request.id, values: request.values as Record<string, unknown> } : null } catch { return null }
}
