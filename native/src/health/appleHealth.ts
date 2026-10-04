import { NativeModules, Platform } from 'react-native'
import AppleHealthKit, { HealthKitPermissions, HealthValue } from 'react-native-health'

type AppleHealthTodaySummary = {
  steps: number
  distanceKm: number | null
  activeEnergyKcal: number | null
}

function asNumber(val: any): number | null {
  const n = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(n)) return null
  return n
}

function startOfTodayLocalISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function nowISO() {
  return new Date().toISOString()
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

function getStepCount(): Promise<number> {
  return new Promise((resolve, reject) => {
    healthKitBridge().getStepCount(
      { startDate: startOfTodayLocalISO(), endDate: nowISO() } as any,
      (err: string, results: HealthValue) => {
        if (err) return reject(new Error(String(err)))
        resolve(Math.max(0, Math.floor(asNumber((results as any)?.value) || 0)))
      },
    )
  })
}

function getDistanceWalkingRunningKm(): Promise<number | null> {
  return new Promise((resolve, reject) => {
    healthKitBridge().getDistanceWalkingRunning(
      { startDate: startOfTodayLocalISO(), endDate: nowISO() } as any,
      (err: string, results: HealthValue) => {
        if (err) return reject(new Error(String(err)))
        const meters = asNumber((results as any)?.value)
        if (meters === null || meters <= 0) return resolve(null)
        resolve(meters / 1000)
      },
    )
  })
}

function getActiveEnergyKcal(): Promise<number | null> {
  return new Promise((resolve, reject) => {
    healthKitBridge().getActiveEnergyBurned(
      { startDate: startOfTodayLocalISO(), endDate: nowISO() } as any,
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
  const [steps, distanceKm, activeEnergyKcal] = await Promise.all([
    getStepCount(),
    getDistanceWalkingRunningKm(),
    getActiveEnergyKcal(),
  ])

  return { steps, distanceKm, activeEnergyKcal }
}
