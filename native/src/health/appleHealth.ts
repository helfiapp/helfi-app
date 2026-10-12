import { NativeModules, Platform } from 'react-native'
import AppleHealthKit, { HealthKitPermissions, HealthValue } from 'react-native-health'

export type AppleHealthTodaySummary = {
  localDate: string
  steps: number
  distanceKm: number | null
  activeEnergyKcal: number | null
}

function asNumber(val: any): number | null {
  const n = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(n)) return null
  return n
}

function startOfTodayLocalISO(now: Date) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function healthKitBridge(): typeof AppleHealthKit {
  // The library copies NativeModules with Object.assign. Bridgeless host
  // methods may be callable without being enumerable, so that copy can lose
  // the methods. Keep the original native object in that case.
  const candidates = [AppleHealthKit, NativeModules.AppleHealthKit]
  const methods = ['isAvailable', 'initHealthKit', 'getStepCount', 'getDistanceWalkingRunning', 'getActiveEnergyBurned']
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

function getActiveEnergyKcal(now: Date): Promise<number | null> {
  return new Promise((resolve, reject) => {
    healthKitBridge().getActiveEnergyBurned(
      { startDate: startOfTodayLocalISO(now), endDate: now.toISOString() } as any,
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
  if (!isAppleHealthSupportedDevice()) throw new Error('Apple Health requires an iPhone or an iPad with iPadOS 17 or later.')
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [steps, distanceKm, activeEnergyKcal] = await Promise.all([
    getStepCount(now),
    getDistanceWalkingRunningKm(now),
    getActiveEnergyKcal(now),
  ])

  return { localDate, steps, distanceKm, activeEnergyKcal }
}
