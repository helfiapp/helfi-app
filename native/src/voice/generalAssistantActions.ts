/** A bounded transport shape only. The authenticated server registry decides
 * which actions/fields exist and whether a human authorized this exact turn.
 * Sanitizing a confirm command does not itself authorize a save or charge.
 */
export type GeneralAssistantValue = null | boolean | number | string | GeneralAssistantValue[] | { [key: string]: GeneralAssistantValue }
export type GeneralAssistantArguments = Record<string, GeneralAssistantValue>
export type GeneralAssistantCommand =
  | { type: 'plan'; steps: { id: string; operation: string; values: GeneralAssistantArguments }[] }
  | { type: 'correct'; stepId: string; values: GeneralAssistantArguments }
  | { type: 'confirm'; reviewId: string }
  | { type: 'decline'; reviewId: string }
  | { type: 'recover'; actionId: string }
  | { type: 'advance' }
  | { type: 'stop' }

const forbidden = /^(?:__proto__|prototype|constructor|endpoint|method|headers|authorization|cookie|auth|owner|ownerId|actorId|userId|accountId|apiKey|accessToken|refreshToken|sessionToken|password|secret|credentials|reviewToken|canConfirm|autoSave|receiptClaimed|clientActionId|actionId)$/i
const stepId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)
const opaqueId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
function arrayData(value: unknown[], maximum: number) {
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return value.length <= maximum && Object.keys(value).length === value.length && Object.getOwnPropertySymbols(value).length === 0 && Object.keys(descriptors).every(key => key === 'length' || /^\d+$/.test(key) && 'value' in descriptors[key] && descriptors[key].enumerable)
}
function fields(value: unknown, allowed: readonly string[], required = allowed): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && (Object.getPrototypeOf(prototype) !== null || Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value?.name !== 'Object')) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return Object.getOwnPropertySymbols(value).length === 0 && Object.keys(descriptors).every(key => allowed.includes(key) && 'value' in descriptors[key] && descriptors[key].enumerable) && required.every(key => Object.hasOwn(value, key))
}

export function sanitizeGeneralAssistantCommand(value: unknown): GeneralAssistantCommand | null {
  let nodes = 0, characters = 0
  const seen = new Set<object>()
  function clone(value: unknown, depth: number): GeneralAssistantValue {
    if (++nodes > 20000 || depth > 20 || characters > 100000) throw new Error('Assistant command limit')
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      characters += value.length
      if (value.includes('\0') || characters > 100000) throw new Error('Assistant text limit')
      return value
    }
    if (!value || typeof value !== 'object' || seen.has(value)) throw new Error('Assistant field shape')
    seen.add(value)
    try {
      if (Array.isArray(value)) {
        if (!arrayData(value, 1000)) throw new Error('Assistant item limit')
        return value.map(item => clone(item, depth + 1))
      }
      const keys = Object.keys(value)
      if (keys.length > 1000 || !fields(value, keys)) throw new Error('Assistant object shape')
      if (Object.hasOwn(value, '$from')) {
        const reference = value as Record<string, unknown>
        if (!fields(reference, ['$from', 'path']) || !stepId(reference.$from) || !Array.isArray(reference.path) || reference.path.length > 10) throw new Error('Assistant result reference')
        const referencePath = clone(reference.path, depth + 1)
        if (!Array.isArray(referencePath) || referencePath.some(part => typeof part !== 'string' || !/^(?:[A-Za-z][A-Za-z0-9_]{0,99}|\d{1,3})$/.test(part) || forbidden.test(part))) throw new Error('Assistant result reference')
        characters += reference.$from.length
        return { $from: reference.$from, path: referencePath }
      }
      const result: Record<string, GeneralAssistantValue> = {}
      for (const key of keys) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(key) || forbidden.test(key)) throw new Error('Assistant reserved field')
        characters += key.length
        result[key] = clone((value as Record<string, unknown>)[key], depth + 1)
      }
      return result
    } finally { seen.delete(value) }
  }
  function argumentsValue(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Assistant arguments shape')
    const copied = clone(raw, 0)
    if (!copied || typeof copied !== 'object' || Array.isArray(copied) || Object.hasOwn(copied, '$from')) throw new Error('Assistant arguments shape')
    return copied as GeneralAssistantArguments
  }
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const command = value as Record<string, unknown>
    const commandType = Object.getOwnPropertyDescriptor(command, 'type')?.value
    if (commandType === 'plan') {
      if (!fields(command, ['type', 'steps']) || !Array.isArray(command.steps) || !command.steps.length || !arrayData(command.steps, 20)) return null
      const ids = new Set<string>()
      const steps = command.steps.map(step => {
        if (!fields(step, ['id', 'operation', 'values']) || !stepId(step.id) || ids.has(step.id) || typeof step.operation !== 'string' || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(step.operation) || step.operation.length > 120) throw new Error('Assistant step shape')
        ids.add(step.id)
        return { id: step.id, operation: step.operation, values: argumentsValue(step.values) }
      })
      return characters <= 100000 ? { type: 'plan', steps } : null
    }
    if (commandType === 'correct') return fields(command, ['type', 'stepId', 'values']) && stepId(command.stepId) ? { type: 'correct', stepId: command.stepId, values: argumentsValue(command.values) } : null
    if (commandType === 'confirm' || commandType === 'decline') return fields(command, ['type', 'reviewId']) && opaqueId(command.reviewId) ? { type: commandType, reviewId: command.reviewId } : null
    if (commandType === 'recover') return fields(command, ['type', 'actionId']) && opaqueId(command.actionId) ? { type: 'recover', actionId: command.actionId } : null
    if (commandType === 'advance' || commandType === 'stop') return fields(command, ['type']) ? { type: commandType } : null
    return null
  } catch { return null }
}
