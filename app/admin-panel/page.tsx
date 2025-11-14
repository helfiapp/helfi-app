'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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
  const [showCustomEmailInterface, setShowCustomEmailInterface] = useState(false)
  const [customEmailSubject, setCustomEmailSubject] = useState('')
  const [customEmailMessage, setCustomEmailMessage] = useState('')
  const [isComposingEmail, setIsComposingEmail] = useState(false)

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
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [ticketResponse, setTicketResponse] = useState('')
  const [isRespondingToTicket, setIsRespondingToTicket] = useState(false)

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
  const [pushNotificationStatus, setPushNotificationStatus] = useState<{subscribed: boolean, loading: boolean}>({subscribed: false, loading: false})

  // Check for URL hash to set active tab and load data
  useEffect(() => {
    const token = sessionStorage.getItem('adminToken')
    const user = sessionStorage.getItem('adminUser')
    
    if (token && user) {
      setAdminToken(token)
      setAdminUser(JSON.parse(user))
      setIsAuthenticated(true)
      loadAnalyticsData()
      loadWaitlistData(token)
      loadUserStats(token)
      
      // Check for URL hash to set active tab
      const checkHashAndLoadData = () => {
        if (window.location.hash === '#tickets') {
          setActiveTab('tickets')
          loadSupportTickets()
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
          setActiveTab('tickets')
          loadSupportTickets()
        }
      }
      
      // New: Add focus detection for returning via back button
      const handleWindowFocus = () => {
        if (window.location.hash === '#tickets') {
          setActiveTab('tickets')
          loadSupportTickets()
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Password-only authentication for admin panel
    if (password === 'gX8#bQ3!Vr9zM2@kLf1T') {
      const mockAdmin = {
        id: 'temp-admin-id',
        email: 'admin@helfi.ai',
        name: 'Helfi Admin',
        role: 'SUPER_ADMIN'
      }
      
      setAdminToken('temp-admin-token')
      setAdminUser(mockAdmin)
      setIsAuthenticated(true)
      sessionStorage.setItem('adminToken', 'temp-admin-token')
      sessionStorage.setItem('adminUser', JSON.stringify(mockAdmin))
      loadAnalyticsData()
      loadWaitlistData('temp-admin-token')
      loadUserStats('temp-admin-token')
      setLoading(false)
      return
    } else {
      setError('Invalid password. Please try again.')
      setLoading(false)
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
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

      // Load summary (non-blocking)
      try {
        const summaryResponse = await fetch('/api/analytics?action=summary')
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

      const result = await response.json()

      if (response.ok) {
        // Reload the user list to show updated data
        await loadUserManagement(userSearch, userFilter, currentPage)
        // Refresh selected user if modal is open
        if (selectedUser && showUserModal) {
          const refreshedUsers = await fetch(`/api/admin/user-management?search=${selectedUser.email}&plan=all&page=1&limit=1`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          }).then(r => r.json())
          if (refreshedUsers.users && refreshedUsers.users.length > 0) {
            setSelectedUser(refreshedUsers.users[0])
          }
        } else {
          setShowUserModal(false)
          setSelectedUser(null)
        }
        alert(`User ${action} completed successfully`)
      } else {
        const errorMessage = result.error || 'Action failed. Please try again.'
        console.error('API Error:', result)
        alert(`Action failed: ${errorMessage}`)
      }
    } catch (error) {
      console.error('Error performing user action:', error)
      alert(`Action failed: ${error instanceof Error ? error.message : 'Please try again.'}`)
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
          waitlistData: waitlistData.filter(entry => selectedEmails.includes(entry.email))
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
          waitlistData: emailData // Using same structure for compatibility
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

  // Support ticket functions
  const loadSupportTickets = async () => {
    setIsLoadingTickets(true)
    try {
      // Get token from sessionStorage directly to avoid state timing issues
      const authToken = sessionStorage.getItem('adminToken') || adminToken
      const response = await fetch(`/api/admin/tickets?status=${ticketFilter}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      if (response.ok) {
        const result = await response.json()
        setSupportTickets(result.tickets || [])
      }
    } catch (error) {
      console.error('Error loading tickets:', error)
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
      const response = await fetch('/api/admin/qr-generate', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setQrCodeUrl(data.qrData.url)
        
        // Generate QR code image using qrcode library
        const QRCode = (await import('qrcode')).default
        const qrImageData = await QRCode.toDataURL(data.qrData.url, {
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
    
    setPushNotificationStatus({ subscribed: false, loading: true })
    try {
      // Check if admin user has push subscription
      const response = await fetch('/api/admin/push-subscribe', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setPushNotificationStatus({ subscribed: data.hasSubscription || false, loading: false })
      } else {
        setPushNotificationStatus({ subscribed: false, loading: false })
      }
    } catch (error) {
      console.error('Error checking push status:', error)
      setPushNotificationStatus({ subscribed: false, loading: false })
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

    setPushNotificationStatus({ subscribed: false, loading: true })

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        alert('Push notifications were denied')
        setPushNotificationStatus({ subscribed: false, loading: false })
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
        setPushNotificationStatus({ subscribed: true, loading: false })
        alert('✅ Push notifications enabled! You will now receive notifications for signups, subscriptions, and credit purchases.')
      } else {
        throw new Error('Failed to save subscription')
      }
    } catch (error: any) {
      console.error('Error enabling push notifications:', error)
      alert(`Failed to enable push notifications: ${error.message}`)
      setPushNotificationStatus({ subscribed: false, loading: false })
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
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center">
            <Image
              src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
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

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6">
          <nav className="flex space-x-4 md:space-x-8 overflow-x-auto whitespace-nowrap no-scrollbar -mx-4 px-4">
            {[
              { id: 'overview', label: '📊 Overview', desc: 'Key metrics' },
              { id: 'events', label: '📋 Events', desc: 'Raw data' },
              { id: 'insights', label: '🤖 AI Insights', desc: 'OpenAI analysis' },
              { id: 'waitlist', label: '📧 Waitlist', desc: 'Signups' },
              { id: 'users', label: '👥 Users', desc: 'User stats' },
              { id: 'management', label: '🛠️ User Management', desc: 'Manage users' },
              { id: 'templates', label: '📝 Templates', desc: 'Email templates' },
              { id: 'tickets', label: '🎫 Support', desc: 'Customer support' },
              { id: 'settings', label: '⚙️ Settings', desc: 'QR Login & Notifications' }
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
                    loadEmailTemplates() // Load templates for email campaigns
                  }
                  if (tab.id === 'templates') {
                    loadEmailTemplates()
                  }
                  if (tab.id === 'tickets') {
                    loadSupportTickets()
                  }
                  if (tab.id === 'settings') {
                    checkPushNotificationStatus()
                  }
                }}
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
                          waitlistData: waitlistData.filter(entry => selectedEmails.includes(entry.email))
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
                                  onClick={() => {
                                    setSelectedUser(user)
                                    setShowUserModal(true)
                                  }}
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

                         {/* User Management Modal */}
             {showUserModal && selectedUser && (
               <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center py-8">
                 <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto">
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
                           {selectedUser.subscription?.plan || 'No Subscription'}
                         </span>
                       </div>
                       
                       {selectedUser.subscription?.plan === 'PREMIUM' && selectedUser.subscription?.monthlyPriceCents && (
                         <div className="flex justify-between items-center">
                           <span className="text-sm text-gray-600">Subscription Tier:</span>
                           <span className="text-sm font-semibold text-emerald-700">
                             {selectedUser.subscription.endDate ? (
                               // Temporary access - show duration and credits
                               (() => {
                                 const endDate = new Date(selectedUser.subscription.endDate)
                                 const daysRemaining = Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                                 const credits = Math.floor(selectedUser.subscription.monthlyPriceCents * 0.5) // 50% of price = credits
                                 if (daysRemaining > 90) {
                                   return `Permanent (${credits} credits/month)`
                                 } else {
                                   return `${daysRemaining}-Day Access (${credits} credits)`
                                 }
                               })()
                             ) : (
                               // Permanent subscription - show monthly tier
                               selectedUser.subscription.monthlyPriceCents === 2000 ? '$20/month (1,000 credits)' :
                               selectedUser.subscription.monthlyPriceCents === 3000 ? '$30/month (1,700 credits)' :
                               selectedUser.subscription.monthlyPriceCents === 5000 ? '$50/month (3,000 credits)' :
                               `$${(selectedUser.subscription.monthlyPriceCents / 100).toFixed(0)}/month`
                             )}
                           </span>
                         </div>
                       )}
                       
                       {selectedUser.subscription?.endDate && (
                         <div className="flex justify-between items-center">
                           <span className="text-sm text-gray-600">Access Type:</span>
                           <span className="text-sm font-medium">
                             {new Date(selectedUser.subscription.endDate).getFullYear() > 2050 
                               ? '🎉 Permanent Access' 
                               : `⏰ Expires ${new Date(selectedUser.subscription.endDate).toLocaleDateString()}`
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
                       
                       {!selectedUser.subscription && (
                         <div className="flex justify-between items-center">
                           <span className="text-sm text-gray-600">Access Type:</span>
                           <span className="text-sm font-medium text-gray-600">👤 No Subscription</span>
                         </div>
                       )}
                       
                       {selectedUser.subscription && (
                         <>
                           <div className="flex justify-between items-center">
                             <span className="text-sm text-gray-600">Subscription Started:</span>
                             <span className="text-sm font-medium">
                               {selectedUser.subscription.startDate 
                                 ? new Date(selectedUser.subscription.startDate).toLocaleDateString()
                                 : 'Unknown'}
                             </span>
                           </div>
                           
                           {selectedUser.subscription.startDate && !selectedUser.subscription.endDate && (
                             <div className="flex justify-between items-center">
                               <span className="text-sm text-gray-600">Next Renewal:</span>
                               <span className="text-sm font-medium">
                                 {(() => {
                                   const startDate = new Date(selectedUser.subscription.startDate)
                                   const now = new Date()
                                   const startYear = startDate.getUTCFullYear()
                                   const startMonth = startDate.getUTCMonth()
                                   const startDay = startDate.getUTCDate()
                                   
                                   const currentYear = now.getUTCFullYear()
                                   const currentMonth = now.getUTCMonth()
                                   const currentDay = now.getUTCDate()
                                   
                                   let monthsSinceStart = (currentYear - startYear) * 12 + (currentMonth - startMonth)
                                   if (currentDay < startDay) {
                                     monthsSinceStart--
                                   }
                                   
                                   const nextRenewal = new Date(Date.UTC(startYear, startMonth + monthsSinceStart + 1, startDay, 0, 0, 0, 0))
                                   return nextRenewal.toLocaleDateString()
                                 })()}
                               </span>
                             </div>
                           )}
                         </>
                       )}
                       
                       <div className="flex justify-between items-center">
                         <span className="text-sm text-gray-600">Member since:</span>
                         <span className="text-sm">{new Date(selectedUser.createdAt).toLocaleDateString()}</span>
                       </div>
                     </div>
                   </div>
                   
                   {/* Credit Management */}
                   <div className="bg-green-50 rounded-lg p-4 mb-6 border-l-4 border-green-500">
                     <h4 className="font-medium text-gray-900 mb-3">📊 Credit Management</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Additional Credits:</span>
                        <span className="text-sm font-medium text-green-600">
                          {selectedUser.totalAvailableCredits !== undefined 
                            ? `${selectedUser.totalAvailableCredits} credits`
                            : (selectedUser.additionalCredits || 0) + ' credits'}
                        </span>
                      </div>
                       <div className="flex justify-between items-center">
                         <span className="text-sm text-gray-600">Total Analyses:</span>
                         <span className="text-sm font-medium">
                           {selectedUser.totalAnalysisCount || 0} lifetime
                         </span>
                       </div>
                       
                       {/* Feature-specific usage */}
                       <div className="pt-2 border-t border-gray-200">
                         <div className="text-xs text-gray-500 mb-2">Monthly Feature Usage:</div>
                         <div className="grid grid-cols-2 gap-2 text-xs">
                           <div className="flex justify-between">
                             <span>Food Analysis:</span>
                             <span className="font-medium">{selectedUser.dailyFoodAnalysisUsed || 0}</span>
                           </div>
                           <div className="flex justify-between">
                             <span>Food Reanalysis:</span>
                             <span className="font-medium">{selectedUser.dailyFoodReanalysisUsed || 0}</span>
                           </div>
                           <div className="flex justify-between">
                             <span>Medical Image:</span>
                             <span className="font-medium">{selectedUser.monthlyMedicalImageAnalysisUsed || 0}</span>
                           </div>
                           <div className="flex justify-between">
                             <span>Interaction Analysis:</span>
                             <span className="font-medium">{selectedUser.dailyInteractionAnalysisUsed || 0}</span>
                           </div>
                           <div className="flex justify-between">
                             <span>Symptom Analysis:</span>
                             <span className="font-medium">{selectedUser.monthlySymptomAnalysisUsed || 0}</span>
                           </div>
                           <div className="flex justify-between">
                             <span>Insights Generation:</span>
                             <span className="font-medium">{selectedUser.monthlyInsightsGenerationUsed || 0}</span>
                           </div>
                         </div>
                       </div>
                       {selectedUser.lastAnalysisResetDate && (
                         <div className="flex justify-between items-center">
                           <span className="text-sm text-gray-600">Last Reset:</span>
                           <span className="text-sm">
                             {new Date(selectedUser.lastAnalysisResetDate).toLocaleDateString()}
                           </span>
                         </div>
                       )}
                     </div>
                     
                     <div className="mt-4 grid grid-cols-3 gap-3">
                       <button
                         onClick={() => {
                           const credits = prompt('Enter number of credits to add:')
                           if (credits && !isNaN(parseInt(credits)) && parseInt(credits) > 0) {
                             handleUserAction('add_credits', selectedUser.id, { creditAmount: parseInt(credits) })
                           }
                         }}
                         className="bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors"
                       >
                         💳 Add Credits
                       </button>
                       <button
                         onClick={() => {
                           const credits = prompt('Enter number of credits to remove:')
                           if (credits && !isNaN(parseInt(credits)) && parseInt(credits) > 0) {
                             if (confirm(`Are you sure you want to remove ${credits} credits?`)) {
                               handleUserAction('remove_credits', selectedUser.id, { creditAmount: parseInt(credits) })
                             }
                           }
                         }}
                         className="bg-red-500 text-white px-3 py-2 rounded text-sm hover:bg-red-600 transition-colors"
                       >
                         ➖ Remove Credits
                       </button>
                       <button
                         onClick={() => {
                           if (confirm('Reset daily quota for this user?')) {
                             handleUserAction('reset_daily_quota', selectedUser.id)
                           }
                         }}
                         className="bg-blue-500 text-white px-3 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                       >
                         🔄 Reset Daily
                       </button>
                     </div>
                   </div>

                   {/* Actions */}
                   <div className="space-y-4">
                     <h4 className="font-medium text-gray-900">Grant Subscription</h4>
                     
                     {/* Subscription Tiers - matching billing page */}
                     <div className="grid grid-cols-3 gap-2 mb-3">
                       <button
                         onClick={() => handleUserAction('grant_subscription', selectedUser.id, { tier: '20' })}
                         className="bg-emerald-500 text-white px-3 py-2 rounded hover:bg-emerald-600 transition-colors text-xs"
                       >
                         $20/month<br/>(1,000 credits)
                       </button>
                       <button
                         onClick={() => handleUserAction('grant_subscription', selectedUser.id, { tier: '30' })}
                         className="bg-emerald-600 text-white px-3 py-2 rounded hover:bg-emerald-700 transition-colors text-xs font-semibold"
                       >
                         $30/month<br/>(1,700 credits)
                       </button>
                       <button
                         onClick={() => handleUserAction('grant_subscription', selectedUser.id, { tier: '50' })}
                         className="bg-gray-900 text-white px-3 py-2 rounded hover:bg-gray-800 transition-colors text-xs"
                       >
                         $50/month<br/>(3,000 credits)
                       </button>
                     </div>
                     
                     {/* Temporary Access */}
                     <div className="border-t pt-3">
                       <h5 className="text-sm font-medium text-gray-700 mb-2">Temporary Access</h5>
                       <div className="grid grid-cols-2 gap-2">
                         <button
                           onClick={() => handleUserAction('grant_trial', selectedUser.id, { trialDays: 7 })}
                           className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 transition-colors text-xs"
                         >
                           7-Day Premium<br/>(250 credits)
                         </button>
                         <button
                           onClick={() => handleUserAction('grant_trial', selectedUser.id, { trialDays: 30 })}
                           className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 transition-colors text-xs"
                         >
                           30-Day Premium<br/>(1,000 credits)
                         </button>
                       </div>
                     </div>
                     
                     {/* Credit Packages */}
                     <div className="border-t pt-4">
                       <h4 className="font-medium text-gray-900 mb-3">Grant Credits</h4>
                       <div className="grid grid-cols-3 gap-2">
                         <button
                           onClick={() => handleUserAction('add_credits', selectedUser.id, { creditPackage: '250' })}
                           className="bg-purple-500 text-white px-3 py-2 rounded hover:bg-purple-600 transition-colors text-xs"
                         >
                           250 Credits ($5)
                         </button>
                         <button
                           onClick={() => handleUserAction('add_credits', selectedUser.id, { creditPackage: '500' })}
                           className="bg-purple-500 text-white px-3 py-2 rounded hover:bg-purple-600 transition-colors text-xs"
                         >
                           500 Credits ($10)
                         </button>
                         <button
                           onClick={() => handleUserAction('add_credits', selectedUser.id, { creditPackage: '1000' })}
                           className="bg-purple-500 text-white px-3 py-2 rounded hover:bg-purple-600 transition-colors text-xs"
                         >
                           1000 Credits ($20)
                         </button>
                       </div>
                     </div>
                     
                     {/* Plan Controls */}
                     <div className="border-t pt-4">
                       <h4 className="font-medium text-gray-900 mb-3">Plan Controls</h4>
                       <div className="grid grid-cols-2 gap-3">
                         {selectedUser.subscription?.plan === 'PREMIUM' ? (
                           <button
                             onClick={() => handleUserAction('deactivate', selectedUser.id)}
                             className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition-colors text-sm"
                           >
                             ⬇️ Remove Subscription
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
            {/* QR Code Login Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📱 QR Code Login</h3>
              <p className="text-sm text-gray-600 mb-4">
                Generate a QR code to log into the admin panel on your phone. Scan the QR code with your phone's camera to instantly log in.
              </p>
              
              {qrCodeData ? (
                <div className="flex flex-col items-center space-y-4">
                  <img src={qrCodeData} alt="QR Code" className="border-2 border-gray-200 rounded-lg" />
                  <p className="text-sm text-gray-600 text-center">
                    Scan this QR code with your phone to log into the admin panel
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
                </div>
                <button
                  onClick={enablePushNotifications}
                  disabled={pushNotificationStatus.loading || pushNotificationStatus.subscribed}
                  className="bg-emerald-500 text-white px-6 py-2 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pushNotificationStatus.loading 
                    ? 'Loading...' 
                    : pushNotificationStatus.subscribed 
                      ? '✅ Enabled' 
                      : 'Enable Notifications'}
                </button>
              </div>

              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Make sure you've enabled push notifications in your browser settings. 
                  On mobile, you may need to add the site to your home screen for best results.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 