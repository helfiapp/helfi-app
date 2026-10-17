import { AssistantContext, AssistantField, AssistantOperation, AssistantPrepared, AssistantValue, createAssistantRegistry } from './native-assistant-registry'
import { DomainAdapterServices, createNativeAssistantDomainAdapters } from './native-assistant-domain-adapters'

const date: AssistantField = { type: 'string', maxLength: 10, format: 'date' }
const id: AssistantField = { type: 'string', maxLength: 200 }
const meal: AssistantField = { type: 'string', maxLength: 20, enum: ['breakfast', 'lunch', 'dinner', 'snacks', 'other', 'uncategorized'] }
const object = (properties: Record<string, AssistantField>, required: string[] = []): Extract<AssistantField, { type: 'object' }> => ({ type: 'object', properties, required })
/** The five foundation operations share this catalog with the core factories
 * assembled by the app host. Coverage stays offline until actual installed
 * behavior and release are verified; navigation never counts as execution. */
export function createNativeAssistantCatalog(services: DomainAdapterServices, additionalOperations: AssistantOperation[] = []) {
  const adapters = createNativeAssistantDomainAdapters(services)
  // Match the existing normal JSON transport: optional undefined object fields
  // are omitted, while recorded null/zero nutrient values stay distinct.
  const wire = (value: unknown) => JSON.parse(JSON.stringify(value))
  const read = (operationId: string, description: string, input: AssistantOperation['input'], normalHandler: string, manualId: string, scope: string): AssistantOperation => ({
    id: operationId, description, input, kind: 'read', normalHandler,
    coverage: { manualIds: [manualId], status: 'offline-proof', scope },
    read: async (context, values) => wire(await adapters[operationId].read!(context, values)),
    plannerResult: (result): AssistantValue => {
      const entry = (row: any) => wire({ id: row.id, label: row.label, localDate: row.localDate, meal: row.meal, nutrition: row.nutrition, content: row.content })
      const message: Record<string, AssistantValue> = typeof result.message === 'string' && result.message.trim() ? { message: result.message } : {}
      if (operationId === 'journal.health.read') return { ...message, entry: entry(result.entry) }
      if (operationId === 'food.diary.totals') return { ...message, data: wire({ localDate: result.data.localDate, meal: result.data.meal, entryCount: result.data.entryCount, totals: result.data.totals }) }
      if (operationId === 'food.diary.detail') return { ...message, data: { entry: entry(result.data.entry) } }
      return { ...message, data: wire({ localDate: result.data.localDate, totalCount: result.data.totalCount, truncated: result.data.truncated, entries: result.data.entries.map(entry) }) }
    },
    verify: async (_context: AssistantContext, result: any) => result?.verified === true && result?.safeToClaimSaved === false && (operationId === 'journal.health.read' ? typeof result.entry?.id === 'string' && typeof result.entry?.content === 'string' : Boolean(result.data) && typeof result.data === 'object'),
  })
  const journal = adapters['journal.health.create']
  return createAssistantRegistry([
    read('food.diary.list', 'Read saved foods for one local calendar day; lists identify truncation.', object({ localDate: date, meal, limit: { type: 'number', minimum: 1, maximum: 100, integer: true } }), 'prepareVoiceFoodManagement → normal /api/food-log GET', 'food.diary.list', 'Normal read-only saved-food list wired locally; installed behavior not verified.'),
    read('food.diary.detail', 'Read one exact saved food on its source date.', object({ id, sourceDate: date }, ['id', 'sourceDate']), 'prepareVoiceFoodManagement → normal /api/food-log GET', 'food.diary.detail', 'Exact owned source detail only; normal editor opening absent.'),
    read('food.diary.totals', 'Read full saved daily food totals; unknown nutrients remain unknown.', object({ localDate: date, meal }), 'prepareVoiceFoodManagement → normal /api/food-log GET', 'food.diary.totals', 'Stored food nutrients only; excludes remaining-calorie targets/exercise calculation.'),
    read('journal.health.read', 'Read one exact owned Health Journal entry.', object({ id, localDate: date }, ['id']), '/api/health-journal GET', 'journal.health.list', 'Supporting exact-ID readback only; not full journal history list.'),
    {
      id: 'journal.health.create', description: 'Review and save literal text to Health Journal, then reopen the exact saved entry.', kind: 'write',
      normalHandler: '/api/health-journal POST + GET',
      coverage: { manualIds: ['journal.health.create'], status: 'offline-proof', scope: 'Literal text/date owned idempotent normal POST+GET integrated locally; production behavior not verified.' },
      input: object({ content: { type: 'string', maxLength: 20000 }, localDate: date }, ['content']),
      prepare: journal.prepare!,
      execute: (context, prepared, claim) => journal.execute!(context, prepared.data, claim),
      verify: (context, result, prepared?: AssistantPrepared) => journal.verify!(context, result, prepared?.data),
      plannerResult: result => ({ entry: wire({ id: result.entry.id, localDate: result.entry.localDate, content: result.entry.content }) }),
      ...(journal.recover ? { recover: (context: AssistantContext, actionId: string, prepared: AssistantPrepared) => journal.recover!(context, actionId, prepared.data) } : {}),
    },
    ...additionalOperations,
  ])
}
