import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'

export type LocalPreferenceKey = 'darkMode' | 'hapticsEnabled' | 'profileVisibility' | 'dataAnalytics'
export type LocalPreferenceValue = boolean | 'private' | 'public' | 'friends'
export type LocalPreference = { key: LocalPreferenceKey; value: LocalPreferenceValue }
type LocalPreferenceIo = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; setColorScheme: (value: 'dark' | 'light') => void; now: () => number }
export type LocalPreferenceReview = { token: string; accountId: string; preference: LocalPreference; beforeValue: string | null; expiresAt: number }
export type LocalPreferenceReceipt = { kind: 'local_preference_action'; id: LocalPreferenceKey; operation: 'update'; entity: 'device_preferences'; message: string; idempotentReplay?: boolean }
const normalIo: LocalPreferenceIo = {
  getItem: key => AsyncStorage.getItem(key), setItem: (key, value) => AsyncStorage.setItem(key, value),
  setColorScheme: value => Appearance.setColorScheme(value), now: () => Date.now(),
}
const pending = new Map<LocalPreferenceReview, Promise<LocalPreferenceReceipt>>()
const completed = new WeakSet<LocalPreferenceReview>()

export function validateLocalPreference(value: unknown): LocalPreference {
  const input = value as Partial<LocalPreference> | null
  if (!input || typeof input !== 'object' || typeof input.key !== 'string' || Object.keys(input).some(key => !['key', 'value'].includes(key))) throw new Error('Please review one supported device setting.')
  if (input.key === 'profileVisibility') {
    if (typeof input.value !== 'string' || !['private', 'public', 'friends'].includes(input.value)) throw new Error('Please choose private, public, or friends for this device setting.')
  } else if (['darkMode', 'hapticsEnabled', 'dataAnalytics'].includes(input.key)) {
    if (typeof input.value !== 'boolean') throw new Error('Please say whether to turn that device setting on or off.')
  } else throw new Error('That device setting is not supported by this voice action.')
  return { key: input.key as LocalPreferenceKey, value: input.value as LocalPreferenceValue }
}

export async function captureLocalPreferenceReview(token: string, accountId: string, input: unknown, isCurrent: () => boolean, io = normalIo): Promise<LocalPreferenceReview> {
  if (!token || !accountId || !isCurrent()) throw new Error('Please review this device setting again.')
  const preference = validateLocalPreference(input)
  const beforeValue = await io.getItem(preference.key)
  if (!isCurrent()) throw new Error('This device setting request has stopped.')
  return { token, accountId, preference, beforeValue, expiresAt: io.now() + 10 * 60 * 1000 }
}

export async function applyReviewedLocalPreference(review: LocalPreferenceReview, token: string, accountId: string, authorized: unknown, isCurrent: () => boolean, io = normalIo): Promise<LocalPreferenceReceipt> {
  const preference = validateLocalPreference(authorized)
  const check = () => {
    if (!isCurrent() || review.accountId !== accountId || review.token !== token || io.now() > review.expiresAt) throw new Error('This device setting request has stopped or expired. Please review it again.')
    if (preference.key !== review.preference.key || preference.value !== review.preference.value) throw new Error('The authorized setting differs from the setting you reviewed.')
  }
  check()
  const existing = pending.get(review)
  if (existing) return existing
  const run = (async (): Promise<LocalPreferenceReceipt> => {
    const current = await io.getItem(preference.key)
    check()
    const target = String(preference.value)
    if (completed.has(review)) {
      if (current !== target) throw new Error('This device setting has changed since the last confirmation. Please review its current value.')
      return { kind: 'local_preference_action', id: preference.key, operation: 'update', entity: 'device_preferences', message: 'That device setting was already saved and has been checked again.', idempotentReplay: true }
    }
    if (current !== review.beforeValue) throw new Error('This device setting changed after your review. Please review it again before applying the change.')
    check()
    await io.setItem(preference.key, target)
    if (!isCurrent()) throw new Error('The device write had already started when the request stopped. Please check the setting before retrying.')
    if (await io.getItem(preference.key) !== target) throw new Error('The device did not confirm the new setting. Please check Settings before retrying.')
    check()
    if (preference.key === 'darkMode') io.setColorScheme(preference.value ? 'dark' : 'light')
    completed.add(review)
    return { kind: 'local_preference_action', id: preference.key, operation: 'update', entity: 'device_preferences', message: 'Your device setting has been saved and checked on this device.' }
  })()
  pending.set(review, run)
  try { return await run } finally { if (pending.get(review) === run) pending.delete(review) }
}
