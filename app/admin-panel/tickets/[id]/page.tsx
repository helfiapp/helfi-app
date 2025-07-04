'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'

interface TicketResponse {
  id: string
  message: string
  isAdminResponse: boolean
  createdAt: string
  admin?: {
    name: string
    email: string
  }
}

interface SupportTicket {
  id: string
  subject: string
  message: string
  userEmail: string
  userName: string
  status: string
  priority: string
  category: string
  createdAt: string
  updatedAt: string
  responses: TicketResponse[]
}

export default function TicketPage() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string
  
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set())
  const [newResponse, setNewResponse] = useState('')
  const [isSendingResponse, setIsSendingResponse] = useState(false)

  // Check authentication
  useEffect(() => {
    const token = sessionStorage.getItem('adminToken')
    if (!token) {
      router.push('/admin-panel')
      return
    }
    setIsAuthenticated(true)
    loadTicketData()
  }, [ticketId, router])

  const loadTicketData = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/admin/tickets?action=get_ticket&ticketId=${ticketId}`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to load ticket data')
      }
      
      const data = await response.json()
      setTicket(data.ticket)
      
      // Expand all responses by default
      const allResponseIds = new Set<string>(data.ticket.responses?.map((r: TicketResponse) => r.id) || [])
      setExpandedResponses(allResponseIds)
      
      // Pre-fill response with greeting template
      if (data.ticket && !newResponse) {
        let customerName = 'there'
        if (data.ticket.userName && data.ticket.userName.trim()) {
          if (data.ticket.userName.includes('@')) {
            customerName = data.ticket.userName.split('@')[0]
          } else {
            customerName = data.ticket.userName
          }
          customerName = customerName.charAt(0).toUpperCase() + customerName.slice(1).toLowerCase()
        }
        
        const greeting = `Hi ${customerName},\n\n`
        const signature = `\n\nWarmest Regards,\nHelfi Support Team`
        setNewResponse(greeting + signature)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleResponseExpansion = (responseId: string) => {
    const newExpanded = new Set(expandedResponses)
    if (newExpanded.has(responseId)) {
      newExpanded.delete(responseId)
    } else {
      newExpanded.add(responseId)
    }
    setExpandedResponses(newExpanded)
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      const response = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          action: 'update_status',
          ticketId: ticket?.id,
          status: newStatus
        })
      })
      
      if (response.ok) {
        setTicket(prev => prev ? { ...prev, status: newStatus } : null)
      }
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  const handleSendResponse = async () => {
    if (!newResponse.trim() || !ticket) return
    
    setIsSendingResponse(true)
    try {
      const response = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          action: 'add_response',
          ticketId: ticket.id,
          message: newResponse.trim()
        })
      })
      
      if (response.ok) {
        // Reload ticket data to get updated responses
        await loadTicketData()
        setNewResponse('')
      }
    } catch (err) {
      console.error('Failed to send response:', err)
    } finally {
      setIsSendingResponse(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800 border-green-200'
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'AWAITING_RESPONSE': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'RESPONDED': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'RESOLVED': return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'CLOSED': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW': return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'MEDIUM': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'URGENT': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isAuthenticated) {
    return null
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          <span className="text-gray-600">Loading ticket...</span>
        </div>
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Ticket</h2>
            <p className="text-red-600 mb-4">{error || 'Ticket not found'}</p>
            <button
              onClick={() => router.push('/admin-panel')}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              Back to Admin Panel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/admin-panel')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Admin Panel</span>
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <div className="flex items-center space-x-3">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={32}
                height={32}
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Support Ticket #{ticket.id.slice(-8)}</h1>
                <p className="text-sm text-gray-600">{ticket.subject}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(ticket.status)}`}>
              {ticket.status.replace('_', ' ')}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getPriorityColor(ticket.priority)}`}>
              {ticket.priority}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Conversation Thread */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">💬 Conversation</h2>
                <p className="text-sm text-gray-600 mt-1">Latest responses appear first</p>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Response Form - At Top */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-emerald-900 mb-3">📤 Send New Response</h3>
                  <textarea
                    value={newResponse}
                    onChange={(e) => setNewResponse(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                    placeholder="Type your response to the customer..."
                  />
                  <div className="flex justify-end space-x-3 mt-3">
                    <button
                      onClick={() => setNewResponse('')}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleSendResponse}
                      disabled={isSendingResponse || !newResponse.trim()}
                      className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {isSendingResponse ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>Send Response</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Responses - Latest First */}
                {ticket.responses && ticket.responses.length > 0 && (
                  <div className="space-y-4">
                    {[...ticket.responses].reverse().map((response) => (
                      <div
                        key={response.id}
                        className={`border rounded-lg overflow-hidden ${
                          response.isAdminResponse 
                            ? 'border-blue-200 bg-blue-50' 
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div 
                          className="px-4 py-3 cursor-pointer hover:bg-opacity-80 transition-colors"
                          onClick={() => toggleResponseExpansion(response.id)}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium ${
                                response.isAdminResponse ? 'bg-blue-500' : 'bg-gray-500'
                              }`}>
                                {response.isAdminResponse ? '🛡️' : '👤'}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900">
                                  {response.isAdminResponse 
                                    ? `${response.admin?.name || 'Admin'} (Support Team)`
                                    : `${ticket.userName || 'Customer'}`}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {formatDate(response.createdAt)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                response.isAdminResponse 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {response.isAdminResponse ? 'Admin Reply' : 'Customer'}
                              </span>
                              <svg 
                                className={`w-4 h-4 text-gray-400 transition-transform ${
                                  expandedResponses.has(response.id) ? 'rotate-180' : ''
                                }`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        
                        {expandedResponses.has(response.id) && (
                          <div className="px-4 pb-4 border-t border-gray-200 bg-white">
                            <div className="pt-3">
                              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {response.message}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Original Message - At Bottom */}
                <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <h3 className="text-sm font-medium text-orange-900">Original Message</h3>
                    <span className="text-xs text-orange-600">({formatDate(ticket.createdAt)})</span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {ticket.message}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Customer Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">👤 Customer Information</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                    <span className="text-emerald-600 font-semibold text-lg">
                      {ticket.userName ? ticket.userName.charAt(0).toUpperCase() : ticket.userEmail.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {ticket.userName || 'Unknown User'}
                    </div>
                    <div className="text-sm text-gray-600">
                      {ticket.userEmail}
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Category:</span>
                      <span className="text-sm font-medium text-gray-900">{ticket.category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Created:</span>
                      <span className="text-sm font-medium text-gray-900">{formatDate(ticket.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Last Update:</span>
                      <span className="text-sm font-medium text-gray-900">{formatDate(ticket.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ticket Management */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">⚙️ Ticket Management</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={ticket.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="AWAITING_RESPONSE">Awaiting Response</option>
                    <option value="RESPONDED">Responded</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority
                  </label>
                  <div className={`px-3 py-2 rounded-lg border ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority}
                  </div>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to permanently delete this ticket? This action cannot be undone.`)) {
                        // Handle delete logic here
                        console.log('Delete ticket:', ticket.id)
                      }
                    }}
                    className="w-full bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    🗑️ Delete Ticket
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 