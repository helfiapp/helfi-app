// Resolve a spoken wall-clock time using the date's actual time-zone offset.
// A repeated or skipped clock time must be clarified rather than guessed.
export function normalizeVoiceTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) return null
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: value.trim() }).resolvedOptions().timeZone
  } catch { return null }
}

export function resolveVoiceWallTime(localDate: string, localTime: string, timeZone: string):
  { status: 'unique'; tzOffsetMin: number } | { status: 'invalid' | 'ambiguous' | 'nonexistent' } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) return { status: 'invalid' }
  const zone = normalizeVoiceTimeZone(timeZone)
  if (!zone) return { status: 'invalid' }
  const [year, month, day] = localDate.split('-').map(Number)
  const [hour, minute] = localTime.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const calendar = new Date(wall)
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return { status: 'invalid' }
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const wallAt = (utc: number) => {
    const values: Record<string, number> = {}
    formatter.formatToParts(new Date(utc)).forEach((part) => {
      if (part.type !== 'literal') values[part.type] = Number(part.value)
    })
    return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute)
  }
  const offsets = new Set<number>()
  // Both sides of ordinary DST changes, half-hour changes and date-line jumps.
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = wall + hours * 60 * 60 * 1000
    offsets.add((probe - wallAt(probe)) / 60000)
  }
  const matches = [...offsets].filter((offset) => Number.isInteger(offset) && Math.abs(offset) <= 840 && wallAt(wall + offset * 60000) === wall)
  if (matches.length === 1) return { status: 'unique', tzOffsetMin: matches[0] }
  return { status: matches.length > 1 ? 'ambiguous' : 'nonexistent' }
}
