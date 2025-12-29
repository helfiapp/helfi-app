'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function AdminPanel() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [adminUser, setAdminUser] = useState<any>(null)
  const [totpSetupUrl, setTotpSetupUrl] = useState<string | null>(null)
  const [totpQrData, setTotpQrData] = useState<string | null>(null)
  const [needsOtp, setNeedsOtp] = useState(false)
  const [useQrLogin, setUseQrLogin] = useState(true)
  const [qrLoginToken, setQrLoginToken] = useState<string | null>(null)
  const [qrLoginUrl, setQrLoginUrl] = useState<string | null>(null)
  const [qrLoginImage, setQrLoginImage] = useState<string | null>(null)
  const [qrLoginStatus, setQrLoginStatus] = useState<'idle' | 'loading' | 'pending' | 'approved'>('idle')
  const [qrLoginError, setQrLoginError] = useState('')
  const qrLoginIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Analytics data states
  const [analyticsData, setAnalyticsData] = useState<any[]>([])
  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null)
  const [aiInsights, setAiInsights] = useState<string>('')
  const [activeTab, setActiveTab] = useState('overview')
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [visionUsage, setVisionUsage] = useState<any>(null)
  const [visionRecent, setVisionRecent] = useState<any[]>([])
  const [visionUsageRange, setVisionUsageRange] = useState(7)
  const [visionUsageUserFilter, setVisionUsageUserFilter] = useState('')
  const [visionUsageLoading, setVisionUsageLoading] = useState(false)
  const [visionUsageError, setVisionUsageError] = useState('')

  // Food analysis cost testing (admin)
  const [foodCostSimRange, setFoodCostSimRange] = useState(7)
  const [foodCostSim, setFoodCostSim] = useState<any>(null)
  const [foodCostSimLoading, setFoodCostSimLoading] = useState(false)
  const [foodCostSimError, setFoodCostSimError] = useState('')
  const [foodServerUsageRange, setFoodServerUsageRange] = useState(30)
  const [foodServerUsage, setFoodServerUsage] = useState<any>(null)
  const [foodServerUsageLoading, setFoodServerUsageLoading] = useState(false)
  const [foodServerUsageError, setFoodServerUsageError] = useState('')
  const [serverCallUsageRange, setServerCallUsageRange] = useState(30)
  const [serverCallUsage, setServerCallUsage] = useState<any>(null)
  const [serverCallUsageLoading, setServerCallUsageLoading] = useState(false)
  const [serverCallUsageError, setServerCallUsageError] = useState('')
  const [vercelWebhookTestLoading, setVercelWebhookTestLoading] = useState(false)
  const [foodCostEstimatorUsers, setFoodCostEstimatorUsers] = useState(1000)
  const [foodCostEstimatorAnalysesPerUser, setFoodCostEstimatorAnalysesPerUser] = useState(1)
  const [foodCostEstimatorCallsPerAnalysis, setFoodCostEstimatorCallsPerAnalysis] = useState(3)
  const [foodCostEstimatorCostPer1kCalls, setFoodCostEstimatorCostPer1kCalls] = useState(0.00146)
  const [foodEstimatorAutoCalls, setFoodEstimatorAutoCalls] = useState(true)
  const [foodBenchmarkImageUrl, setFoodBenchmarkImageUrl] = useState('')
  const [foodBenchmarkModels, setFoodBenchmarkModels] = useState<Record<string, boolean>>({
    'gpt-4o': true,
    'gpt-5.2': true,
    'gpt-5-mini': false,
    'gpt-5.2-pro': false,
  })
  const [foodBenchmarkResult, setFoodBenchmarkResult] = useState<any>(null)
  const [foodBenchmarkLoading, setFoodBenchmarkLoading] = useState(false)
  const [foodBenchmarkError, setFoodBenchmarkError] = useState('')

  // Additional admin data states
  const [waitlistData, setWaitlistData] = useState<any[]>([])
  const [partnerOutreachData, setPartnerOutreachData] = useState<any[]>([])
  const [userStats, setUserStats] = useState<any>(null)
  const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false)
  const [isLoadingPartnerOutreach, setIsLoadingPartnerOutreach] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  
  // User management states
  const [managedUsers, setManagedUsers] = useState<any[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoadingManagement, setIsLoadingManagement] = useState(false)
  const [actionInFlight, setActionInFlight] = useState<Record<string, boolean>>({})
  const actionInFlightRef = useRef<Record<string, boolean>>({})

  // Email functionality states
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [showCustomEmailInterface, setShowCustomEmailInterface] = useState(false)
  const [customEmailSubject, setCustomEmailSubject] = useState('')
  const [customEmailMessage, setCustomEmailMessage] = useState('')
  const [isComposingEmail, setIsComposingEmail] = useState(false)

  // Partner outreach email states
  const [selectedPartnerEmails, setSelectedPartnerEmails] = useState<string[]>([])
  const [showPartnerEmailInterface, setShowPartnerEmailInterface] = useState(false)
  const [partnerEmailSubject, setPartnerEmailSubject] = useState('')
  const [partnerEmailMessage, setPartnerEmailMessage] = useState('')
  const [isComposingPartnerEmail, setIsComposingPartnerEmail] = useState(false)

  // User Management Email states
  const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([])
  const [showUserEmailInterface, setShowUserEmailInterface] = useState(false)
  const [userEmailSubject, setUserEmailSubject] = useState('')
  const [userEmailMessage, setUserEmailMessage] = useState('')
  const [isComposingUserEmail, setIsComposingUserEmail] = useState(false)
  const [emailTemplate, setEmailTemplate] = useState('custom')

  // Template Management states
  const [emailTemplates, setEmailTemplates] = useState<any[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateCategory, setTemplateCategory] = useState('MARKETING')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateContent, setTemplateContent] = useState('')
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false)

  // Email testing states
  const [showEmailTest, setShowEmailTest] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [isTestingEmail, setIsTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<any>(null)

  // Support ticket states
  const [supportTickets, setSupportTickets] = useState<any[]>([])
  const [isLoadingTickets, setIsLoadingTickets] = useState(false)
  const [ticketFilter, setTicketFilter] = useState('all')
  const [ticketsError, setTicketsError] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [ticketResponse, setTicketResponse] = useState('')
  const [isRespondingToTicket, setIsRespondingToTicket] = useState(false)

  // Affiliate program admin states
  const [affiliateApplications, setAffiliateApplications] = useState<any[]>([])
  const [affiliateStatusFilter, setAffiliateStatusFilter] = useState('PENDING_REVIEW')
  const [affiliateLoading, setAffiliateLoading] = useState(false)
  const [affiliateError, setAffiliateError] = useState('')
  const [affiliateActionLoading, setAffiliateActionLoading] = useState<Record<string, boolean>>({})
  const [payoutCurrency, setPayoutCurrency] = useState('usd')
  const [payoutMinThreshold, setPayoutMinThreshold] = useState(5000)
  const [payoutDryRun, setPayoutDryRun] = useState(true)
  const [payoutLoading, setPayoutLoading] = useState(false)
  const [payoutError, setPayoutError] = useState('')
  const [payoutResult, setPayoutResult] = useState<any>(null)

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

  // QR Code and Push Notification states
  const [qrCodeData, setQrCodeData] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [isGeneratingQR, setIsGeneratingQR] = useState(false)
  type PushNotificationState = { subscribed: boolean; loading: boolean; lastUpdated: string | null }
  const [pushNotificationStatus, setPushNotificationStatus] = useState<PushNotificationState>({
    subscribed: false,
    loading: false,
    lastUpdated: null
  })
  const [pushLogs, setPushLogs] = useState<Array<{createdAt: string; event: string; userEmail: string; status: string; info?: string}>>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [securityStatus, setSecurityStatus] = useState<Array<{ id: string; label: string; status: 'set' | 'missing' }>>([])
  const [securityStatusLoading, setSecurityStatusLoading] = useState(false)
  const [securityStatusError, setSecurityStatusError] = useState('')

  // Check for URL hash to set active tab and load data
  useEffect(() => {
    const token = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken')
    const user = sessionStorage.getItem('adminUser') || localStorage.getItem('adminUser')
    
    if (token && user) {
      sessionStorage.setItem('adminToken', token)
      sessionStorage.setItem('adminUser', user)
      setAdminToken(token)
      setAdminUser(JSON.parse(user))
      setIsAuthenticated(true)
      loadAnalyticsData()
      loadWaitlistData(token)
      loadUserStats(token)
      
      // Check for URL hash or query to set active tab
      const checkHashAndLoadData = () => {
        const queryTab = new URLSearchParams(window.location.search).get('tab')
        if (queryTab) {
          handleTabChange(queryTab, token)
          return
        }
        if (window.location.hash === '#tickets') {
          handleTabChange('tickets', token)
          return
        }
        const storedTab = (() => {
          try {
            return localStorage.getItem('adminActiveTab')
          } catch {
            return null
          }
        })()
        if (storedTab) {
          handleTabChange(storedTab, token)
        }
      }
      
      checkHashAndLoadData()
      
      // Listen for hash changes (Agent #25's implementation preserved)
      const handleHashChange = () => {
        checkHashAndLoadData()
      }
      
      // New: Add visibility change detection for auto-loading
      const handleVisibilityChange = () => {
        if (!document.hidden && window.location.hash === '#tickets') {
          // Auto-load tickets when returning to visible tab with tickets hash
          handleTabChange('tickets', token)
        }
      }
      
      // New: Add focus detection for returning via back button
      const handleWindowFocus = () => {
        if (window.location.hash === '#tickets') {
          handleTabChange('tickets', token)
        }
      }
      
      window.addEventListener('hashchange', handleHashChange)
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('focus', handleWindowFocus)
      
      // Cleanup
      return () => {
        window.removeEventListener('hashchange', handleHashChange)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('focus', handleWindowFocus)
      }
    }
  }, [])

  const applyAdminSession = (tokenValue: string, adminValue: any) => {
    setAdminToken(tokenValue)
    setAdminUser(adminValue)
    setIsAuthenticated(true)
    sessionStorage.setItem('adminToken', tokenValue)
    sessionStorage.setItem('adminUser', JSON.stringify(adminValue))
    localStorage.setItem('adminToken', tokenValue)
    localStorage.setItem('adminUser', JSON.stringify(adminValue))
    loadAnalyticsData()
    loadWaitlistData(tokenValue)
    loadUserStats(tokenValue)
    const queryTab = new URLSearchParams(window.location.search).get('tab')
    const storedTab = (() => {
      try {
        return localStorage.getItem('adminActiveTab')
      } catch {
        return null
      }
    })()
    if (queryTab || storedTab) {
      handleTabChange(queryTab || storedTab || 'overview', tokenValue)
    }
  }

  const stopQrPolling = () => {
    if (qrLoginIntervalRef.current) {
      clearInterval(qrLoginIntervalRef.current)
      qrLoginIntervalRef.current = null
    }
  }

  const pollQrLoginStatus = async (tokenValue: string) => {
    try {
      const response = await fetch(`/api/admin/qr-login/status?token=${encodeURIComponent(tokenValue)}`)
      if (response.status === 404 || response.status === 410) {
        stopQrPolling()
        setQrLoginStatus('idle')
        setQrLoginError('QR code expired. Please generate a new one.')
        return
      }
      const data = await response.json().catch(() => ({}))
      if (data?.status === 'APPROVED' && data?.token && data?.admin) {
        stopQrPolling()
        setQrLoginStatus('approved')
        applyAdminSession(data.token, data.admin)
      }
    } catch (error) {
      console.error('QR login status error:', error)
    }
  }

  const startQrLogin = async () => {
    stopQrPolling()
    setQrLoginStatus('loading')
    setQrLoginError('')
    setQrLoginImage(null)
    setQrLoginUrl(null)
    setQrLoginToken(null)

    try {
      const response = await fetch('/api/admin/qr-login/start')
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.token || !data?.url) {
        setQrLoginStatus('idle')
        setQrLoginError(data?.error || 'Failed to generate QR login')
        return
      }

      setQrLoginToken(data.token)
      setQrLoginUrl(data.url)
      setQrLoginStatus('pending')

      try {
        const QRCode = (await import('qrcode')).default
        const qrImageData = await QRCode.toDataURL(data.url, {
          width: 240,
          margin: 1
        })
        setQrLoginImage(qrImageData)
      } catch (qrError) {
        console.error('QR login image error:', qrError)
        setQrLoginError('Unable to render QR code. Please refresh and try again.')
      }
    } catch (error) {
      console.error('QR login start error:', error)
      setQrLoginStatus('idle')
      setQrLoginError('Failed to generate QR login')
    }
  }

  useEffect(() => {
    if (isAuthenticated || !useQrLogin) {
      stopQrPolling()
      return
    }

    if (!qrLoginToken) {
      void startQrLogin()
    }
  }, [isAuthenticated, useQrLogin, qrLoginToken])

  useEffect(() => {
    if (isAuthenticated || !useQrLogin || !qrLoginToken) {
      stopQrPolling()
      return
    }

    stopQrPolling()
    void pollQrLoginStatus(qrLoginToken)
    qrLoginIntervalRef.current = setInterval(() => {
      void pollQrLoginStatus(qrLoginToken)
    }, 2500)

    return () => {
      stopQrPolling()
    }
  }, [isAuthenticated, useQrLogin, qrLoginToken])

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
        setError(data?.error || 'Authentication failed. Please try again.')
        setLoading(false)
        return
      }

      if (!data?.token || !data?.admin) {
        setError('Authentication failed. Please try again.')
        setLoading(false)
        return
      }

      applyAdminSession(data.token, data.admin)
      setOtp('')
      setNeedsOtp(false)
      setTotpSetupUrl(null)
      setTotpQrData(null)
      setError('')
      setLoading(false)
    } catch (loginError) {
      console.error('Admin login error:', loginError)
      setError('Authentication failed. Please try again.')
      setLoading(false)
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUser')
    stopQrPolling()
    setPassword('')
    setOtp('')
    setAdminToken('')
    setAdminUser(null)
    setTotpSetupUrl(null)
    setTotpQrData(null)
    setNeedsOtp(false)
    setUseQrLogin(true)
    setQrLoginToken(null)
    setQrLoginUrl(null)
    setQrLoginImage(null)
    setQrLoginStatus('idle')
    setQrLoginError('')
    setAnalyticsData([])
    setAnalyticsSummary(null)
    setAiInsights('')
    setVisionUsage(null)
    setVisionRecent([])
  }

  const loadAnalyticsData = async () => {
    try {
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      if (!authToken) return
      const headers = { Authorization: `Bearer ${authToken}` }
      // Load raw data
      const dataResponse = await fetch('/api/analytics', { headers })
      if (dataResponse.ok) {
        const dataResult = await dataResponse.json()
        setAnalyticsData(dataResult.data || [])
      }

      // Load summary (non-blocking)
      try {
        const summaryResponse = await fetch('/api/analytics?action=summary', { headers })
        if (summaryResponse.ok) {
          const summaryResult = await summaryResponse.json()
          setAnalyticsSummary(summaryResult.summary)
        }
      } catch (e) {
        console.warn('Summary load failed')
      }
    } catch (error) {
      console.error('Error loading analytics:', error)
    }
  }

  const loadVisionUsage = async (range?: number, userFilter?: string) => {
    const days = range ?? visionUsageRange
    const filter = userFilter !== undefined ? userFilter : visionUsageUserFilter
    setVisionUsageRange(days)
    setVisionUsageUserFilter(filter)
    setVisionUsageLoading(true)
    setVisionUsageError('')
    try {
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      const params = new URLSearchParams()
      params.set('rangeDays', String(days))
      if (filter) params.set('user', filter)
      const res = await fetch(`/api/admin/vision-usage?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setVisionUsageError(data?.error || 'Failed to load vision usage')
        setVisionUsageLoading(false)
        return
      }
      setVisionUsage(data)
      setVisionRecent(data.recent || [])
    } catch (err: any) {
      setVisionUsageError(err?.message || 'Failed to load vision usage')
    } finally {
      setVisionUsageLoading(false)
    }
  }

  const loadFoodCostSim = async (range?: number) => {
    const days = range ?? foodCostSimRange
    setFoodCostSimRange(days)
    setFoodCostSimLoading(true)
    setFoodCostSimError('')
    try {
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      const params = new URLSearchParams()
      params.set('rangeDays', String(days))
      const res = await fetch(`/api/admin/food-cost-sim?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setFoodCostSimError(data?.error || 'Failed to load food cost simulation')
        setFoodCostSimLoading(false)
        return
      }
      setFoodCostSim(data)
    } catch (err: any) {
      setFoodCostSimError(err?.message || 'Failed to load food cost simulation')
    } finally {
      setFoodCostSimLoading(false)
    }
  }

  const loadFoodServerUsage = async (range?: number) => {
    const days = range ?? foodServerUsageRange
    setFoodServerUsageRange(days)
    setFoodServerUsageLoading(true)
    setFoodServerUsageError('')
    try {
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      if (!authToken) return
      const res = await fetch(`/api/admin/food-analysis-usage?rangeDays=${days}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load food analysis usage')
      setFoodServerUsage(data)
    } catch (err: any) {
      setFoodServerUsageError(err?.message || 'Failed to load food analysis usage')
    } finally {
      setFoodServerUsageLoading(false)
    }
  }

  const loadServerCallUsage = async (range?: number) => {
    const days = range ?? serverCallUsageRange
    setServerCallUsageRange(days)
    setServerCallUsageLoading(true)
    setServerCallUsageError('')
    try {
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      if (!authToken) return
      const res = await fetch(`/api/admin/server-call-usage?rangeDays=${days}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load server call usage')
      setServerCallUsage(data)
    } catch (err: any) {
      setServerCallUsageError(err?.message || 'Failed to load server call usage')
    } finally {
      setServerCallUsageLoading(false)
    }
  }

  const runFoodBenchmark = async () => {
    setFoodBenchmarkLoading(true)
    setFoodBenchmarkError('')
    setFoodBenchmarkResult(null)
    try {
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      const models = Object.entries(foodBenchmarkModels)
        .filter(([, enabled]) => enabled)
        .map(([m]) => m)
      const res = await fetch('/api/admin/food-benchmark', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: foodBenchmarkImageUrl.trim(), models }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFoodBenchmarkError(data?.error || 'Benchmark failed')
        setFoodBenchmarkLoading(false)
        return
      }
      setFoodBenchmarkResult(data)
    } catch (err: any) {
      setFoodBenchmarkError(err?.message || 'Benchmark failed')
    } finally {
      setFoodBenchmarkLoading(false)
    }
  }

  const loadWaitlistData = async (token?: string) => {
    setIsLoadingWaitlist(true)
    try {
      const authToken = token || adminToken
      const response = await fetch('/api/waitlist', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      if (response.ok) {
        const result = await response.json()
        setWaitlistData(result.waitlist || [])
        // Clear selected emails if they no longer exist
        setSelectedEmails(prev => prev.filter(email => 
          result.waitlist?.some((entry: any) => entry.email === email)
        ))
      }
    } catch (error) {
      console.error('Error loading waitlist:', error)
    }
    setIsLoadingWaitlist(false)
  }

  const handleDeleteWaitlistEntry = async (entryId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete ${email} from the waitlist?`)) {
      return
    }

    try {
      const response = await fetch('/api/waitlist', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: entryId })
      })

      const result = await response.json()
      
      if (response.ok) {
        // Remove from local state
        setWaitlistData(prev => prev.filter(entry => entry.id !== entryId))
        // Remove from selected emails if it was selected
        setSelectedEmails(prev => prev.filter(e => e !== email))
        alert('Waitlist entry deleted successfully')
      } else {
        alert(result.error || 'Failed to delete waitlist entry')
      }
    } catch (error) {
      console.error('Error deleting waitlist entry:', error)
      alert('Failed to delete waitlist entry. Please try again.')
    }
  }

  const handleBulkDeleteWaitlistEntries = async () => {
    if (selectedEmails.length === 0) {
      alert('Please select at least one entry to delete')
      return
    }

    const selectedEntries = waitlistData.filter(entry => selectedEmails.includes(entry.email))
    const emailList = selectedEntries.map(e => e.email).join(', ')
    
    if (!confirm(`Are you sure you want to delete ${selectedEmails.length} waitlist ${selectedEmails.length === 1 ? 'entry' : 'entries'}?\n\n${emailList}`)) {
      return
    }

    try {
      // Delete all selected entries
      const deletePromises = selectedEntries.map(entry =>
        fetch('/api/waitlist', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id: entry.id })
        })
      )

      const results = await Promise.all(deletePromises)
      const failed = results.filter(r => !r.ok)
      
      if (failed.length === 0) {
        // Store count before clearing
        const deletedCount = selectedEmails.length
        // Remove all deleted entries from local state
        const deletedIds = selectedEntries.map(e => e.id)
        setWaitlistData(prev => prev.filter(entry => !deletedIds.includes(entry.id)))
        // Clear selected emails
        setSelectedEmails([])
        alert(`✅ Successfully deleted ${deletedCount} waitlist ${deletedCount === 1 ? 'entry' : 'entries'}`)
      } else {
        alert(`Failed to delete ${failed.length} of ${selectedEmails.length} entries. Please try again.`)
      }
    } catch (error) {
      console.error('Error bulk deleting waitlist entries:', error)
      alert('Failed to delete waitlist entries. Please try again.')
    }
  }

  const loadPartnerOutreachData = async (token?: string) => {
    setIsLoadingPartnerOutreach(true)
    try {
      const authToken = token || adminToken
      const response = await fetch('/api/admin/partner-outreach', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      if (response.ok) {
        const result = await response.json()
        setPartnerOutreachData(result.contacts || [])
        setSelectedPartnerEmails(prev => prev.filter(email =>
          result.contacts?.some((entry: any) => entry.email === email)
        ))
      }
    } catch (error) {
      console.error('Error loading partner outreach contacts:', error)
    }
    setIsLoadingPartnerOutreach(false)
  }

  const handleInitPartnerOutreach = async () => {
    if (!confirm('Load the default partner outreach list? This will add missing contacts.')) {
      return
    }

    try {
      const response = await fetch('/api/admin/partner-outreach/init', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      const result = await response.json()
      if (response.ok) {
        alert(`✅ Added ${result.createdCount || 0} partner contacts`)
        loadPartnerOutreachData()
      } else {
        alert(result.error || 'Failed to initialize partner contacts')
      }
    } catch (error) {
      console.error('Error initializing partner outreach contacts:', error)
      alert('Failed to initialize partner contacts. Please try again.')
    }
  }

  const handlePartnerEmailSelect = (email?: string | null) => {
    if (!email) return
    setSelectedPartnerEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    )
  }

  const handlePartnerSelectAll = () => {
    const selectable = partnerOutreachData.map(entry => entry.email).filter(Boolean)
    if (selectedPartnerEmails.length === selectable.length) {
      setSelectedPartnerEmails([])
    } else {
      setSelectedPartnerEmails(selectable)
    }
  }

  const handleDeletePartnerContact = async (entryId: string, email: string | null, label: string) => {
    if (!confirm(`Are you sure you want to delete ${label} from the partner outreach list?`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/partner-outreach?id=${entryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })

      const result = await response.json()

      if (response.ok) {
        setPartnerOutreachData(prev => prev.filter(entry => entry.id !== entryId))
        if (email) {
          setSelectedPartnerEmails(prev => prev.filter(e => e !== email))
        }
        alert('Partner contact deleted successfully')
      } else {
        alert(result.error || 'Failed to delete partner contact')
      }
    } catch (error) {
      console.error('Error deleting partner contact:', error)
      alert('Failed to delete partner contact. Please try again.')
    }
  }

  const handleBulkDeletePartnerContacts = async () => {
    if (selectedPartnerEmails.length === 0) {
      alert('Please select at least one contact to delete')
      return
    }

    const selectedEntries = partnerOutreachData.filter(entry => selectedPartnerEmails.includes(entry.email))
    const emailList = selectedEntries.map(e => e.email).join(', ')

    if (!confirm(`Are you sure you want to delete ${selectedPartnerEmails.length} partner contact${selectedPartnerEmails.length === 1 ? '' : 's'}?\n\n${emailList}`)) {
      return
    }

    try {
      const deletePromises = selectedEntries.map(entry =>
        fetch(`/api/admin/partner-outreach?id=${entry.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        })
      )

      const results = await Promise.all(deletePromises)
      const failed = results.filter(r => !r.ok)

      if (failed.length === 0) {
        const deletedCount = selectedPartnerEmails.length
        const deletedIds = selectedEntries.map(e => e.id)
        setPartnerOutreachData(prev => prev.filter(entry => !deletedIds.includes(entry.id)))
        setSelectedPartnerEmails([])
        alert(`✅ Successfully deleted ${deletedCount} partner contact${deletedCount === 1 ? '' : 's'}`)
      } else {
        alert(`Failed to delete ${failed.length} of ${selectedPartnerEmails.length} contacts. Please try again.`)
      }
    } catch (error) {
      console.error('Error bulk deleting partner contacts:', error)
      alert('Failed to delete partner contacts. Please try again.')
    }
  }

  const handleStartPartnerEmail = () => {
    if (selectedPartnerEmails.length === 0) {
      alert('Please select at least one recipient')
      return
    }
    setPartnerEmailSubject('Data partnership request for verified nutrition + barcode data (Helfi)')
    setPartnerEmailMessage(`Hi {name},

My name is Louie Veleski and I am the founder of Helfi. Helfi is an AI-driven health analysis web app that allows people to take control of every aspect of their health. You can see an overview of what we do at https://www.helfi.ai.

We are looking to license or partner for authoritative barcode and nutrition data to improve accuracy in our Food Diary module, where users track calories and macronutrients. We want the data behind barcode scans to reflect official product nutrition labels.

Key data fields we are looking for:
- GTIN/UPC/EAN
- Brand + product name
- Pack size and serving size (including ml for liquids)
- Nutrition panel values (per serve and per 100 g/ml)
- Ingredients + allergens
- Product images (front of pack / nutrition panel if available)
- Update cadence or change notifications

If you are the right team, could you please share:
- The best way to request access (API, GDSN data pool, portal, or data feed)
- Any licensing requirements or pricing
- A technical contact for integration details

If this should be directed to a specific data partnerships or product content team, please forward it to the right contact.

Thanks in advance,
Louie Veleski
Founder, Helfi
https://www.helfi.ai`)
    setShowPartnerEmailInterface(true)
  }

  const handleCancelPartnerEmail = () => {
    setShowPartnerEmailInterface(false)
    setPartnerEmailSubject('')
    setPartnerEmailMessage('')
    setIsComposingPartnerEmail(false)
  }

  const handleSendPartnerEmail = async () => {
    if (!partnerEmailSubject.trim() || !partnerEmailMessage.trim()) {
      alert('Please enter both subject and message')
      return
    }

    const confirmed = confirm(`Send email to ${selectedPartnerEmails.length} recipients?`)
    if (!confirmed) return

    setIsComposingPartnerEmail(true)

    try {
      const selectedEntries = partnerOutreachData.filter(entry => selectedPartnerEmails.includes(entry.email))
      const response = await fetch('/api/admin/send-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          emails: selectedPartnerEmails,
          subject: partnerEmailSubject,
          message: partnerEmailMessage,
          waitlistData: selectedEntries,
          emailType: 'marketing',
          reasonText: 'You received this email because we are reaching out about a potential data partnership with Helfi.'
        })
      })

      if (response.ok) {
        alert(`✅ Successfully sent emails to ${selectedPartnerEmails.length} recipients!`)
        handleCancelPartnerEmail()
        setSelectedPartnerEmails([])
      } else {
        const error = await response.json()
        alert(`❌ Failed to send emails: ${error.message}`)
      }
    } catch (error) {
      console.error('Error sending partner outreach emails:', error)
      alert('❌ Failed to send emails. Please try again.')
    }

    setIsComposingPartnerEmail(false)
  }

  const loadUserStats = async (token?: string) => {
    setIsLoadingUsers(true)
    try {
      const authToken = token || adminToken
      // We'll create a simple endpoint to get user count and basic stats
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      if (response.ok) {
        const result = await response.json()
        setUserStats(result)
      } else {
        // Fallback: try to populate the table via management endpoint even if stats failed
        loadUserManagement(userSearch, userFilter, currentPage)
      }
    } catch (error) {
      console.error('Error loading user stats:', error)
    }
    setIsLoadingUsers(false)
  }

  const loadUserManagement = async (search = '', filter = 'all', page = 1, tokenOverride?: string) => {
    setIsLoadingManagement(true)
    try {
      const authToken = tokenOverride || adminToken
      const params = new URLSearchParams({
        search,
        plan: filter,
        page: page.toString(),
        limit: '20'
      })
      
      const response = await fetch(`/api/admin/user-management?${params}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
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
    const key = `${action}:${userId}`
    if (actionInFlightRef.current[key]) return
    actionInFlightRef.current[key] = true
    setActionInFlight((prev) => ({ ...prev, [key]: true }))
    try {
      const response = await fetch('/api/admin/user-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ action, userId, data })
      })

      const result = await response.json()

      if (response.ok) {
        // Reload the user list to show updated data
        await loadUserManagement(userSearch, userFilter, currentPage)
        if (action === 'refund_latest_payment') {
          const amountCents = typeof result?.refundedAmountCents === 'number' ? result.refundedAmountCents : null
          const currency = typeof result?.currency === 'string' ? result.currency.toUpperCase() : 'AUD'
          const amountText = amountCents != null ? `${currency} ${(amountCents / 100).toFixed(2)}` : 'the payment'
          alert(`Refund started for ${amountText}. Access and credits will be removed automatically.`)
        } else {
          const successMessage = result?.message || `User ${action} completed successfully`
          alert(successMessage)
        }
      } else {
        const errorMessage = result.error || 'Action failed. Please try again.'
        console.error('API Error:', result)
        alert(`Action failed: ${errorMessage}`)
      }
    } catch (error) {
      console.error('Error performing user action:', error)
      alert(`Action failed: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      delete actionInFlightRef.current[key]
      setActionInFlight((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const loadAiInsights = async () => {
    setLoadingInsights(true)
    try {
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      if (!authToken) {
        setAiInsights('Admin login required to view insights.')
        setLoadingInsights(false)
        return
      }
      const response = await fetch('/api/analytics?action=insights', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
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

  const loadAffiliateApplications = async (statusOverride?: string) => {
    if (!adminToken) return
    const status = statusOverride ?? affiliateStatusFilter
    setAffiliateLoading(true)
    setAffiliateError('')
    try {
      const params = new URLSearchParams()
      if (status && status !== 'ALL') {
        params.set('status', status)
      }
      const res = await fetch(`/api/admin/affiliates/applications?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load applications')
      setAffiliateApplications(data?.applications || [])
    } catch (err: any) {
      setAffiliateError(err?.message || 'Failed to load applications')
    } finally {
      setAffiliateLoading(false)
    }
  }

  const handleAffiliateDecision = async (applicationId: string, action: 'approve' | 'reject') => {
    if (!adminToken) return
    const confirmText =
      action === 'approve'
        ? 'Approve this affiliate application?'
        : 'Reject this affiliate application?'
    if (!confirm(confirmText)) return

    setAffiliateActionLoading((prev) => ({ ...prev, [applicationId]: true }))
    try {
      const res = await fetch('/api/admin/affiliates/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ applicationId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Action failed')
      await loadAffiliateApplications()
    } catch (err: any) {
      alert(err?.message || 'Action failed')
    } finally {
      setAffiliateActionLoading((prev) => {
        const next = { ...prev }
        delete next[applicationId]
        return next
      })
    }
  }

  const runAffiliatePayout = async (dryRunOverride?: boolean) => {
    if (!adminToken) return
    setPayoutLoading(true)
    setPayoutError('')
    setPayoutResult(null)
    try {
      const res = await fetch('/api/admin/affiliates/payout-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          currency: payoutCurrency,
          minThresholdCents: Number(payoutMinThreshold) || 0,
          dryRun: dryRunOverride ?? payoutDryRun,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Payout run failed')
      setPayoutResult(data)
    } catch (err: any) {
      setPayoutError(err?.message || 'Payout run failed')
    } finally {
      setPayoutLoading(false)
    }
  }

  const persistActiveTab = (tabId: string) => {
    try {
      localStorage.setItem('adminActiveTab', tabId)
    } catch {
      // Ignore storage errors
    }
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tabId)
    if (tabId === 'tickets') {
      url.hash = '#tickets'
    } else {
      url.hash = ''
    }
    window.history.replaceState({}, '', url.toString())
  }

  const handleTabChange = (tabId: string, tokenOverride?: string) => {
    setActiveTab(tabId)
    persistActiveTab(tabId)
    if (tabId === 'insights' && !aiInsights) {
      loadAiInsights()
    }
    if (tabId === 'usage' && !visionUsage) {
      loadVisionUsage(visionUsageRange)
    }
    if (tabId === 'usage' && !foodCostSim) {
      loadFoodCostSim(foodCostSimRange)
    }
    if (tabId === 'usage' && !foodServerUsage) {
      loadFoodServerUsage(foodServerUsageRange)
    }
    if (tabId === 'usage' && !serverCallUsage) {
      loadServerCallUsage(serverCallUsageRange)
    }
    if (tabId === 'management') {
      loadUserManagement(userSearch, userFilter, currentPage, tokenOverride)
      loadEmailTemplates()
    }
    if (tabId === 'affiliates') {
      loadAffiliateApplications('PENDING_REVIEW')
    }
    if (tabId === 'templates') {
      loadEmailTemplates()
    }
    if (tabId === 'tickets') {
      loadSupportTickets()
    }
    if (tabId === 'partner-outreach') {
      loadPartnerOutreachData()
    }
    if (tabId === 'settings') {
      checkPushNotificationStatus()
      loadSecurityStatus(tokenOverride)
    }
  }

  const refreshData = () => {
    loadAnalyticsData()
    loadWaitlistData(adminToken)
    loadUserStats(adminToken)
    if (activeTab === 'insights') {
      loadAiInsights()
    }
    if (activeTab === 'management') {
      loadUserManagement(userSearch, userFilter, currentPage)
    }
    if (activeTab === 'templates') {
      loadEmailTemplates()
    }
    if (activeTab === 'tickets') {
      loadSupportTickets()
    }
    if (activeTab === 'affiliates') {
      loadAffiliateApplications()
    }
    if (activeTab === 'partner-outreach') {
      loadPartnerOutreachData()
    }
    if (activeTab === 'usage') {
      loadVisionUsage(visionUsageRange)
      loadFoodCostSim(foodCostSimRange)
      loadFoodServerUsage(foodServerUsageRange)
      loadServerCallUsage(serverCallUsageRange)
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

  // Custom Email Interface Functions
  const handleStartCustomEmail = () => {
    if (selectedEmails.length === 0) {
      alert('Please select at least one email address')
      return
    }
    
    // Initialize the email interface
    setCustomEmailSubject('')
    setCustomEmailMessage('Hi {name},\n\n\n\nBest regards,\nThe Helfi Team')
    setShowCustomEmailInterface(true)
  }

  const handleCancelCustomEmail = () => {
    setShowCustomEmailInterface(false)
    setCustomEmailSubject('')
    setCustomEmailMessage('')
    setIsComposingEmail(false)
  }

  const handleSendCustomEmail = async () => {
    if (!customEmailSubject.trim() || !customEmailMessage.trim()) {
      alert('Please enter both subject and message')
      return
    }
    
    const confirmed = confirm(`Send custom email to ${selectedEmails.length} recipients?`)
    if (!confirmed) return
    
    setIsComposingEmail(true)
    
    try {
      const response = await fetch('/api/admin/send-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          emails: selectedEmails,
          subject: customEmailSubject,
          message: customEmailMessage,
          waitlistData: waitlistData.filter(entry => selectedEmails.includes(entry.email)),
          emailType: 'marketing',
          reasonText: 'You received this email because you joined the Helfi waitlist.'
        })
      })

      if (response.ok) {
        alert(`✅ Successfully sent custom emails to ${selectedEmails.length} recipients!`)
        handleCancelCustomEmail() // Reset the interface
        setSelectedEmails([]) // Clear selections
      } else {
        const error = await response.json()
        alert(`❌ Failed to send emails: ${error.message}`)
      }
    } catch (error) {
      console.error('Error sending emails:', error)
      alert('❌ Failed to send emails. Please try again.')
    }
    
    setIsComposingEmail(false)
  }

  // User Management Email Functions
  const handleUserEmailSelect = (email: string) => {
    if (selectedUserEmails.includes(email)) {
      setSelectedUserEmails(selectedUserEmails.filter(e => e !== email))
    } else {
      setSelectedUserEmails([...selectedUserEmails, email])
    }
  }

  const handleSelectAllUsers = () => {
    if (selectedUserEmails.length === managedUsers.length) {
      setSelectedUserEmails([])
    } else {
      setSelectedUserEmails(managedUsers.map(user => user.email))
    }
  }

  const handleSelectByTier = (tier: string) => {
    const filteredUsers = managedUsers.filter(user => {
      if (tier === 'premium') return user.subscription?.plan === 'PREMIUM'
      if (tier === 'non-subscribed') return !user.subscription?.plan
      return true
    })
    setSelectedUserEmails(filteredUsers.map(user => user.email))
  }

  // Bulk delete function
  const handleBulkDelete = async () => {
    if (selectedUserEmails.length === 0) {
      alert('Please select users to delete')
      return
    }

    const confirmMessage = `⚠️ DANGER: This will permanently delete ${selectedUserEmails.length} user account(s) and ALL their data.\n\nThis action CANNOT be undone!\n\nSelected users:\n${selectedUserEmails.slice(0, 5).join('\n')}${selectedUserEmails.length > 5 ? `\n...and ${selectedUserEmails.length - 5} more` : ''}\n\nType "DELETE" to confirm:`

    const userConfirmation = prompt(confirmMessage)
    if (userConfirmation !== 'DELETE') {
      alert('Bulk delete cancelled - confirmation text did not match')
      return
    }

    const finalConfirm = confirm(`FINAL CONFIRMATION: Delete ${selectedUserEmails.length} users permanently?`)
    if (!finalConfirm) {
      alert('Bulk delete cancelled')
      return
    }

    try {
      setIsLoadingManagement(true)
      
      // Get user IDs from emails
      const usersToDelete = managedUsers.filter(user => selectedUserEmails.includes(user.email))
      
      let successCount = 0
      let errorCount = 0
      const errors = []

      // Delete users one by one to handle individual failures
      for (const user of usersToDelete) {
        try {
          const response = await fetch('/api/admin/user-management', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ 
              action: 'delete_user', 
              userId: user.id 
            })
          })

          if (response.ok) {
            successCount++
          } else {
            errorCount++
            const error = await response.json()
            errors.push(`${user.email}: ${error.message || 'Unknown error'}`)
          }
        } catch (error) {
          errorCount++
          errors.push(`${user.email}: Network error`)
        }
      }

      // Show results
      if (successCount > 0 && errorCount === 0) {
        alert(`✅ Successfully deleted ${successCount} user accounts`)
      } else if (successCount > 0 && errorCount > 0) {
        alert(`⚠️ Partial success: ${successCount} users deleted, ${errorCount} failed.\n\nErrors:\n${errors.join('\n')}`)
      } else {
        alert(`❌ All deletions failed:\n${errors.join('\n')}`)
      }

      // Clear selections and reload
      setSelectedUserEmails([])
      loadUserManagement(userSearch, userFilter, currentPage)

    } catch (error) {
      console.error('Bulk delete error:', error)
      alert('❌ Bulk delete failed due to an unexpected error')
    } finally {
      setIsLoadingManagement(false)
    }
  }

  const handleStartUserEmail = (templateType = 'custom') => {
    if (selectedUserEmails.length === 0) {
      alert('Please select at least one user')
      return
    }
    
    setEmailTemplate(templateType)
    applyEmailTemplate(templateType)
    setShowUserEmailInterface(true)
  }

  const applyEmailTemplate = (templateType: string) => {
    // Check if it's a database template ID
    const dbTemplate = emailTemplates.find(t => t.id === templateType)
    if (dbTemplate) {
      setUserEmailSubject(dbTemplate.subject)
      setUserEmailMessage(dbTemplate.content)
      return
    }

    // Fallback to hardcoded templates for backwards compatibility
    switch (templateType) {
      case 'welcome':
        setUserEmailSubject('🎉 Welcome to Helfi - Your AI Health Journey Begins!')
        setUserEmailMessage(`Hi {name},

Welcome to the Helfi community! We're thrilled to have you on board.

🚀 **Getting Started:**
• Complete your health profile for personalized insights
• Start logging your meals with AI-powered analysis
• Set your health goals and track your progress
• Explore our medication interaction checker

💡 **Pro Tip:** The more you use Helfi, the smarter your AI health coach becomes!

Need help getting started? Just reply to this email or contact our support team.

Best regards,
The Helfi Team`)
        break
      
      case 'premium_upgrade':
        setUserEmailSubject('🔥 Unlock Your Full Health Potential with Helfi Premium')
        setUserEmailMessage(`Hi {name},

Ready to supercharge your health journey? Helfi Premium gives you everything you need:

✨ **Premium Benefits:**
• 30 AI food analyses per day (vs 3 on free)
• 30 medical image analyses per day
• Advanced medication interaction checking
• Priority customer support
• Early access to new features

🎯 **Special Offer:** Get 14 days free when you upgrade today!

[Upgrade to Premium - helfi.ai/billing]

Your health deserves the best tools. Let's make it happen!

Best regards,
The Helfi Team`)
        break
      
      case 'engagement':
        setUserEmailSubject('🌟 Your Health Journey Awaits - Come Back to Helfi!')
        setUserEmailMessage(`Hi {name},

We miss you at Helfi! Your health journey is important, and we're here to support you every step of the way.

🎯 **Quick Health Check:**
• Log today's meals in under 2 minutes
• Check if your medications interact safely
• Review your progress toward your health goals

💪 **Remember:** Small daily actions lead to big health transformations.

Ready to continue your journey? We're excited to see your progress!

[Continue Your Journey - helfi.ai]

Best regards,
The Helfi Team`)
        break
      
      case 'feature_announcement':
        setUserEmailSubject('🆕 Exciting New Features Just Dropped at Helfi!')
        setUserEmailMessage(`Hi {name},

Big news! We've just released some amazing new features that will take your health journey to the next level:

🔥 **What's New:**
• Enhanced AI food analysis with better accuracy
• New medical image analysis for skin conditions
• Improved medication interaction database
• Faster mobile app performance
• Smart health insights dashboard

✨ **Ready to explore?** Log in to your Helfi account and discover these powerful new tools.

[Explore New Features - helfi.ai]

Your feedback helps us build better health tools. Let us know what you think!

Best regards,
The Helfi Team`)
        break
      
      case 'support_followup':
        setUserEmailSubject('🌟 Hope you\'re enjoying your Helfi journey!')
        setUserEmailMessage(`Hi {name},

Hope you're doing well! 😊

We noticed you've been using Helfi and wanted to personally check in to see how everything is going for you.

✨ **Your health journey matters to us**, and we're here to make sure you get the most out of Helfi.

If you have any questions, thoughts, or just want to share how Helfi has been helping you, we'd love to hear from you! Simply reply to this email - our team personally reads every message.

🚀 **Pro tip:** The more you use Helfi's AI analysis, the better it gets at understanding your unique health patterns!

Wishing you the best on your health journey,

The Helfi Team
P.S. Need quick help? We're always here at support@helfi.ai`)
        break
        
      default:
        setUserEmailSubject('')
        setUserEmailMessage('Hi {name},\n\n\n\nBest regards,\nThe Helfi Team')
    }
  }

  const handleCancelUserEmail = () => {
    setShowUserEmailInterface(false)
    setUserEmailSubject('')
    setUserEmailMessage('')
    setIsComposingUserEmail(false)
    setEmailTemplate('custom')
  }

  const handleSendUserEmail = async () => {
    if (!userEmailSubject.trim() || !userEmailMessage.trim()) {
      alert('Please enter both subject and message')
      return
    }
    
    const confirmed = confirm(`Send email to ${selectedUserEmails.length} users?`)
    if (!confirmed) return
    
    setIsComposingUserEmail(true)
    
    try {
      // Prepare user data for personalization
      const emailData = selectedUserEmails.map(email => {
        const user = managedUsers.find(u => u.email === email)
        return {
          email,
          name: user?.name || 'there'
        }
      })
      
      const response = await fetch('/api/admin/send-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          emails: selectedUserEmails,
          subject: userEmailSubject,
          message: userEmailMessage,
          waitlistData: emailData, // Using same structure for compatibility
          emailType: 'marketing',
          reasonText: 'You received this email because you have a Helfi account.'
        })
      })

      if (response.ok) {
        alert(`✅ Successfully sent emails to ${selectedUserEmails.length} users!`)
        handleCancelUserEmail()
        setSelectedUserEmails([])
      } else {
        const error = await response.json()
        alert(`❌ Failed to send emails: ${error.message}`)
      }
    } catch (error) {
      console.error('Error sending user emails:', error)
      alert('❌ Failed to send emails. Please try again.')
    }
    
    setIsComposingUserEmail(false)
  }

  // Template Management Functions
  const loadEmailTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      const response = await fetch('/api/admin/email-templates', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setEmailTemplates(data.templates || [])
      } else {
        // If templates fail to load, might need database initialization
        console.warn('Failed to load email templates - database may need initialization')
        setEmailTemplates([])
      }
    } catch (error) {
      console.error('Error loading templates:', error)
      console.warn('Templates system may need database initialization')
      setEmailTemplates([])
    }
    setIsLoadingTemplates(false)
  }

  const initializeTemplateDatabase = async () => {
    if (!confirm('Initialize the email template database? This will create the required table and add built-in templates.')) {
      return
    }

    try {
      const response = await fetch('/api/admin/init-templates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        alert(`✅ ${data.message}\nCreated: ${data.created} templates`)
        loadEmailTemplates() // Reload templates
      } else {
        const error = await response.json()
        alert(`❌ Failed to initialize: ${error.details || error.error}`)
      }
    } catch (error) {
      console.error('Error initializing templates:', error)
      alert('❌ Failed to initialize templates')
    }
  }

  const handleCreateTemplate = () => {
    setEditingTemplate(null)
    setTemplateName('')
    setTemplateCategory('MARKETING')
    setTemplateSubject('')
    setTemplateContent('Hi {name},\n\n\n\nBest regards,\nThe Helfi Team')
    setShowTemplateForm(true)
  }

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template)
    setTemplateName(template.name)
    setTemplateCategory(template.category)
    setTemplateSubject(template.subject)
    setTemplateContent(template.content)
    setShowTemplateForm(true)
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !templateSubject.trim() || !templateContent.trim()) {
      alert('Please fill in all required fields')
      return
    }

    setIsSubmittingTemplate(true)

    try {
      const method = editingTemplate ? 'PUT' : 'POST'
      const body = {
        ...(editingTemplate && { id: editingTemplate.id }),
        name: templateName,
        category: templateCategory,
        subject: templateSubject,
        content: templateContent
      }

      const response = await fetch('/api/admin/email-templates', {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        alert(`Template ${editingTemplate ? 'updated' : 'created'} successfully!`)
        handleCancelTemplateForm()
        loadEmailTemplates() // Reload templates
      } else {
        const error = await response.json()
        alert(`Failed to save template: ${error.message}`)
      }
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template')
    }

    setIsSubmittingTemplate(false)
  }

  const handleDeleteTemplate = async (template: any) => {
    if (template.isBuiltIn) {
      alert('Cannot delete built-in templates')
      return
    }

    const confirmed = confirm(`Are you sure you want to delete "${template.name}"? This action cannot be undone.`)
    if (!confirmed) return

    try {
      const response = await fetch(`/api/admin/email-templates?id=${template.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })

      if (response.ok) {
        alert('Template deleted successfully!')
        loadEmailTemplates() // Reload templates
      } else {
        const error = await response.json()
        alert(`Failed to delete template: ${error.message}`)
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Failed to delete template')
    }
  }

  const handleCancelTemplateForm = () => {
    setShowTemplateForm(false)
    setEditingTemplate(null)
    setTemplateName('')
    setTemplateCategory('MARKETING')
    setTemplateSubject('')
    setTemplateContent('')
  }

  const handleEmailTest = async () => {
    if (!testEmail.trim()) {
      alert('Please enter a test email address')
      return
    }

    setIsTestingEmail(true)
    setEmailTestResult(null)

    try {
      const response = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ testEmail })
      })

      const result = await response.json()
      setEmailTestResult(result)

      if (result.success) {
        alert(`✅ Test email sent successfully!\n\nMessage ID: ${result.details.messageId}\n\nCheck your inbox (and spam folder) for the test email.`)
      } else {
        alert(`❌ Test email failed:\n\n${result.error}\n\nDetails: ${result.details?.errorMessage || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Email test error:', error)
      setEmailTestResult({
        success: false,
        error: 'Network error',
        details: { errorMessage: error instanceof Error ? error.message : 'Unknown error' }
      })
      alert('❌ Test email failed: Network error')
    }

    setIsTestingEmail(false)
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ONBOARDING': return 'bg-green-100 text-green-800'
      case 'MARKETING': return 'bg-purple-100 text-purple-800'
      case 'SUPPORT': return 'bg-blue-100 text-blue-800'
      case 'ANNOUNCEMENTS': return 'bg-orange-100 text-orange-800'
      case 'RETENTION': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
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

    const authToken = sessionStorage.getItem('adminToken') || adminToken
    if (!authToken) {
      alert('Session expired. Please log in again and retry.')
      return
    }

    try {
      const response = await fetch('/api/admin/management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
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
        const error = await response.json().catch(() => ({}))
        const message = error?.error || error?.message || 'Unable to change password'
        if (response.status === 401 && message.toLowerCase().includes('current password')) {
          alert('Current password is incorrect. Please try again.')
          return
        }
        if (response.status === 401) {
          alert('Session expired. Please log out, log back in, and try again.')
          return
        }
        alert(`Failed to change password: ${message}`)
      }
    } catch (error) {
      console.error('Error changing password:', error)
      alert('Failed to change password')
    }
  }

  // Support ticket functions
  const loadSupportTickets = async () => {
    setIsLoadingTickets(true)
    setTicketsError('')
    try {
      // Get token from storage directly to avoid state timing issues
      const authToken = (sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || adminToken || '').trim()
      if (!authToken) {
        setTicketsError('Your admin session expired. Please log in again.')
        setSupportTickets([])
        setIsAuthenticated(false)
        return
      }
      const response = await fetch(`/api/admin/tickets?status=${encodeURIComponent(ticketFilter)}&ts=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        cache: 'no-store'
      })
      const result = await response.json().catch(() => ({}))
      if (response.status === 401) {
        setTicketsError('Your admin session expired. Please log in again.')
        setSupportTickets([])
        sessionStorage.removeItem('adminToken')
        sessionStorage.removeItem('adminUser')
        localStorage.removeItem('adminToken')
        localStorage.removeItem('adminUser')
        setIsAuthenticated(false)
        return
      }
      if (!response.ok) {
        const message = result?.error || result?.message || 'Unable to load support tickets.'
        setTicketsError(message)
        setSupportTickets([])
        return
      }
      if (result?.schemaStatus?.ready === false) {
        setTicketsError(result.schemaStatus?.message || 'Support tickets database is not ready.')
      }
      setSupportTickets(result.tickets || [])
    } catch (error) {
      console.error('Error loading tickets:', error)
      setTicketsError('Unable to load support tickets. Please refresh and try again.')
    }
    setIsLoadingTickets(false)
  }

  const handleTicketAction = async (action: string, ticketId: string, data?: any) => {
    try {
      // Get token from sessionStorage directly to avoid state timing issues
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      const response = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ action, ticketId, ...data })
      })
      
      if (response.ok) {
        loadSupportTickets() // Refresh tickets
        if (action === 'add_response') {
          setTicketResponse('')
          setSelectedTicket(null)
          setShowTicketModal(false)
        }
      }
    } catch (error) {
      console.error('Error handling ticket action:', error)
    }
  }

  const openTicketModal = (ticket: any) => {
    setSelectedTicket(ticket)
    setShowTicketModal(true)
    
    // Auto-populate response with customer greeting - improved name extraction
    let customerName = 'there'
    if (ticket.userName && ticket.userName.trim()) {
      // If userName exists and isn't just email prefix, use it
      if (ticket.userName.includes('@')) {
        // If userName is actually an email, extract name part
        customerName = ticket.userName.split('@')[0]
      } else {
        customerName = ticket.userName
      }
      // Capitalize first letter
      customerName = customerName.charAt(0).toUpperCase() + customerName.slice(1).toLowerCase()
    }
    
    // Create complete template with greeting and signature
    const greeting = `Hi ${customerName},\n\n`
    const signature = `\n\nWarmest Regards,\nHelfi Support Team`
    const completeTemplate = greeting + signature
    setTicketResponse(completeTemplate)
  }

  const sendTicketResponse = async () => {
    if (!selectedTicket || !ticketResponse.trim()) return
    
    // Template already includes greeting and signature, send as-is
    setIsRespondingToTicket(true)
    await handleTicketAction('add_response', selectedTicket.id, {
      message: ticketResponse.trim()
    })
    setIsRespondingToTicket(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800'
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800'
      case 'AWAITING_RESPONSE': return 'bg-blue-100 text-blue-800'
      case 'RESPONDED': return 'bg-purple-100 text-purple-800'
      case 'RESOLVED': return 'bg-gray-100 text-gray-800'
      case 'CLOSED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW': return 'bg-gray-100 text-gray-800'
      case 'MEDIUM': return 'bg-blue-100 text-blue-800'
      case 'HIGH': return 'bg-orange-100 text-orange-800'
      case 'URGENT': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // QR Code Functions
  const generateQRCode = async () => {
    setIsGeneratingQR(true)
    try {
      const response = await fetch('/api/admin/qr-login/start')

      if (response.ok) {
        const data = await response.json()
        setQrCodeUrl(data.url)
        
        // Generate QR code image using qrcode library
        const QRCode = (await import('qrcode')).default
        const qrImageData = await QRCode.toDataURL(data.url, {
          width: 300,
          margin: 2
        })
        setQrCodeData(qrImageData)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('QR generation failed:', errorData)
        alert(`Failed to generate QR code: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error: any) {
      console.error('Error generating QR code:', error)
      alert(`Failed to generate QR code: ${error?.message || 'Network error'}`)
    }
    setIsGeneratingQR(false)
  }

  // Push Notification Functions
  const checkPushNotificationStatus = async () => {
    if (!adminUser?.email || !adminToken) return
    
    setPushNotificationStatus((prev) => ({ ...prev, loading: true }))
    try {
      // Check if admin user has push subscription
      const response = await fetch('/api/admin/push-subscribe', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setPushNotificationStatus({
          subscribed: data.hasSubscription || false,
          loading: false,
          lastUpdated: data.lastUpdated || null
        })
      } else {
        setPushNotificationStatus({ subscribed: false, loading: false, lastUpdated: null })
      }
    } catch (error) {
      console.error('Error checking push status:', error)
      setPushNotificationStatus({ subscribed: false, loading: false, lastUpdated: null })
    }
  }

  const enablePushNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Push notifications are not supported in this browser')
      return
    }

    if (Notification.permission === 'denied') {
      alert('Push notifications were denied. Please enable them in your browser settings.')
      return
    }

    setPushNotificationStatus((prev) => ({ ...prev, loading: true }))

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        alert('Push notifications were denied')
        setPushNotificationStatus({ subscribed: false, loading: false, lastUpdated: null })
        return
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
          ? urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
          : undefined
      })

      // Send subscription to server (using admin API endpoint)
      const response = await fetch('/api/admin/push-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ subscription })
      })

      if (response.ok) {
        setPushNotificationStatus({
          subscribed: true,
          loading: false,
          lastUpdated: new Date().toISOString()
        })
        alert('✅ Push notifications enabled! You will now receive notifications for signups, subscriptions, and credit purchases.')
      } else {
        throw new Error('Failed to save subscription')
      }
    } catch (error: any) {
      console.error('Error enabling push notifications:', error)
      alert(`Failed to enable push notifications: ${error.message}`)
      setPushNotificationStatus({ subscribed: false, loading: false, lastUpdated: null })
    }
  }

  const disablePushNotifications = async () => {
    setPushNotificationStatus((s) => ({ ...s, loading: true }))
    try {
      const response = await fetch('/api/admin/push-subscribe', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (response.ok) {
        setPushNotificationStatus({ subscribed: false, loading: false, lastUpdated: null })
        alert('🔕 Push notifications disabled.')
      } else {
        throw new Error('Failed to unsubscribe')
      }
    } catch (e: any) {
      console.error('Disable push error', e)
      alert(`Failed to disable push notifications: ${e?.message || e}`)
      setPushNotificationStatus((s) => ({ ...s, loading: false }))
    }
  }

  const sendTestOwnerPush = async () => {
    try {
      const res = await fetch('/api/admin/push-test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      if (!res.ok) throw new Error('Failed to send test push')
      alert('✅ Test notification enqueued (via Upstash).')
    } catch (e: any) {
      alert(`Test notification failed: ${e?.message || e}`)
    }
  }

  const sendVercelWebhookTest = async () => {
    setVercelWebhookTestLoading(true)
    try {
      const res = await fetch('/api/admin/vercel-spend-test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to send test webhook')
      alert('✅ Vercel spend webhook test sent. Check your email.')
    } catch (e: any) {
      alert(`Webhook test failed: ${e?.message || e}`)
    } finally {
      setVercelWebhookTestLoading(false)
    }
  }

  const loadSecurityStatus = async (tokenOverride?: string) => {
    const authToken = tokenOverride || adminToken
    if (!authToken) return
    setSecurityStatusLoading(true)
    setSecurityStatusError('')
    try {
      const response = await fetch('/api/admin/security-status', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (response.ok) {
        const result = await response.json()
        setSecurityStatus(result.items || [])
      } else {
        setSecurityStatusError('Unable to load security status.')
      }
    } catch (error) {
      console.error('Error loading security status:', error)
      setSecurityStatusError('Unable to load security status.')
    } finally {
      setSecurityStatusLoading(false)
    }
  }

  const loadPushLogs = async () => {
    try {
      const res = await fetch('/api/admin/push-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      const data = await res.json()
      if (res.ok) {
        setPushLogs(
          (data.logs || []).map((r: any) => ({
            createdAt: r.createdAt || r.createdat,
            event: r.event,
            userEmail: r.userEmail,
            status: r.status,
            info: r.info || ''
          }))
        )
      }
    } catch (e) {
      console.error('loadPushLogs error', e)
    }
  }

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0)
  const formatDollars = (value: number, digits = 2) => `$${safeNumber(value).toFixed(digits)}`
  const costEstimatorUsers = Math.max(0, safeNumber(foodCostEstimatorUsers))
  const costEstimatorAnalysesPerUser = Math.max(0, safeNumber(foodCostEstimatorAnalysesPerUser))
  const costEstimatorCallsPerAnalysis = Math.max(0, safeNumber(foodCostEstimatorCallsPerAnalysis))
  const costEstimatorCostPer1kCalls = Math.max(0, safeNumber(foodCostEstimatorCostPer1kCalls))
  const costEstimatorDailyAnalyses = costEstimatorUsers * costEstimatorAnalysesPerUser
  const costEstimatorDailyCalls = costEstimatorDailyAnalyses * costEstimatorCallsPerAnalysis
  const costEstimatorDailyCost = (costEstimatorDailyCalls / 1000) * costEstimatorCostPer1kCalls
  const costEstimatorMonthlyCost = costEstimatorDailyCost * 30
  const costEstimatorCostPerAnalysis =
    (costEstimatorCallsPerAnalysis / 1000) * costEstimatorCostPer1kCalls

  const liveFoodCallsPerAnalysis = (() => {
    const serverRow = serverCallUsage?.features?.find((row: any) => row.feature === 'foodAnalysis')
    if (serverRow?.callsPerAnalysis && Number.isFinite(serverRow.callsPerAnalysis)) {
      return Number(serverRow.callsPerAnalysis)
    }
    if (foodServerUsage?.estimatedCallsPerAnalysis && Number.isFinite(foodServerUsage.estimatedCallsPerAnalysis)) {
      return Number(foodServerUsage.estimatedCallsPerAnalysis)
    }
    return null
  })()

  useEffect(() => {
    if (!foodEstimatorAutoCalls) return
    if (liveFoodCallsPerAnalysis == null) return
    const normalized = Number(liveFoodCallsPerAnalysis.toFixed(2))
    if (Number.isFinite(normalized) && normalized > 0) {
      setFoodCostEstimatorCallsPerAnalysis(normalized)
    }
  }, [foodEstimatorAutoCalls, liveFoodCallsPerAnalysis])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <Image
              src="/mobile-assets/LOGOS/helfi-01-01.png"
              alt="Helfi Logo"
              width={80}
              height={80}
              className="mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Enter credentials to access analytics dashboard</p>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs mb-6">
            <button
              type="button"
              onClick={() => {
                setUseQrLogin(true)
                setQrLoginToken(null)
                setQrLoginError('')
              }}
              className={`px-3 py-1 rounded-full border ${useQrLogin ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-600'}`}
            >
              QR Login
            </button>
            <button
              type="button"
              onClick={() => {
                setUseQrLogin(false)
                setQrLoginError('')
              }}
              className={`px-3 py-1 rounded-full border ${!useQrLogin ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-600'}`}
            >
              Email + Authenticator
            </button>
          </div>

          {useQrLogin ? (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-700 font-medium">
                  Scan this QR code with your phone to approve the login.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  This uses your phone&apos;s existing admin session.
                </p>
              </div>

              <div className="flex flex-col items-center space-y-3">
                {qrLoginImage ? (
                  <img src={qrLoginImage} alt="Admin QR login" className="border border-gray-200 rounded-lg" />
                ) : (
                  <div className="w-60 h-60 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-500">
                    {qrLoginStatus === 'loading' ? 'Generating QR code…' : 'QR code loading…'}
                  </div>
                )}
                {qrLoginStatus === 'pending' && (
                  <p className="text-xs text-gray-500">Waiting for phone approval…</p>
                )}
                {qrLoginError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm w-full text-center">
                    {qrLoginError}
                  </div>
                )}
                {qrLoginUrl && (
                  <a
                    href={qrLoginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline break-all"
                  >
                    {qrLoginUrl}
                  </a>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={startQrLogin}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Refresh QR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseQrLogin(false)
                    setQrLoginError('')
                  }}
                  className="flex-1 bg-emerald-500 text-white py-2 px-4 rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  Use Email Login
                </button>
              </div>
            </div>
          ) : (
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

              {totpSetupUrl && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-emerald-900 font-medium mb-3">
                    Scan this setup code with your authenticator app.
                  </p>
                  {totpQrData ? (
                    <img src={totpQrData} alt="Authenticator setup QR" className="mx-auto border border-emerald-200 rounded-lg" />
                  ) : (
                    <p className="text-xs text-emerald-700">Loading setup code…</p>
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
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Enter 6-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
              )}

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

              <button
                type="button"
                onClick={() => {
                  setUseQrLogin(true)
                  setQrLoginToken(null)
                  setQrLoginError('')
                }}
                className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Use QR Login Instead
              </button>
            </form>
          )}

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
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center">
            <Image
              src="/mobile-assets/LOGOS/helfi-01-01.png"
              alt="Helfi Logo"
              width={40}
              height={40}
              className="mr-3"
            />
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">Helfi Analytics Dashboard</h1>
              <p className="text-xs sm:text-sm text-gray-600">Real-time user behavior insights</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="sm:hidden mr-1 inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs"
              aria-label="Open menu"
            >
              ☰
            </button>
            <button
              onClick={refreshData}
              className="shrink-0 bg-emerald-500 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors text-xs sm:text-sm"
            >
              🔄 <span className="hidden sm:inline">Refresh Data</span>
              <span className="sm:hidden">Refresh</span>
            </button>
            <button
              onClick={handleLogout}
              className="shrink-0 bg-gray-500 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-xs sm:text-sm"
            >
              🚪 <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu (only essential sections) */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-white border-b border-gray-200 px-4 py-2 z-30">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'usage', label: 'AI Usage' },
              { id: 'affiliates', label: 'Affiliates' },
              { id: 'waitlist', label: 'Waitlist' },
              { id: 'partner-outreach', label: 'Partners' },
              { id: 'users', label: 'Users' },
              { id: 'settings', label: 'Settings' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  handleTabChange(item.id)
                  setMobileMenuOpen(false)
                }}
                className={`w-full py-2 rounded-lg border text-sm ${
                  activeTab === item.id ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="hidden md:block bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6">
          <nav className="flex space-x-4 md:space-x-8 overflow-x-auto whitespace-nowrap no-scrollbar -mx-4 px-4">
            {[
              { id: 'overview', label: '📊 Overview', desc: 'Key metrics' },
              { id: 'usage', label: '💰 AI Usage', desc: 'Vision costs' },
              { id: 'affiliates', label: '🤝 Affiliates', desc: 'Applications & payouts' },
              { id: 'events', label: '📋 Events', desc: 'Raw data' },
              { id: 'insights', label: '🤖 AI Insights', desc: 'OpenAI analysis' },
              { id: 'waitlist', label: '📧 Waitlist', desc: 'Signups' },
              { id: 'partner-outreach', label: '📮 Partners', desc: 'Outreach list' },
              { id: 'users', label: '👥 Users', desc: 'User stats' },
              { id: 'management', label: '🛠️ User Management', desc: 'Manage users' },
              { id: 'templates', label: '📝 Templates', desc: 'Email templates' },
              { id: 'tickets', label: '🎫 Support', desc: 'Customer support' },
              { id: 'settings', label: '⚙️ Settings', desc: 'QR Login & Notifications' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`py-3 md:py-4 px-2 md:px-1 border-b-2 font-medium text-xs sm:text-sm min-w-fit ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center">
                  <span>{tab.label}</span>
                  <span className="text-[10px] sm:text-xs text-gray-400">{tab.desc}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-4 sm:py-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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

        {activeTab === 'usage' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">AI Usage & Cost</h2>
                <p className="text-sm text-gray-600">Feature + user breakdown, per-scan costs, trends, and MTD meter.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm text-gray-600">Range</label>
                <select
                  value={visionUsageRange}
                  onChange={(e) => loadVisionUsage(Number(e.target.value))}
                  className="border-gray-300 rounded-lg text-sm"
                >
                  <option value={1}>Last 24h</option>
                  <option value={7}>Last 7d</option>
                  <option value={30}>Last 30d</option>
                  <option value={90}>Last 90d</option>
                </select>
                <input
                  value={visionUsageUserFilter}
                  onChange={(e) => setVisionUsageUserFilter(e.target.value)}
                  onBlur={() => loadVisionUsage(visionUsageRange, visionUsageUserFilter)}
                  placeholder="Filter by user/email"
                  className="border-gray-300 rounded-lg text-sm px-2 py-1"
                />
                <button
                  onClick={() => loadVisionUsage(visionUsageRange)}
                  className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">Food analysis server usage (estimate)</div>
                  <div className="text-xs text-gray-500">
                    Based on food analysis logs. Estimate assumes 1 analysis call + 1 save + 1 refresh.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Range</label>
                  <select
                    value={foodServerUsageRange}
                    onChange={(e) => loadFoodServerUsage(Number(e.target.value))}
                    className="border-gray-300 rounded-lg text-sm"
                  >
                    <option value={1}>Last 24h</option>
                    <option value={7}>Last 7d</option>
                    <option value={30}>Last 30d</option>
                    <option value={90}>Last 90d</option>
                  </select>
                  <button
                    onClick={() => loadFoodServerUsage(foodServerUsageRange)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {foodServerUsageError && (
                <div className="mt-3 bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                  {foodServerUsageError}
                </div>
              )}

              {foodServerUsageLoading && (
                <div className="mt-3 text-sm text-gray-600">Loading food analysis usage...</div>
              )}

              {!foodServerUsageLoading && foodServerUsage && (
                <>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500 uppercase">Food Analyses</div>
                      <div className="text-xl font-semibold text-gray-900">
                        {foodServerUsage.analysisCount || 0}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500 uppercase">Estimated Calls Per Analysis</div>
                      <div className="text-xl font-semibold text-gray-900">
                        {foodServerUsage.estimatedCallsPerAnalysis || 0}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500 uppercase">Estimated Server Calls</div>
                      <div className="text-xl font-semibold text-gray-900">
                        {foodServerUsage.estimatedTotalServerCalls || 0}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500 uppercase">Fallback Reruns</div>
                      <div className="text-xl font-semibold text-gray-900">
                        {foodServerUsage.fallbackCount || 0}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Estimate math: analyses x calls per analysis. Use this for rough 1000-user planning.
                  </div>
                </>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-semibold text-gray-900">Server cost estimator (food analysis)</div>
                  <div className="text-xs text-gray-500">
                    Uses server calls only. Set your cost per 1,000 calls from Vercel usage.
                  </div>
                </div>
                {liveFoodCallsPerAnalysis != null || foodServerUsage?.estimatedCallsPerAnalysis ? (
                  <button
                    onClick={() => {
                      const next = liveFoodCallsPerAnalysis ?? foodServerUsage.estimatedCallsPerAnalysis
                      if (typeof next === 'number' && Number.isFinite(next)) {
                        setFoodCostEstimatorCallsPerAnalysis(Number(next.toFixed(2)))
                        setFoodEstimatorAutoCalls(true)
                      }
                    }}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-xs hover:bg-gray-200"
                  >
                    Use current estimate ({liveFoodCallsPerAnalysis?.toFixed?.(2) ?? foodServerUsage.estimatedCallsPerAnalysis})
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Users</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={foodCostEstimatorUsers}
                    onChange={(e) => setFoodCostEstimatorUsers(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Analyses per user per day</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={foodCostEstimatorAnalysesPerUser}
                    onChange={(e) => setFoodCostEstimatorAnalysesPerUser(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Calls per analysis</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={foodCostEstimatorCallsPerAnalysis}
                    onChange={(e) => {
                      setFoodCostEstimatorCallsPerAnalysis(Number(e.target.value))
                      setFoodEstimatorAutoCalls(false)
                    }}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Cost per 1,000 calls ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    value={foodCostEstimatorCostPer1kCalls}
                    onChange={(e) => setFoodCostEstimatorCostPer1kCalls(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase">Analyses per day</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {costEstimatorDailyAnalyses.toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase">Server calls per day</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {costEstimatorDailyCalls.toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase">Estimated cost per day</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {formatDollars(costEstimatorDailyCost, 4)}
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500 uppercase">Estimated cost per 30 days</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {formatDollars(costEstimatorMonthlyCost, 2)}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Cost per analysis: {formatDollars(costEstimatorCostPerAnalysis, 6)}. This excludes AI model costs.
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-semibold text-gray-900">Calls per analysis (by feature)</div>
                  <div className="text-xs text-gray-500">
                    Counts analysis calls plus credit meter refreshes that were tagged to a feature.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Range</label>
                  <select
                    value={serverCallUsageRange}
                    onChange={(e) => loadServerCallUsage(Number(e.target.value))}
                    className="border-gray-300 rounded-lg text-sm"
                  >
                    <option value={1}>Last 24h</option>
                    <option value={7}>Last 7d</option>
                    <option value={30}>Last 30d</option>
                    <option value={90}>Last 90d</option>
                  </select>
                  <button
                    onClick={() => loadServerCallUsage(serverCallUsageRange)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {serverCallUsageError && (
                <div className="mt-3 bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                  {serverCallUsageError}
                </div>
              )}

              {serverCallUsageLoading && (
                <div className="mt-3 text-sm text-gray-600">Loading server call usage...</div>
              )}

              {!serverCallUsageLoading && serverCallUsage && (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead>
                      <tr className="text-xs uppercase text-gray-500 border-b">
                        <th className="py-2 pr-4">Feature</th>
                        <th className="py-2 pr-4">Analyses</th>
                        <th className="py-2 pr-4">Extra Calls</th>
                        <th className="py-2 pr-4">Total Calls</th>
                        <th className="py-2">Calls / Analysis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(serverCallUsage.features || []).map((row: any) => {
                        const labelMap: Record<string, string> = {
                          foodAnalysis: 'Food analysis',
                          packagedFoodLabel: 'Packaged food label',
                          symptomAnalysis: 'Symptom analysis',
                          medicalImageAnalysis: 'Medical image analysis',
                          interactionAnalysis: 'Interaction analysis',
                          healthTips: 'Health tips',
                        }
                        const label = labelMap[row.feature] || row.feature
                        const callsPerAnalysis =
                          row.callsPerAnalysis == null ? '—' : row.callsPerAnalysis.toFixed(2)
                        return (
                          <tr key={row.feature} className="border-b last:border-b-0">
                            <td className="py-2 pr-4 font-medium text-gray-900">{label}</td>
                            <td className="py-2 pr-4">{row.analysisCalls || 0}</td>
                            <td className="py-2 pr-4">{row.extraCalls || 0}</td>
                            <td className="py-2 pr-4">{row.totalCalls || 0}</td>
                            <td className="py-2">{callsPerAnalysis}</td>
                          </tr>
                        )
                      })}
                      {(!serverCallUsage.features || serverCallUsage.features.length === 0) && (
                        <tr>
                          <td colSpan={5} className="py-3 text-gray-500">
                            No call data yet. Trigger a few analyses and refresh.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {visionUsageError && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                {visionUsageError}
              </div>
            )}

            {visionUsageLoading && (
              <div className="bg-white rounded-lg shadow p-6 text-gray-600">Loading usage...</div>
            )}

            {!visionUsageLoading && visionUsage && (
              <>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="font-semibold text-gray-900">Vendor totals (OpenAI)</div>
                      <div className="text-xs text-gray-500">
                        This is the “invoice truth” if OpenAI exposes totals for your account via API. If not, we fall back to Helfi logs below.
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      Range: {visionUsage?.billing?.range?.startDate || '—'} → {visionUsage?.billing?.range?.endDate || '—'}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500 uppercase">Vendor Cost (Range)</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {typeof visionUsage?.billing?.range?.costUsd === 'number'
                          ? `$${Number(visionUsage.billing.range.costUsd).toFixed(2)}`
                          : visionUsage?.billing?.range?.totalUsageCents
                          ? `$${(Number(visionUsage.billing.range.totalUsageCents) / 100).toFixed(2)}`
                          : 'Unavailable'}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500 uppercase">Vendor Cost (MTD)</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {typeof visionUsage?.billing?.monthToDate?.costUsd === 'number'
                          ? `$${Number(visionUsage.billing.monthToDate.costUsd).toFixed(2)}`
                          : visionUsage?.billing?.monthToDate?.totalUsageCents
                          ? `$${(Number(visionUsage.billing.monthToDate.totalUsageCents) / 100).toFixed(2)}`
                          : 'Unavailable'}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[11px] text-gray-500 uppercase">Status</div>
                      <div className="text-sm font-medium text-gray-900">
                        {visionUsage?.billing?.range?.totalUsageCents != null || typeof visionUsage?.billing?.range?.costUsd === 'number'
                          ? 'OK'
                          : 'Not supported'}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Endpoint: {visionUsage?.keyStatus?.baseUrl || 'api.openai.com'}
                      </div>
                    </div>
                  </div>

                  {visionUsage?.billing?.range?.error && (
                    <details className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm">
                      <summary className="cursor-pointer font-medium">Why vendor totals are unavailable</summary>
                      <div className="mt-2 text-xs text-amber-900 whitespace-pre-wrap">
                        {String(visionUsage.billing.range.error)}
                      </div>
                    </details>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-xs text-gray-500 uppercase">Estimated Cost (Range)</div>
                    <div className="text-2xl font-bold text-blue-600">
                      ${((Number(visionUsage?.totals?.rangeCostCentsFromLogs || 0) || 0) / 100).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-gray-500">From Helfi logs + OpenAI rate card</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-xs text-gray-500 uppercase">Tokens (P/C)</div>
                    <div className="text-lg font-semibold text-purple-600">
                      {(visionUsage?.billing?.range?.tokenTotals?.promptTokens ??
                        visionUsage?.totals?.totalPromptTokens ??
                        0
                      ).toLocaleString()}{' '}
                      /
                      {(visionUsage?.billing?.range?.tokenTotals?.completionTokens ??
                        visionUsage?.totals?.totalCompletionTokens ??
                        0
                      ).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {visionUsage?.billing?.range?.tokenTotals ? 'From OpenAI usage API' : 'From Helfi logs (best-effort)'}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-xs text-gray-500 uppercase">Total Calls</div>
                    <div className="text-2xl font-bold text-emerald-600">{visionUsage?.totals?.totalCalls || 0}</div>
                    <div className="text-[11px] text-gray-500">In selected range</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-xs text-gray-500 uppercase">Features</div>
                    <div className="text-2xl font-bold text-gray-800">{visionUsage.features || 0}</div>
                    <div className="text-[11px] text-gray-500">Tracked in Helfi logs</div>
                  </div>
                </div>

                {visionUsage?.spikeAlert && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4">
                    <div className="font-semibold">Daily cost spike detected</div>
                    <div className="text-sm">
                      Today: ${(Number(visionUsage.spikeAlert.todayCostCents || 0) / 100).toFixed(2)} vs Yesterday: ${(Number(visionUsage.spikeAlert.yesterdayCostCents || 0) / 100).toFixed(2)} (
                      {Number(visionUsage.spikeAlert.increasePct || 0).toFixed(1)}% increase)
                    </div>
                  </div>
                )}

                <details className="bg-white rounded-lg shadow overflow-hidden">
                  <summary className="cursor-pointer select-none p-4 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Breakdowns (Feature + User)</span>
                    <span className="text-xs text-gray-500">Expand to view tables</span>
                  </summary>
                  <div className="p-4 space-y-4">
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 text-sm">
                      Costs use Helfi request logs + OpenAI rate card (no markup). If a feature can't be mapped cleanly you'll see “Not available yet”.
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                          <h3 className="font-semibold text-gray-900">Breakdown by Feature</h3>
                          <span className="text-xs text-gray-500">Requests · Tokens · Cost</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Feature</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Requests</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Tokens</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Cost</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Model · Max Res</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-sm">
                              {Object.entries<any>(visionUsage.featureSummary || {})
                                .sort((a, b) => Number((b[1] as any).costCents || 0) - Number((a[1] as any).costCents || 0))
                                .slice(0, 12)
                                .map(([feature, stats]) => {
                                  const models = (Object.entries((stats as any).models || {}) as Array<[string, any]>)
                                    .map(([k, v]) => [k, Number(v || 0)] as [string, number])
                                    .sort((a, b) => b[1] - a[1])
                                  const topModel = models[0]?.[0] || 'n/a'
                                  const costValue = Number((stats as any).costCents)
                                  const res =
                                    (stats as any).maxWidth && (stats as any).maxHeight
                                      ? `${(stats as any).maxWidth}x${(stats as any).maxHeight}`
                                      : 'n/a'
                                  return (
                                    <tr key={feature} className="hover:bg-gray-50">
                                      <td className="px-4 py-3 font-medium text-gray-900">{feature}</td>
                                      <td className="px-4 py-3 text-gray-700">{(stats as any).count}</td>
                                      <td className="px-4 py-3 text-gray-700">
                                        {(stats as any).promptTokens?.toLocaleString?.() || (stats as any).promptTokens} /
                                        {(stats as any).completionTokens?.toLocaleString?.() || (stats as any).completionTokens}
                                      </td>
                                      <td className="px-4 py-3 text-gray-700">
                                        {Number.isFinite(costValue) ? `$${(costValue / 100).toFixed(2)}` : 'Not available yet'}
                                      </td>
                                      <td className="px-4 py-3 text-gray-700">
                                        {topModel} • {res}
                                      </td>
                                    </tr>
                                  )
                                })}
                              {Object.keys(visionUsage.featureSummary || {}).length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                    No usage recorded for this range yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {Object.keys(visionUsage.featureSummary || {}).length > 12 && (
                          <div className="p-3 text-xs text-gray-500 border-t border-gray-200">
                            Showing top 12. Use the user/email filter above to narrow results.
                          </div>
                        )}
                      </div>

                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                          <h3 className="font-semibold text-gray-900">Breakdown by User</h3>
                          <span className="text-xs text-gray-500">Top spenders</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">User</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Requests</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Cost</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Top Features</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-sm">
                              {Object.entries<any>(visionUsage.userSummary || {})
                                .sort((a, b) => Number((b[1] as any).costCents || 0) - Number((a[1] as any).costCents || 0))
                                .slice(0, 12)
                                .map(([userKey, stats]) => {
                                  const featureList = (Object.entries((stats as any).features || {}) as Array<[string, any]>)
                                    .map(([f, c]) => [f, Number(c || 0)] as [string, number])
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 2)
                                    .map(([f, c]) => `${f} (${c})`)
                                    .join(', ')
                                  const rawCostCents = Number((stats as any).costCents)
                                  const costUsd = Number.isFinite(rawCostCents) ? rawCostCents / 100 : null
                                  const status =
                                    (stats as any).count > 50 || (costUsd ?? 0) > 5
                                      ? '🚩 FLAG'
                                      : (stats as any).count > 20
                                      ? '⚠️ Watch'
                                      : '✅ OK'
                                  return (
                                    <tr key={userKey} className="hover:bg-gray-50">
                                      <td className="px-4 py-3 font-medium text-gray-900">{(stats as any).label || userKey}</td>
                                      <td className="px-4 py-3 text-gray-700">{(stats as any).count}</td>
                                      <td className="px-4 py-3 text-gray-700">
                                        {costUsd !== null ? `$${costUsd.toFixed(2)}` : 'Not available yet'}
                                      </td>
                                      <td className="px-4 py-3 text-gray-700">{featureList || 'n/a'}</td>
                                      <td className="px-4 py-3 text-gray-700">{status}</td>
                                    </tr>
                                  )
                                })}
                              {Object.keys(visionUsage.userSummary || {}).length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                    No user usage yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {Object.keys(visionUsage.userSummary || {}).length > 12 && (
                          <div className="p-3 text-xs text-gray-500 border-t border-gray-200">
                            Showing top 12. Use the user/email filter above to narrow results.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </details>

                <details className="bg-white rounded-lg shadow overflow-hidden">
                  <summary className="cursor-pointer select-none p-4 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Trend (Cost per Day)</span>
                    <span className="text-xs text-gray-500">Expand to view chart</span>
                  </summary>
                  <div className="p-4 space-y-2">
                    {(!visionUsage.trend || visionUsage.trend.length === 0) && (
                      <div className="text-sm text-gray-600">No data for this range.</div>
                    )}
                    {visionUsage.trend &&
                      visionUsage.trend.map((row: any) => {
                        const maxCost = Math.max(...visionUsage.trend.map((t: any) => Number(t.costCents || 0)), 1)
                        const pct = Math.min(100, Math.round((Number(row.costCents || 0) / maxCost) * 100))
                        return (
                          <div key={row.day} className="flex items-center gap-2 text-sm">
                            <div className="w-24 text-gray-700">{row.day}</div>
                            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-3 rounded-full"
                                style={{ width: `${pct}%` }}
                                title={`$${(Number(row.costCents || 0) / 100).toFixed(2)}`}
                              />
                            </div>
                            <div className="w-24 text-right text-gray-700">
                              ${(Number(row.costCents || 0) / 100).toFixed(2)}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </details>

                <details className="bg-white rounded-lg shadow overflow-hidden">
                  <summary className="cursor-pointer select-none p-4 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Recent Scans (per-image)</span>
                    <span className="text-xs text-gray-500">Expand to view list</span>
                  </summary>
                  <div className="divide-y divide-gray-200">
                    {visionRecent.length === 0 && (
                      <div className="p-4 text-sm text-gray-600">No recent entries.</div>
                    )}
                    {visionRecent.map((entry, idx) => (
                      <div key={idx} className="p-4 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-gray-900">
                            {entry.scanId || entry.feature} • {entry.feature} {entry.expensive ? '🚨' : ''}
                          </div>
                          <div className="text-sm text-gray-700">
                            Cost: ${Number(entry.costUsd || 0).toFixed(4)} | Tokens: {entry.tokens?.toLocaleString?.() || entry.tokens}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                          <span>{entry.timestampIso}</span>
                          <span>{entry.model}</span>
                          <span>{entry.imageWidth && entry.imageHeight ? `${entry.imageWidth}x${entry.imageHeight}` : 'n/a'}</span>
                          <span>{entry.imageMime || 'mime n/a'}</span>
                          <span>User: {entry.userLabel || entry.userId || 'unknown'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}

            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Food Analysis Cost Simulator</h3>
                  <p className="text-sm text-gray-600">
                    Uses recent Helfi usage logs to estimate what switching models (e.g. GPT‑5.2) would cost per food image analysis.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-sm text-gray-600">Range</label>
                  <select
                    value={foodCostSimRange}
                    onChange={(e) => loadFoodCostSim(Number(e.target.value))}
                    className="border-gray-300 rounded-lg text-sm"
                  >
                    <option value={1}>Last 24h</option>
                    <option value={7}>Last 7d</option>
                    <option value={30}>Last 30d</option>
                    <option value={90}>Last 90d</option>
                  </select>
                  <button
                    onClick={() => loadFoodCostSim(foodCostSimRange)}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {foodCostSimError && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                  {foodCostSimError}
                </div>
              )}

              {foodCostSimLoading && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
                  Loading food cost simulation…
                </div>
              )}

              {!foodCostSimLoading && foodCostSim && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500">Samples</div>
                      <div className="text-xl font-semibold text-gray-900">{foodCostSim.samples || 0}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500">Avg Prompt Tokens</div>
                      <div className="text-xl font-semibold text-gray-900">{foodCostSim.averages?.promptTokens || 0}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500">Avg Completion Tokens</div>
                      <div className="text-xl font-semibold text-gray-900">{foodCostSim.averages?.completionTokens || 0}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500">Avg Total Tokens</div>
                      <div className="text-xl font-semibold text-gray-900">{foodCostSim.averages?.totalTokens || 0}</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Model</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Vendor $ (est)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Billed Credits</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Analyses / $20 Plan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-sm">
                        {(foodCostSim.simulations || []).map((s: any) => (
                          <tr key={s.model} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{s.model}</td>
                            <td className="px-4 py-3 text-gray-700">
                              ${((Number(s.vendorCostCents || 0) || 0) / 100).toFixed(4)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">{Number(s.billedCostCents || 0)}</td>
                            <td className="px-4 py-3 text-gray-700">{Number(s.analysesPer1400Credits || 0)}</td>
                          </tr>
                        ))}
                        {(foodCostSim.simulations || []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                              Not enough data yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-xs text-gray-500">
                    Credits are cents. “Billed credits” includes Helfi markup; “Vendor $” is raw estimated OpenAI cost for the same tokens.
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Food Model Benchmark (Image URL)</h3>
                <p className="text-sm text-gray-600">
                  Runs a simplified image-analysis prompt on selected models and returns token usage + a short output preview.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">Public Image URL</label>
                  <input
                    value={foodBenchmarkImageUrl}
                    onChange={(e) => setFoodBenchmarkImageUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full border-gray-300 rounded-lg text-sm px-3 py-2"
                  />
                  <div className="text-xs text-gray-500 mt-1">Must be publicly accessible (https://).</div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Models</label>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.keys(foodBenchmarkModels).map((m) => (
                      <label key={m} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={foodBenchmarkModels[m]}
                          onChange={(e) => setFoodBenchmarkModels((prev) => ({ ...prev, [m]: e.target.checked }))}
                          className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                        />
                        <span className="text-gray-700">{m}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={runFoodBenchmark}
                  disabled={foodBenchmarkLoading || !foodBenchmarkImageUrl.trim()}
                  className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {foodBenchmarkLoading ? 'Running…' : 'Run Benchmark'}
                </button>
                <button
                  onClick={() => {
                    setFoodBenchmarkResult(null)
                    setFoodBenchmarkError('')
                  }}
                  className="px-3 py-2 bg-gray-100 text-gray-800 rounded-md text-sm hover:bg-gray-200"
                >
                  Clear
                </button>
              </div>

              {foodBenchmarkError && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                  {foodBenchmarkError}
                </div>
              )}

              {foodBenchmarkResult && (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Model</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Prompt</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Completion</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Vendor $</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Billed Credits</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-sm">
                        {(foodBenchmarkResult.results || []).map((r: any) => (
                          <tr key={r.model} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{r.model}</td>
                            <td className="px-4 py-3 text-gray-700">{Number(r.promptTokens || 0)}</td>
                            <td className="px-4 py-3 text-gray-700">{Number(r.completionTokens || 0)}</td>
                            <td className="px-4 py-3 text-gray-700">
                              ${((Number(r.vendorCostCents || 0) || 0) / 100).toFixed(4)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">{Number(r.billedCostCents || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(foodBenchmarkResult.results || []).map((r: any) => (
                    <div key={`${r.model}-preview`} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-xs font-semibold text-gray-700 mb-2">{r.model} output preview</div>
                      <pre className="whitespace-pre-wrap text-xs text-gray-800">{r.outputPreview}</pre>
                    </div>
                  ))}

                  <div className="text-xs text-gray-500">{foodBenchmarkResult.note}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'affiliates' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Affiliate Applications</h2>
                  <p className="text-sm text-gray-600">Review and approve affiliate applications.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={affiliateStatusFilter}
                    onChange={(e) => setAffiliateStatusFilter(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="PENDING_REVIEW">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="ALL">All</option>
                  </select>
                  <button
                    onClick={() => loadAffiliateApplications()}
                    className="bg-emerald-600 text-white px-3 py-2 rounded-md text-sm hover:bg-emerald-700"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {affiliateLoading && <div className="mt-4 text-sm text-gray-500">Loading applications…</div>}
              {affiliateError && <div className="mt-4 text-sm text-red-600">{affiliateError}</div>}

              {!affiliateLoading && !affiliateError && affiliateApplications.length === 0 && (
                <div className="mt-4 text-sm text-gray-500">No applications found.</div>
              )}

              <div className="mt-6 space-y-4">
                {affiliateApplications.map((app) => (
                  <div key={app.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">{app.name}</div>
                        <div className="text-xs text-gray-500">{app.email}</div>
                        {app.website && (
                          <a
                            href={app.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-emerald-700 underline"
                          >
                            {app.website}
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        <div>Status: <span className="font-semibold text-gray-700">{app.status}</span></div>
                        <div>Risk: <span className="font-semibold text-gray-700">{app.riskLevel || '—'}</span></div>
                        <div>Recommendation: <span className="font-semibold text-gray-700">{app.recommendation || '—'}</span></div>
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-gray-700">
                      <div>
                        Channel: <span className="font-medium">{app.primaryChannel || '—'}</span>
                        {app.primaryChannelOther ? ` (${app.primaryChannelOther})` : ''}
                      </div>
                      <div>Audience: <span className="font-medium">{app.audienceSize || '—'}</span></div>
                      <div>Submitted: <span className="font-medium">{new Date(app.createdAt).toLocaleString()}</span></div>
                      <div>Terms: <span className="font-medium">{app.termsVersion || '—'}</span></div>
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-emerald-700">View details</summary>
                      <div className="mt-2 text-sm text-gray-700 space-y-2">
                        <div><span className="font-medium">Promotion method:</span> {app.promotionMethod || '—'}</div>
                        {app.aiReasoning && (
                          <div><span className="font-medium">AI reasoning:</span> {app.aiReasoning}</div>
                        )}
                        {app.notes && (
                          <div><span className="font-medium">Notes:</span> {app.notes}</div>
                        )}
                        <div className="text-xs text-gray-500">
                          Location: {[app.city, app.region, app.country].filter(Boolean).join(', ') || '—'}
                        </div>
                        <div className="text-xs text-gray-500">IP: {app.ip || '—'}</div>
                      </div>
                    </details>

                    {app.status === 'PENDING_REVIEW' && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleAffiliateDecision(app.id, 'approve')}
                          disabled={!!affiliateActionLoading[app.id]}
                          className="bg-emerald-600 text-white px-3 py-2 rounded-md text-sm hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAffiliateDecision(app.id, 'reject')}
                          disabled={!!affiliateActionLoading[app.id]}
                          className="bg-red-600 text-white px-3 py-2 rounded-md text-sm hover:bg-red-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Affiliate Payout Run</h2>
                  <p className="text-sm text-gray-600">Process Net‑30 payouts via Stripe Connect.</p>
                </div>
                <button
                  onClick={() => runAffiliatePayout(true)}
                  disabled={payoutLoading}
                  className="bg-gray-900 text-white px-3 py-2 rounded-md text-sm hover:bg-black disabled:opacity-60"
                >
                  {payoutLoading ? 'Running…' : 'Dry Run'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Currency</label>
                  <input
                    value={payoutCurrency}
                    onChange={(e) => setPayoutCurrency(e.target.value.toLowerCase())}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Min threshold (cents)</label>
                  <input
                    type="number"
                    min={0}
                    value={payoutMinThreshold}
                    onChange={(e) => setPayoutMinThreshold(Number(e.target.value))}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="payout-dry-run"
                    type="checkbox"
                    checked={payoutDryRun}
                    onChange={(e) => setPayoutDryRun(e.target.checked)}
                  />
                  <label htmlFor="payout-dry-run" className="text-sm text-gray-700">Default to dry run</label>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => runAffiliatePayout()}
                  disabled={payoutLoading}
                  className="bg-emerald-600 text-white px-3 py-2 rounded-md text-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {payoutLoading ? 'Running…' : 'Run Payout'}
                </button>
              </div>

              {payoutError && <div className="mt-3 text-sm text-red-600">{payoutError}</div>}
              {payoutResult && (
                <div className="mt-3 text-sm text-gray-700">
                  <div>Transfer count: <span className="font-medium">{payoutResult.transferCount || 0}</span></div>
                  <div>Total cents: <span className="font-medium">{payoutResult.totalCents || 0}</span></div>
                  {payoutResult.dryRun && (
                    <div className="text-xs text-gray-500 mt-1">Dry run completed.</div>
                  )}
                </div>
              )}
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
                    onClick={async () => {
                      if (selectedEmails.length === 0) {
                        alert('Please select at least one email address')
                        return
                      }
                      
                      const confirmed = confirm(`Send launch email to ${selectedEmails.length} recipients: ${selectedEmails.join(', ')}?`)
                      if (!confirmed) return
                      
                      // Send email directly without modal
                      const response = await fetch('/api/admin/send-emails', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${adminToken}`
                        },
                        body: JSON.stringify({
                          emails: selectedEmails,
                          subject: '🎉 Helfi is now live! Your personal AI health coach awaits',
                          message: `Hi {name},

Great news! Helfi is officially live and ready to transform your health journey.

As a valued waitlist member, you get:
✅ 14-day free trial with full premium access
✅ 30 AI food analyses per day + 30 medical image analyses  
✅ Complete medication interaction checking
✅ Priority support from our team

Ready to start your AI-powered health transformation?

[Get Started Now - helfi.ai]

Thank you for your patience and support,
The Helfi Team`,
                          waitlistData: waitlistData.filter(entry => selectedEmails.includes(entry.email)),
                          emailType: 'marketing',
                          reasonText: 'You received this email because you joined the Helfi waitlist.'
                        })
                      })

                      if (response.ok) {
                        alert(`✅ Successfully sent launch emails to ${selectedEmails.length} recipients!`)
                        setSelectedEmails([])
                      } else {
                        const error = await response.json()
                        alert(`❌ Failed to send emails: ${error.message}`)
                      }
                    }}
                    disabled={selectedEmails.length === 0}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📧 Send Launch Email
                  </button>
                  <button
                    onClick={handleStartCustomEmail}
                    disabled={selectedEmails.length === 0}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✏️ Custom Email
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Email Composition Interface */}
            {showCustomEmailInterface && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900">✏️ Compose Custom Email</h3>
                    <p className="text-sm text-blue-700">
                      Sending to {selectedEmails.length} recipients: {selectedEmails.join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={handleCancelCustomEmail}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Subject Line */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Line <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customEmailSubject}
                      onChange={(e) => setCustomEmailSubject(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                      placeholder="Enter email subject..."
                      autoFocus
                    />
                  </div>

                  {/* Message Body */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Message <span className="text-red-500">*</span>
                      <span className="text-xs text-gray-500 ml-2">(Use {'{name}'} to personalize with recipient names)</span>
                    </label>
                    <textarea
                      value={customEmailMessage}
                      onChange={(e) => setCustomEmailMessage(e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base leading-relaxed"
                      placeholder="Enter your email message..."
                    />
                  </div>

                  {/* Preview Section */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">📧 Email Preview</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div><strong>To:</strong> {selectedEmails.length} recipients</div>
                      <div><strong>Subject:</strong> {customEmailSubject || 'No subject'}</div>
                      <div className="max-h-20 overflow-y-auto">
                        <strong>Message:</strong> {customEmailMessage.slice(0, 200)}
                        {customEmailMessage.length > 200 && '...'}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <button
                      onClick={handleCancelCustomEmail}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendCustomEmail}
                      disabled={isComposingEmail || !customEmailSubject.trim() || !customEmailMessage.trim()}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
                    >
                      {isComposingEmail ? (
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
                    <div className="flex items-center gap-3">
                      {selectedEmails.length > 0 && (
                        <button
                          onClick={handleBulkDeleteWaitlistEntries}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Selected ({selectedEmails.length})
                        </button>
                      )}
                      <button
                        onClick={handleSelectAll}
                        className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        {selectedEmails.length === waitlistData.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {waitlistData.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => handleDeleteWaitlistEntry(entry.id, entry.email)}
                                className="text-red-600 hover:text-red-800 font-medium transition-colors"
                                title="Delete entry"
                              >
                                Delete
                              </button>
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

        {activeTab === 'partner-outreach' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Partner Outreach</h3>
                  <p className="text-sm text-gray-600">
                    {selectedPartnerEmails.length > 0
                      ? `${selectedPartnerEmails.length} recipients selected`
                      : 'Select recipients to send emails'
                    }
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleInitPartnerOutreach}
                    className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    🔄 Load Default List
                  </button>
                  <button
                    onClick={handleStartPartnerEmail}
                    disabled={selectedPartnerEmails.length === 0}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📧 Compose Email
                  </button>
                </div>
              </div>
            </div>

            {showPartnerEmailInterface && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-emerald-900">📮 Compose Partner Outreach Email</h3>
                    <p className="text-sm text-emerald-700">
                      Sending to {selectedPartnerEmails.length} recipients
                    </p>
                  </div>
                  <button
                    onClick={handleCancelPartnerEmail}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Line <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={partnerEmailSubject}
                      onChange={(e) => setPartnerEmailSubject(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg"
                      placeholder="Enter email subject..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Message <span className="text-red-500">*</span>
                      <span className="text-xs text-gray-500 ml-2">(Use {'{name}'}, {'{company}'}, {'{region}'})</span>
                    </label>
                    <textarea
                      value={partnerEmailMessage}
                      onChange={(e) => setPartnerEmailMessage(e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base leading-relaxed"
                      placeholder="Enter your email content..."
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <button
                      onClick={handleCancelPartnerEmail}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendPartnerEmail}
                      disabled={isComposingPartnerEmail || !partnerEmailSubject.trim() || !partnerEmailMessage.trim()}
                      className="px-6 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
                    >
                      {isComposingPartnerEmail ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          📧 Send to {selectedPartnerEmails.length} Recipients
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Partner Contacts</h3>
                    <p className="text-sm text-gray-600">
                      {isLoadingPartnerOutreach ? 'Loading...' : `${partnerOutreachData.length} contacts`}
                    </p>
                  </div>
                  {partnerOutreachData.length > 0 && (
                    <div className="flex items-center gap-3">
                      {selectedPartnerEmails.length > 0 && (
                        <button
                          onClick={handleBulkDeletePartnerContacts}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Selected ({selectedPartnerEmails.length})
                        </button>
                      )}
                      <button
                        onClick={handlePartnerSelectAll}
                        className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        {selectedPartnerEmails.length === partnerOutreachData.filter(entry => entry.email).length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isLoadingPartnerOutreach ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                  <span className="ml-3 text-gray-600">Loading partner contacts...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={partnerOutreachData.some(entry => entry.email) && selectedPartnerEmails.length === partnerOutreachData.filter(entry => entry.email).length}
                            onChange={handlePartnerSelectAll}
                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Company
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Region
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Notes
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {partnerOutreachData.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                            No partner contacts yet. Use "Load Default List" to seed the list.
                          </td>
                        </tr>
                      ) : (
                        partnerOutreachData.map((entry, index) => (
                          <tr key={entry.id || index} className={selectedPartnerEmails.includes(entry.email) ? 'bg-emerald-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={Boolean(entry.email) && selectedPartnerEmails.includes(entry.email)}
                                onChange={() => handlePartnerEmailSelect(entry.email)}
                                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                                disabled={!entry.email}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {entry.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {entry.company}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {entry.email || 'Form only'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {entry.region || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {entry.notes || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => handleDeletePartnerContact(entry.id, entry.email, `${entry.name} (${entry.company})`)}
                                className="text-red-600 hover:text-red-800 font-medium transition-colors"
                                title="Delete contact"
                              >
                                Delete
                              </button>
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
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-lg font-semibold text-gray-800 mb-2">Device Interest</div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span>Apple Watch</span>
                        <span className="font-bold text-emerald-600">{userStats.deviceInterest?.appleWatch || 0}</span>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span>Fitbit</span>
                        <span className="font-bold text-emerald-600">{userStats.deviceInterest?.fitbit || 0}</span>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span>Garmin</span>
                        <span className="font-bold text-emerald-600">{userStats.deviceInterest?.garmin || 0}</span>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span>Samsung Health</span>
                        <span className="font-bold text-emerald-600">{userStats.deviceInterest?.samsung || 0}</span>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span>Google Fit</span>
                        <span className="font-bold text-emerald-600">{userStats.deviceInterest?.googleFit || 0}</span>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span>Oura Ring</span>
                        <span className="font-bold text-emerald-600">{userStats.deviceInterest?.oura || 0}</span>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span>Polar</span>
                        <span className="font-bold text-emerald-600">{userStats.deviceInterest?.polar || 0}</span>
                      </div>
                    </div>
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
                    <option value="premium">Premium Plan</option>
                    <option value="non-subscribed">Non-Subscribed</option>
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

            {/* User Email Campaign */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">User Email Campaign</h3>
                  <p className="text-sm text-gray-600">
                    {selectedUserEmails.length > 0 
                      ? `${selectedUserEmails.length} users selected` 
                      : 'Select users to send emails'
                    }
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Quick Selection Buttons */}
                  <button
                    onClick={() => handleSelectByTier('all')}
                    className="bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                  >
                    👥 All Users ({managedUsers.length})
                  </button>
                  <button
                    onClick={() => handleSelectByTier('premium')}
                    className="bg-emerald-500 text-white px-3 py-2 rounded-lg hover:bg-emerald-600 transition-colors text-sm"
                  >
                    💎 Premium Users ({managedUsers.filter(u => u.subscription?.plan === 'PREMIUM').length})
                  </button>
                  <button
                    onClick={() => handleSelectByTier('non-subscribed')}
                    className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm"
                  >
                    👤 Non-Subscribed Users ({managedUsers.filter(u => !u.subscription?.plan).length})
                  </button>
                </div>
              </div>

              {/* Email Template Buttons */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <button
                  onClick={() => handleStartUserEmail('welcome')}
                  disabled={selectedUserEmails.length === 0}
                  className="bg-green-500 text-white px-4 py-3 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  🎉 Welcome Email
                </button>
                <button
                  onClick={() => handleStartUserEmail('premium_upgrade')}
                  disabled={selectedUserEmails.length === 0}
                  className="bg-purple-500 text-white px-4 py-3 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  🔥 Upgrade to Premium
                </button>
                <button
                  onClick={() => handleStartUserEmail('engagement')}
                  disabled={selectedUserEmails.length === 0}
                  className="bg-orange-500 text-white px-4 py-3 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  🌟 Re-engagement
                </button>
                <button
                  onClick={() => handleStartUserEmail('feature_announcement')}
                  disabled={selectedUserEmails.length === 0}
                  className="bg-indigo-500 text-white px-4 py-3 rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  🆕 New Features
                </button>
                <button
                  onClick={() => handleStartUserEmail('support_followup')}
                  disabled={selectedUserEmails.length === 0}
                  className="bg-teal-500 text-white px-4 py-3 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  🤝 Support Follow-up
                </button>
                <button
                  onClick={() => handleStartUserEmail('custom')}
                  disabled={selectedUserEmails.length === 0}
                  className="bg-gray-500 text-white px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  ✏️ Custom Email
                </button>
              </div>
            </div>

            {/* Bulk Delete Section - Separate and clearly marked as dangerous */}
            {selectedUserEmails.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-red-900">⚠️ Danger Zone</h3>
                    <p className="text-sm text-red-700">
                      Permanently delete {selectedUserEmails.length} selected user account(s) and ALL their data
                    </p>
                  </div>
                </div>
                <div className="bg-red-100 p-4 rounded-lg mb-4">
                  <p className="text-sm text-red-800 font-medium mb-2">
                    ⚠️ WARNING: This action cannot be undone!
                  </p>
                  <p className="text-xs text-red-700">
                    Selected users: {selectedUserEmails.slice(0, 3).join(', ')}
                    {selectedUserEmails.length > 3 && ` and ${selectedUserEmails.length - 3} more...`}
                  </p>
                </div>
                <button
                  onClick={handleBulkDelete}
                  disabled={isLoadingManagement}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
                >
                  {isLoadingManagement ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Deleting Users...
                    </>
                  ) : (
                    <>
                      🗑️ Delete {selectedUserEmails.length} User{selectedUserEmails.length !== 1 ? 's' : ''} Permanently
                    </>
                  )}
                </button>
              </div>
            )}

            {/* User Email Composition Interface */}
            {showUserEmailInterface && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-purple-900">
                      📧 Compose Email to Users ({emailTemplate === 'custom' ? 'Custom' : emailTemplate.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())})
                    </h3>
                    <p className="text-sm text-purple-700">
                      Sending to {selectedUserEmails.length} users: {selectedUserEmails.slice(0, 3).join(', ')}{selectedUserEmails.length > 3 && ` and ${selectedUserEmails.length - 3} more...`}
                    </p>
                  </div>
                  <button
                    onClick={handleCancelUserEmail}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Template Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Template</label>
                    <select
                      value={emailTemplate}
                      onChange={(e) => {
                        setEmailTemplate(e.target.value)
                        applyEmailTemplate(e.target.value)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    >
                      <option value="custom">✏️ Custom Email</option>
                      
                      {/* Built-in Templates */}
                      <optgroup label="📦 Built-in Templates">
                        <option value="welcome">🎉 Welcome Email</option>
                        <option value="premium_upgrade">🔥 Premium Upgrade</option>
                        <option value="engagement">🌟 Re-engagement</option>
                        <option value="feature_announcement">🆕 Feature Announcement</option>
                        <option value="support_followup">🤝 Support Follow-up</option>
                      </optgroup>
                      
                      {/* Database Templates */}
                      {emailTemplates.length > 0 && (
                        <optgroup label="👤 Your Custom Templates">
                          {emailTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.category === 'ONBOARDING' && '🎉'} 
                              {template.category === 'MARKETING' && '📢'} 
                              {template.category === 'SUPPORT' && '🤝'} 
                              {template.category === 'ANNOUNCEMENTS' && '📣'} 
                              {template.category === 'RETENTION' && '🔄'} 
                              {template.category === 'CUSTOM' && '⚙️'} 
                              {' '}{template.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Subject Line */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Line <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={userEmailSubject}
                      onChange={(e) => setUserEmailSubject(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                      placeholder="Enter email subject..."
                    />
                  </div>

                  {/* Message Body */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Message <span className="text-red-500">*</span>
                      <span className="text-xs text-gray-500 ml-2">(Use {'{name}'} to personalize with user names)</span>
                    </label>
                    <textarea
                      value={userEmailMessage}
                      onChange={(e) => setUserEmailMessage(e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base leading-relaxed"
                      placeholder="Enter your email message..."
                    />
                  </div>

                  {/* Preview Section */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">📧 Email Preview</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div><strong>To:</strong> {selectedUserEmails.length} users</div>
                      <div><strong>Template:</strong> {emailTemplate.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                      <div><strong>Subject:</strong> {userEmailSubject || 'No subject'}</div>
                      <div className="max-h-20 overflow-y-auto">
                        <strong>Message:</strong> {userEmailMessage.slice(0, 200)}
                        {userEmailMessage.length > 200 && '...'}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <button
                      onClick={handleCancelUserEmail}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendUserEmail}
                      disabled={isComposingUserEmail || !userEmailSubject.trim() || !userEmailMessage.trim()}
                      className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
                    >
                      {isComposingUserEmail ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          📧 Send to {selectedUserEmails.length} Users
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                          <input
                            type="checkbox"
                            checked={managedUsers.length > 0 && selectedUserEmails.length === managedUsers.length}
                            onChange={handleSelectAllUsers}
                            className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                          />
                        </th>
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
                          <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        managedUsers.map((user) => (
                          <tr key={user.id} className={selectedUserEmails.includes(user.email) ? 'bg-purple-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedUserEmails.includes(user.email)}
                                onChange={() => handleUserEmailSelect(user.email)}
                                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                              />
                            </td>
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
                                   {user.subscription?.plan || 'No Subscription'}
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
                              <div className="flex flex-col space-y-1">
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
                                <div className="text-xs text-gray-500">
                                  📊 {user.dailyAnalysisUsed || 0}/{user.dailyAnalysisCredits || 3} daily
                                 {(user.totalAvailableCredits > 0 || (user.additionalCredits && user.additionalCredits > 0)) && (
                                   <span className="text-green-600"> (+{user.totalAvailableCredits || user.additionalCredits || 0})</span>
                                 )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => router.push(`/admin-panel/user/${user.id}`)}
                                  className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                                >
                                  Manage
                                </button>
                                <button
                                  onClick={() => {
                                    const credits = prompt('Enter credit package (250, 500, or 1000):')
                                    if (credits && ['250', '500', '1000'].includes(credits)) {
                                      handleUserAction('add_credits', user.id, { creditPackage: credits })
                                    } else if (credits) {
                                      alert('Invalid package. Use: 250, 500, or 1000')
                                    }
                                  }}
                                  className="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600 transition-colors"
                                >
                                  💳 Credits
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

          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-6">
            {/* Template Management Header */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Email Template Management</h3>
                  <p className="text-sm text-gray-600">
                    Create and manage email templates for campaigns
                  </p>
                </div>
                <div className="flex space-x-3">
                  {emailTemplates.length === 0 && (
                    <button
                      onClick={initializeTemplateDatabase}
                      className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      🔧 Initialize Database
                    </button>
                  )}
                  <button
                    onClick={() => setShowEmailTest(!showEmailTest)}
                    className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    🧪 Test Email System
                  </button>
                  <button
                    onClick={handleCreateTemplate}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    ➕ Create New Template
                  </button>
                </div>
              </div>

              {/* Template Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-xl font-bold text-green-600">
                    {emailTemplates.filter(t => t.category === 'ONBOARDING').length}
                  </div>
                  <div className="text-sm text-green-700">Onboarding</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-xl font-bold text-purple-600">
                    {emailTemplates.filter(t => t.category === 'MARKETING').length}
                  </div>
                  <div className="text-sm text-purple-700">Marketing</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-xl font-bold text-blue-600">
                    {emailTemplates.filter(t => t.category === 'SUPPORT').length}
                  </div>
                  <div className="text-sm text-blue-700">Support</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-xl font-bold text-orange-600">
                    {emailTemplates.filter(t => !t.isBuiltIn).length}
                  </div>
                  <div className="text-sm text-orange-700">Custom</div>
                </div>
              </div>
            </div>

            {/* Email Test Panel */}
            {showEmailTest && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-orange-800">🧪 Email Delivery Test</h3>
                  <button
                    onClick={() => setShowEmailTest(false)}
                    className="text-orange-600 hover:text-orange-800"
                  >
                    ✕
                  </button>
                </div>
                
                <p className="text-orange-700 mb-4">
                  Test your email delivery system to ensure emails are being sent properly. 
                  This will send a test email to verify the Resend API configuration.
                </p>

                <div className="flex space-x-3 mb-4">
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="flex-1 px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={handleEmailTest}
                    disabled={isTestingEmail || !testEmail.trim()}
                    className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTestingEmail ? '🔄 Sending...' : '📧 Send Test Email'}
                  </button>
                </div>

                {emailTestResult && (
                  <div className={`p-4 rounded-lg border ${
                    emailTestResult.success 
                      ? 'bg-green-50 border-green-200 text-green-800' 
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <div className="font-semibold mb-2">
                      {emailTestResult.success ? '✅ Test Email Sent Successfully!' : '❌ Test Email Failed'}
                    </div>
                    
                    {emailTestResult.success ? (
                      <div className="text-sm space-y-1">
                        <div><strong>Message ID:</strong> {emailTestResult.details?.messageId}</div>
                        <div><strong>Recipient:</strong> {emailTestResult.details?.recipient}</div>
                        <div><strong>Timestamp:</strong> {emailTestResult.details?.timestamp}</div>
                        <div className="mt-2 p-2 bg-green-100 rounded">
                          📬 Check your inbox (and spam folder) for the test email!
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm space-y-1">
                        <div><strong>Error:</strong> {emailTestResult.error}</div>
                        <div><strong>Details:</strong> {emailTestResult.details?.errorMessage || 'Unknown error'}</div>
                        <div><strong>Timestamp:</strong> {emailTestResult.details?.timestamp}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Template Creation/Edit Form */}
            {showTemplateForm && (
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-emerald-900">
                      {editingTemplate ? '✏️ Edit Template' : '➕ Create New Template'}
                    </h3>
                    <p className="text-sm text-emerald-700">
                      {editingTemplate ? `Editing: ${editingTemplate.name}` : 'Create a new email template'}
                    </p>
                  </div>
                  <button
                    onClick={handleCancelTemplateForm}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column - Form Fields */}
                  <div className="space-y-4">
                    {/* Template Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Template Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="e.g., Welcome New Users"
                      />
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                      <select
                        value={templateCategory}
                        onChange={(e) => setTemplateCategory(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      >
                        <option value="ONBOARDING">🎉 Onboarding</option>
                        <option value="MARKETING">📢 Marketing</option>
                        <option value="SUPPORT">🤝 Support</option>
                        <option value="ANNOUNCEMENTS">📢 Announcements</option>
                        <option value="RETENTION">🔄 Retention</option>
                        <option value="CUSTOM">⚙️ Custom</option>
                      </select>
                    </div>

                    {/* Subject Line */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Line <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={templateSubject}
                        onChange={(e) => setTemplateSubject(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="Enter email subject..."
                      />
                    </div>
                  </div>

                  {/* Right Column - Preview */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">📧 Template Preview</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div><strong>Name:</strong> {templateName || 'Untitled Template'}</div>
                      <div>
                        <strong>Category:</strong> 
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs ${getCategoryColor(templateCategory)}`}>
                          {templateCategory}
                        </span>
                      </div>
                      <div><strong>Subject:</strong> {templateSubject || 'No subject'}</div>
                      <div className="max-h-24 overflow-y-auto">
                        <strong>Content:</strong> {templateContent.slice(0, 150)}
                        {templateContent.length > 150 && '...'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Message Content */}
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Content <span className="text-red-500">*</span>
                    <span className="text-xs text-gray-500 ml-2">(Use {'{name}'} for personalization)</span>
                  </label>
                  <textarea
                    value={templateContent}
                    onChange={(e) => setTemplateContent(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base leading-relaxed"
                    placeholder="Enter your email content..."
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-6">
                  <button
                    onClick={handleCancelTemplateForm}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={isSubmittingTemplate || !templateName.trim() || !templateSubject.trim() || !templateContent.trim()}
                    className="px-6 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
                  >
                    {isSubmittingTemplate ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {editingTemplate ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        {editingTemplate ? '💾 Update Template' : '➕ Create Template'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Templates List */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h4 className="text-md font-semibold text-gray-900">
                  {isLoadingTemplates ? 'Loading...' : `${emailTemplates.length} templates available`}
                </h4>
              </div>
              
              {isLoadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                  <span className="ml-3 text-gray-600">Loading templates...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Template
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Subject
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {emailTemplates.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                            No email templates found. Create your first template!
                          </td>
                        </tr>
                      ) : (
                        emailTemplates.map((template) => (
                          <tr key={template.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {template.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                Created {new Date(template.createdAt).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(template.category)}`}>
                                {template.category}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 max-w-xs truncate">
                                {template.subject}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                template.isBuiltIn 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {template.isBuiltIn ? '🔧 System' : '👤 Custom'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleEditTemplate(template)}
                                  className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                                >
                                  ✏️ Edit
                                </button>
                                {!template.isBuiltIn && (
                                  <button
                                    onClick={() => handleDeleteTemplate(template)}
                                    className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 transition-colors"
                                  >
                                    🗑️ Delete
                                  </button>
                                )}
                              </div>
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

        {/* Support Tickets Tab */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">🎫 Support Tickets</h2>
                  <p className="text-gray-600">Manage customer support requests and responses</p>
                </div>
                <div className="flex items-center space-x-4">
                  <select
                    value={ticketFilter}
                    onChange={(e) => {
                      setTicketFilter(e.target.value)
                      // Re-load tickets with new filter
                      setTimeout(() => loadSupportTickets(), 100)
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="all">All Tickets</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="AWAITING_RESPONSE">Awaiting Response</option>
                    <option value="RESPONDED">Responded</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                  <button
                    onClick={loadSupportTickets}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Tickets List */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h4 className="text-md font-semibold text-gray-900">
                  {isLoadingTickets ? 'Loading...' : `${supportTickets.length} tickets`}
                </h4>
              </div>

              {ticketsError && (
                <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {ticketsError}
                </div>
              )}
              
              {isLoadingTickets ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                  <span className="ml-3 text-gray-600">Loading tickets...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Subject
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {supportTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                            <div className="flex flex-col items-center">
                              <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                              </svg>
                              <h3 className="text-lg font-medium text-gray-900 mb-2">No support tickets yet</h3>
                              <p className="text-gray-500">
                                {ticketFilter === 'all' ? 'No tickets have been created yet.' : `No ${ticketFilter.toLowerCase()} tickets found.`}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        supportTickets.map((ticket) => (
                          <tr key={ticket.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-10 w-10 flex-shrink-0">
                                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <span className="text-emerald-600 font-medium text-sm">
                                      {ticket.userName ? ticket.userName.charAt(0).toUpperCase() : ticket.userEmail.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {ticket.userName || 'Unknown User'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {ticket.userEmail}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 font-medium max-w-xs truncate">
                                {ticket.subject}
                              </div>
                              <div className="text-sm text-gray-500 max-w-xs truncate">
                                {ticket.message}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                                {ticket.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(ticket.priority)}`}>
                                {ticket.priority}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {ticket.category}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(ticket.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => window.location.href = `/admin-panel/tickets/${ticket.id}`}
                                  className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                                >
                                  💬 View
                                </button>
                                <select
                                  value={ticket.status}
                                  onChange={(e) => handleTicketAction('update_status', ticket.id, { status: e.target.value })}
                                  className="text-xs border border-gray-300 rounded px-2 py-1"
                                >
                                  <option value="OPEN">Open</option>
                                  <option value="IN_PROGRESS">In Progress</option>
                                  <option value="AWAITING_RESPONSE">Awaiting Response</option>
                                  <option value="RESPONDED">Responded</option>
                                  <option value="RESOLVED">Resolved</option>
                                  <option value="CLOSED">Closed</option>
                                </select>
                                <button
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to permanently delete the ticket "${ticket.subject}"? This action cannot be undone.`)) {
                                      handleTicketAction('delete', ticket.id)
                                    }
                                  }}
                                  className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 transition-colors"
                                  title="Delete ticket permanently"
                                >
                                  🗑️ Delete
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
            </div>
          </div>
        )}

        {/* Ticket Modal */}
        {showTicketModal && selectedTicket && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      🎫 {selectedTicket.subject}
                    </h2>
                    <p className="text-sm text-gray-600">
                      From: {selectedTicket.userName || 'Unknown'} ({selectedTicket.userEmail})
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTicketModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center space-x-4 mt-3">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedTicket.status)}`}>
                    {selectedTicket.status.replace('_', ' ')}
                  </span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(selectedTicket.priority)}`}>
                    {selectedTicket.priority}
                  </span>
                  <span className="text-sm text-gray-500">
                    {selectedTicket.category}
                  </span>
                  <span className="text-sm text-gray-500">
                    Created: {new Date(selectedTicket.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="px-6 py-4">
                {/* Original Message */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Original Message:</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedTicket.message}</p>
                </div>

                {/* Conversation History */}
                {selectedTicket.responses && selectedTicket.responses.length > 0 && (
                  <div className="space-y-4 mb-6">
                    <h3 className="text-sm font-medium text-gray-900">Conversation History:</h3>
                    {selectedTicket.responses.map((response: any, index: number) => (
                      <div key={response.id} className={`p-4 rounded-lg ${
                        response.isAdminResponse 
                          ? 'bg-emerald-50 border-l-4 border-emerald-500' 
                          : 'bg-blue-50 border-l-4 border-blue-500'
                      }`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">
                            {response.isAdminResponse 
                              ? `👨‍💼 ${response.admin?.name || 'Admin'}` 
                              : `👤 ${selectedTicket.userName || 'Customer'}`}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(response.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{response.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Response Form */}
                <div className="border-t pt-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Send Response:</h3>
                  <textarea
                    value={ticketResponse}
                    onChange={(e) => setTicketResponse(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Type your response to the customer..."
                  />
                  <div className="flex justify-end space-x-3 mt-4">
                    <button
                      onClick={() => setShowTicketModal(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={sendTicketResponse}
                      disabled={isRespondingToTicket || !ticketResponse.trim()}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRespondingToTicket ? 'Sending...' : '📤 Send Response'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Account Security */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">🔐 Account Security</h3>
              <p className="text-sm text-gray-600 mb-4">
                Update the admin password used for desktop access.
              </p>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
              >
                Change Password
              </button>
            </div>

            {/* Security Status */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">🛡️ Security Status</h3>
                  <p className="text-sm text-gray-600">
                    Shows if required secrets are set. This does not show any secret values.
                  </p>
                </div>
                <button
                  onClick={() => loadSecurityStatus()}
                  className="text-sm text-emerald-600 hover:text-emerald-700"
                >
                  Refresh
                </button>
              </div>

              {securityStatusLoading ? (
                <div className="text-sm text-gray-500">Checking security settings…</div>
              ) : securityStatusError ? (
                <div className="text-sm text-red-600">{securityStatusError}</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {securityStatus.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                        item.status === 'set'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-800">{item.label}</div>
                      <div
                        className={`text-xs font-semibold ${
                          item.status === 'set' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {item.status === 'set' ? 'Set' : 'Missing'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-500 mt-4">
                Missing items should be set in your hosting settings for the Production environment.
              </p>
            </div>

            {/* QR Code Login Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📱 QR Code Login</h3>
              <p className="text-sm text-gray-600 mb-4">
                Generate a QR code to approve a desktop admin login. Scan it with your phone to confirm the session.
              </p>
              
              {qrCodeData ? (
                <div className="flex flex-col items-center space-y-4">
                  <img src={qrCodeData} alt="QR Code" className="border-2 border-gray-200 rounded-lg" />
                  <p className="text-sm text-gray-600 text-center">
                    Scan this QR code with your phone to approve a desktop login
                  </p>
                  <p className="text-xs text-gray-500 text-center">
                    Or visit: <a href={qrCodeUrl || '#'} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">{qrCodeUrl}</a>
                  </p>
                  <button
                    onClick={generateQRCode}
                    className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    🔄 Generate New QR Code
                  </button>
                </div>
              ) : (
                <button
                  onClick={generateQRCode}
                  disabled={isGeneratingQR}
                  className="bg-emerald-500 text-white px-6 py-3 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingQR ? 'Generating...' : '📱 Generate QR Code'}
                </button>
              )}
            </div>

            {/* Push Notifications Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">🔔 Push Notifications</h3>
              <p className="text-sm text-gray-600 mb-4">
                Enable push notifications to receive instant alerts on your phone when:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 mb-4 space-y-1">
                <li>Someone signs up on your website</li>
                <li>Someone purchases a paid subscription</li>
                <li>Someone buys credits</li>
              </ul>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Push Notifications</p>
                  <p className="text-sm text-gray-600">
                    {pushNotificationStatus.loading 
                      ? 'Checking status...' 
                      : pushNotificationStatus.subscribed 
                        ? '✅ Enabled - You will receive notifications' 
                        : '❌ Not enabled - Click below to enable'}
                  </p>
                  {pushNotificationStatus.subscribed && pushNotificationStatus.lastUpdated && (
                    <p className="text-xs text-gray-500 mt-1">
                      Last enabled on {new Date(pushNotificationStatus.lastUpdated).toLocaleString()}. Enabling on a new device will move alerts to that device.
                    </p>
                  )}
                  {!pushNotificationStatus.subscribed && !pushNotificationStatus.loading && (
                    <p className="text-xs text-gray-500 mt-1">
                      Push subscriptions are saved per device. Tap Enable on this phone (PWA) to get notifications here.
                    </p>
                  )}
                </div>
                {pushNotificationStatus.subscribed ? (
                  <button
                    onClick={disablePushNotifications}
                    disabled={pushNotificationStatus.loading}
                    className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pushNotificationStatus.loading ? '...' : 'Disable'}
                  </button>
                ) : (
                  <button
                    onClick={enablePushNotifications}
                    disabled={pushNotificationStatus.loading}
                    className="bg-emerald-500 text-white px-6 py-2 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pushNotificationStatus.loading ? 'Loading...' : 'Enable'}
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={sendTestOwnerPush}
                  className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg"
                >
                  Send Test Notification
                </button>
                <button
                  onClick={loadPushLogs}
                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-4 py-2 rounded-lg"
                >
                  Refresh Logs
                </button>
              </div>

              {pushLogs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Recent Notification Logs</h4>
                  <div className="max-h-56 overflow-auto border rounded-lg">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="text-left px-3 py-2">Time</th>
                          <th className="text-left px-3 py-2">Event</th>
                          <th className="text-left px-3 py-2">Status</th>
                          <th className="text-left px-3 py-2">Info</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pushLogs.map((l, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2 text-gray-600">{new Date(l.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2">{l.event}</td>
                            <td className="px-3 py-2">{l.status}</td>
                            <td className="px-3 py-2 text-gray-500 truncate max-w-[200px]">{l.info}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> On iPhone, web push only works when opened from the Home Screen app icon (PWA).
                  Add to Home Screen and then enable notifications here.
                </p>
              </div>
            </div>

            {/* Vercel Spend Webhook Test */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">📨 Vercel Spend Webhook</h3>
              <p className="text-sm text-gray-600 mb-4">
                Send a test webhook to confirm the spend alert email is working.
              </p>
              <button
                onClick={sendVercelWebhookTest}
                disabled={vercelWebhookTestLoading}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {vercelWebhookTestLoading ? 'Sending...' : 'Send Test Webhook'}
              </button>
            </div>
          </div>
        )}

        {showPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Change Admin Password</h3>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={changePassword}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                >
                  Update Password
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
