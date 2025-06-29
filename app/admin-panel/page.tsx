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
      loadWaitlistData(token)
      loadUserStats(token)
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
      loadWaitlistData('temp-admin-token')
      loadUserStats('temp-admin-token')
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
        loadWaitlistData(result.token)
        loadUserStats(result.token)
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
      }
    } catch (error) {
      console.error('Error loading waitlist:', error)
    }
    setIsLoadingWaitlist(false)
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
    loadWaitlistData(adminToken)
    loadUserStats(adminToken)
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
      if (tier === 'free') return !user.subscription?.plan || user.subscription.plan === 'FREE'
      return true
    })
    setSelectedUserEmails(filteredUsers.map(user => user.email))
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
        setUserEmailSubject('🤝 Following Up - How Can We Help You Better?')
        setUserEmailMessage(`Hi {name},

Hope you're doing well! We wanted to follow up and see how your experience with Helfi has been going.

🤔 **We'd love to know:**
• Are you finding the features helpful?
• Is there anything confusing or frustrating?
• What would make Helfi even better for you?

💬 **Your feedback matters!** Just reply to this email with your thoughts - our team reads every response personally.

🆘 **Need immediate help?** Contact us at support@helfi.ai

Thank you for being part of the Helfi community!

Best regards,
The Helfi Team`)
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
        alert('Failed to load email templates')
      }
    } catch (error) {
      console.error('Error loading templates:', error)
      alert('Failed to load email templates')
    }
    setIsLoadingTemplates(false)
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
              { id: 'management', label: '🛠️ User Management', desc: 'Manage users' },
              { id: 'templates', label: '📝 Templates', desc: 'Email templates' }
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
                    onClick={() => handleSelectByTier('free')}
                    className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm"
                  >
                    🆓 Free Users ({managedUsers.filter(u => !u.subscription?.plan || u.subscription.plan === 'FREE').length})
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
                <button
                  onClick={handleCreateTemplate}
                  className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  ➕ Create New Template
                </button>
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
      </div>
    </div>
  )
} 