'use client'

import React, { useEffect, useState, useRef, Suspense } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useRouter, useSearchParams } from 'next/navigation'

export const dynamic = 'force-dynamic'

function QRLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const verifyingRef = useRef<boolean>(false) // Prevent multiple simultaneous verifications
  const qrCodeRegionId = 'qr-reader'

  // Check if token is in URL (direct link from QR code)
  const tokenFromUrl = searchParams.get('token')

  useEffect(() => {
    // If token is in URL, verify it directly (no camera needed)
    if (tokenFromUrl && !verifyingRef.current) {
      handleTokenVerification(tokenFromUrl)
      return
    }

    // Don't auto-start scanner - let user click button to start
    // This prevents permission issues on mobile
    
    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl])

  const startScanner = async () => {
    try {
      setScanning(true)
      setStatus('scanning')
      setError('')

      // Request camera permissions first (especially important on mobile)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        })
        // Stop the stream immediately - html5-qrcode will start its own
        stream.getTracks().forEach(track => track.stop())
      } catch (permError: any) {
        console.error('Camera permission error:', permError)
        setError('Camera permission denied. Please allow camera access in your browser settings and try again.')
        setStatus('error')
        setScanning(false)
        return
      }

      const html5QrCode = new Html5Qrcode(qrCodeRegionId)
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' }, // Use back camera on mobile
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          // QR code scanned successfully
          handleQRCodeScanned(decodedText)
        },
        (errorMessage) => {
          // Ignore scan errors (they're frequent during scanning)
        }
      )
    } catch (err: any) {
      console.error('Scanner error:', err)
      let errorMsg = 'Failed to start camera. '
      if (err?.message?.includes('permission')) {
        errorMsg += 'Please allow camera access in your browser settings.'
      } else if (err?.message?.includes('not found') || err?.message?.includes('not available')) {
        errorMsg += 'Camera not found. Make sure your device has a camera.'
      } else {
        errorMsg += 'Please check permissions and try again.'
      }
      setError(errorMsg)
      setStatus('error')
      setScanning(false)
    }
  }

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        scannerRef.current = null
        setScanning(false)
      }).catch((err) => {
        console.error('Error stopping scanner:', err)
      })
    }
  }

  const handleQRCodeScanned = (qrData: string) => {
    // Prevent multiple scans from triggering multiple verifications
    if (verifyingRef.current) {
      console.log('[QR-SCAN] Already verifying, ignoring duplicate scan')
      return
    }

    stopScanner()
    
    console.log('[QR-SCAN] Scanned QR data:', qrData.substring(0, 100))
    
    // Extract token from URL if it's a full URL
    let token = qrData
    if (qrData.includes('token=')) {
      const match = qrData.match(/token=([^&?#]+)/)
      if (match && match[1]) {
        token = match[1]
        console.log('[QR-SCAN] Extracted token:', token.substring(0, 20) + '...')
      } else {
        console.error('[QR-SCAN] Failed to extract token from URL')
        setError('Failed to extract token from QR code. Please try scanning again.')
        setStatus('error')
        setScanning(false)
        return
      }
    } else if (qrData.includes('/admin-panel/qr-login')) {
      // Try to extract from path
      const urlMatch = qrData.match(/qr-login[?&]token=([^&?#]+)/)
      if (urlMatch && urlMatch[1]) {
        token = urlMatch[1]
        console.log('[QR-SCAN] Extracted token from path:', token.substring(0, 20) + '...')
      } else {
        console.error('[QR-SCAN] Failed to extract token from path')
        setError('Failed to extract token from QR code. Please try scanning again.')
        setStatus('error')
        setScanning(false)
        return
      }
    }

    if (!token || token.length < 10) {
      console.error('[QR-SCAN] Invalid token extracted:', token)
      setError('Invalid QR code format. Please scan a fresh QR code from your desktop.')
      setStatus('error')
      setScanning(false)
      return
    }

    console.log('[QR-SCAN] Final token to verify:', token.substring(0, 20) + '...')
    handleTokenVerification(token)
  }

  const handleTokenVerification = async (token: string) => {
    // Prevent multiple simultaneous verification attempts
    if (verifyingRef.current) {
      console.log('[QR-VERIFY] Already verifying, ignoring duplicate request')
      return
    }

    verifyingRef.current = true
    setLoading(true)
    setStatus('idle')
    setError('')

    console.log('[QR-VERIFY] Verifying token:', token.substring(0, 20) + '...')

    try {
      const response = await fetch('/api/admin/qr-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      })

      const data = await response.json()
      console.log('[QR-VERIFY] Response status:', response.status, 'Data:', data)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify QR code')
      }

      // Store admin session
      sessionStorage.setItem('adminToken', data.token)
      sessionStorage.setItem('adminUser', JSON.stringify(data.admin))

      setStatus('success')
      setLoading(false)
      
      // Redirect to admin panel after short delay
      setTimeout(() => {
        router.push('/admin-panel')
      }, 1500)
    } catch (err: any) {
      console.error('[QR-VERIFY] Verification error:', err)
      setError(err.message || 'Failed to verify QR code. Please try scanning a fresh QR code.')
      setStatus('error')
      setLoading(false)
      verifyingRef.current = false
      // DO NOT auto-restart scanner - let user manually retry
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6">Admin Panel Login</h1>
        
        {status === 'success' && (
          <div className="text-center py-8">
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <p className="text-lg font-semibold text-gray-800">Login Successful!</p>
            <p className="text-sm text-gray-600 mt-2">Redirecting to admin panel...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-8">
            <div className="text-red-500 text-5xl mb-4">✗</div>
            <p className="text-lg font-semibold text-gray-800">Login Failed</p>
            <p className="text-sm text-gray-600 mt-2">{error}</p>
            <button
              onClick={() => {
                setError('')
                setStatus('idle')
                verifyingRef.current = false
                startScanner()
              }}
              className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors mt-4"
            >
              Try Again
            </button>
          </div>
        )}

        {(status === 'idle' || status === 'scanning') && (
          <>
            <p className="text-center text-gray-600 mb-6">
              Scan the QR code from your desktop admin panel
            </p>
            
            {!scanning && !error && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800 text-center">
                  <strong>Tip:</strong> When you click "Start Scanner", your browser will ask for camera permission. Please allow it to scan the QR code.
                </p>
              </div>
            )}
            
            <div id={qrCodeRegionId} className="w-full mb-4" style={{ minHeight: scanning ? '300px' : '0px' }}></div>
            
            {loading && (
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-sm text-gray-600">Verifying...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 mb-2">{error}</p>
                <p className="text-xs text-red-600 mt-2">
                  <strong>Alternative:</strong> You can also manually visit the URL shown below the QR code on your desktop.
                </p>
              </div>
            )}

            <button
              onClick={() => {
                if (scanning) {
                  stopScanner()
                } else {
                  setError('')
                  setStatus('idle')
                  verifyingRef.current = false
                  startScanner()
                }
              }}
              className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors"
              disabled={loading}
            >
              {scanning ? 'Stop Scanner' : 'Start Scanner'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function QRLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <QRLoginContent />
    </Suspense>
  )
}

