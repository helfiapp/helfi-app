import { NativeModules, Platform } from 'react-native'
import AppleHealthKit, { HealthKitPermissions, HealthValue } from 'react-native-health'
import { AppleHealthSource, discoverAppleHealthSources, sumAppleHealthSourceQuantity, validateAppleHealthSource } from './appleHealthSources'
export type { AppleHealthSource } from './appleHealthSources'

export type AppleHealthTodaySummary = {
  localDate: string
  steps: number | null
  distanceKm: number | null
  activeEnergyKcal: number | null
  selectedSource: AppleHealthSource | null
}

function asNumber(val: any): number | null {
  const n = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(n)) return null
  return n
}

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function appleHealthDateWindow(localDate: string | undefined, now = new Date()) {
  const date = localDate ?? localDateString(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid date for Apple Health.')
  const [year, month, day] = date.split('-').map(Number)
  const reference = new Date(year, month - 1, day, 12)
  if (localDateString(reference) !== date) throw new Error('Choose a valid date for Apple Health.')
  if (date > localDateString(now)) throw new Error('Apple Health cannot import a future date.')
  const start = new Date(year, month - 1, day)
  const end = date === localDateString(now) ? new Date(now) : new Date(year, month - 1, day + 1)
  if (date !== localDateString(now)) end.setMilliseconds(-1)
  return { localDate: date, reference: date === localDateString(now) ? new Date(now) : reference, start, end }
}

function healthKitBridge(sourceMethods = false): typeof AppleHealthKit {
  // The library copies NativeModules with Object.assign. Bridgeless host
  // methods may be callable without being enumerable, so that copy can lose
  // the methods. Keep the original native object in that case.
  const candidates = [AppleHealthKit, NativeModules.AppleHealthKit]
  const methods = ['isAvailable', 'initHealthKit', 'getStepCount', 'getDistanceWalkingRunning', 'getActiveEnergyBurned']
  if (sourceMethods) methods.push('getDailyStepCountSamples', 'getDailyDistanceWalkingRunningSamples')
  const bridge = candidates.find(candidate => candidate && methods.every(method => typeof candidate[method] === 'function'))
  if (!bridge) throw new Error('Apple Health is unavailable in this installation. Please update Helfi and try again.')
  return bridge
}

export function isAppleHealthSupportedDevice() {
  // Apple brought HealthKit to iPad with iPadOS 17. The native availability
  // check below is still authoritative before requesting access.
  return Platform.OS === 'ios' && ((Platform as any).isPad !== true || Number.parseInt(String(Platform.Version), 10) >= 17)
}

async function initHealthKit(): Promise<void> {
  if (!isAppleHealthSupportedDevice()) throw new Error('Apple Health requires an iPhone or an iPad with iPadOS 17 or later.')
  const bridge = healthKitBridge()
  const available = await new Promise<boolean>((resolve, reject) => {
    bridge.isAvailable((error, result) => error ? reject(new Error(String(error))) : resolve(result === true))
  })
  if (!available) throw new Error('Apple Health is unavailable on this device.')

  const permissions: HealthKitPermissions = {
    permissions: {
      read: [
        AppleHealthKit.Constants.Permissions.Steps,
        AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
        AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      ],
      write: [],
    },
  }

  return new Promise((resolve, reject) => {
    bridge.initHealthKit(permissions, (err: string) => {
      if (err) reject(new Error(String(err)))
      else resolve()
    })
  })
}

function getStepCount(now: Date): Promise<number> {
  return new Promise((resolve, reject) => {
    healthKitBridge().getStepCount(
      { date: now.toISOString() } as any,
      (err: string, results: HealthValue) => {
        if (err) return reject(new Error(String(err)))
        resolve(Math.max(0, Math.floor(asNumber((results as any)?.value) || 0)))
      },
    )
  })
}

function getDistanceWalkingRunningKm(now: Date): Promise<number | null> {
  return new Promise((resolve, reject) => {
    healthKitBridge().getDistanceWalkingRunning(
      { date: now.toISOString(), unit: 'meter' } as any,
      (err: string, results: HealthValue) => {
        if (err) return reject(new Error(String(err)))
        const meters = asNumber((results as any)?.value)
        if (meters === null || meters <= 0) return resolve(null)
        resolve(meters / 1000)
      },
    )
  })
}

function getActiveEnergyKcal(start: Date, end: Date): Promise<number | null> {
  return new Promise((resolve, reject) => {
    healthKitBridge().getActiveEnergyBurned(
      { startDate: start.toISOString(), endDate: end.toISOString() } as any,
      (err: string, results: Array<HealthValue>) => {
        if (err) return reject(new Error(String(err)))
        const sum = (Array.isArray(results) ? results : [])
          .map((r: any) => asNumber(r?.value) || 0)
          .reduce((a, b) => a + b, 0)
        if (!Number.isFinite(sum) || sum <= 0) return resolve(null)
        return resolve(sum)
      },
    )
  })
}

export async function appleHealthConnectAndReadToday(): Promise<AppleHealthTodaySummary> {
  await initHealthKit()
  return appleHealthReadToday()
}

// Reading already-authorised data must never open Apple's permission sheet.
export async function appleHealthReadToday(now = new Date()): Promise<AppleHealthTodaySummary> {
  return appleHealthReadDate(undefined, now)
}

async function readSourceBuckets(localDate?: string, now = new Date()) {
  if (!isAppleHealthSupportedDevice()) throw new Error('Apple Health requires an iPhone or an iPad with iPadOS 17 or later.')
  const window = appleHealthDateWindow(localDate, now)
  const bridge = healthKitBridge(true)
  const options = { startDate: window.start.toISOString(), endDate: window.end.toISOString(), period: 60, ascending: true }
  const query = (method: 'getDailyStepCountSamples' | 'getDailyDistanceWalkingRunningSamples' | 'getActiveEnergyBurned', unit?: 'count' | 'meter') => new Promise<HealthValue[]>((resolve, reject) => {
    bridge[method]({ ...options, ...(unit ? { unit } : {}) } as any, (error: string, results: HealthValue[]) => error ? reject(new Error(String(error))) : resolve(Array.isArray(results) ? results : []))
  })
  const [steps, distance, energy] = await Promise.all([query('getDailyStepCountSamples', 'count'), query('getDailyDistanceWalkingRunningSamples', 'meter'), query('getActiveEnergyBurned')])
  return { window, steps, distance, energy }
}

export async function appleHealthDiscoverSources(localDate?: string): Promise<AppleHealthSource[]> {
  const buckets = await readSourceBuckets(localDate)
  return discoverAppleHealthSources([buckets.steps, buckets.distance, buckets.energy])
}

export async function appleHealthReadDate(localDate?: string, now = new Date(), selection: AppleHealthSource | null = null): Promise<AppleHealthTodaySummary> {
  const selectedSource = validateAppleHealthSource(selection)
  if (selectedSource) {
    const buckets = await readSourceBuckets(localDate, now)
    const observed = discoverAppleHealthSources([buckets.steps, buckets.distance, buckets.energy]).find(source => source.sourceId === selectedSource.sourceId)
    if (!observed) return { localDate: buckets.window.localDate, selectedSource, steps: null, distanceKm: null, activeEnergyKcal: null }
    const steps = sumAppleHealthSourceQuantity(buckets.steps, selectedSource.sourceId)
    const distanceMeters = sumAppleHealthSourceQuantity(buckets.distance, selectedSource.sourceId)
    return {
      localDate: buckets.window.localDate, selectedSource: observed ?? selectedSource,
      steps: steps === null ? null : Math.floor(steps),
      distanceKm: distanceMeters === null ? null : distanceMeters / 1000,
      activeEnergyKcal: sumAppleHealthSourceQuantity(buckets.energy, selectedSource.sourceId),
    }
  }
  if (!isAppleHealthSupportedDevice()) throw new Error('Apple Health requires an iPhone or an iPad with iPadOS 17 or later.')
  const window = appleHealthDateWindow(localDate, now)
  const [steps, distanceKm, activeEnergyKcal] = await Promise.all([
    getStepCount(window.reference),
    getDistanceWalkingRunningKm(window.reference),
    getActiveEnergyKcal(window.start, window.end),
  ])

  return { localDate: window.localDate, steps, distanceKm, activeEnergyKcal, selectedSource: null }
}
