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
  const qrCodeRegionId = 'qr-reader'

  // Check if token is in URL (direct link from QR code)
  const tokenFromUrl = searchParams.get('token')

  useEffect(() => {
    // If token is in URL, verify it directly
    if (tokenFromUrl) {
      handleTokenVerification(tokenFromUrl)
      return
    }

    // Otherwise, start QR scanner
    startScanner()
    
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
      setError('Failed to start camera. Please check permissions.')
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
    stopScanner()
    
    // Extract token from URL if it's a full URL
    let token = qrData
    if (qrData.includes('token=')) {
      const match = qrData.match(/token=([^&]+)/)
      token = match ? match[1] : qrData
    }

    handleTokenVerification(token)
  }

  const handleTokenVerification = async (token: string) => {
    setLoading(true)
    setStatus('idle')
    setError('')

    try {
      const response = await fetch('/api/admin/qr-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify QR code')
      }

      // Store admin session
      sessionStorage.setItem('adminToken', data.token)
      sessionStorage.setItem('adminUser', JSON.stringify(data.admin))

      setStatus('success')
      
      // Redirect to admin panel after short delay
      setTimeout(() => {
        router.push('/admin-panel')
      }, 1500)
    } catch (err: any) {
      console.error('Verification error:', err)
      setError(err.message || 'Failed to verify QR code. Please try again.')
      setStatus('error')
      setLoading(false)
      
      // Restart scanner after error
      setTimeout(() => {
        startScanner()
      }, 2000)
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
          </div>
        )}

        {(status === 'idle' || status === 'scanning') && (
          <>
            <p className="text-center text-gray-600 mb-6">
              Scan the QR code from your desktop admin panel
            </p>
            
            <div id={qrCodeRegionId} className="w-full mb-4" style={{ minHeight: '300px' }}></div>
            
            {loading && (
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-sm text-gray-600">Verifying...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              onClick={() => {
                if (scanning) {
                  stopScanner()
                } else {
                  startScanner()
                }
              }}
              className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors"
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

