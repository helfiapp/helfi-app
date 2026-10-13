import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppState, DeviceEventEmitter } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { appleHealthReadDate, appleHealthDiscoverSources, isAppleHealthSupportedDevice } from './appleHealth'
import { appleHealthAutoKey, appleHealthSourceKey, createAppleHealthSync, AppleHealthSyncResult } from './appleHealthSync'
import { validateAppleHealthSource, type AppleHealthSource } from './appleHealthSources'

const runSync = createAppleHealthSync({
  read: (date, source) => appleHealthReadDate(date, new Date(), source),
  discover: appleHealthDiscoverSources,
  importSummary: async (summary, token) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(`${API_BASE_URL}/api/native-exercise-import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ source: 'APPLE_HEALTH', date: summary.localDate, steps: summary.steps, distanceKm: summary.distanceKm, caloriesKcal: summary.activeEnergyKcal, selectedSource: summary.selectedSource }),
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
  source: AppleHealthSource | null
  setSource: (source: AppleHealthSource | null) => Promise<void>
  readSources: (localDate?: string) => Promise<AppleHealthSource[]>
  setEnabled: (enabled: boolean) => Promise<void>
  refresh: (manual?: boolean, localDate?: string) => Promise<AppleHealthSyncResult | null>
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
  const [source, updateSource] = useState<AppleHealthSource | null>(null)
  const preferenceWrites = useRef(Promise.resolve())
  const current = useRef({ userId: '', token: '', enabled: false, source: null as AppleHealthSource | null, savedSource: null as AppleHealthSource | null, savedSourceHydrated: false, sourceHydrated: false, sourcePending: null as number | null, revision: 0, enabledRevision: 0, sourceRevision: 0 })
  const userId = mode === 'signedIn' ? session?.user.id || '' : ''
  const token = mode === 'signedIn' ? session?.token || '' : ''
  if (current.current.userId !== userId || current.current.token !== token) {
    current.current = { userId, token, enabled: false, source: null, savedSource: null, savedSourceHydrated: false, sourceHydrated: false, sourcePending: null, revision: current.current.revision + 1, enabledRevision: 0, sourceRevision: 0 }
  }

  useEffect(() => {
    let cancelled = false
    setStateUserId(userId); updateSource(null); updateEnabled(false); setReady(false); setResult(null); setError(null); setBusy(false)
    if (!userId || !isAppleHealthSupportedDevice()) return
    const enabledRevision = current.current.enabledRevision
    const sourceRevision = current.current.sourceRevision
    void Promise.all([AsyncStorage.getItem(appleHealthAutoKey(userId)), AsyncStorage.getItem(appleHealthSourceKey(userId))]).then(([value, sourceJson]) => {
      if (cancelled || current.current.userId !== userId || current.current.token !== token) return
      if (current.current.sourceRevision === sourceRevision || current.current.sourcePending !== null) {
        const savedSource = sourceJson ? validateAppleHealthSource(JSON.parse(sourceJson)) : null
        current.current.savedSource = savedSource
        current.current.savedSourceHydrated = true
        if (current.current.sourceRevision === sourceRevision) {
          current.current.source = savedSource
          updateSource(savedSource)
        }
      }
      if (current.current.enabledRevision === enabledRevision) {
        current.current.enabled = value === '1'
        updateEnabled(value === '1')
      }
      current.current.sourceHydrated = true
      setReady(current.current.sourcePending === null)
    }).catch(() => { if (!cancelled && current.current.userId === userId && current.current.token === token) { current.current.enabled = false; updateEnabled(false); setError('Health settings could not be loaded. Select your source again before enabling automatic updates.'); setReady(current.current.sourceHydrated) } })
    return () => { cancelled = true }
  }, [userId, token])

  const setEnabled = useCallback(async (value: boolean) => {
    if (!userId || current.current.userId !== userId) return
    current.current.revision += 1
    current.current.enabledRevision = (current.current.enabledRevision ?? 0) + 1
    const enabledOperation = current.current.enabledRevision
    if (!value) {
      current.current.enabled = false
      updateEnabled(false)
    }
    const write = preferenceWrites.current.catch(() => {}).then(() => AsyncStorage.setItem(appleHealthAutoKey(userId), value ? '1' : '0'))
    preferenceWrites.current = write
    await write
    if (current.current.userId !== userId || current.current.enabledRevision !== enabledOperation) return
    current.current.enabled = value
    updateEnabled(value); if (current.current.sourceHydrated && current.current.sourcePending === null) setReady(true); setError(null)
  }, [userId])

  const setSource = useCallback(async (value: AppleHealthSource | null) => {
    const choice = validateAppleHealthSource(value)
    if (!userId || current.current.userId !== userId) return
    current.current.revision += 1
    current.current.sourceRevision = (current.current.sourceRevision ?? 0) + 1
    const sourceOperation = current.current.sourceRevision
    current.current.sourcePending = sourceOperation
    setReady(false)
    // Stop stale source reads immediately, and keep the old saved choice if saving fails.
    current.current.source = choice
    current.current.sourceHydrated = true
    updateSource(choice); setResult(null)
    const write = preferenceWrites.current.catch(() => {}).then(() => AsyncStorage.setItem(appleHealthSourceKey(userId), JSON.stringify(choice)))
    preferenceWrites.current = write
    try {
      await write
      if (current.current.userId !== userId) return
      current.current.savedSource = choice
      current.current.savedSourceHydrated = true
      if (current.current.sourceRevision !== sourceOperation) return
      current.current.sourcePending = null
      setReady(true); setError(null)
    } catch (error) {
      if (current.current.userId === userId && current.current.sourceRevision === sourceOperation) {
        current.current.source = current.current.savedSource; current.current.revision += 1
        current.current.sourceHydrated = current.current.savedSourceHydrated
        current.current.sourcePending = null
        current.current.enabled = false; updateEnabled(false)
        updateSource(current.current.savedSource)
        setReady(current.current.savedSourceHydrated)
      }
      throw error
    }
  }, [userId])

  const readSources = useCallback(async (localDate?: string) => {
    if (!userId || !token || !isAppleHealthSupportedDevice()) return []
    const revision = current.current.revision
    const allowed = () => current.current.userId === userId && current.current.token === token && current.current.revision === revision
    if (!allowed()) return []
    return runSync.readSources({ userId, token, localDate, allowed })
  }, [userId, token])

  const refresh = useCallback(async (manual = false, localDate?: string) => {
    if (!ready || current.current.sourcePending != null || !userId || !token || !isAppleHealthSupportedDevice()) return null
    const revision = current.current.revision
    const selectedSource = current.current.source
    const allowed = () => current.current.userId === userId && current.current.token === token && current.current.revision === revision && current.current.sourcePending == null && (manual || current.current.enabled)
    if (!allowed()) return null
    setBusy(true)
    try {
      const next = await runSync({ userId, token, localDate, source: selectedSource, manual, allowed })
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
  }, [ready, userId, token, source])

  useEffect(() => {
    if (!ready || !enabled) return
    if (AppState.currentState === 'active') void refresh()
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh() })
    return () => sub.remove()
  }, [ready, enabled, refresh])

  const sameAccount = stateUserId === userId
  return <Context.Provider value={{ enabled: sameAccount && enabled, busy: sameAccount && busy, result: sameAccount ? result : null, error: sameAccount ? error : null, source: sameAccount ? source : null, setSource, readSources, setEnabled, refresh }}>{children}</Context.Provider>
}

export function useAppleHealthSync() {
  const value = useContext(Context)
  if (!value) throw new Error('Apple Health sync provider is missing')
  return value
}
