'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import PageHeader from '@/components/PageHeader'
import { isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'
import { useSaveOnLeave } from '@/lib/use-save-on-leave'

const baseTimezones = [
  'UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Rome','Europe/Amsterdam','Europe/Zurich','Europe/Stockholm','Europe/Athens',
  'Africa/Johannesburg','Asia/Dubai','Asia/Kolkata','Asia/Bangkok','Asia/Singapore','Asia/Kuala_Lumpur','Asia/Hong_Kong','Asia/Tokyo','Asia/Seoul','Asia/Shanghai',
  'Australia/Perth','Australia/Adelaide','Australia/Melbourne','Australia/Sydney','Pacific/Auckland',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Vancouver','America/Mexico_City','America/Bogota','America/Sao_Paulo'
]

const CHECKINS_CACHE_TTL_MS = 5 * 60_000
const MOOD_CACHE_TTL_MS = 5 * 60_000

function normalizeTime(input: string, fallback: string) {
  const s = (input || '').trim()
  const m24 = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (m24) return `${m24[1]}:${m24[2]}`
  const digits = s.replace(/[^0-9]/g, '')
  if (digits.length >= 3) {
    const h = digits.slice(0, digits.length - 2)
    const mm = digits.slice(-2)
    const hh = Math.max(0, Math.min(23, parseInt(h, 10)))
    const m = Math.max(0, Math.min(59, parseInt(mm, 10)))
    return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  return fallback
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function ReminderSettingsPage() {
  const { data: session } = useSession()

  const [pushNotifications, setPushNotifications] = useState(false)
  const [localPrefsLoaded, setLocalPrefsLoaded] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  const [checkinsEnabled, setCheckinsEnabled] = useState(true)
  const [checkinsTime1, setCheckinsTime1] = useState('12:30')
  const [checkinsTime2, setCheckinsTime2] = useState('18:30')
  const [checkinsTime3, setCheckinsTime3] = useState('21:30')
  const [checkinsTime4, setCheckinsTime4] = useState('09:00')
  const [checkinsTz, setCheckinsTz] = useState('Australia/Melbourne')
  const [checkinsFrequency, setCheckinsFrequency] = useState(1)
  const [checkinsMaxFrequency, setCheckinsMaxFrequency] = useState(1)
  const [checkinsLoading, setCheckinsLoading] = useState(true)
  const [checkinsSaving, setCheckinsSaving] = useState(false)
  const [checkinsUnsaved, setCheckinsUnsaved] = useState(false)
  const checkinsSnapshotRef = useRef<string>('')
  const checkinsRef = useRef({
    enabled: true,
    time1: '12:30',
    time2: '18:30',
    time3: '21:30',
    time4: '09:00',
    timezone: 'Australia/Melbourne',
    frequency: 1,
  })
  const checkinsDirtyRef = useRef(false)
  const checkinsCacheKey = session?.user?.email ? `checkins-settings:${session.user.email}` : ''
  const checkinsStickyKey = session?.user?.email ? `checkins-settings-sticky:${session.user.email}` : ''

  const deviceTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

  const [moodEnabled, setMoodEnabled] = useState(false)
  const [moodFrequency, setMoodFrequency] = useState(1)
  const [moodTime1, setMoodTime1] = useState('20:00')
  const [moodTime2, setMoodTime2] = useState('12:00')
  const [moodTime3, setMoodTime3] = useState('18:00')
  const [moodTime4, setMoodTime4] = useState('09:00')
  const [moodTimezone, setMoodTimezone] = useState('UTC')
  const [moodMaxFrequency, setMoodMaxFrequency] = useState(1)
  const [moodLoading, setMoodLoading] = useState(true)
  const [moodSaving, setMoodSaving] = useState(false)
  const [moodUnsaved, setMoodUnsaved] = useState(false)
  const moodSnapshotRef = useRef<string>('')
  const moodRef = useRef({
    enabled: false,
    frequency: 1,
    time1: '20:00',
    time2: '12:00',
    time3: '18:00',
    time4: '09:00',
    timezone: 'UTC',
  })
  const moodDirtyRef = useRef(false)
  const moodCacheKey = session?.user?.email ? `mood-reminders:${session.user.email}` : ''
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [upgradeModalMessage, setUpgradeModalMessage] = useState('')

  useEffect(() => {
    try {
      const savedPush = localStorage.getItem('pushNotifications')
      if (savedPush !== null) setPushNotifications(savedPush === 'true')
    } catch {}

    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(isIOSDevice)
    const standalone =
      (window.navigator as any).standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    setIsInstalled(standalone)
    setLocalPrefsLoaded(true)
  }, [])

  useEffect(() => {
    if (!localPrefsLoaded) return
    localStorage.setItem('pushNotifications', pushNotifications.toString())
  }, [pushNotifications, localPrefsLoaded])

  useEffect(() => {
    ;(async () => {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration()
          if (reg) {
            const sub = await reg.pushManager.getSubscription()
            if (sub && Notification.permission === 'granted') {
              setPushNotifications(true)
            }
          }
        }
      } catch {}
    })()
  }, [])

  const handlePushNotificationToggle = async (enabled: boolean) => {
    if (pushBusy) return
    if (isIOS && !isInstalled && enabled) {
      alert('On iPhone: add to Home Screen first, then open the app icon and enable here.')
      return
    }
    setPushBusy(true)
    setPushNotifications(enabled)

    if (enabled && 'Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushNotifications(false)
        setPushBusy(false)
        alert('Push notifications were denied. Please enable them in your browser settings.')
        return
      }
      try {
        const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
        const vapid = await fetch('/api/push/vapid').then((r) => r.json()).catch(() => ({ publicKey: '' }))
        if (!vapid.publicKey) {
          setPushNotifications(false)
          setPushBusy(false)
          alert('Notifications are not yet fully enabled by the server. Please try again later.')
          return
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub }),
        })
        alert('Notifications enabled')
      } catch (e) {
        console.error('push enable error', e)
        setPushNotifications(false)
        alert('Could not enable notifications on this device.')
      }
    }

    if (!enabled) {
      try {
        await fetch('/api/push/unsubscribe', { method: 'POST' })
      } catch {}
    }
    setPushBusy(false)
  }

  const saveCheckins = useCallback(async (options?: { silent?: boolean; keepalive?: boolean; payload?: typeof checkinsRef.current }) => {
    if (checkinsSaving && !options?.silent) return
    const payload = options?.payload ?? {
      enabled: checkinsEnabled,
      time1: checkinsTime1,
      time2: checkinsTime2,
      time3: checkinsTime3,
      time4: checkinsTime4,
      timezone: checkinsTz,
      frequency: checkinsFrequency,
    }
    if (!options?.silent) setCheckinsSaving(true)
    try {
      const res = await fetch('/api/checkins/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: !!options?.keepalive,
      })
      if (res.ok) {
        const snapshot = JSON.stringify(payload)
        checkinsSnapshotRef.current = snapshot
        checkinsDirtyRef.current = false
        setCheckinsUnsaved(false)
        if (checkinsCacheKey) {
          writeClientCache(checkinsCacheKey, payload)
        }
        if (checkinsStickyKey) {
          try {
            localStorage.setItem(checkinsStickyKey, JSON.stringify(payload))
          } catch {}
        }
        if (!options?.silent) alert('Check-in reminders saved.')
      } else {
        const data = await res.json().catch(() => ({}))
        if (!options?.silent) alert(`Failed to save: ${data.error || 'Unknown error'}`)
      }
    } catch {
      if (!options?.silent) alert('Could not save check-in reminders.')
    } finally {
      if (!options?.silent) setCheckinsSaving(false)
    }
  }, [checkinsCacheKey, checkinsStickyKey, checkinsSaving, checkinsEnabled, checkinsTime1, checkinsTime2, checkinsTime3, checkinsTime4, checkinsTz, checkinsFrequency])

  const saveMood = useCallback(async (options?: { silent?: boolean; keepalive?: boolean; payload?: typeof moodRef.current }) => {
    if (moodSaving && !options?.silent) return
    const payload = options?.payload ?? {
      enabled: moodEnabled,
      frequency: moodFrequency,
      time1: moodTime1,
      time2: moodTime2,
      time3: moodTime3,
      time4: moodTime4,
      timezone: moodTimezone,
    }
    if (!options?.silent) setMoodSaving(true)
    try {
      const res = await fetch('/api/mood/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: !!options?.keepalive,
      })
      if (res.ok) {
        const snapshot = JSON.stringify(payload)
        moodSnapshotRef.current = snapshot
        moodDirtyRef.current = false
        setMoodUnsaved(false)
        if (moodCacheKey) {
          writeClientCache(moodCacheKey, payload)
        }
        if (!options?.silent) alert('Mood reminders saved.')
      } else {
        const data = await res.json().catch(() => ({}))
        if (!options?.silent) alert(`Failed to save: ${data.error || 'Unknown error'}`)
      }
    } catch {
      if (!options?.silent) alert('Could not save mood reminders.')
    } finally {
      if (!options?.silent) setMoodSaving(false)
    }
  }, [moodCacheKey, moodSaving, moodEnabled, moodFrequency, moodTime1, moodTime2, moodTime3, moodTime4, moodTimezone])

  useEffect(() => {
    const applyCheckins = (data: any, options?: { setSnapshot?: boolean }) => {
      if (!data) return
      const enabled = typeof data.enabled === 'boolean' ? data.enabled : true
      const time1 = normalizeTime(data.time1 || '12:30', '12:30')
      const time2 = normalizeTime(data.time2 || '18:30', '18:30')
      const time3 = normalizeTime(data.time3 || '21:30', '21:30')
      const time4 = normalizeTime(data.time4 || '09:00', '09:00')
      const timezone = String(data.timezone || 'Australia/Melbourne')
      const maxFreq = Number(data.maxFrequency) || 1
      const frequency = Math.min(Math.max(1, Number(data.frequency) || 1), maxFreq)

      if (options?.setSnapshot) {
        const snapshot = JSON.stringify({ enabled, time1, time2, time3, time4, timezone, frequency })
        checkinsSnapshotRef.current = snapshot
        checkinsDirtyRef.current = false
        setCheckinsUnsaved(false)
      }

      setCheckinsEnabled(enabled)
      setCheckinsTime1(time1)
      setCheckinsTime2(time2)
      setCheckinsTime3(time3)
      setCheckinsTime4(time4)
      setCheckinsTz(timezone)
      setCheckinsMaxFrequency(maxFreq)
      setCheckinsFrequency(frequency)
    }

    if (checkinsStickyKey) {
      try {
        const raw = localStorage.getItem(checkinsStickyKey)
        if (raw) {
          const sticky = JSON.parse(raw)
          applyCheckins(sticky)
          setCheckinsLoading(false)
        }
      } catch {}
    }

    const cached = checkinsCacheKey ? readClientCache<any>(checkinsCacheKey) : null
    if (cached?.data) {
      applyCheckins(cached.data)
      setCheckinsLoading(false)
    }

    ;(async () => {
      try {
        const res = await fetch('/api/checkins/settings', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          applyCheckins(data, { setSnapshot: true })
          if (checkinsCacheKey) writeClientCache(checkinsCacheKey, data)
          if (checkinsStickyKey) {
            try {
              localStorage.setItem(checkinsStickyKey, JSON.stringify(data))
            } catch {}
          }
        }
      } catch {}
      setCheckinsLoading(false)
    })()
  }, [checkinsCacheKey, checkinsStickyKey])

  useEffect(() => {
    const applyMood = (data: any, options?: { setSnapshot?: boolean }) => {
      if (!data) return
      const enabled = !!data.enabled
      const time1 = normalizeTime(data.time1 || '20:00', '20:00')
      const time2 = normalizeTime(data.time2 || '12:00', '12:00')
      const time3 = normalizeTime(data.time3 || '18:00', '18:00')
      const time4 = normalizeTime(data.time4 || '09:00', '09:00')
      const timezone = (data.timezone && String(data.timezone).trim()) || deviceTimezone || 'UTC'
      const maxFreq = Number(data.maxFrequency) || 1
      const frequency = Math.min(Math.max(1, Number(data.frequency) || 1), maxFreq)

      if (options?.setSnapshot) {
        const snapshot = JSON.stringify({ enabled, frequency, time1, time2, time3, time4, timezone })
        moodSnapshotRef.current = snapshot
        moodDirtyRef.current = false
        setMoodUnsaved(false)
      }

      setMoodEnabled(enabled)
      setMoodTime1(time1)
      setMoodTime2(time2)
      setMoodTime3(time3)
      setMoodTime4(time4)
      setMoodTimezone(timezone)
      setMoodMaxFrequency(maxFreq)
      setMoodFrequency(frequency)
    }

    const cached = moodCacheKey ? readClientCache<any>(moodCacheKey) : null
    if (cached?.data) {
      applyMood(cached.data)
      setMoodLoading(false)
    }

    ;(async () => {
      try {
        const res = await fetch('/api/mood/reminders', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          applyMood(data, { setSnapshot: true })
          if (moodCacheKey) writeClientCache(moodCacheKey, data)
        }
      } catch {}
      setMoodLoading(false)
    })()
  }, [deviceTimezone, moodCacheKey])

  useEffect(() => {
    if (checkinsLoading) return
    const nextSettings = {
      enabled: checkinsEnabled,
      time1: checkinsTime1,
      time2: checkinsTime2,
      time3: checkinsTime3,
      time4: checkinsTime4,
      timezone: checkinsTz,
      frequency: checkinsFrequency,
    }
    checkinsRef.current = nextSettings
    const snapshot = JSON.stringify(nextSettings)
    if (!checkinsSnapshotRef.current) {
      checkinsSnapshotRef.current = snapshot
      checkinsDirtyRef.current = false
      setCheckinsUnsaved(false)
      return
    }
    const dirty = snapshot !== checkinsSnapshotRef.current
    checkinsDirtyRef.current = dirty
    setCheckinsUnsaved(dirty)
  }, [checkinsEnabled, checkinsTime1, checkinsTime2, checkinsTime3, checkinsTime4, checkinsTz, checkinsFrequency, checkinsLoading])

  useEffect(() => {
    if (moodLoading) return
    const nextSettings = {
      enabled: moodEnabled,
      frequency: moodFrequency,
      time1: moodTime1,
      time2: moodTime2,
      time3: moodTime3,
      time4: moodTime4,
      timezone: moodTimezone,
    }
    moodRef.current = nextSettings
    const snapshot = JSON.stringify(nextSettings)
    if (!moodSnapshotRef.current) {
      moodSnapshotRef.current = snapshot
      moodDirtyRef.current = false
      setMoodUnsaved(false)
      return
    }
    const dirty = snapshot !== moodSnapshotRef.current
    moodDirtyRef.current = dirty
    setMoodUnsaved(dirty)
  }, [moodEnabled, moodFrequency, moodTime1, moodTime2, moodTime3, moodTime4, moodTimezone, moodLoading])

  useSaveOnLeave(() => {
    if (!checkinsDirtyRef.current) return
    void saveCheckins({ silent: true, keepalive: true, payload: checkinsRef.current })
  })

  useSaveOnLeave(() => {
    if (!moodDirtyRef.current) return
    void saveMood({ silent: true, keepalive: true, payload: moodRef.current })
  })

  const openUpgradeModal = (message: string) => {
    setUpgradeModalMessage(message)
    setUpgradeModalOpen(true)
  }

  const handleCheckinsFrequencyChange = (value: number) => {
    if (value > checkinsMaxFrequency) {
      openUpgradeModal('Free members can set 1 reminder per day. Subscribe or buy credits to unlock up to 4 reminders per day.')
      return
    }
    setCheckinsFrequency(value)
  }

  const handleMoodFrequencyChange = (value: number) => {
    if (value > moodMaxFrequency) {
      openUpgradeModal('Free members can set 1 reminder per day. Subscribe or buy credits to unlock up to 4 reminders per day.')
      return
    }
    setMoodFrequency(value)
  }

  const maxReminderLabel = checkinsMaxFrequency >= 4
    ? 'You can set up to 4 reminders per day.'
    : 'Free members can set 1 reminder per day.'
  const moodMaxReminderLabel = moodMaxFrequency >= 4
    ? 'You can set up to 4 reminders per day.'
    : 'Free members can set 1 reminder per day.'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Reminders" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Push notifications</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Turn these on to receive reminders on this device.</p>
            </div>
            <label className={`relative inline-flex items-center ${(isIOS && !isInstalled) ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                className="sr-only peer"
                checked={pushNotifications}
                disabled={isIOS && !isInstalled}
                onChange={(e) => handlePushNotificationToggle(e.target.checked)}
              />
              <div className={`w-11 h-6 ${(isIOS && !isInstalled) ? 'bg-gray-100 dark:bg-gray-600' : 'bg-gray-200'} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${(isIOS && !isInstalled) ? '' : 'peer-checked:bg-helfi-green'} ${(isIOS && !isInstalled) ? 'opacity-50' : ''}`}></div>
            </label>
          </div>
          {isIOS && !isInstalled && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              On iPhone: Add to Home Screen first, then open the app icon to enable notifications.
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Step 1: turn on push notifications. Step 2: turn on the check-in and mood reminders below and pick times.
          </p>
        </div>

        {!pushNotifications && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4">
            <div className="font-semibold mb-1">Push notifications are off on this device.</div>
            <div className="text-sm">
              Turn them on above so reminders can actually appear.
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Daily check-in reminders</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                These reminders help you build your 7-day health report. The full report is for paid members or people who bought credits.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={checkinsEnabled}
                disabled={checkinsLoading || checkinsSaving}
                onChange={(e) => setCheckinsEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
            </label>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{maxReminderLabel}</p>
          {checkinsMaxFrequency < 4 && (
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              Want more reminders? <Link href="/billing" className="text-helfi-green font-semibold hover:underline">Subscribe or buy credits</Link> to unlock up to 4 per day.
            </div>
          )}
          {!pushNotifications && (
            <div className="text-xs text-amber-700 mb-4">
              Turn on push notifications above so these reminders can show up on this device.
            </div>
          )}

          {checkinsLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-helfi-green"></div>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Number of reminders per day
                  </label>
                  <select
                    value={checkinsFrequency}
                    onChange={(e) => handleCheckinsFrequencyChange(parseInt(e.target.value, 10))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!checkinsEnabled}
                  >
                    <option value={1}>1 reminder</option>
                    <option value={2}>2 reminders</option>
                    <option value={3}>3 reminders</option>
                    <option value={4}>4 reminders</option>
                  </select>
                </div>

                {checkinsFrequency >= 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 1
                    </label>
                    <input
                      type="time"
                      value={checkinsTime1}
                      onChange={(e) => setCheckinsTime1(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!checkinsEnabled}
                    />
                  </div>
                )}

                {checkinsFrequency >= 2 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 2
                    </label>
                    <input
                      type="time"
                      value={checkinsTime2}
                      onChange={(e) => setCheckinsTime2(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!checkinsEnabled}
                    />
                  </div>
                )}

                {checkinsFrequency >= 3 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 3
                    </label>
                    <input
                      type="time"
                      value={checkinsTime3}
                      onChange={(e) => setCheckinsTime3(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!checkinsEnabled}
                    />
                  </div>
                )}

                {checkinsFrequency >= 4 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 4
                    </label>
                    <input
                      type="time"
                      value={checkinsTime4}
                      onChange={(e) => setCheckinsTime4(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!checkinsEnabled}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <select
                    value={checkinsTz}
                    onChange={(e) => setCheckinsTz(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!checkinsEnabled}
                  >
                    {baseTimezones.map((tzOption) => (
                      <option key={tzOption} value={tzOption}>
                        {tzOption}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={async () => {
                  await saveCheckins()
                }}
                disabled={checkinsSaving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
              >
                {checkinsSaving ? 'Saving...' : 'Save check-in reminders'}
              </button>
              {checkinsUnsaved && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Changes save automatically when you leave this page.
                </p>
              )}
            </>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mood reminders</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                These reminders help you build your 7-day health report. The full report is for paid members or people who bought credits.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={moodEnabled}
                disabled={moodLoading || moodSaving}
                onChange={(e) => setMoodEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
            </label>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{moodMaxReminderLabel}</p>
          {moodMaxFrequency < 4 && (
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              Want more reminders? <Link href="/billing" className="text-helfi-green font-semibold hover:underline">Subscribe or buy credits</Link> to unlock up to 4 per day.
            </div>
          )}
          {!pushNotifications && (
            <div className="text-xs text-amber-700 mb-4">
              Turn on push notifications above so these reminders can show up on this device.
            </div>
          )}

          {moodLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-helfi-green"></div>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Number of reminders per day
                  </label>
                  <select
                    value={moodFrequency}
                    onChange={(e) => handleMoodFrequencyChange(parseInt(e.target.value, 10))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!moodEnabled}
                  >
                    <option value={1}>1 reminder</option>
                    <option value={2}>2 reminders</option>
                    <option value={3}>3 reminders</option>
                    <option value={4}>4 reminders</option>
                  </select>
                </div>

                {moodFrequency >= 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 1
                    </label>
                    <input
                      type="time"
                      value={moodTime1}
                      onChange={(e) => setMoodTime1(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!moodEnabled}
                    />
                  </div>
                )}

                {moodFrequency >= 2 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 2
                    </label>
                    <input
                      type="time"
                      value={moodTime2}
                      onChange={(e) => setMoodTime2(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!moodEnabled}
                    />
                  </div>
                )}

                {moodFrequency >= 3 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 3
                    </label>
                    <input
                      type="time"
                      value={moodTime3}
                      onChange={(e) => setMoodTime3(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!moodEnabled}
                    />
                  </div>
                )}

                {moodFrequency >= 4 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 4
                    </label>
                    <input
                      type="time"
                      value={moodTime4}
                      onChange={(e) => setMoodTime4(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!moodEnabled}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <select
                    value={moodTimezone}
                    onChange={(e) => setMoodTimezone(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!moodEnabled}
                  >
                    {baseTimezones.map((tzOption) => (
                      <option key={tzOption} value={tzOption}>
                        {tzOption}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Detected on this device: {deviceTimezone}
                </p>
              </div>

              <button
                onClick={async () => {
                  await saveMood()
                }}
                disabled={moodSaving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
              >
                {moodSaving ? 'Saving...' : 'Save mood reminders'}
              </button>
              {moodUnsaved && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Changes save automatically when you leave this page.
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {upgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upgrade for more reminders</h3>
            <p className="text-sm text-gray-700 mb-6">{upgradeModalMessage}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setUpgradeModalOpen(false)}
                className="w-full sm:w-auto rounded-lg border border-helfi-green px-4 py-2 text-helfi-green font-semibold hover:bg-helfi-green/10"
              >
                OK
              </button>
              <Link
                href="/billing"
                className="w-full sm:w-auto rounded-lg bg-helfi-green px-4 py-2 text-center text-white font-semibold hover:bg-helfi-green/90"
                onClick={() => setUpgradeModalOpen(false)}
              >
                Upgrade
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
