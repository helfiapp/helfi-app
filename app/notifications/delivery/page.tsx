'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'

export default function NotificationDeliveryPage() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(false)
  const [localPrefsLoaded, setLocalPrefsLoaded] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('emailNotifications')
      const savedPush = localStorage.getItem('pushNotifications')
      if (savedEmail !== null) setEmailNotifications(savedEmail === 'true')
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
    localStorage.setItem('emailNotifications', emailNotifications.toString())
  }, [emailNotifications, localPrefsLoaded])

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
    if (isIOS && !isInstalled && enabled) {
      alert('To enable notifications on iPhone, first Add to Home Screen, then open the Helfi app icon and enable here.')
      return
    }

    setPushNotifications(enabled)

    if (enabled && 'Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushNotifications(false)
        alert('Push notifications were denied. Please enable them in your browser settings.')
        return
      }
      try {
        const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
        const vapid = await fetch('/api/push/vapid').then((r) => r.json()).catch(() => ({ publicKey: '' }))
        if (!vapid.publicKey) {
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
        alert('Could not enable notifications on this device.')
      }
    }

    if (!enabled) {
      try {
        await fetch('/api/push/unsubscribe', { method: 'POST' })
      } catch {}
    }
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Notification delivery" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Delivery</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose how you want to receive alerts.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Email notifications</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Receive updates via email</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Push notifications</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isIOS && !isInstalled
                  ? 'On iPhone: Add to Home Screen, then open the app to enable'
                  : 'Get reminders on this device'}
              </p>
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

          {pushNotifications && (
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Test notification</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">Send yourself a test push now</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    if (Notification.permission !== 'granted') {
                      alert('Notifications are not enabled. Please enable them in your browser settings.')
                      return
                    }
                    const res = await fetch('/api/push/test', { method: 'POST' })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) {
                      const errorMsg = data.error || 'Failed to send notification'
                      if (errorMsg.includes('No subscription')) {
                        alert('No push subscription found. Please toggle notifications off and on again to re-register.')
                      } else if (errorMsg.includes('VAPID')) {
                        alert('Server configuration error. Please contact support.')
                      } else {
                        alert(`Failed: ${errorMsg}`)
                      }
                      return
                    }
                    alert('Test notification sent! Check your browser notifications.')
                  } catch (e: any) {
                    alert(`Error: ${e?.message || 'Could not send test notification.'}`)
                  }
                }}
                className="px-3 py-1.5 rounded-md bg-helfi-green text-white text-sm font-medium hover:opacity-90"
              >
                Send test
              </button>
            </div>
          )}

          {pushNotifications && (
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Send reminder now</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">Triggers the same path as the scheduler</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    if (Notification.permission !== 'granted') {
                      alert('Notifications are not enabled. Please enable them in your browser settings.')
                      return
                    }
                    const res = await fetch('/api/push/send-reminder-now', { method: 'POST' })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) {
                      const errorMsg = data.error || 'Failed to send reminder'
                      if (errorMsg.includes('No subscription')) {
                        alert('No push subscription found. Please toggle notifications off and on again to re-register.')
                      } else {
                        alert(`Failed: ${errorMsg}`)
                      }
                      return
                    }
                    alert('Reminder sent! Check your notifications.')
                  } catch (e: any) {
                    alert(`Error: ${e?.message || 'Could not send reminder.'}`)
                  }
                }}
                className="px-3 py-1.5 rounded-md bg-helfi-green text-white text-sm font-medium hover:opacity-90"
              >
                Send
              </button>
            </div>
          )}

          {pushNotifications && (
            <>
              {isIOS ? (
                <div className="mt-2 p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-lg border-2 border-blue-300 dark:border-blue-700">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                      Enable Notifications on iPhone
                    </p>
                  </div>
                  {!isInstalled && (
                    <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-300 dark:border-yellow-700">
                      <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                        Step 0: Add to Home Screen First
                      </p>
                      <p className="text-xs text-yellow-800 dark:text-yellow-200 leading-relaxed">
                        In Safari, tap the Share button and select "Add to Home Screen", then open Helfi from your home screen.
                      </p>
                    </div>
                  )}
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 p-2 bg-white/60 dark:bg-gray-800/40 rounded">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900 dark:text-blue-100">Open Settings</p>
                        <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-300">Open the Settings app on your iPhone</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-white/60 dark:bg-gray-800/40 rounded">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900 dark:text-blue-100">Go to Notifications</p>
                        <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-300">Scroll down and tap "Notifications"</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-white/60 dark:bg-gray-800/40 rounded">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900 dark:text-blue-100">Find Helfi</p>
                        <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-300">Tap "Helfi" in the list</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-white/60 dark:bg-gray-800/40 rounded">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900 dark:text-blue-100">Enable notifications</p>
                        <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-300">Toggle "Allow Notifications" to ON</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>Note:</strong> Notifications may not appear if your browser is in the foreground. Try minimizing the browser window or switching to another app.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
