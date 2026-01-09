'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import PageHeader from '@/components/PageHeader'
import FitbitSummary from '@/components/devices/FitbitSummary'
import FitbitCharts from '@/components/devices/FitbitCharts'
import FitbitCorrelations from '@/components/devices/FitbitCorrelations'
import { isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'

const USER_DATA_CACHE_TTL_MS = 5 * 60_000

export default function DevicesPage() {
  const { data: session } = useSession()
  const userDataCacheKey = session?.user?.email ? `user-data:${session.user.email}` : ''
  const garminConnectEnabled = process.env.NEXT_PUBLIC_GARMIN_CONNECT_ENABLED === 'true'
  const [fitbitConnected, setFitbitConnected] = useState(false)
  const [fitbitLoading, setFitbitLoading] = useState(false)
  const [syncingFitbit, setSyncingFitbit] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [garminConnected, setGarminConnected] = useState(false)
  const [garminLoading, setGarminLoading] = useState(false)
  const [garminPopupOpen, setGarminPopupOpen] = useState(false)
  const [garminCheckingStatus, setGarminCheckingStatus] = useState(false)
  const [deviceInterest, setDeviceInterest] = useState<Record<string, boolean>>({})
  const [savingInterest, setSavingInterest] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [clearingDemo, setClearingDemo] = useState(false)
  const [adminToken, setAdminToken] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const closedCheckRef = useRef<NodeJS.Timeout | null>(null)
  const garminPopupRef = useRef<Window | null>(null)
  const garminCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const garminClosedCheckRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    checkFitbitStatus()
    if (garminConnectEnabled) {
      checkGarminStatus()
    } else {
      setGarminConnected(false)
      setGarminLoading(false)
      setGarminPopupOpen(false)
      setGarminCheckingStatus(false)
    }
    loadDeviceInterest()

    try {
      const storedAdminToken = sessionStorage.getItem('adminToken')
      if (storedAdminToken) {
        setAdminToken(storedAdminToken)
      }
    } catch (error) {
      console.warn('Admin token lookup skipped:', error)
    }
    
    // Check URL params for Fitbit connection result
    const params = new URLSearchParams(window.location.search)
    if (params.get('fitbit_connected') === 'true') {
      setFitbitConnected(true)
      window.history.replaceState({}, '', '/devices')
    }
    if (params.get('fitbit_error')) {
      alert('Fitbit connection failed: ' + params.get('fitbit_error'))
      window.history.replaceState({}, '', '/devices')
    }
    if (params.get('garmin_connected') === 'true') {
      if (garminConnectEnabled) setGarminConnected(true)
      window.history.replaceState({}, '', '/devices')
    }
    if (params.get('garmin_error')) {
      const err = params.get('garmin_error')
      if (err === 'disabled') {
        alert('Garmin Connect is temporarily unavailable while production access is pending.')
      } else {
        alert('Garmin Connect connection failed: ' + err)
      }
      window.history.replaceState({}, '', '/devices')
    }

    const cleanupFitbitPopup = () => {
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close()
        } catch (e) {}
      }
      if (closedCheckRef.current) {
        clearInterval(closedCheckRef.current)
        closedCheckRef.current = null
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
      setPopupOpen(false)
      setCheckingStatus(false)
    }

    const cleanupGarminPopup = () => {
      if (garminPopupRef.current && !garminPopupRef.current.closed) {
        try {
          garminPopupRef.current.close()
        } catch (e) {}
      }
      if (garminClosedCheckRef.current) {
        clearInterval(garminClosedCheckRef.current)
        garminClosedCheckRef.current = null
      }
      if (garminCheckIntervalRef.current) {
        clearInterval(garminCheckIntervalRef.current)
        garminCheckIntervalRef.current = null
      }
      setGarminPopupOpen(false)
      setGarminCheckingStatus(false)
    }

    // Listen for messages from popup window
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FITBIT_CONNECTED' && event.data.success) {
        cleanupFitbitPopup()
        checkFitbitStatus()
        setFitbitLoading(false)
      } else if (event.data?.type === 'FITBIT_ERROR') {
        cleanupFitbitPopup()
        alert('Fitbit connection failed: ' + event.data.error)
        setFitbitLoading(false)
      } else if (event.data?.type === 'GARMIN_CONNECTED' && event.data.success) {
        cleanupGarminPopup()
        if (garminConnectEnabled) checkGarminStatus()
        setGarminLoading(false)
      } else if (event.data?.type === 'GARMIN_ERROR') {
        cleanupGarminPopup()
        alert('Garmin Connect connection failed: ' + event.data.error)
        setGarminLoading(false)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const loadDeviceInterest = async () => {
    try {
      const cached = userDataCacheKey ? readClientCache<any>(userDataCacheKey) : null
      if (cached?.data?.deviceInterest && typeof cached.data.deviceInterest === 'object') {
        setDeviceInterest(cached.data.deviceInterest)
      }
      const shouldFetch = !cached || !isCacheFresh(cached, USER_DATA_CACHE_TTL_MS)
      if (!shouldFetch) return

      const res = await fetch('/api/user-data', { cache: 'no-cache' })
      if (!res.ok) return
      const json = await res.json()
      if (json?.data?.deviceInterest && typeof json.data.deviceInterest === 'object') {
        setDeviceInterest(json.data.deviceInterest)
      }
      if (userDataCacheKey && json?.data) {
        writeClientCache(userDataCacheKey, json.data)
      }
    } catch {}
  }

  const saveDeviceInterest = async (next: Record<string, boolean>) => {
    try {
      setSavingInterest(true)
      const res = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceInterest: next }),
      })
      if (!res.ok) {
        throw new Error('Device interest update failed')
      }
      setDeviceInterest(next)
    } catch (e) {
      console.error('Failed to save device interest', e)
    } finally {
      setSavingInterest(false)
    }
  }

  const toggleInterest = (key: string) => {
    const next = { ...deviceInterest, [key]: !deviceInterest?.[key] }
    saveDeviceInterest(next)
  }

  const checkFitbitStatus = async () => {
    try {
      const response = await fetch('/api/fitbit/status')
      if (response.ok) {
        const data = await response.json()
        setFitbitConnected(data.connected)
        return data.connected
      }
      return false
    } catch (error) {
      console.error('Error checking Fitbit status:', error)
      return false
    }
  }

  const checkGarminStatus = async () => {
    if (!garminConnectEnabled) {
      setGarminConnected(false)
      return false
    }
    try {
      const response = await fetch('/api/garmin/status')
      if (response.ok) {
        const data = await response.json()
        setGarminConnected(data.connected)
        return data.connected
      }
      return false
    } catch (error) {
      console.error('Error checking Garmin status:', error)
      return false
    }
  }

  const handleConnectFitbit = async () => {
    setFitbitLoading(true)
    setPopupOpen(true)
    setCheckingStatus(true)
    try {
      // Open Fitbit OAuth in a popup window so users can still see Helfi
      const width = 600
      const height = 700
      const left = window.screen.width / 2 - width / 2
      const top = window.screen.height / 2 - height / 2
      
      const popup = window.open(
        '/api/auth/fitbit/authorize',
        'Fitbit Authorization',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
      )

      if (!popup) {
        alert('Please allow popups for this site to connect Fitbit')
        setFitbitLoading(false)
        setPopupOpen(false)
        setCheckingStatus(false)
        return
      }

      popupRef.current = popup

      // Check if popup is closed (user cancelled)
      closedCheckRef.current = setInterval(() => {
        if (popup.closed) {
          if (closedCheckRef.current) {
            clearInterval(closedCheckRef.current)
            closedCheckRef.current = null
          }
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current)
            checkIntervalRef.current = null
          }
          setFitbitLoading(false)
          setPopupOpen(false)
          setCheckingStatus(false)
          // Check status in case they completed it quickly
          setTimeout(() => checkFitbitStatus(), 1000)
        }
      }, 500)

      // Poll for connection status - check every 1 second (more frequent)
      checkIntervalRef.current = setInterval(async () => {
        setCheckingStatus(true)
        const connected = await checkFitbitStatus()
        if (connected) {
          if (closedCheckRef.current) {
            clearInterval(closedCheckRef.current)
            closedCheckRef.current = null
          }
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current)
            checkIntervalRef.current = null
          }
          // Try to close popup if still open
          if (popup && !popup.closed) {
            try {
              popup.close()
            } catch (e) {
              // Popup might be on different origin, ignore
            }
          }
          setFitbitLoading(false)
          setPopupOpen(false)
          setCheckingStatus(false)
        }
      }, 1000)

      // Cleanup after 3 minutes
      setTimeout(() => {
        if (closedCheckRef.current) {
          clearInterval(closedCheckRef.current)
          closedCheckRef.current = null
        }
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
          checkIntervalRef.current = null
        }
        setFitbitLoading(false)
        setPopupOpen(false)
        setCheckingStatus(false)
      }, 180000)
    } catch (error) {
      console.error('Error connecting Fitbit:', error)
      alert('Failed to connect Fitbit. Please try again.')
      setFitbitLoading(false)
      setPopupOpen(false)
      setCheckingStatus(false)
    }
  }

  const handleClosePopupAndCheck = async () => {
    // Close popup if still open
    if (popupRef.current && !popupRef.current.closed) {
      try {
        popupRef.current.close()
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Clean up intervals
    if (closedCheckRef.current) {
      clearInterval(closedCheckRef.current)
      closedCheckRef.current = null
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }
    
    setPopupOpen(false)
    setCheckingStatus(true)
    
    // Check status
    const connected = await checkFitbitStatus()
    if (connected) {
      setFitbitLoading(false)
      setCheckingStatus(false)
    } else {
      setFitbitLoading(false)
      setCheckingStatus(false)
      alert('Fitbit connection not detected. Please try connecting again.')
    }
  }

  const handleConnectGarmin = async () => {
    if (!garminConnectEnabled) {
      alert('Garmin Connect is temporarily unavailable while production access is pending.')
      return
    }
    setGarminLoading(true)
    setGarminPopupOpen(true)
    setGarminCheckingStatus(true)

    try {
      const width = 600
      const height = 700
      const left = window.screen.width / 2 - width / 2
      const top = window.screen.height / 2 - height / 2

      const popup = window.open(
        '/api/auth/garmin/authorize',
        'Garmin Connect Authorization',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
      )

      if (!popup) {
        alert('Please allow popups for this site to connect Garmin Connect')
        setGarminLoading(false)
        setGarminPopupOpen(false)
        setGarminCheckingStatus(false)
        return
      }

      garminPopupRef.current = popup

      garminClosedCheckRef.current = setInterval(() => {
        if (popup.closed) {
          if (garminClosedCheckRef.current) {
            clearInterval(garminClosedCheckRef.current)
            garminClosedCheckRef.current = null
          }
          if (garminCheckIntervalRef.current) {
            clearInterval(garminCheckIntervalRef.current)
            garminCheckIntervalRef.current = null
          }
          setGarminLoading(false)
          setGarminPopupOpen(false)
          setGarminCheckingStatus(false)
          setTimeout(() => checkGarminStatus(), 1000)
        }
      }, 500)

      garminCheckIntervalRef.current = setInterval(async () => {
        setGarminCheckingStatus(true)
        const connected = await checkGarminStatus()
        if (connected) {
          if (garminClosedCheckRef.current) {
            clearInterval(garminClosedCheckRef.current)
            garminClosedCheckRef.current = null
          }
          if (garminCheckIntervalRef.current) {
            clearInterval(garminCheckIntervalRef.current)
            garminCheckIntervalRef.current = null
          }
          if (popup && !popup.closed) {
            try {
              popup.close()
            } catch (e) {}
          }
          setGarminLoading(false)
          setGarminPopupOpen(false)
          setGarminCheckingStatus(false)
        }
      }, 1000)

      setTimeout(() => {
        if (garminClosedCheckRef.current) {
          clearInterval(garminClosedCheckRef.current)
          garminClosedCheckRef.current = null
        }
        if (garminCheckIntervalRef.current) {
          clearInterval(garminCheckIntervalRef.current)
          garminCheckIntervalRef.current = null
        }
        setGarminLoading(false)
        setGarminPopupOpen(false)
        setGarminCheckingStatus(false)
      }, 180000)
    } catch (error) {
      console.error('Error connecting Garmin:', error)
      alert('Failed to connect Garmin Connect. Please try again.')
      setGarminLoading(false)
      setGarminPopupOpen(false)
      setGarminCheckingStatus(false)
    }
  }

  const handleCloseGarminPopupAndCheck = async () => {
    if (garminPopupRef.current && !garminPopupRef.current.closed) {
      try {
        garminPopupRef.current.close()
      } catch (e) {}
    }

    if (garminClosedCheckRef.current) {
      clearInterval(garminClosedCheckRef.current)
      garminClosedCheckRef.current = null
    }
    if (garminCheckIntervalRef.current) {
      clearInterval(garminCheckIntervalRef.current)
      garminCheckIntervalRef.current = null
    }

    setGarminPopupOpen(false)
    setGarminCheckingStatus(true)

    const connected = await checkGarminStatus()
    if (connected) {
      setGarminLoading(false)
      setGarminCheckingStatus(false)
    } else {
      setGarminLoading(false)
      setGarminCheckingStatus(false)
      alert('Garmin Connect connection not detected. Please try connecting again.')
    }
  }

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
      if (closedCheckRef.current) {
        clearInterval(closedCheckRef.current)
      }
      if (garminCheckIntervalRef.current) {
        clearInterval(garminCheckIntervalRef.current)
      }
      if (garminClosedCheckRef.current) {
        clearInterval(garminClosedCheckRef.current)
      }
    }
  }, [])

  const handleDisconnectFitbit = async () => {
    if (!confirm('Are you sure you want to disconnect your Fitbit account? This will also delete all synced Fitbit data.')) {
      return
    }
    
    setFitbitLoading(true)
    try {
      const response = await fetch('/api/fitbit/status', { method: 'DELETE' })
      if (response.ok) {
        setFitbitConnected(false)
        alert('Fitbit account disconnected successfully')
      } else {
        throw new Error('Failed to disconnect')
      }
    } catch (error) {
      console.error('Error disconnecting Fitbit:', error)
      alert('Failed to disconnect Fitbit. Please try again.')
    } finally {
      setFitbitLoading(false)
    }
  }

  const handleDisconnectGarmin = async () => {
    if (!confirm('Disconnect Garmin Connect? This will stop new data from reaching Helfi.')) {
      return
    }

    setGarminLoading(true)
    try {
      const response = await fetch('/api/garmin/status', { method: 'DELETE' })
      if (response.ok) {
        setGarminConnected(false)
        alert('Garmin Connect account disconnected successfully')
      } else {
        throw new Error('Failed to disconnect Garmin')
      }
    } catch (error) {
      console.error('Error disconnecting Garmin:', error)
      alert('Failed to disconnect Garmin Connect. Please try again.')
    } finally {
      setGarminLoading(false)
    }
  }

  const handleSyncFitbit = async () => {
    setSyncingFitbit(true)
    try {
      const response = await fetch('/api/fitbit/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          dataTypes: ['steps', 'heartrate', 'sleep', 'weight'],
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        alert('Fitbit data synced successfully!')
        // Refresh page to show new data
        window.location.reload()
      } else {
        throw new Error('Sync failed')
      }
    } catch (error) {
      console.error('Error syncing Fitbit:', error)
      alert('Failed to sync Fitbit data. Please try again.')
    } finally {
      setSyncingFitbit(false)
    }
  }

  const handleLoadDemoData = async () => {
    if (!adminToken) {
      alert('Admin access required to load demo data.')
      return
    }
    if (!confirm('This will create 30 days of demo Fitbit data for testing. Continue?')) {
      return
    }
    
    setLoadingDemo(true)
    try {
      const response = await fetch('/api/fitbit/demo/seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        alert(`✅ ${data.message}\n\n${data.recordsCreated} records created for dates ${data.dateRange.start} to ${data.dateRange.end}`)
        // Refresh page to show demo data
        window.location.reload()
      } else {
        const errorData = await response.json()
        const errorMsg = errorData.details 
          ? `${errorData.error}: ${errorData.details}` 
          : errorData.error || 'Failed to load demo data'
        throw new Error(errorMsg)
      }
    } catch (error: any) {
      console.error('Error loading demo data:', error)
      alert(`Failed to load demo data: ${error.message || 'Unknown error'}`)
    } finally {
      setLoadingDemo(false)
    }
  }

  const handleClearDemoData = async () => {
    if (!adminToken) {
      alert('Admin access required to clear demo data.')
      return
    }
    if (!confirm('This will delete all Fitbit demo data. Continue?')) {
      return
    }
    
    setClearingDemo(true)
    try {
      const response = await fetch('/api/fitbit/demo/seed', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        alert(`✅ Demo data cleared successfully\n\n${data.recordsDeleted} records deleted`)
        // Refresh page
        window.location.reload()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to clear demo data')
      }
    } catch (error: any) {
      console.error('Error clearing demo data:', error)
      alert(`Failed to clear demo data: ${error.message}`)
    } finally {
      setClearingDemo(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Devices" />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-400">
            Connect your fitness devices to sync activity, sleep, and health data into Helfi.
          </p>
        </div>

        {/* Fitbit Device Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="text-4xl">🏃</div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Fitbit</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Activity, heart rate, sleep, and weight tracking</p>
              </div>
            </div>
            {fitbitConnected && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">Connected</span>
              </div>
            )}
          </div>

          {popupOpen && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {checkingStatus ? (
                    <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <div className="w-5 h-5 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    {checkingStatus ? 'Checking connection status...' : 'Popup window is open'}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                    Complete the Fitbit login in the popup window. If the popup gets stuck, click the button below to close it and check your connection status.
                  </p>
                  <button
                    onClick={handleClosePopupAndCheck}
                    disabled={checkingStatus}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {checkingStatus ? 'Checking...' : 'Close Popup & Check Status'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {fitbitConnected ? (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Your Fitbit account is connected. Data will sync automatically, or you can manually sync below.
                </p>
              </div>
              
              <FitbitSummary rangeDays={7} />

              <div className="flex gap-3">
                <button
                  onClick={handleSyncFitbit}
                  disabled={syncingFitbit}
                  className="flex-1 px-4 py-2 bg-helfi-green text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {syncingFitbit ? 'Syncing...' : 'Sync Data Now'}
                </button>
                <button
                  onClick={handleDisconnectFitbit}
                  disabled={fitbitLoading}
                  className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Disconnect
                </button>
              </div>

              {/* Developer Demo Data Section */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Developer Tools:</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleLoadDemoData}
                    disabled={loadingDemo}
                    className="flex-1 px-3 py-1.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {loadingDemo ? 'Loading...' : 'Load Demo Data'}
                  </button>
                  <button
                    onClick={handleClearDemoData}
                    disabled={clearingDemo}
                    className="flex-1 px-3 py-1.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {clearingDemo ? 'Clearing...' : 'Clear Demo Data'}
                  </button>
                </div>
              </div>

              <FitbitCharts rangeDays={30} />
              <FitbitCorrelations rangeDays={30} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Connect your Fitbit account to automatically sync your activity, heart rate, sleep, and weight data.
                </p>
                <button
                  onClick={handleConnectFitbit}
                  disabled={fitbitLoading}
                  className="w-full sm:w-auto px-4 py-2 bg-helfi-green text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  {fitbitLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      Connect Fitbit
                    </>
                  )}
                </button>
              </div>

              {adminToken && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Developer Tools (Test UI without connecting):</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleLoadDemoData}
                      disabled={loadingDemo}
                      className="flex-1 px-3 py-1.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {loadingDemo ? 'Loading...' : 'Load Demo Data'}
                    </button>
                    <button
                      onClick={handleClearDemoData}
                      disabled={clearingDemo}
                      className="flex-1 px-3 py-1.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {clearingDemo ? 'Clearing...' : 'Clear Demo Data'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    💡 Tip: Load demo data to see how Fitbit data displays without connecting a real account.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Garmin Device Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <Image src="/brands/garmin-connect.jpg" alt="Garmin Connect" width={44} height={44} className="rounded-lg" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Garmin Connect</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect Garmin Connect to start receiving wellness data via secure webhooks.
                </p>
              </div>
            </div>
            {garminConnected && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">Connected</span>
              </div>
            )}
          </div>

          {garminPopupOpen && garminConnectEnabled && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {garminCheckingStatus ? (
                    <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <div className="w-5 h-5 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    {garminCheckingStatus ? 'Checking connection status...' : 'Popup window is open'}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                    Complete the Garmin Connect login in the popup window. If it gets stuck, click below to close it and re-check.
                  </p>
                  <button
                    onClick={handleCloseGarminPopupAndCheck}
                    disabled={garminCheckingStatus}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {garminCheckingStatus ? 'Checking...' : 'Close Popup & Check Status'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!garminConnectEnabled ? (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Garmin Connect access is temporarily unavailable while production approval is pending.
                  You can register interest and we’ll notify you when it’s live.
                </p>
              </div>
              <button
                onClick={() => toggleInterest('garmin')}
                disabled={savingInterest}
                className={`w-full sm:w-auto px-4 py-2 rounded-lg font-medium transition-colors ${
                  deviceInterest.garmin
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${savingInterest ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {deviceInterest.garmin ? 'Interested ✓' : "I'm interested"}
              </button>
            </div>
          ) : garminConnected ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Garmin Connect is connected. Data will be delivered automatically via webhooks and logged for processing.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDisconnectGarmin}
                  disabled={garminLoading}
                  className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Disconnect
                </button>
              </div>

              {adminToken && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Webhook endpoint: <span className="font-mono">/api/garmin/webhook</span> (auto-registered). Data is stored in raw form for downstream mapping.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Connect your Garmin Connect account to allow Helfi to receive daily, sleep, and activity data directly from Garmin Connect.
                </p>
                <button
                  onClick={handleConnectGarmin}
                  disabled={garminLoading}
                  className="w-full sm:w-auto px-4 py-2 bg-helfi-green text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  {garminLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      Connect Garmin Connect
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You&apos;ll be redirected to Garmin Connect to approve access. We keep the popup open so you can continue browsing while you authorize.
              </p>
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Garmin and the Garmin logo are trademarks of Garmin Ltd. or its subsidiaries.
          </p>
        </div>

        {/* Other Devices */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Other devices under review</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: 'googleFit', icon: '🏃', name: 'Google Fit', detail: 'Android fitness' },
              { key: 'oura', icon: '💍', name: 'Oura Ring', detail: 'Recovery & sleep' },
              { key: 'polar', icon: '🧭', name: 'Polar', detail: 'Training insights' },
            ].map((device) => (
              <div
                key={device.name}
                className={`text-center p-4 border rounded-lg transition-colors ${
                  deviceInterest[device.key]
                    ? 'border-emerald-300 ring-1 ring-emerald-200 bg-emerald-50/40'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800'
                }`}
              >
                <div className="text-3xl mb-2">{device.icon}</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{device.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{device.detail}</div>
                <button
                  onClick={() => toggleInterest(device.key)}
                  disabled={savingInterest}
                  className={`mt-3 w-full text-center text-[12px] px-3.5 py-1.5 rounded-full ${
                    deviceInterest[device.key]
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } ${savingInterest ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {deviceInterest[device.key] ? 'Interested ✓' : "I'm interested"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          <Link href="/dashboard" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Dashboard</span>
          </Link>

          <Link href="/insights" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Insights</span>
          </Link>

          <Link href="/food" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Food</span>
          </Link>

          <MobileMoreMenu />

          <Link href="/settings" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Settings</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
