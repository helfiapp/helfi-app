'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [adminUser, setAdminUser] = useState<any>(null)
  
  // Analytics data states
  const [analyticsData, setAnalyticsData] = useState<any[]>([])
  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null)
  const [aiInsights, setAiInsights] = useState<string>('')
  const [activeTab, setActiveTab] = useState('overview')
  const [loadingInsights, setLoadingInsights] = useState(false)
  
  // Additional admin data states
  const [waitlistData, setWaitlistData] = useState<any[]>([])
  const [userStats, setUserStats] = useState<any>(null)
  const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  
  // User management states
  const [managedUsers, setManagedUsers] = useState<any[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoadingManagement, setIsLoadingManagement] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [showUserModal, setShowUserModal] = useState(false)

  // Email functionality states
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailTemplate, setEmailTemplate] = useState('launch')
  const [isLoadingEmail, setIsLoadingEmail] = useState(false)

  // Admin management states
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newAdminRole, setNewAdminRole] = useState('ADMIN')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [adminList, setAdminList] = useState<any[]>([])
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false)

  // Check if already authenticated
  useEffect(() => {
    const token = sessionStorage.getItem('adminToken')
    const adminData = sessionStorage.getItem('adminUser')
    if (token && adminData) {
      setAdminToken(token)
      setAdminUser(JSON.parse(adminData))
      setIsAuthenticated(true)
      loadAnalyticsData()
      loadWaitlistData()
      loadUserStats()
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Temporary hardcoded admin credentials until database is fully set up
    if (email === 'info@sonicweb.com.au' && password === 'gX8#bQ3!Vr9zM2@kLf1T') {
      const mockAdmin = {
        id: 'temp-admin-id',
        email: 'info@sonicweb.com.au',
        name: 'Louie Veleski',
        role: 'SUPER_ADMIN'
      }
      
      setAdminToken('temp-admin-token')
      setAdminUser(mockAdmin)
      setIsAuthenticated(true)
      sessionStorage.setItem('adminToken', 'temp-admin-token')
      sessionStorage.setItem('adminUser', JSON.stringify(mockAdmin))
      loadAnalyticsData()
      loadWaitlistData()
      loadUserStats()
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      })

      if (response.ok) {
        const result = await response.json()
        setAdminToken(result.token)
        setAdminUser(result.admin)
        setIsAuthenticated(true)
        sessionStorage.setItem('adminToken', result.token)
        sessionStorage.setItem('adminUser', JSON.stringify(result.admin))
        loadAnalyticsData()
        loadWaitlistData()
        loadUserStats()
      } else {
        const error = await response.json()
        setError(error.message || 'Authentication failed. Please check your credentials.')
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('Login failed. Please try again.')
    }
    setLoading(false)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
    setEmail('')
    setPassword('')
    setAdminToken('')
    setAdminUser(null)
    setAnalyticsData([])
    setAnalyticsSummary(null)
    setAiInsights('')
  }

  const loadAnalyticsData = async () => {
    try {
      // Load raw data
      const dataResponse = await fetch('/api/analytics')
      if (dataResponse.ok) {
        const dataResult = await dataResponse.json()
        setAnalyticsData(dataResult.data || [])
      }

      // Load summary
      const summaryResponse = await fetch('/api/analytics?action=summary')
      if (summaryResponse.ok) {
        const summaryResult = await summaryResponse.json()
        setAnalyticsSummary(summaryResult.summary)
      }
    } catch (error) {
      console.error('Error loading analytics:', error)
    }
  }

  const loadWaitlistData = async () => {
    setIsLoadingWaitlist(true)
    try {
      const response = await fetch('/api/waitlist', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      if (response.ok) {
        const result = await response.json()
        setWaitlistData(result.waitlist || [])
      }
    } catch (error) {
      console.error('Error loading waitlist:', error)
    }
    setIsLoadingWaitlist(false)
  }

  const loadUserStats = async () => {
    setIsLoadingUsers(true)
    try {
      // We'll create a simple endpoint to get user count and basic stats
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      if (response.ok) {
        const result = await response.json()
        setUserStats(result)
      }
    } catch (error) {
      console.error('Error loading user stats:', error)
    }
    setIsLoadingUsers(false)
  }

  const loadUserManagement = async (search = '', filter = 'all', page = 1) => {
    setIsLoadingManagement(true)
    try {
      const params = new URLSearchParams({
        search,
        plan: filter,
        page: page.toString(),
        limit: '20'
      })
      
      const response = await fetch(`/api/admin/user-management?${params}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        setManagedUsers(result.users || [])
        setTotalPages(result.pagination?.pages || 1)
        setCurrentPage(result.pagination?.page || 1)
      }
    } catch (error) {
      console.error('Error loading user management:', error)
    }
    setIsLoadingManagement(false)
  }

  const handleUserAction = async (action: string, userId: string, data?: any) => {
    try {
      const response = await fetch('/api/admin/user-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ action, userId, data })
      })

      if (response.ok) {
        // Reload the user list to show updated data
        loadUserManagement(userSearch, userFilter, currentPage)
        setShowUserModal(false)
        setSelectedUser(null)
        alert(`User ${action} completed successfully`)
      } else {
        alert('Action failed. Please try again.')
      }
    } catch (error) {
      console.error('Error performing user action:', error)
      alert('Action failed. Please try again.')
    }
  }

  const loadAiInsights = async () => {
    setLoadingInsights(true)
    try {
      const response = await fetch('/api/analytics?action=insights')
      if (response.ok) {
        const result = await response.json()
        setAiInsights(result.insights || 'No insights available yet.')
      }
    } catch (error) {
      console.error('Error loading AI insights:', error)
      setAiInsights('Error loading insights. Please try again.')
    }
    setLoadingInsights(false)
  }

  const refreshData = () => {
    loadAnalyticsData()
    loadWaitlistData()
    loadUserStats()
    if (activeTab === 'insights') {
      loadAiInsights()
    }
  }

  // Email functionality
  const handleEmailSelect = (email: string) => {
    if (selectedEmails.includes(email)) {
      setSelectedEmails(selectedEmails.filter(e => e !== email))
    } else {
      setSelectedEmails([...selectedEmails, email])
    }
  }

  const handleSelectAll = () => {
    if (selectedEmails.length === waitlistData.length) {
      setSelectedEmails([])
    } else {
      setSelectedEmails(waitlistData.map(entry => entry.email))
    }
  }

  const handleEmailTemplate = (template: string) => {
    setEmailTemplate(template)
    switch (template) {
             case 'launch':
         setEmailSubject('🎉 Helfi is now live! Your personal AI health coach awaits')
         setEmailMessage(`Hi {name},

Great news! Helfi is officially live and ready to transform your health journey.

As a valued waitlist member, you get:
✅ 14-day free trial with full premium access
✅ 30 AI food analyses per day + 30 medical image analyses  
✅ Complete medication interaction checking
✅ Priority support from our team

Ready to start your AI-powered health transformation?

[Get Started Now - helfi.ai]

Thank you for your patience and support,
The Helfi Team`)
         break
       case 'update':
         setEmailSubject('📱 Helfi Platform Update - New Features Added')
         setEmailMessage(`Hi {name},

We've added exciting new features to Helfi that we think you'll love:

🆕 What's New:
• Enhanced AI food analysis with better accuracy
• New medical image analysis for skin conditions
• Improved medication interaction database
• Faster mobile performance

Your health data is more powerful than ever. Log in to explore!

[Access Helfi - helfi.ai]

Best regards,
The Helfi Team`)
         break
       case 'custom':
         setEmailSubject('')
         setEmailMessage('Hi {name},\n\n\n\nBest regards,\nThe Helfi Team')
         break
    }
  }

  const sendEmails = async () => {
    if (selectedEmails.length === 0) {
      alert('Please select at least one email address')
      return
    }
    
    if (!emailSubject.trim() || !emailMessage.trim()) {
      alert('Please enter both subject and message')
      return
    }

    setIsLoadingEmail(true)
    try {
      const response = await fetch('/api/admin/send-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          emails: selectedEmails,
          subject: emailSubject,
          message: emailMessage,
          waitlistData: waitlistData.filter(entry => selectedEmails.includes(entry.email))
        })
      })

      if (response.ok) {
        alert(`Successfully sent emails to ${selectedEmails.length} recipients`)
        setShowEmailModal(false)
        setSelectedEmails([])
        setEmailSubject('')
        setEmailMessage('')
      } else {
        const error = await response.json()
        alert(`Failed to send emails: ${error.message}`)
      }
    } catch (error) {
      console.error('Error sending emails:', error)
      alert('Failed to send emails. Please try again.')
    }
    setIsLoadingEmail(false)
  }

  // Admin Management Functions
  const loadAdminList = async () => {
    if (adminUser?.role !== 'SUPER_ADMIN') return
    
    setIsLoadingAdmins(true)
    try {
      const response = await fetch('/api/admin/management', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      if (response.ok) {
        const result = await response.json()
        setAdminList(result.admins || [])
      }
    } catch (error) {
      console.error('Error loading admin list:', error)
    }
    setIsLoadingAdmins(false)
  }

  const createNewAdmin = async () => {
    if (!newAdminEmail || !newAdminName || !newAdminPassword) {
      alert('Please fill in all fields')
      return
    }

    try {
      const response = await fetch('/api/admin/management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'create',
          email: newAdminEmail,
          name: newAdminName,
          password: newAdminPassword,
          role: newAdminRole
        })
      })

      if (response.ok) {
        alert('Admin account created successfully')
        setShowCreateAdminModal(false)
        setNewAdminEmail('')
        setNewAdminName('')
        setNewAdminPassword('')
        setNewAdminRole('ADMIN')
        loadAdminList()
      } else {
        const error = await response.json()
        alert(`Failed to create admin: ${error.message}`)
      }
    } catch (error) {
      console.error('Error creating admin:', error)
      alert('Failed to create admin account')
    }
  }

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('Please fill in all password fields')
      return
    }

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters long')
      return
    }

    try {
      const response = await fetch('/api/admin/management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'change_password',
          currentPassword,
          newPassword
        })
      })

      if (response.ok) {
        alert('Password changed successfully')
        setShowPasswordModal(false)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const error = await response.json()
        alert(`Failed to change password: ${error.message}`)
      }
    } catch (error) {
      console.error('Error changing password:', error)
      alert('Failed to change password')
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <Image
              src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
              alt="Helfi Logo"
              width={80}
              height={80}
              className="mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Enter credentials to access analytics dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
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
                  type={showPassword ? "text" : "password"}
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

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 text-white py-3 px-4 rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Authenticating...' : 'Access Dashboard'}
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Authorized access only. Contact support if you need assistance.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Image
              src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
              alt="Helfi Logo"
              width={40}
              height={40}
              className="mr-3"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Helfi Analytics Dashboard</h1>
              <p className="text-sm text-gray-600">Real-time user behavior insights</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={refreshData}
              className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors text-sm"
            >
              🔄 Refresh Data
            </button>
            <button
              onClick={handleLogout}
              className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: '📊 Overview', desc: 'Key metrics' },
              { id: 'events', label: '📋 Events', desc: 'Raw data' },
              { id: 'insights', label: '🤖 AI Insights', desc: 'OpenAI analysis' },
              { id: 'waitlist', label: '📧 Waitlist', desc: 'Signups' },
              { id: 'users', label: '👥 Users', desc: 'User stats' },
              { id: 'management', label: '🛠️ User Management', desc: 'Manage users' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'insights' && !aiInsights) {
                    loadAiInsights()
                  }
                  if (tab.id === 'management') {
                    loadUserManagement(userSearch, userFilter, currentPage)
                  }
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center">
                  <span>{tab.label}</span>
                  <span className="text-xs text-gray-400">{tab.desc}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-emerald-600">
                  {analyticsSummary?.totalEvents || 0}
                </div>
                <div className="text-sm text-gray-600">Total Events</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-blue-600">
                  {analyticsSummary?.uniqueUsers || 0}
                </div>
                <div className="text-sm text-gray-600">Unique Users</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-purple-600">
                  {analyticsSummary?.recentEvents || 0}
                </div>
                <div className="text-sm text-gray-600">Recent Events</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl font-bold text-orange-600">
                  {analyticsSummary?.topActions?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Action Types</div>
              </div>
            </div>

            {/* Top Actions */}
            {analyticsSummary?.topActions && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top User Actions</h3>
                <div className="space-y-3">
                  {analyticsSummary.topActions.map((action: any, index: number) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-gray-700">{action.action}</span>
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-sm">
                        {action.count} events
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Recent Analytics Events</h3>
              <p className="text-sm text-gray-600">Latest {analyticsData.length} user interactions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Page
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analyticsData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                        No analytics data available yet. Users need to opt-in to data analytics and interact with the app.
                      </td>
                    </tr>
                  ) : (
                    analyticsData.slice(0, 50).map((event, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(event.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {event.userId?.split('@')[0] || 'Anonymous'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                            {event.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {event.page || 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">AI-Powered Insights</h3>
                <p className="text-sm text-gray-600">OpenAI analysis of user behavior patterns</p>
              </div>
              <button
                onClick={loadAiInsights}
                disabled={loadingInsights}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors text-sm"
              >
                {loadingInsights ? '🤖 Analyzing...' : '🤖 Generate Insights'}
              </button>
            </div>

            {loadingInsights ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <span className="ml-3 text-gray-600">OpenAI is analyzing your user data...</span>
              </div>
            ) : aiInsights ? (
              <div className="prose max-w-none">
                <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-emerald-500">
                  <pre className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">
                    {aiInsights}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-4">🤖</div>
                <p>Click "Generate Insights" to get AI-powered recommendations for improving your app.</p>
                <p className="text-sm mt-2">Requires at least 10 user interactions for meaningful analysis.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'waitlist' && (
          <div className="space-y-6">
            {/* Email Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Waitlist Email Campaign</h3>
                  <p className="text-sm text-gray-600">
                    {selectedEmails.length > 0 
                      ? `${selectedEmails.length} recipients selected` 
                      : 'Select recipients to send emails'
                    }
                  </p>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      if (selectedEmails.length === 0) {
                        alert('Please select at least one email address')
                        return
                      }
                      handleEmailTemplate('launch')
                      setShowEmailModal(true)
                    }}
                    disabled={selectedEmails.length === 0}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📧 Send Launch Email
                  </button>
                  <button
                    onClick={() => {
                      if (selectedEmails.length === 0) {
                        alert('Please select at least one email address')
                        return
                      }
                      handleEmailTemplate('custom')
                      setShowEmailModal(true)
                    }}
                    disabled={selectedEmails.length === 0}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✏️ Custom Email
                  </button>
                </div>
              </div>
            </div>

            {/* Waitlist Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Waitlist Signups</h3>
                    <p className="text-sm text-gray-600">
                      {isLoadingWaitlist ? 'Loading...' : `${waitlistData.length} people on waitlist`}
                    </p>
                  </div>
                  {waitlistData.length > 0 && (
                    <button
                      onClick={handleSelectAll}
                      className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      {selectedEmails.length === waitlistData.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
              </div>
              
              {isLoadingWaitlist ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                  <span className="ml-3 text-gray-600">Loading waitlist data...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={waitlistData.length > 0 && selectedEmails.length === waitlistData.length}
                            onChange={handleSelectAll}
                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                          />
                        </th>
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
                      {waitlistData.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                            No waitlist signups yet.
                          </td>
                        </tr>
                      ) : (
                        waitlistData.map((entry, index) => (
                          <tr key={entry.id || index} className={selectedEmails.includes(entry.email) ? 'bg-emerald-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedEmails.includes(entry.email)}
                                onChange={() => handleEmailSelect(entry.email)}
                                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {entry.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {entry.email}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(entry.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <span className="ml-3 text-gray-600">Loading user statistics...</span>
              </div>
            ) : userStats ? (
              <>
                {/* User Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-3xl font-bold text-blue-600">
                      {userStats.totalUsers}
                    </div>
                    <div className="text-sm text-gray-600">Total Users</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-3xl font-bold text-green-600">
                      {userStats.recentSignups}
                    </div>
                    <div className="text-sm text-gray-600">New Users (30 days)</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-3xl font-bold text-purple-600">
                      {userStats.completionRate}%
                    </div>
                    <div className="text-sm text-gray-600">Profile Completion</div>
                  </div>
                </div>

                {/* Engagement Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-orange-600">
                      {userStats.usersWithGoals}
                    </div>
                    <div className="text-sm text-gray-600">Users with Goals</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-red-600">
                      {userStats.usersWithSupplements}
                    </div>
                    <div className="text-sm text-gray-600">Users with Supplements</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-indigo-600">
                      {userStats.usersWithMedications}
                    </div>
                    <div className="text-sm text-gray-600">Users with Medications</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-teal-600">
                      {userStats.usersWithFoodLogs}
                    </div>
                    <div className="text-sm text-gray-600">Users with Food Logs</div>
                  </div>
                </div>

                {/* Recent Users */}
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Recent Users</h3>
                    <p className="text-sm text-gray-600">Latest 10 user registrations</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Joined
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Activity
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {userStats.recentUsers?.map((user: any, index: number) => (
                          <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {user.email}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {user.name || 'Not set'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex space-x-1">
                                {user._count.healthGoals > 0 && (
                                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                    {user._count.healthGoals} goals
                                  </span>
                                )}
                                {user._count.foodLogs > 0 && (
                                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                    {user._count.foodLogs} foods
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-4">👥</div>
                <p>No user data available.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'management' && (
          <div className="space-y-6">
            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
                <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                  <input
                    type="text"
                    placeholder="Search users by email or name..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && loadUserManagement(userSearch, userFilter, 1)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="all">All Users</option>
                    <option value="free">Free Plan</option>
                    <option value="premium">Premium Plan</option>
                  </select>
                  <button
                    onClick={() => loadUserManagement(userSearch, userFilter, 1)}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h4 className="text-md font-semibold text-gray-900">
                  {isLoadingManagement ? 'Loading...' : `${managedUsers.length} users found`}
                </h4>
              </div>
              
              {isLoadingManagement ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                  <span className="ml-3 text-gray-600">Loading users...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Plan
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Activity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Joined
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {managedUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        managedUsers.map((user) => (
                          <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {user.name || 'No name set'}
                                </div>
                                <div className="text-sm text-gray-500">{user.email}</div>
                              </div>
                            </td>
                                                         <td className="px-6 py-4 whitespace-nowrap">
                               <div className="flex flex-col space-y-1">
                                 <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                   user.subscription?.plan === 'PREMIUM' 
                                     ? 'bg-emerald-100 text-emerald-800' 
                                     : 'bg-gray-100 text-gray-800'
                                 }`}>
                                   {user.subscription?.plan || 'FREE'}
                                   {user.subscription?.endDate && new Date(user.subscription.endDate).getFullYear() > 2050 && (
                                     <span className="ml-1 text-xs">∞</span>
                                   )}
                                 </span>
                                 
                                 {user.subscription?.endDate && (
                                   <span className="text-xs text-gray-500">
                                     {new Date(user.subscription.endDate).getFullYear() > 2050 
                                       ? '🎉 Permanent' 
                                       : `⏰ Until ${new Date(user.subscription.endDate).toLocaleDateString()}`
                                     }
                                   </span>
                                 )}
                                 
                                 {user.subscription?.plan === 'PREMIUM' && !user.subscription?.endDate && (
                                   <span className="text-xs text-green-600">💳 Paid</span>
                                 )}
                               </div>
                             </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex space-x-1">
                                {user._count.healthGoals > 0 && (
                                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                    {user._count.healthGoals} goals
                                  </span>
                                )}
                                {user._count.foodLogs > 0 && (
                                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                    {user._count.foodLogs} foods
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => {
                                    setSelectedUser(user)
                                    setShowUserModal(true)
                                  }}
                                  className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                                >
                                  Manage
                                </button>
                                                                 {user.subscription?.plan === 'PREMIUM' ? (
                                   <button
                                     onClick={() => handleUserAction('deactivate', user.id)}
                                     className="bg-orange-500 text-white px-3 py-1 rounded text-xs hover:bg-orange-600 transition-colors"
                                   >
                                     ⬇️ To Free
                                   </button>
                                 ) : (
                                   <button
                                     onClick={() => handleUserAction('activate', user.id)}
                                     className="bg-emerald-500 text-white px-3 py-1 rounded text-xs hover:bg-emerald-600 transition-colors"
                                   >
                                     ⬆️ To Premium
                                   </button>
                                 )}
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
                                      handleUserAction('delete_user', user.id)
                                    }
                                  }}
                                  className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => loadUserManagement(userSearch, userFilter, currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => loadUserManagement(userSearch, userFilter, currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

                         {/* User Management Modal */}
             {showUserModal && selectedUser && (
               <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                 <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full mx-4">
                   <h3 className="text-lg font-semibold text-gray-900 mb-4">
                     Manage User: {selectedUser.name || selectedUser.email}
                   </h3>
                   
                   {/* Current Subscription Status */}
                   <div className="bg-gray-50 rounded-lg p-4 mb-6 border-l-4 border-blue-500">
                     <h4 className="font-medium text-gray-900 mb-2">Current Subscription Status</h4>
                     <div className="space-y-2">
                       <div className="flex justify-between items-center">
                         <span className="text-sm text-gray-600">Plan:</span>
                         <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                           selectedUser.subscription?.plan === 'PREMIUM' 
                             ? 'bg-emerald-100 text-emerald-800' 
                             : 'bg-gray-100 text-gray-800'
                         }`}>
                           {selectedUser.subscription?.plan || 'FREE'}
                         </span>
                       </div>
                       
                       {selectedUser.subscription?.endDate && (
                         <div className="flex justify-between items-center">
                           <span className="text-sm text-gray-600">Access Type:</span>
                           <span className="text-sm font-medium">
                             {new Date(selectedUser.subscription.endDate).getFullYear() > 2050 
                               ? '🎉 Permanent Free Access' 
                               : `⏰ Trial expires ${new Date(selectedUser.subscription.endDate).toLocaleDateString()}`
                             }
                           </span>
                         </div>
                       )}
                       
                       {selectedUser.subscription?.plan === 'PREMIUM' && !selectedUser.subscription?.endDate && (
                         <div className="flex justify-between items-center">
                           <span className="text-sm text-gray-600">Access Type:</span>
                           <span className="text-sm font-medium text-green-600">💳 Active Premium Subscription</span>
                         </div>
                       )}
                       
                       {(!selectedUser.subscription || selectedUser.subscription?.plan === 'FREE') && (
                         <div className="flex justify-between items-center">
                           <span className="text-sm text-gray-600">Access Type:</span>
                           <span className="text-sm font-medium text-gray-600">🆓 Free Plan</span>
                         </div>
                       )}
                       
                       <div className="flex justify-between items-center">
                         <span className="text-sm text-gray-600">Member since:</span>
                         <span className="text-sm">{new Date(selectedUser.createdAt).toLocaleDateString()}</span>
                       </div>
                     </div>
                   </div>
                   
                   {/* Actions */}
                   <div className="space-y-4">
                     <h4 className="font-medium text-gray-900">Grant Access</h4>
                     
                     <div className="grid grid-cols-2 gap-3">
                       <button
                         onClick={() => handleUserAction('grant_trial', selectedUser.id, { trialDays: 7 })}
                         className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors text-sm"
                       >
                         7-Day Trial
                       </button>
                       <button
                         onClick={() => handleUserAction('grant_trial', selectedUser.id, { trialDays: 30 })}
                         className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors text-sm"
                       >
                         30-Day Trial
                       </button>
                     </div>
                     
                     <button
                       onClick={() => handleUserAction('grant_free_access', selectedUser.id)}
                       className="w-full bg-emerald-500 text-white px-4 py-2 rounded hover:bg-emerald-600 transition-colors text-sm"
                     >
                       🎉 Grant Permanent Free Access
                     </button>
                     
                     {/* Plan Controls */}
                     <div className="border-t pt-4">
                       <h4 className="font-medium text-gray-900 mb-3">Plan Controls</h4>
                       <div className="grid grid-cols-2 gap-3">
                         {selectedUser.subscription?.plan === 'PREMIUM' ? (
                           <button
                             onClick={() => handleUserAction('deactivate', selectedUser.id)}
                             className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition-colors text-sm"
                           >
                             ⬇️ Downgrade to Free
                           </button>
                         ) : (
                           <button
                             onClick={() => handleUserAction('activate', selectedUser.id)}
                             className="bg-emerald-500 text-white px-4 py-2 rounded hover:bg-emerald-600 transition-colors text-sm"
                           >
                             ⬆️ Upgrade to Premium
                           </button>
                         )}
                         
                         <button
                           onClick={() => {
                             if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
                               handleUserAction('delete_user', selectedUser.id)
                             }
                           }}
                           className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors text-sm"
                         >
                           🗑️ Delete User
                         </button>
                       </div>
                     </div>
                     
                     <div className="border-t pt-4">
                       <button
                         onClick={() => {
                           setShowUserModal(false)
                           setSelectedUser(null)
                         }}
                         className="w-full bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors text-sm"
                       >
                         Close
                       </button>
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {/* Email Composition Modal */}
             {showEmailModal && (
               <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                 <div className="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
                   <h3 className="text-xl font-semibold text-gray-900 mb-6">
                     📧 Compose Email to {selectedEmails.length} Recipients
                   </h3>
                   
                   {/* Email Template Selection */}
                   <div className="mb-6">
                     <label className="block text-sm font-medium text-gray-700 mb-2">Email Template</label>
                     <div className="grid grid-cols-3 gap-3">
                       <button
                         onClick={() => handleEmailTemplate('launch')}
                         className={`p-3 border rounded-lg text-sm ${emailTemplate === 'launch' 
                           ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                           : 'border-gray-300 hover:border-gray-400'
                         }`}
                       >
                         🚀 Launch Announcement
                       </button>
                       <button
                         onClick={() => handleEmailTemplate('update')}
                         className={`p-3 border rounded-lg text-sm ${emailTemplate === 'update' 
                           ? 'border-blue-500 bg-blue-50 text-blue-700' 
                           : 'border-gray-300 hover:border-gray-400'
                         }`}
                       >
                         📱 Product Update
                       </button>
                       <button
                         onClick={() => handleEmailTemplate('custom')}
                         className={`p-3 border rounded-lg text-sm ${emailTemplate === 'custom' 
                           ? 'border-purple-500 bg-purple-50 text-purple-700' 
                           : 'border-gray-300 hover:border-gray-400'
                         }`}
                       >
                         ✏️ Custom Message
                       </button>
                     </div>
                   </div>

                   {/* Subject Line */}
                   <div className="mb-4">
                     <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
                     <input
                       type="text"
                       value={emailSubject}
                       onChange={(e) => setEmailSubject(e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                       placeholder="Enter email subject..."
                     />
                   </div>

                   {/* Email Message */}
                                        <div className="mb-6">
                       <label className="block text-sm font-medium text-gray-700 mb-2">
                         Message <span className="text-xs text-gray-500">(Use {'{name}'} to personalize with recipient names)</span>
                       </label>
                     <textarea
                       value={emailMessage}
                       onChange={(e) => setEmailMessage(e.target.value)}
                       rows={12}
                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                       placeholder="Enter your email message..."
                     />
                   </div>

                   {/* Recipients Preview */}
                   <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                     <h4 className="text-sm font-medium text-gray-700 mb-2">Recipients ({selectedEmails.length})</h4>
                     <div className="text-sm text-gray-600 max-h-20 overflow-y-auto">
                       {selectedEmails.join(', ')}
                     </div>
                   </div>

                   {/* Action Buttons */}
                   <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-3">
                     <button
                       onClick={() => {
                         setShowEmailModal(false)
                         setEmailSubject('')
                         setEmailMessage('')
                       }}
                       className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                     >
                       Cancel
                     </button>
                     <button
                       onClick={sendEmails}
                       disabled={isLoadingEmail || !emailSubject.trim() || !emailMessage.trim()}
                       className="bg-emerald-500 text-white px-6 py-2 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                     >
                       {isLoadingEmail ? (
                         <>
                           <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                           Sending...
                         </>
                       ) : (
                         <>
                           📧 Send to {selectedEmails.length} Recipients
                         </>
                       )}
                     </button>
                   </div>
                 </div>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  )
} 