'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export const dynamic = 'force-dynamic'

function QRLoginContent() {
  const searchParams = useSearchParams()
  const tokenFromUrl = (searchParams.get('token') || '').trim()
  const [status, setStatus] = useState<'idle' | 'approving' | 'approved' | 'needs-login' | 'error'>('idle')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsOtp, setNeedsOtp] = useState(false)
  const [totpSetupUrl, setTotpSetupUrl] = useState<string | null>(null)
  const [totpQrData, setTotpQrData] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const approveLogin = async (adminToken: string) => {
    if (!tokenFromUrl) return
    setStatus('approving')
    setError('')
    try {
      // First, try to refresh the token if it's expired
      let tokenToUse = adminToken
      try {
        const refreshResponse = await fetch('/api/admin/refresh-token', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          tokenToUse = refreshData.token
          // Update stored token
          sessionStorage.setItem('adminToken', refreshData.token)
          sessionStorage.setItem('adminUser', JSON.stringify(refreshData.admin))
          try {
            localStorage.setItem('adminToken', refreshData.token)
            localStorage.setItem('adminUser', JSON.stringify(refreshData.admin))
          } catch (storageError) {
            console.warn('Unable to persist refreshed token', storageError)
          }
        }
      } catch (refreshError) {
        // If refresh fails, continue with original token
        console.warn('Token refresh failed, using original token:', refreshError)
      }

      const response = await fetch('/api/admin/qr-login/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`
        },
        body: JSON.stringify({ token: tokenFromUrl })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 401) {
          // Token is invalid - try refresh one more time before giving up
          try {
            const lastRefresh = await fetch('/api/admin/refresh-token', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${adminToken}`
              }
            })
            if (lastRefresh.ok) {
              const refreshData = await lastRefresh.json()
              // Retry with refreshed token
              const retryResponse = await fetch('/api/admin/qr-login/approve', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${refreshData.token}`
                },
                body: JSON.stringify({ token: tokenFromUrl })
              })
              if (retryResponse.ok) {
                sessionStorage.setItem('adminToken', refreshData.token)
                sessionStorage.setItem('adminUser', JSON.stringify(refreshData.admin))
                try {
                  localStorage.setItem('adminToken', refreshData.token)
                  localStorage.setItem('adminUser', JSON.stringify(refreshData.admin))
                } catch {}
                setStatus('approved')
                return
              }
            }
          } catch {}
          
          // If all refresh attempts fail, clear and require login
          sessionStorage.removeItem('adminToken')
          sessionStorage.removeItem('adminUser')
          try {
            localStorage.removeItem('adminToken')
            localStorage.removeItem('adminUser')
          } catch (storageError) {
            console.warn('Unable to clear saved admin token', storageError)
          }
          setStatus('needs-login')
          return
        }
        setStatus('error')
        setError(data?.error || 'Unable to approve login. Please try again.')
        return
      }

      setStatus('approved')
    } catch (err) {
      console.error('QR approve error:', err)
      setStatus('error')
      setError('Unable to approve login. Please try again.')
    }
  }

  useEffect(() => {
    if (!tokenFromUrl) {
      setStatus('error')
      setError('Missing login token. Please scan the QR code from your desktop.')
      return
    }

    const existingToken =
      sessionStorage.getItem('adminToken') ||
      (typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null)
    
    if (existingToken) {
      // Try to refresh token first if it might be expired
      const refreshAndApprove = async () => {
        try {
          const refreshResponse = await fetch('/api/admin/refresh-token', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${existingToken}`
            }
          })
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            // Update stored token with refreshed one
            sessionStorage.setItem('adminToken', refreshData.token)
            sessionStorage.setItem('adminUser', JSON.stringify(refreshData.admin))
            try {
              localStorage.setItem('adminToken', refreshData.token)
              localStorage.setItem('adminUser', JSON.stringify(refreshData.admin))
            } catch {}
            // Use refreshed token for approval
            await approveLogin(refreshData.token)
          } else {
            // Token can't be refreshed, try with original (might still be valid)
            await approveLogin(existingToken)
          }
        } catch (refreshError) {
          // Refresh failed, try with original token
          console.warn('Token refresh attempt failed, using original token:', refreshError)
          await approveLogin(existingToken)
        }
      }
      
      void refreshAndApprove()
    } else {
      setStatus('needs-login')
    }
  }, [tokenFromUrl])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setTotpSetupUrl(null)
    setTotpQrData(null)

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
          otp: otp.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (data?.setupRequired && data?.otpauthUrl) {
        setNeedsOtp(true)
        setError('')
        setTotpSetupUrl(data.otpauthUrl)
        try {
          const QRCode = (await import('qrcode')).default
          const qrImageData = await QRCode.toDataURL(data.otpauthUrl, {
            width: 220,
            margin: 1,
          })
          setTotpQrData(qrImageData)
        } catch (qrError) {
          console.error('QR setup generation failed:', qrError)
          setError('Unable to render the setup code. Please refresh and try again.')
        }
        setLoading(false)
        return
      }

      if (!response.ok) {
        if (data?.code === 'OTP_REQUIRED') {
          setNeedsOtp(true)
          setError('Enter your 6-digit authenticator code to continue.')
          setLoading(false)
          return
        }
        setError(data?.error || 'Sign-in failed. Please try again.')
        setLoading(false)
        return
      }

      if (!data?.token || !data?.admin) {
        setError('Sign-in failed. Please try again.')
        setLoading(false)
        return
      }

      sessionStorage.setItem('adminToken', data.token)
      sessionStorage.setItem('adminUser', JSON.stringify(data.admin))
      try {
        localStorage.setItem('adminToken', data.token)
        localStorage.setItem('adminUser', JSON.stringify(data.admin))
      } catch (storageError) {
        console.warn('Unable to persist admin token locally', storageError)
      }
      setOtp('')
      setNeedsOtp(false)
      setTotpSetupUrl(null)
      setTotpQrData(null)
      await approveLogin(data.token)
      setLoading(false)
    } catch (loginError) {
      console.error('Admin login error:', loginError)
      setError('Sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-2">Approve Admin Login</h1>
        <p className="text-sm text-center text-gray-600 mb-6">
          Opened from the QR code on your desktop.
        </p>

        {status === 'approved' && (
          <div className="text-center py-6">
            <p className="text-lg font-semibold text-gray-800">Login approved.</p>
            <p className="text-sm text-gray-600 mt-2">You can return to your desktop now.</p>
          </div>
        )}

        {status === 'approving' && (
          <div className="text-center py-6">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-3 text-sm text-gray-600">Approving login...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {status === 'needs-login' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-700">
              Sign in to approve this desktop login.
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Admin Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Enter admin email"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Enter admin password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {totpSetupUrl && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <p className="text-sm text-emerald-900 font-medium mb-3">
                  Scan this setup code with your authenticator app.
                </p>
                {totpQrData ? (
                  <img src={totpQrData} alt="Authenticator setup QR" className="mx-auto border border-emerald-200 rounded-lg" />
                ) : (
                  <p className="text-xs text-emerald-700">Loading setup code...</p>
                )}
                <p className="text-xs text-emerald-700 mt-3">
                  After scanning, enter the 6-digit code below to finish setup.
                </p>
              </div>
            )}

            {(needsOtp || totpSetupUrl) && (
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                  Authenticator Code
                </label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => {
                    const nextValue = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setOtp(nextValue)
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Enter 6-digit code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 text-white py-3 px-4 rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Signing in...' : 'Approve Login'}
            </button>
          </form>
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
