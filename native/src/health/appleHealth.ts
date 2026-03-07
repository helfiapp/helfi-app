import { Platform } from 'react-native'
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

function initHealthKit(): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.reject(new Error('Apple Health is only available on iPhone'))

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
    AppleHealthKit.initHealthKit(permissions, (err: string) => {
      if (err) reject(new Error(String(err)))
      else resolve()
    })
  })
}

function getStepCount(): Promise<number> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.getStepCount(
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
    AppleHealthKit.getDistanceWalkingRunning(
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
    AppleHealthKit.getActiveEnergyBurned(
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

