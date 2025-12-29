'use client'

import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'

export default function SupportPage() {
  const { data: session } = useSession()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [activeTicket, setActiveTicket] = useState<any | null>(null)
  const [isLoadingTicket, setIsLoadingTicket] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [isSendingChat, setIsSendingChat] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    email: session?.user?.email || '',
    inquiryType: '',
    registeredEmail: '',
    subject: '',
    message: '',
    isRegisteredUser: false
  })

  // Update email when session loads
  useEffect(() => {
    if (session?.user?.email) {
      setFormData(prev => ({
        ...prev,
        email: session.user?.email || '',
        name: session.user?.name || '',
        isRegisteredUser: true
      }))
    }
  }, [session])

  const loadActiveTicket = async () => {
    if (!session?.user?.email) return
    setIsLoadingTicket(true)
    try {
      const response = await fetch('/api/support/tickets?activeOnly=1')
      if (response.ok) {
        const result = await response.json()
        setActiveTicket(result.ticket || null)
      }
    } catch (error) {
      console.error('Error loading support ticket:', error)
    }
    setIsLoadingTicket(false)
  }

  useEffect(() => {
    if (session?.user?.email) {
      loadActiveTicket()
    }
  }, [session])

  const inquiryTypes = [
    { value: 'account', label: 'Account/Login Issue' },
    { value: 'billing', label: 'Billing Question' },
    { value: 'technical', label: 'Technical Support' },
    { value: 'general', label: 'General Inquiry' },
    { value: 'feedback', label: 'Feedback / Suggestion' }
  ]

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : false
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')

    try {
      const endpoint = session ? '/api/support/tickets' : '/api/admin/tickets'
      const payload = session
        ? {
            action: 'create',
            subject: formData.subject || `${formData.inquiryType} - ${inquiryTypes.find(t => t.value === formData.inquiryType)?.label}`,
            message: formData.message,
            category: formData.inquiryType.toUpperCase(),
            priority: formData.inquiryType === 'account' || formData.inquiryType === 'billing' ? 'HIGH' : 'MEDIUM'
          }
        : {
            action: 'create',
            subject: formData.subject || `${formData.inquiryType} - ${inquiryTypes.find(t => t.value === formData.inquiryType)?.label}`,
            message: formData.message,
            userEmail: formData.inquiryType === 'account' ? formData.registeredEmail : formData.email,
            userName: formData.name,
            category: formData.inquiryType.toUpperCase(),
            priority: formData.inquiryType === 'account' || formData.inquiryType === 'billing' ? 'HIGH' : 'MEDIUM'
          }

      // Create support ticket via API
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        setSubmitStatus('success')
        if (session) {
          await loadActiveTicket()
        }
        // Reset form
        setFormData({
          name: session?.user?.name || '',
          email: session?.user?.email || '',
          inquiryType: '',
          registeredEmail: '',
          subject: '',
          message: '',
          isRegisteredUser: !!session
        })
      } else {
        setSubmitStatus('error')
      }
    } catch (error) {
      console.error('Error submitting support ticket:', error)
      setSubmitStatus('error')
    }

    setIsSubmitting(false)
  }

  const sendChatMessage = async () => {
    if (!activeTicket || !chatMessage.trim()) return
    setIsSendingChat(true)
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'add_response',
          ticketId: activeTicket.id,
          message: chatMessage.trim()
        })
      })

      if (response.ok) {
        const result = await response.json()
        setActiveTicket(result.ticket || null)
        setChatMessage('')
      }
    } catch (error) {
      console.error('Error sending support message:', error)
    }
    setIsSendingChat(false)
  }

  const startNewTicket = () => {
    setActiveTicket(null)
    setSubmitStatus('idle')
  }

  const shouldShowRegisteredEmail = formData.inquiryType === 'account' && !session
  const shouldShowExtraFields = formData.isRegisteredUser || session
  const conversationItems = activeTicket
    ? [
        {
          id: `ticket-${activeTicket.id}`,
          message: activeTicket.message,
          isAdminResponse: false,
          createdAt: activeTicket.createdAt
        },
        ...(activeTicket.responses || [])
          .filter((response: any) => !String(response.message || '').startsWith('[SYSTEM]'))
          .map((response: any) => ({
            id: response.id,
            message: response.message,
            isAdminResponse: response.isAdminResponse,
            createdAt: response.createdAt
          }))
      ]
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo on the left */}
          <div className="flex items-center">
            <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="/mobile-assets/LOGOS/helfi-01-01.png"
                alt="Helfi Logo"
                width={80}
                height={80}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
          </div>
          
          {/* Navigation Links */}
          <div className="flex items-center space-x-4">
            {session ? (
              <Link 
                href="/dashboard" 
                className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
              >
                Back to Dashboard
              </Link>
            ) : (
              <Link 
                href="/" 
                className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
              >
                Back to Home
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Page Title */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Get Support</h1>
          <p className="text-sm text-gray-500 hidden sm:block">We're here to help you with any questions or issues</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto p-8">
        {session && activeTicket && (
          <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Support Chat</h2>
              <p className="text-gray-600">Chat with our support assistant. Replies are also sent to your email.</p>
            </div>

            {isLoadingTicket && (
              <div className="text-center text-sm text-gray-500">Loading your conversation...</div>
            )}

            {!isLoadingTicket && (
              <div className="space-y-4">
                {conversationItems.length === 0 && (
                  <div className="text-sm text-gray-500 text-center">No messages yet.</div>
                )}
                {conversationItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg p-4 ${item.isAdminResponse ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'bg-gray-50 border-l-4 border-gray-300'}`}
                  >
                    <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                      <span>{item.isAdminResponse ? 'Helfi Support' : 'You'}</span>
                      <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap">{item.message}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6">
              <label htmlFor="chatMessage" className="block text-sm font-medium text-gray-700 mb-2">
                Send a message
              </label>
              <textarea
                id="chatMessage"
                name="chatMessage"
                rows={4}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                placeholder="Describe the issue or add more details..."
              />
              <div className="flex items-center justify-between mt-4">
                <button
                  type="button"
                  onClick={startNewTicket}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Start a new ticket
                </button>
                <button
                  type="button"
                  onClick={sendChatMessage}
                  disabled={!chatMessage.trim() || isSendingChat}
                  className="px-4 py-2 bg-helfi-green text-white rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingChat ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>
        )}

        {(!session || !activeTicket) && (
          <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Contact Support</h2>
            <p className="text-gray-600">
              Have a question or need help? Send us a message and we'll get back to you as soon as possible.
            </p>
          </div>

          {/* Success Message */}
          {submitStatus === 'success' && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="text-green-800 font-medium">Support ticket submitted successfully!</h3>
                  <p className="text-green-700 text-sm">You will receive a reply by email shortly.</p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {submitStatus === 'error' && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="text-red-800 font-medium">Error submitting ticket</h3>
                  <p className="text-red-700 text-sm">Please try again or email us directly at support@helfi.ai</p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Registered User Toggle */}
            {!session && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isRegisteredUser"
                  name="isRegisteredUser"
                  checked={formData.isRegisteredUser}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-helfi-green focus:ring-helfi-green border-gray-300 rounded"
                />
                <label htmlFor="isRegisteredUser" className="ml-2 text-sm text-gray-700">
                  I am a registered Helfi user
                </label>
              </div>
            )}

            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            {/* Inquiry Type */}
            <div>
              <label htmlFor="inquiryType" className="block text-sm font-medium text-gray-700 mb-2">
                What can we help you with? *
              </label>
              <select
                id="inquiryType"
                name="inquiryType"
                required
                value={formData.inquiryType}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
              >
                <option value="">Select an option...</option>
                {inquiryTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Conditional Field for Account Issues */}
            {shouldShowRegisteredEmail && (
              <div>
                <label htmlFor="registeredEmail" className="block text-sm font-medium text-gray-700 mb-2">
                  Registered Email Address *
                </label>
                <input
                  type="email"
                  id="registeredEmail"
                  name="registeredEmail"
                  required
                  value={formData.registeredEmail}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="The email address associated with your Helfi account"
                />
              </div>
            )}

            {/* Subject Line */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                Subject
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                placeholder="Brief description of your issue"
              />
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                Message *
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={6}
                value={formData.message}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                placeholder="Please provide as much detail as possible about your issue or question..."
              />
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg font-medium hover:bg-helfi-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Send Message'}
              </button>
            </div>
          </form>

          {/* Additional Contact Info */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Other Ways to Reach Us</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  📧 Email: <a href="mailto:support@helfi.ai" className="text-helfi-green hover:text-helfi-green/80 font-medium">support@helfi.ai</a>
                </p>
                <p>⏰ Response Time: Usually within a few minutes</p>
                <p>🕒 Business Hours: Monday - Friday, 9 AM - 5 PM (AEST)</p>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
} 
