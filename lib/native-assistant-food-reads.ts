/** Fixed, owned normal diary reads using the host's actual IANA calendar day.
 * No date repair, stored-date fabrication, provider lookup or mutation. */
import { NextRequest } from 'next/server'
import type { AdapterContext } from './native-assistant-domain-adapters'
import { currentStateDay } from './native-assistant-current-state'
import { prepareVoiceFoodManagement, type VoiceFoodManagementIo } from './native-voice-food-management'

type DiaryReadAction = 'diary.list' | 'diary.detail' | 'diary.totals'
const fail = (message: string): never => { throw new Error(message) }
function stable(value: any): any {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(key => !['imageUrl','signedUrl'].includes(key) && value[key] !== undefined).sort().map(key => [key, stable(value[key])]))
  return value
}
function actualDay(row: any, timeZone: string): string {
  if (row.localDate !== null && row.localDate !== undefined && row.localDate !== '') {
    // Validate a genuine stored date; never replace it with a timestamp date.
    return currentStateDay(row.localDate, timeZone).localDate
  }
  const raw = row.createdAt
  if (!(raw instanceof Date) && (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw))) return fail('This older food entry has no verifiable saved date. Please review it in the diary.')
  const instant = raw instanceof Date ? raw : new Date(raw)
  if (!Number.isFinite(instant.getTime())) return fail('This older food entry has no verifiable saved timestamp.')
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type,part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function createNativeAssistantFoodReadService(options: {
  request: NextRequest
  authenticate(context: AdapterContext): Promise<string | null>
  trustedTimeZone(context: AdapterContext): string | null | Promise<string | null>
}): (context: AdapterContext, action: DiaryReadAction, values: Record<string, unknown>) => Promise<any> {
  return async (context, action, values) => {
    if (!['diary.list','diary.detail','diary.totals'].includes(action)) return fail('Choose a supported saved-food read.')
    const authorize = async () => {
      if (!context.actorId || context.signal?.aborted || options.request.signal?.aborted || await options.authenticate(context) !== context.actorId || context.signal?.aborted || options.request.signal?.aborted) fail('Please use the same signed-in account for this food read.')
    }
    await authorize()
    const timeZone = await options.trustedTimeZone(context)
    await authorize()
    if (!timeZone) return fail('The app needs your trusted time zone before reading a diary day.')
    const selectedDate = action === 'diary.detail' ? values.sourceDate : values.localDate ?? context.localDate
    const selected = currentStateDay(selectedDate as string, timeZone)
    const headers = new Headers(options.request.headers)
    headers.delete('host'); headers.delete('content-length'); headers.set('cache-control','no-store'); headers.set('x-helfi-assistant-read-only','1')
    const caps = new Set((headers.get('x-helfi-voice-capabilities') || '').split(',').map(value => value.trim()).filter(Boolean)); caps.add('food-management-v1')
    headers.set('x-helfi-voice-capabilities',[...caps].join(','))
    const normalRequest = new NextRequest(options.request.url,{method:'GET',headers,signal:context.signal || options.request.signal})
    const io: VoiceFoodManagementIo = {
      userId: async () => { await authorize(); return context.actorId },
      call: async (_original, call) => {
        if (call.domain !== 'diary' || call.body !== undefined || call.localDate !== selected.localDate) return fail('Only this exact saved diary day can be read.')
        const rows = new Map<string, any>(), snapshots = new Map<string,string>()
        const offsets: Array<number | null> = call.id ? [null] : selected.offsetsMinutes
        for (const offset of offsets) {
          await authorize()
          const url = new URL('/api/food-log',options.request.url)
          url.searchParams.set('voiceReadOnly','1')
          if (call.id) url.searchParams.set('id',call.id)
          else { url.searchParams.set('date',selected.localDate); url.searchParams.set('tz',String(offset)) }
          const route = await import('@/app/api/food-log/route')
          const response = await route.GET(new NextRequest(url,{method:'GET',headers,signal:context.signal || options.request.signal})), data = await response.json().catch(() => null)
          await authorize()
          if (!response.ok || data?.success !== true || data.readOnly !== true) return fail('The normal diary could not verify this read-only saved selection.')
          const list = call.id ? data.log ? [data.log] : null : data.logs
          if (!Array.isArray(list) || list.length > 5000) return fail('The normal diary did not return a complete bounded saved selection.')
          for (const row of list) {
            if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || row.id.length > 120 || row.userId !== context.actorId || call.id && row.id !== call.id) return fail('The normal diary returned an invalid owned food identity.')
            const snapshot = JSON.stringify(stable(row))
            if (snapshots.has(row.id) && snapshots.get(row.id) !== snapshot) return fail('A saved food changed between the local-day reads. Please refresh the diary.')
            snapshots.set(row.id,snapshot)
            const rowDay = actualDay(row,timeZone)
            if (rowDay !== selected.localDate) {
              if (call.id || row.localDate) return fail('That food belongs to another saved calendar day.')
              continue
            }
            rows.set(row.id,row)
            if (rows.size > 5000) return fail('Please narrow this saved-food selection before reading it.')
          }
        }
        await authorize()
        if (await options.trustedTimeZone(context) !== timeZone) return fail('Your time zone changed during this diary read. Please refresh it.')
        await authorize()
        const list = [...rows.values()].sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || a.id.localeCompare(b.id))
        return call.id ? { success:true,readOnly:true,log:list[0] } : { success:true,readOnly:true,logs:list }
      },
    }
    const result = await prepareVoiceFoodManagement(normalRequest,context.actorId,{action,values},'',context.localDate,io)
    await authorize()
    return result
  }
}
