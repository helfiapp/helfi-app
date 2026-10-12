import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppState, DeviceEventEmitter } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { appleHealthReadToday, isAppleHealthSupportedDevice } from './appleHealth'
import { appleHealthAutoKey, createAppleHealthSync, AppleHealthSyncResult } from './appleHealthSync'

const runSync = createAppleHealthSync({
  read: appleHealthReadToday,
  importSummary: async (summary, token) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(`${API_BASE_URL}/api/native-exercise-import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ source: 'APPLE_HEALTH', date: summary.localDate, steps: summary.steps, distanceKm: summary.distanceKm, caloriesKcal: summary.activeEnergyKcal }),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success !== true) throw new Error(data.error || 'Activity could not be saved. Please try again.')
    } finally { clearTimeout(timer) }
  },
})

type SyncContext = {
  enabled: boolean
  busy: boolean
  result: AppleHealthSyncResult | null
  error: string | null
  setEnabled: (enabled: boolean) => Promise<void>
  refresh: (manual?: boolean) => Promise<AppleHealthSyncResult | null>
}
const Context = createContext<SyncContext | null>(null)

export function AppleHealthSyncProvider({ children }: { children: React.ReactNode }) {
  const { mode, session } = useAppMode()
  const [enabled, updateEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AppleHealthSyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stateUserId, setStateUserId] = useState('')
  const preferenceWrites = useRef(Promise.resolve())
  const current = useRef({ userId: '', token: '', enabled: false, revision: 0 })
  const userId = mode === 'signedIn' ? session?.user.id || '' : ''
  const token = mode === 'signedIn' ? session?.token || '' : ''
  if (current.current.userId !== userId || current.current.token !== token) {
    current.current = { userId, token, enabled: false, revision: current.current.revision + 1 }
  }

  useEffect(() => {
    let cancelled = false
    setStateUserId(userId); updateEnabled(false); setReady(false); setResult(null); setError(null); setBusy(false)
    if (!userId || !isAppleHealthSupportedDevice()) return
    const revision = current.current.revision
    void AsyncStorage.getItem(appleHealthAutoKey(userId)).then(value => {
      if (cancelled || current.current.revision !== revision) return
      current.current.enabled = value === '1'
      updateEnabled(value === '1'); setReady(true)
    }).catch(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [userId, token])

  const setEnabled = useCallback(async (value: boolean) => {
    if (!userId || current.current.userId !== userId) return
    const revision = ++current.current.revision
    if (!value) {
      current.current.enabled = false
      updateEnabled(false)
    }
    const write = preferenceWrites.current.catch(() => {}).then(() => AsyncStorage.setItem(appleHealthAutoKey(userId), value ? '1' : '0'))
    preferenceWrites.current = write
    await write
    if (current.current.userId !== userId || current.current.revision !== revision) return
    current.current.enabled = value
    updateEnabled(value); setReady(true); setError(null)
  }, [userId])

  const refresh = useCallback(async (manual = false) => {
    if (!userId || !token || !isAppleHealthSupportedDevice()) return null
    const revision = current.current.revision
    const allowed = () => current.current.userId === userId && current.current.token === token && current.current.revision === revision && (manual || current.current.enabled)
    if (!allowed()) return null
    setBusy(true)
    try {
      const next = await runSync({ userId, token, manual, allowed })
      if (next && allowed()) {
        setResult(next); setError(null)
        if (next.imported) DeviceEventEmitter.emit('helfi:apple-health-imported', { userId, localDate: next.summary.localDate })
      }
      return next
    } catch (e: any) {
      if (allowed()) setError(e?.message || 'Activity could not be refreshed. Please try again.')
      if (manual && allowed()) throw e
      return null
    } finally {
      if (current.current.userId === userId && current.current.token === token) setBusy(false)
    }
  }, [userId, token])

  useEffect(() => {
    if (!ready || !enabled) return
    if (AppState.currentState === 'active') void refresh()
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh() })
    return () => sub.remove()
  }, [ready, enabled, refresh])

  const sameAccount = stateUserId === userId
  return <Context.Provider value={{ enabled: sameAccount && enabled, busy: sameAccount && busy, result: sameAccount ? result : null, error: sameAccount ? error : null, setEnabled, refresh }}>{children}</Context.Provider>
}

export function useAppleHealthSync() {
  const value = useContext(Context)
  if (!value) throw new Error('Apple Health sync provider is missing')
  return value
}
