'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getCurrentSupportAgent, getSupportAgentForTimestamp } from '@/lib/support-agents'

type SupportAttachment = {
  id?: string
  name: string
  url: string
  path?: string
  type?: string
  size?: number
}

const ATTACHMENTS_MARKER = '[[ATTACHMENTS]]'
const URL_REGEX = /https?:\/\/[^\s]+/g

export default function SupportPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const RETURN_KEY = 'helfi:support:returnTo'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [activeTicket, setActiveTicket] = useState<any | null>(null)
  const [isLoadingTicket, setIsLoadingTicket] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [isSendingChat, setIsSendingChat] = useState(false)
  const [isAwaitingReply, setIsAwaitingReply] = useState(false)
  const [chatAttachments, setChatAttachments] = useState<SupportAttachment[]>([])
  const [formAttachments, setFormAttachments] = useState<SupportAttachment[]>([])
  const [isUploadingChatAttachment, setIsUploadingChatAttachment] = useState(false)
  const [isUploadingFormAttachment, setIsUploadingFormAttachment] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [showChatComposer, setShowChatComposer] = useState(false)
  const [showChatView, setShowChatView] = useState(true)
  const [showPostSubmitChoice, setShowPostSubmitChoice] = useState(false)
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null)
  const [ticketHistory, setTicketHistory] = useState<Array<{
    id: string
    subject: string
    status: string
    priority: string
    category: string
    createdAt: string
    updatedAt: string
  }>>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<Array<{
    id: string
    message: string
    attachments: SupportAttachment[]
    isAdminResponse: boolean
    createdAt: string
  }>>([])
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const agent = activeTicket?.createdAt
    ? getSupportAgentForTimestamp(new Date(activeTicket.createdAt))
    : getCurrentSupportAgent()
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8)
    }
  }, [])

  const renderMessageWithLinks = (text: string) => {
    if (!text) return text
    const matches = Array.from(text.matchAll(URL_REGEX))
    if (matches.length === 0) return text
    const nodes: Array<string | JSX.Element> = []
    let lastIndex = 0
    matches.forEach((match, index) => {
      const start = match.index ?? 0
      const rawUrl = match[0]
      if (start > lastIndex) {
        nodes.push(text.slice(lastIndex, start))
      }
      let url = rawUrl
      let trailing = ''
      const trailingMatch = url.match(/[),.;!?]+$/)
      if (trailingMatch) {
        trailing = trailingMatch[0]
        url = url.slice(0, -trailing.length)
      }
      nodes.push(
        <a
          key={`url-${index}-${start}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-helfi-green underline break-words"
        >
          {url}
        </a>
      )
      if (trailing) {
        nodes.push(trailing)
      }
      lastIndex = start + rawUrl.length
    })
    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex))
    }
    return nodes
  }

  const formatMessageTime = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const getConversationDayLabel = (items: Array<{ createdAt: string }>) => {
    if (!items.length) return 'Today'
    const last = items[items.length - 1]
    if (!last?.createdAt) return 'Today'
    const date = new Date(last.createdAt)
    if (Number.isNaN(date.getTime())) return 'Today'
    const today = new Date()
    const isSameDay = date.toDateString() === today.toDateString()
    return isSameDay ? 'Today' : date.toLocaleDateString()
  }

  const formatFileSize = (size?: number) => {
    if (!size || size <= 0) return ''
    if (size < 1024) return `${size} B`
    const kb = size / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }
  
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

  const loadActiveTicket = useCallback(async () => {
    if (!session?.user?.email) return
    setIsLoadingTicket(true)
    try {
      const response = await fetch('/api/support/tickets?activeOnly=1')
      if (response.ok) {
        const result = await response.json()
        const clearedTicketId = typeof window !== 'undefined' ? window.localStorage.getItem('helfi:support:cleared-ticket') || '' : ''
        const isClearedClosed =
          clearedTicketId &&
          result.ticket?.id === clearedTicketId &&
          ['RESOLVED', 'CLOSED'].includes(result.ticket?.status)
        setActiveTicket(isClearedClosed ? null : (result.ticket || null))
        setFeedbackSubmitted(Boolean(result.ticket?.responses?.some((res: any) => String(res.message || '').startsWith('[FEEDBACK]'))))
      }
    } catch (error) {
      console.error('Error loading support ticket:', error)
    }
    setIsLoadingTicket(false)
  }, [session?.user?.email])

  const loadTicketHistory = useCallback(async () => {
    if (!session?.user?.email) return
    setIsLoadingHistory(true)
    try {
      const response = await fetch('/api/support/tickets?list=1&activeOnly=0')
      if (response.ok) {
        const result = await response.json()
        setTicketHistory(Array.isArray(result.tickets) ? result.tickets : [])
      }
    } catch (error) {
      console.error('Error loading support ticket history:', error)
    }
    setIsLoadingHistory(false)
  }, [session?.user?.email])

  useEffect(() => {
    if (session?.user?.email) {
      loadActiveTicket()
      loadTicketHistory()
    }
  }, [session, loadActiveTicket, loadTicketHistory])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const referrer = document.referrer
    if (!referrer) return
    try {
      const url = new URL(referrer)
      if (url.origin === window.location.origin && url.pathname !== '/support') {
        const target = `${url.pathname}${url.search}${url.hash}`
        window.sessionStorage.setItem(RETURN_KEY, target)
      }
    } catch {
      return
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeTicket && session?.user?.email) {
      window.localStorage.setItem('helfi:support:widget:open', 'true')
    }
  }, [activeTicket, session?.user?.email])

  useEffect(() => {
    if (!activeTicket) return
    const timer = window.setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeTicket?.id, activeTicket?.responses?.length, optimisticMessages.length])

  const splitMessageAttachments = (message: string) => {
    const markerIndex = message.indexOf(ATTACHMENTS_MARKER)
    if (markerIndex === -1) {
      return { text: message, attachments: [] as SupportAttachment[] }
    }
    const text = message.slice(0, markerIndex).trim()
    const raw = message.slice(markerIndex + ATTACHMENTS_MARKER.length).trim()
    if (!raw) {
      return { text, attachments: [] as SupportAttachment[] }
    }
    try {
      const parsed = JSON.parse(raw)
      const attachments = Array.isArray(parsed)
        ? parsed
            .map((item) => ({
              id: item?.id ? String(item.id) : undefined,
              name: String(item?.name || ''),
              url: String(item?.url || ''),
              path: item?.path ? String(item.path) : undefined,
              type: item?.type ? String(item.type) : undefined,
              size: typeof item?.size === 'number' ? item.size : undefined
            }))
            .filter((item) => item.name && item.url)
        : []
      return { text, attachments }
    } catch {
      return { text: message, attachments: [] as SupportAttachment[] }
    }
  }

  const serializeMessageWithAttachments = (text: string, attachments: SupportAttachment[]) => {
    if (!attachments.length) return text
    const payload = attachments.map((att) => ({
      id: att.id,
      name: att.name,
      url: att.url,
      path: att.path,
      type: att.type,
      size: att.size
    }))
    return `${text}\n\n${ATTACHMENTS_MARKER}\n${JSON.stringify(payload)}`
  }

  const uploadSupportFile = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/support/uploads', {
      method: 'POST',
      body: formData
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error?.error || 'Upload failed')
    }
    return response.json()
  }

  const handleUploadFiles = async (
    files: File[],
    setAttachments: React.Dispatch<React.SetStateAction<SupportAttachment[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!files.length) return
    setAttachmentError('')
    setUploading(true)
    try {
      const uploads = await Promise.all(
        files.map(async (file) => {
          const result = await uploadSupportFile(file)
          return {
            id: result.fileId,
            name: result.name,
            url: result.url,
            path: result.path,
            type: result.type,
            size: result.size
          } as SupportAttachment
        })
      )
      setAttachments((prev) => [...prev, ...uploads])
    } catch (error: any) {
      setAttachmentError(error?.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  const handlePasteUpload = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
    setAttachments: React.Dispatch<React.SetStateAction<SupportAttachment[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const items = Array.from(event.clipboardData?.items || [])
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      await handleUploadFiles(imageFiles, setAttachments, setUploading)
    }
  }

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
      const messageWithAttachments = serializeMessageWithAttachments(formData.message, formAttachments)
      const endpoint = session ? '/api/support/tickets' : '/api/admin/tickets'
      const payload = session
        ? {
            action: 'create',
            subject: formData.subject || `${formData.inquiryType} - ${inquiryTypes.find(t => t.value === formData.inquiryType)?.label}`,
            message: messageWithAttachments,
            category: formData.inquiryType.toUpperCase(),
            priority: formData.inquiryType === 'account' || formData.inquiryType === 'billing' ? 'HIGH' : 'MEDIUM'
          }
        : {
            action: 'create',
            subject: formData.subject || `${formData.inquiryType} - ${inquiryTypes.find(t => t.value === formData.inquiryType)?.label}`,
            message: messageWithAttachments,
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
        const result = await response.json().catch(() => ({}))
        setSubmitStatus('success')
        if (session) {
          setActiveTicket(result.ticket || null)
          setSubmittedTicketId(result.ticket?.id || null)
          setShowPostSubmitChoice(true)
          setShowChatView(false)
          setShowChatComposer(false)
          await loadTicketHistory()
        }
        setFormAttachments([])
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
    if (!chatMessage.trim() && chatAttachments.length === 0) return
    if (isChatClosed) return
    triggerHaptic()
    const trimmedMessage = chatMessage.trim()
    const outgoingAttachments = chatAttachments
    const optimisticId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        message: trimmedMessage,
        attachments: outgoingAttachments,
        isAdminResponse: false,
        createdAt: new Date().toISOString()
      }
    ])
    setChatMessage('')
    setChatAttachments([])
    setIsSendingChat(true)
    setIsAwaitingReply(true)
    try {
      const messageWithAttachments = serializeMessageWithAttachments(trimmedMessage, outgoingAttachments)
      const payload = activeTicket
        ? { action: 'add_response', ticketId: activeTicket.id, message: messageWithAttachments }
        : { action: 'create', subject: 'Support chat', message: messageWithAttachments, category: 'TECHNICAL', priority: 'MEDIUM' }
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const result = await response.json()
        setActiveTicket(result.ticket || null)
        if (result.ticket) {
          setShowChatComposer(true)
        }
        setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
        loadTicketHistory()
      }
      if (!response.ok) {
        setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
      }
    } catch (error) {
      console.error('Error sending support message:', error)
      setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
    }
    setIsSendingChat(false)
    setIsAwaitingReply(false)
  }

  const handleChatKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (!isChatClosed && !isSendingChat) {
      sendChatMessage()
    }
  }

  const startNewTicket = () => {
    triggerHaptic()
    setShowChatView(true)
    setShowPostSubmitChoice(false)
    setSubmittedTicketId(null)
    setActiveTicket(null)
    setSubmitStatus('idle')
    setChatAttachments([])
    setFormAttachments([])
    setOptimisticMessages([])
    setFeedbackRating(0)
    setFeedbackComment('')
    setFeedbackSubmitted(false)
    setAttachmentError('')
    setIsAwaitingReply(false)
    setShowChatComposer(true)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('helfi:support:cleared-ticket')
    }
    loadTicketHistory()
  }

  const clearChat = () => {
    if (typeof window !== 'undefined' && activeTicket?.id) {
      window.localStorage.setItem('helfi:support:cleared-ticket', activeTicket.id)
    }
    triggerHaptic()
    setShowChatView(false)
    setActiveTicket(null)
    setChatMessage('')
    setChatAttachments([])
    setOptimisticMessages([])
    setFeedbackRating(0)
    setFeedbackComment('')
    setFeedbackSubmitted(false)
    setIsAwaitingReply(false)
    setShowChatComposer(false)
  }

  const endChat = async () => {
    if (!activeTicket) return
    triggerHaptic()
    setIsSendingChat(true)
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'end_chat',
          ticketId: activeTicket.id
        })
      })
      if (response.ok) {
        const result = await response.json()
        setActiveTicket(result.ticket || null)
        loadTicketHistory()
      }
    } catch (error) {
      console.error('Error ending support chat:', error)
    }
    setIsSendingChat(false)
    setIsAwaitingReply(false)
  }

  const submitFeedback = async () => {
    if (!activeTicket || feedbackRating < 1) return
    triggerHaptic()
    setIsSubmittingFeedback(true)
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'submit_feedback',
          ticketId: activeTicket.id,
          rating: feedbackRating,
          comment: feedbackComment.trim()
        })
      })
      if (response.ok) {
        const result = await response.json()
        setActiveTicket(result.ticket || null)
        setFeedbackSubmitted(true)
        loadTicketHistory()
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
    }
    setIsSubmittingFeedback(false)
  }

  const shouldShowRegisteredEmail = formData.inquiryType === 'account' && !session
  const isChatClosed = activeTicket && ['RESOLVED', 'CLOSED'].includes(activeTicket.status)
  const hasFeedback = feedbackSubmitted || Boolean(activeTicket?.responses?.some((res: any) => String(res.message || '').startsWith('[FEEDBACK]')))
  const showChatPanel = Boolean(session && showChatView && (activeTicket || showChatComposer))
  const showSupportEntry = Boolean(session && !showChatPanel)
  const conversationItems = activeTicket
    ? [
        (() => {
          const parsed = splitMessageAttachments(String(activeTicket.message || ''))
          return {
            id: `ticket-${activeTicket.id}`,
            message: parsed.text,
            attachments: parsed.attachments,
            isAdminResponse: false,
            createdAt: activeTicket.createdAt
          }
        })(),
        ...(activeTicket.responses || [])
          .filter((response: any) => {
            const msg = String(response.message || '')
            return !msg.startsWith('[SYSTEM]') && !msg.startsWith('[FEEDBACK]')
          })
          .map((response: any) => {
            const parsed = splitMessageAttachments(String(response.message || ''))
            return {
              id: response.id,
              message: parsed.text,
              attachments: parsed.attachments,
              isAdminResponse: response.isAdminResponse,
              createdAt: response.createdAt
            }
          })
      ]
    : []
  const combinedConversationItems = [...conversationItems, ...optimisticMessages]

  const handleBack = () => {
    triggerHaptic()
    if (showChatPanel) {
      setShowChatView(false)
      setShowChatComposer(false)
      setShowPostSubmitChoice(false)
      return
    }
    if (typeof window !== 'undefined') {
      const stored = window.sessionStorage.getItem(RETURN_KEY)
      if (stored) {
        router.push(stored)
        return
      }
      if (window.history.length > 1) {
        router.back()
        return
      }
    }
    if (session) {
      router.push('/dashboard')
      return
    }
    router.push('/')
  }

  const openTicket = async (ticketId: string) => {
    triggerHaptic()
    setIsLoadingTicket(true)
    try {
      const response = await fetch(`/api/support/tickets?ticketId=${ticketId}&activeOnly=0`)
      if (response.ok) {
        const result = await response.json()
        if (result.ticket) {
          setActiveTicket(result.ticket)
          setShowChatComposer(true)
          setShowChatView(true)
          setShowPostSubmitChoice(false)
        }
      }
    } catch (error) {
      console.error('Error loading ticket:', error)
    }
    setIsLoadingTicket(false)
  }

  const startChatFromSubmit = () => {
    if (submittedTicketId) {
      openTicket(submittedTicketId)
    } else {
      setShowChatComposer(true)
      setShowChatView(true)
    }
    setShowPostSubmitChoice(false)
  }

  const keepEmailOnly = () => {
    setShowChatView(false)
    setShowChatComposer(false)
    setShowPostSubmitChoice(false)
  }

  const deleteTicket = async (ticketId: string) => {
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Delete this ticket permanently? This cannot be undone.')
      : false
    if (!confirmed) return
    triggerHaptic()
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_ticket', ticketId }),
      })
      if (response.ok) {
        setTicketHistory((prev) => prev.filter((ticket) => ticket.id !== ticketId))
        if (activeTicket?.id === ticketId) {
          setActiveTicket(null)
          setShowChatComposer(false)
          setShowChatView(false)
        }
      }
    } catch (error) {
      console.error('Error deleting ticket:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Page Title */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="text-sm font-semibold text-helfi-green"
          >
            ← Back
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-lg md:text-xl font-semibold text-gray-900">Get Support</h1>
            <p className="text-sm text-gray-500 hidden sm:block">We're here to help you with any questions or issues</p>
          </div>
          <span className="w-14" aria-hidden="true" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 md:px-10 py-8">
        {showSupportEntry && (
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Need help right now?</h2>
              <p className="text-sm text-gray-600">Start a support chat and we’ll assist you straight away.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic()
                setShowChatComposer(true)
                setShowChatView(true)
              }}
              className="inline-flex items-center justify-center px-5 py-2 bg-helfi-green text-white rounded-lg hover:bg-helfi-green/90 transition-colors"
            >
              Start support chat
            </button>
          </div>
        )}

        {showSupportEntry && (
          <div className="mb-10 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Past tickets</h3>
                <p className="text-sm text-gray-500">View or delete previous support chats.</p>
              </div>
            </div>
            {isLoadingHistory && (
              <div className="mt-4 text-sm text-gray-500">Loading tickets...</div>
            )}
            {!isLoadingHistory && ticketHistory.length === 0 && (
              <div className="mt-4 text-sm text-gray-500">No past tickets yet.</div>
            )}
            {!isLoadingHistory && ticketHistory.length > 0 && (
              <div className="mt-4 space-y-3">
                {ticketHistory.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{ticket.subject}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(ticket.updatedAt || ticket.createdAt).toLocaleString()} • {ticket.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openTicket(ticket.id)}
                        className="text-xs font-semibold text-helfi-green border border-helfi-green/30 px-3 py-1.5 rounded-full hover:bg-helfi-green/10"
                      >
                        View chat
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTicket(ticket.id)}
                        className="text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showChatPanel && (
          <div className="mb-10 -mx-4 md:mx-0">
            <div className="mx-auto w-full md:max-w-[900px] bg-white border-0 md:border border-gray-100 shadow-none md:shadow-2xl rounded-none md:rounded-3xl overflow-hidden flex flex-col min-h-[480px] h-[calc(100dvh-240px)] md:h-[calc(100dvh-260px)]">
              <header className="sticky top-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur-md px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Image
                      src={agent.avatar}
                      alt={`${agent.name} avatar`}
                      width={40}
                      height={40}
                      className="rounded-full object-cover border border-gray-100"
                    />
                    <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-gray-900 text-sm font-bold leading-tight">{agent.name}</h2>
                    <p className={`text-[11px] font-semibold ${isChatClosed ? 'text-gray-400' : 'text-emerald-600'}`}>
                      {isChatClosed ? 'Chat Closed' : 'Active Support'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startNewTicket}
                  className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 px-3 py-2 rounded-full transition-colors active:scale-95"
                >
                  <span className="text-sm">+</span>
                  Ticket
                </button>
              </header>

              <main className="flex-1 min-h-0 overflow-y-auto px-4 bg-white">
                <div className="py-6 flex flex-col gap-6">
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">
                      {getConversationDayLabel(combinedConversationItems)}
                    </span>
                  </div>

                  {isLoadingTicket && (
                    <div className="text-xs text-gray-500 text-center">Loading your conversation...</div>
                  )}

                  {!isLoadingTicket && combinedConversationItems.length === 0 && (
                    <div className="text-xs text-gray-400 text-center">Start your support chat below.</div>
                  )}

          {!isLoadingTicket && combinedConversationItems.map((item) => {
            const timeLabel = formatMessageTime(item.createdAt)
            const isAdmin = item.isAdminResponse
            const messageBubble = (
              <div
                className={`text-base font-normal leading-relaxed max-w-[85%] rounded-2xl px-4 py-2.5 break-words ${isAdmin ? 'rounded-bl-none bg-gray-100 text-gray-800' : 'rounded-br-none bg-helfi-green text-white shadow-sm'}`}
              >
                {renderMessageWithLinks(item.message)}
              </div>
            )

                    return (
                      <div key={item.id} className={`flex items-end gap-2.5 ${isAdmin ? '' : 'justify-end'}`}>
                        {isAdmin && (
                          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-7 h-7 shrink-0 border border-gray-100 overflow-hidden">
                            <Image
                              src={agent.avatar}
                              alt={`${agent.name} avatar`}
                              width={28}
                              height={28}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className={`flex flex-1 flex-col gap-1 ${isAdmin ? 'items-start' : 'items-end'}`}>
                          <div className="flex items-center gap-2 px-1">
                            {isAdmin ? (
                              <>
                                <p className="text-gray-500 text-[11px] font-medium leading-none">{agent.name}</p>
                                <p className="text-gray-300 text-[10px]">{timeLabel}</p>
                              </>
                            ) : (
                              <>
                                <p className="text-gray-300 text-[10px]">{timeLabel}</p>
                                <p className="text-gray-500 text-[11px] font-medium leading-none text-right">You</p>
                              </>
                            )}
                          </div>
                          {messageBubble}
                          {item.attachments?.length > 0 && (
                            <div className={`flex flex-col gap-2 w-full ${isAdmin ? 'items-start' : 'items-end'}`}>
                              {item.attachments.map((att: SupportAttachment) => {
                                const isImage = att.type?.startsWith('image/')
                                const sizeLabel = formatFileSize(att.size)
                                const fileTag = att.type?.includes('pdf') ? 'PDF' : 'FILE'
                                return (
                                  <a
                                    key={`${item.id}-${att.url}`}
                                    href={att.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`max-w-[85%] w-full rounded-xl border border-gray-200 bg-gray-50 p-3 transition-colors hover:bg-gray-100 ${isAdmin ? '' : 'self-end'}`}
                                  >
                                    {isImage ? (
                                      <div className="space-y-2">
                                        <div className="relative w-full h-36">
                                          <Image
                                            src={att.url}
                                            alt={att.name}
                                            fill
                                            className="object-cover rounded-lg"
                                          />
                                        </div>
                                        <div className="text-xs text-gray-600 truncate">{att.name}</div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-3">
                                        <div className="bg-emerald-100 flex items-center justify-center rounded-lg w-10 h-10 text-emerald-600 text-sm font-bold">
                                          {fileTag}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                          <p className="text-gray-900 text-xs font-semibold truncate">{att.name}</p>
                                          <p className="text-gray-400 text-[10px] font-medium uppercase tracking-wider">
                                            {att.type || 'Document'}{sizeLabel ? ` - ${sizeLabel}` : ''}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </a>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {isAwaitingReply && !isChatClosed && (
                    <div className="flex items-end gap-2.5">
                      <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-7 h-7 shrink-0 border border-gray-100 overflow-hidden">
                        <Image
                          src={agent.avatar}
                          alt={`${agent.name} avatar`}
                          width={28}
                          height={28}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1 items-start">
                        <div className="text-[11px] text-gray-500 px-1">Typing...</div>
                        <div className="text-base font-normal leading-relaxed max-w-[85%] rounded-2xl rounded-bl-none px-4 py-2.5 bg-gray-100 text-gray-800">
                          <span className="animate-pulse">...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </main>

              {!isChatClosed && (
                <div className="shrink-0 flex flex-col bg-white border-t border-gray-100">
                  <div className="bg-white p-4">
                    {attachmentError && (
                      <p className="mb-2 text-xs text-red-600">{attachmentError}</p>
                    )}
                    {chatAttachments.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {chatAttachments.map((att) => (
                          <div key={att.url} className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full text-[11px]">
                            <span className="truncate max-w-[160px]">{att.name}</span>
                            <button
                              type="button"
                              onClick={() => setChatAttachments((prev) => prev.filter((item) => item.url !== att.url))}
                              className="text-gray-500 hover:text-gray-700"
                              aria-label={`Remove ${att.name}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="p-2 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer">
                        <span className="text-lg">+</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={(e) => handleUploadFiles(Array.from(e.target.files || []), setChatAttachments, setIsUploadingChatAttachment)}
                          disabled={isChatClosed}
                        />
                      </label>
                      <div className="flex-1 relative flex items-center">
                        <textarea
                          rows={1}
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          onPaste={(e) => handlePasteUpload(e, setChatAttachments, setIsUploadingChatAttachment)}
                          onKeyDown={handleChatKeyDown}
                          className="w-full bg-gray-100 border-none rounded-full px-4 py-2.5 text-base focus:ring-1 focus:ring-emerald-200 placeholder:text-gray-400"
                          placeholder="Type a message..."
                          disabled={isChatClosed}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={sendChatMessage}
                        disabled={isChatClosed || isUploadingChatAttachment || (!chatMessage.trim() && chatAttachments.length === 0) || isSendingChat}
                        className="w-10 h-10 bg-helfi-green text-white rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform disabled:opacity-50"
                        aria-label="Send message"
                        title="Send"
                      >
                        {isSendingChat || isUploadingChatAttachment ? (
                          <span className="text-[10px]">...</span>
                        ) : (
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {activeTicket && (
                      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
                        <button
                          type="button"
                          onClick={endChat}
                          disabled={isChatClosed || isSendingChat}
                          className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                        >
                          End chat
                        </button>
                        {isSendingChat && <span>Sending...</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isChatClosed && (
                <div className="bg-gray-50 border-t border-gray-100 p-5 pb-6 space-y-5">
                  <div className="text-center space-y-1">
                    <h3 className="text-gray-900 text-[15px] font-bold tracking-tight">How was your support experience?</h3>
                    <p className="text-gray-400 text-[11px] font-medium">Your feedback helps us improve.</p>
                  </div>
                  {hasFeedback ? (
                    <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                      Thanks for the feedback. We appreciate it.
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between gap-2 max-w-[320px] mx-auto">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => {
                              triggerHaptic()
                              setFeedbackRating(rating)
                            }}
                            className={`flex-1 aspect-square rounded-xl border flex items-center justify-center transition-all ${feedbackRating === rating ? 'bg-helfi-green text-white border-helfi-green shadow-lg' : 'bg-white border-gray-200 text-gray-400 hover:border-emerald-200 hover:text-emerald-600'}`}
                          >
                            <span className="text-lg font-bold">{rating}</span>
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={2}
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                        placeholder="Optional comment..."
                      />
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={submitFeedback}
                          disabled={feedbackRating < 1 || isSubmittingFeedback}
                          className="px-5 py-2 bg-helfi-green text-white rounded-full hover:bg-helfi-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmittingFeedback ? 'Submitting...' : 'Submit feedback'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {(!session || showSupportEntry) && (
          <div className="mt-6">
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

          {session && showPostSubmitChoice && (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <div className="text-sm font-semibold text-emerald-900">Would you like to chat with support now?</div>
              <p className="text-sm text-emerald-700 mt-1">You can start a live chat or just submit the ticket by email.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startChatFromSubmit}
                  className="px-4 py-2 rounded-full bg-helfi-green text-white text-sm hover:bg-helfi-green/90"
                >
                  Start chat now
                </button>
                <button
                  type="button"
                  onClick={keepEmailOnly}
                  className="px-4 py-2 rounded-full border border-emerald-300 text-emerald-800 text-sm hover:bg-emerald-100"
                >
                  Just email me
                </button>
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
                onPaste={(e) => {
                  if (session) handlePasteUpload(e, setFormAttachments, setIsUploadingFormAttachment)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                placeholder="Please provide as much detail as possible about your issue or question..."
              />
              {session && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-sm">
                    Attach files
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(e) => handleUploadFiles(Array.from(e.target.files || []), setFormAttachments, setIsUploadingFormAttachment)}
                    />
                  </label>
                  {isUploadingFormAttachment && <span className="text-xs text-gray-500">Uploading...</span>}
                </div>
              )}
              {formAttachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {formAttachments.map((att) => (
                    <div key={att.url} className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full text-xs">
                      <span className="truncate max-w-[160px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setFormAttachments((prev) => prev.filter((item) => item.url !== att.url))}
                        className="text-gray-500 hover:text-gray-700"
                        aria-label={`Remove ${att.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {attachmentError && (
                <p className="mt-2 text-sm text-red-600">{attachmentError}</p>
              )}
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting || isUploadingFormAttachment}
                className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg font-medium hover:bg-helfi-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting || isUploadingFormAttachment ? 'Submitting...' : 'Send Message'}
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
