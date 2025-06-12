'use client'

import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

const ADMIN_PASSWORD = "HelfiAdmin2024"

export default function AdminPanel() {
  const { data: session } = useSession()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [waitlistData, setWaitlistData] = useState([])
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    // Check if already authenticated in this session
    const adminAuth = sessionStorage.getItem('adminAuthenticated')
    if (adminAuth === 'true') {
      setIsAuthenticated(true)
      loadWaitlistData()
    }
  }, [])

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      setError('')
      sessionStorage.setItem('adminAuthenticated', 'true')
      loadWaitlistData()
    } else {
      setError('Incorrect password')
      setPassword('')
    }
  }

  const loadWaitlistData = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/waitlist')
      if (response.ok) {
        const data = await response.json()
        setWaitlistData(data.waitlist || [])
      }
    } catch (error) {
      console.error('Failed to load waitlist:', error)
    }
    setLoading(false)
  }

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuthenticated')
    setIsAuthenticated(false)
    setPassword('')
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-helfi-black mb-2">
              Admin Access Required
            </h1>
            <p className="text-gray-600">
              Enter the admin password to continue
            </p>
          </div>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Admin Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="Enter admin password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
              <div className="mt-2 text-xs text-gray-500">
                Password: HelfiAdmin2024
              </div>
            </div>
            
            <button
              type="submit"
              className="w-full bg-helfi-green text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
            >
              Access Admin Panel
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-gray-600 hover:text-helfi-green">
              ← Back to website
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-2xl font-bold text-helfi-green">
                Helfi Admin Panel
              </Link>
              <span className="text-sm text-gray-500">Backend Control Center</span>
            </div>
            <div className="flex items-center space-x-4">
              {session?.user && (
                <span className="text-sm text-gray-600">{session.user.email}</span>
              )}
              <button
                onClick={handleLogout}
                className="btn-secondary text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-helfi-black mb-2">
            Admin Dashboard
          </h1>
          <p className="text-gray-600">
            Manage your Helfi platform and monitor waitlist signups
          </p>
        </div>

        {/* Waitlist Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 border mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-helfi-black">
              Waitlist Signups ({waitlistData.length})
            </h2>
            <button
              onClick={loadWaitlistData}
              className="btn-secondary text-sm"
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading waitlist...</p>
            </div>
          ) : waitlistData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Signed Up
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {waitlistData.map((signup: any, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {signup.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {signup.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(signup.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600">No waitlist signups yet</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <h3 className="text-lg font-semibold text-helfi-black mb-4">Platform Access</h3>
            <div className="space-y-3">
              <Link href="/healthapp" className="block w-full btn-primary text-center">
                Access Health App
              </Link>
              <Link href="/healthapp" className="block w-full btn-secondary text-center">
                Test Onboarding
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <h3 className="text-lg font-semibold text-helfi-black mb-4">Email Testing</h3>
            <div className="space-y-3">
              <button 
                onClick={() => window.open('/api/send-email', '_blank')}
                className="block w-full btn-secondary text-center"
              >
                Test Email Service
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <h3 className="text-lg font-semibold text-helfi-black mb-4">Database</h3>
            <div className="space-y-3">
              <button className="block w-full btn-secondary text-center" disabled>
                Database Console (Coming Soon)
              </button>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-6 border">
          <h3 className="text-lg font-semibold text-helfi-black mb-4">System Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✓</div>
              <div className="text-sm text-gray-600">Database</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✓</div>
              <div className="text-sm text-gray-600">Authentication</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✓</div>
              <div className="text-sm text-gray-600">Email Service</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">⚠</div>
              <div className="text-sm text-gray-600">AI Services</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 