'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getCurrentSupportAgent, getSupportAgentForTimestamp } from '@/lib/support-agents'

type SupportAttachment = {
  id?: string
  name: string
  url: string
  path?: string
  type?: string
  size?: number
}

const URL_REGEX = /https?:\/\/[^\s]+/g

const ATTACHMENTS_MARKER = '[[ATTACHMENTS]]'

const STORAGE_KEYS = {
  open: 'helfi:support:widget:open',
  hidden: 'helfi:support:widget:hidden',
  guestTicketId: 'helfi:support:guest:ticketId',
  guestToken: 'helfi:support:guest:token',
  guestName: 'helfi:support:guest:name',
  guestEmail: 'helfi:support:guest:email',
  guestHistory: 'helfi:support:guest:history',
}

export default function SupportChatWidget() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isHome = pathname === '/'
  const isLoggedIn = Boolean(session?.user?.email)
  const isOpenedFromNativeApp = searchParams.get('helfiNative') === '1'
  const [isOpen, setIsOpen] = useState(false)
  const [isWidgetHidden, setIsWidgetHidden] = useState(false)
  const [hasReachedAnchor, setHasReachedAnchor] = useState(!isHome)
  const [animateIn, setAnimateIn] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAwaitingReply, setIsAwaitingReply] = useState(false)
  const [ticket, setTicket] = useState<any | null>(null)
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<SupportAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [optimisticMessages, setOptimisticMessages] = useState<Array<{
    id: string
    message: string
    attachments: SupportAttachment[]
    isAdminResponse: boolean
    createdAt: string
  }>>([])
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestToken, setGuestToken] = useState('')
  const [guestTicketId, setGuestTicketId] = useState('')
  const [guestHistory, setGuestHistory] = useState<Array<{
    ticketId: string
    token: string
    subject: string
    createdAt: string
    updatedAt: string
  }>>([])
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const isChatClosed = ticket && ['RESOLVED', 'CLOSED'].includes(ticket.status)
  const shouldHideWidget =
    pathname === '/support' ||
    pathname.startsWith('/admin-panel') ||
    pathname.startsWith('/main-admin') ||
    pathname.startsWith('/auth/') ||
    isOpenedFromNativeApp
  const agent = useMemo(() => {
    if (ticket?.createdAt) {
      return getSupportAgentForTimestamp(new Date(ticket.createdAt))
    }
    return getCurrentSupportAgent()
  }, [ticket?.createdAt])
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOpen(window.localStorage.getItem(STORAGE_KEYS.open) === 'true')
    setIsWidgetHidden(window.localStorage.getItem(STORAGE_KEYS.hidden) === 'true')
    setGuestTicketId(window.localStorage.getItem(STORAGE_KEYS.guestTicketId) || '')
    setGuestToken(window.localStorage.getItem(STORAGE_KEYS.guestToken) || '')
    setGuestName(window.localStorage.getItem(STORAGE_KEYS.guestName) || '')
    setGuestEmail(window.localStorage.getItem(STORAGE_KEYS.guestEmail) || '')
    try {
      const rawHistory = window.localStorage.getItem(STORAGE_KEYS.guestHistory)
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory)
        if (Array.isArray(parsed)) {
          setGuestHistory(parsed)
        }
      }
    } catch {
      setGuestHistory([])
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.open, String(isOpen))
  }, [isOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.hidden, String(isWidgetHidden))
  }, [isWidgetHidden])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isHome) {
      setHasReachedAnchor(true)
      return
    }
    setHasReachedAnchor(false)
    const anchor = document.querySelector('[data-chat-anchor="food-photo-analysis"]')
    if (!anchor) {
      setHasReachedAnchor(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasReachedAnchor(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [isHome])

  useEffect(() => {
    if (!hasReachedAnchor || isWidgetHidden) {
      setAnimateIn(false)
      return
    }
    const raf = window.requestAnimationFrame(() => setAnimateIn(true))
    return () => window.cancelAnimationFrame(raf)
  }, [hasReachedAnchor, isWidgetHidden])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (guestTicketId) {
      window.localStorage.setItem(STORAGE_KEYS.guestTicketId, guestTicketId)
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.guestTicketId)
    }
  }, [guestTicketId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (guestToken) {
      window.localStorage.setItem(STORAGE_KEYS.guestToken, guestToken)
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.guestToken)
    }
  }, [guestToken])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (guestName) {
      window.localStorage.setItem(STORAGE_KEYS.guestName, guestName)
    }
    if (guestEmail) {
      window.localStorage.setItem(STORAGE_KEYS.guestEmail, guestEmail)
    }
  }, [guestName, guestEmail])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.guestHistory, JSON.stringify(guestHistory))
  }, [guestHistory])

  const splitMessageAttachments = (messageText: string) => {
    const markerIndex = messageText.indexOf(ATTACHMENTS_MARKER)
    if (markerIndex === -1) {
      return { text: messageText, attachments: [] as SupportAttachment[] }
    }
    const text = messageText.slice(0, markerIndex).trim()
    const raw = messageText.slice(markerIndex + ATTACHMENTS_MARKER.length).trim()
    if (!raw) {
      return { text, attachments: [] as SupportAttachment[] }
    }
    try {
      const parsed = JSON.parse(raw)
      const parsedAttachments = Array.isArray(parsed)
        ? parsed
            .map((item) => ({
              id: item?.id ? String(item.id) : undefined,
              name: String(item?.name || ''),
              url: String(item?.url || ''),
              path: item?.path ? String(item.path) : undefined,
              type: item?.type ? String(item.type) : undefined,
              size: typeof item?.size === 'number' ? item.size : undefined,
            }))
            .filter((item) => item.name && item.url)
        : []
      return { text, attachments: parsedAttachments }
    } catch {
      return { text: messageText, attachments: [] as SupportAttachment[] }
    }
  }

  const serializeMessageWithAttachments = (text: string, items: SupportAttachment[]) => {
    if (!items.length) return text
    const payload = items.map((att) => ({
      id: att.id,
      name: att.name,
      url: att.url,
      path: att.path,
      type: att.type,
      size: att.size,
    }))
    return `${text}\n\n${ATTACHMENTS_MARKER}\n${JSON.stringify(payload)}`
  }

  const conversationItems = useMemo(() => {
    if (!ticket) return [...optimisticMessages]
    const initial = splitMessageAttachments(String(ticket.message || ''))
    const base = [
      {
        id: `ticket-${ticket.id}`,
        message: initial.text,
        attachments: initial.attachments,
        isAdminResponse: false,
        createdAt: ticket.createdAt,
      },
    ]
    const responses = (ticket.responses || [])
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
          createdAt: response.createdAt,
        }
      })
    return [...base, ...responses, ...optimisticMessages]
  }, [ticket, optimisticMessages])

  useEffect(() => {
    if (!isOpen) return
    const timer = window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOpen, conversationItems.length])

  const loadTicket = useCallback(async (forceLoad = false) => {
    if (!forceLoad && !isOpen) return
    setIsLoading(true)
    try {
      if (isLoggedIn) {
        const response = await fetch('/api/support/tickets?activeOnly=1')
        if (response.ok) {
          const result = await response.json()
          const nextTicket = result.ticket || null
          setTicket(nextTicket)
          setFeedbackSubmitted(Boolean(result.ticket?.responses?.some((res: any) => String(res.message || '').startsWith('[FEEDBACK]'))))
          if (nextTicket) {
            setIsOpen(!isWidgetHidden)
          } else {
            setIsOpen(false)
          }
        }
      } else if (guestTicketId && guestToken) {
        const response = await fetch(`/api/support/inquiry?ticketId=${guestTicketId}&token=${guestToken}`)
        if (response.ok) {
          const result = await response.json()
          setTicket(result.ticket || null)
          setFeedbackSubmitted(Boolean(result.ticket?.responses?.some((res: any) => String(res.message || '').startsWith('[FEEDBACK]'))))
        }
      }
    } catch (error) {
      console.error('Error loading support chat:', error)
    }
    setIsLoading(false)
  }, [isOpen, isLoggedIn, guestTicketId, guestToken, isWidgetHidden])

  useEffect(() => {
    if (isOpen) {
      loadTicket()
    }
  }, [isOpen, loadTicket])

  useEffect(() => {
    if (!isLoggedIn) return
    loadTicket(true)
  }, [isLoggedIn, loadTicket])

  const uploadSupportFile = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    if (!isLoggedIn && guestTicketId && guestToken) {
      formData.append('ticketId', guestTicketId)
      formData.append('token', guestToken)
    }

    const endpoint = isLoggedIn ? '/api/support/uploads' : '/api/support/inquiry/uploads'
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error?.error || 'Upload failed')
    }
    return response.json()
  }

  const handleUploadFiles = async (files: File[]) => {
    if (!files.length) return
    setAttachmentError('')
    setIsUploading(true)
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
            size: result.size,
          } as SupportAttachment
        })
      )
      setAttachments((prev) => [...prev, ...uploads])
    } catch (error: any) {
      setAttachmentError(error?.message || 'Failed to upload file')
    } finally {
      setIsUploading(false)
    }
  }

  const handlePasteUpload = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items || [])
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      await handleUploadFiles(imageFiles)
    }
  }

  const createGuestChat = async (payloadMessage: string, payloadAttachments: SupportAttachment[], optimisticId: string) => {
    if (!guestEmail.trim() || (!payloadMessage.trim() && payloadAttachments.length === 0)) return
    setIsLoading(true)
    try {
      const response = await fetch('/api/support/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: guestName.trim(),
          email: guestEmail.trim(),
          message: serializeMessageWithAttachments(payloadMessage.trim(), payloadAttachments),
        }),
      })
      if (response.ok) {
        const result = await response.json()
        setTicket(result.ticket || null)
        setGuestToken(result.token || '')
        setGuestTicketId(result.ticket?.id || '')
        if (result.ticket?.id && result.token) {
          setGuestHistory((prev) => {
            const existing = prev.find((item) => item.ticketId === result.ticket.id)
            if (existing) return prev
            return [
              {
                ticketId: result.ticket.id,
                token: result.token,
                subject: result.ticket.subject || 'Support chat',
                createdAt: result.ticket.createdAt || new Date().toISOString(),
                updatedAt: result.ticket.updatedAt || new Date().toISOString(),
              },
              ...prev,
            ]
          })
        }
        setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
      }
      if (!response.ok) {
        setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
      }
    } catch (error) {
      console.error('Error starting inquiry chat:', error)
      setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
    }
    setIsLoading(false)
    setIsAwaitingReply(false)
  }

  const sendMessage = async () => {
    const trimmedMessage = message.trim()
    const outgoingAttachments = attachments
    if (!trimmedMessage && outgoingAttachments.length === 0) return
    if (isChatClosed || isLoading || isUploading) return
    if (!ticket && !isLoggedIn && !guestEmail.trim()) return

    triggerHaptic()
    setIsAwaitingReply(true)
    const optimisticId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        message: trimmedMessage,
        attachments: outgoingAttachments,
        isAdminResponse: false,
        createdAt: new Date().toISOString(),
      },
    ])
    setMessage('')
    setAttachments([])
    if (!ticket) {
      if (isLoggedIn) {
        setIsLoading(true)
        try {
          const response = await fetch('/api/support/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              subject: 'Support chat',
              message: serializeMessageWithAttachments(message.trim(), attachments),
              category: 'TECHNICAL',
              priority: 'MEDIUM',
            }),
          })
          if (response.ok) {
            const result = await response.json()
            setTicket(result.ticket || null)
            setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
          }
          if (!response.ok) {
            setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
          }
        } catch (error) {
          console.error('Error creating support chat:', error)
          setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
        }
        setIsLoading(false)
        setIsAwaitingReply(false)
      } else {
        await createGuestChat(trimmedMessage, outgoingAttachments, optimisticId)
      }
      return
    }

    setIsLoading(true)
    try {
      const endpoint = isLoggedIn ? '/api/support/tickets' : '/api/support/inquiry'
      const payload = isLoggedIn
        ? { action: 'add_response', ticketId: ticket.id, message: serializeMessageWithAttachments(message.trim(), attachments) }
        : { action: 'add_response', ticketId: ticket.id, token: guestToken, message: serializeMessageWithAttachments(message.trim(), attachments) }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const result = await response.json()
        setTicket(result.ticket || null)
        setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
      }
      if (!response.ok) {
        setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
      }
    } catch (error) {
      console.error('Error sending support message:', error)
      setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId))
    }
    setIsLoading(false)
    setIsAwaitingReply(false)
  }

  const handleChatKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (isChatClosed || isLoading || isUploading) return
    if (!isLoggedIn && !guestEmail.trim()) return
    sendMessage()
  }

  const endChat = async () => {
    if (!ticket) return
    triggerHaptic()
    setIsLoading(true)
    try {
      const endpoint = isLoggedIn ? '/api/support/tickets' : '/api/support/inquiry'
      const payload = isLoggedIn
        ? { action: 'end_chat', ticketId: ticket.id }
        : { action: 'end_chat', ticketId: ticket.id, token: guestToken }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        const result = await response.json()
        setTicket(result.ticket || null)
      }
    } catch (error) {
      console.error('Error ending support chat:', error)
    }
    setIsLoading(false)
    setIsAwaitingReply(false)
  }

  const submitFeedback = async () => {
    if (!ticket || feedbackRating < 1) return
    triggerHaptic()
    setIsLoading(true)
    try {
      const endpoint = isLoggedIn ? '/api/support/tickets' : '/api/support/inquiry'
      const payload = isLoggedIn
        ? { action: 'submit_feedback', ticketId: ticket.id, rating: feedbackRating, comment: feedbackComment.trim() }
        : { action: 'submit_feedback', ticketId: ticket.id, token: guestToken, rating: feedbackRating, comment: feedbackComment.trim() }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        const result = await response.json()
        setTicket(result.ticket || null)
        setFeedbackSubmitted(true)
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
    }
    setIsLoading(false)
  }

  const startNewChat = () => {
    triggerHaptic()
    setTicket(null)
    setMessage('')
    setAttachments([])
    setOptimisticMessages([])
    setFeedbackRating(0)
    setFeedbackComment('')
    setFeedbackSubmitted(false)
    setIsAwaitingReply(false)
    if (!isLoggedIn) {
      setGuestToken('')
      setGuestTicketId('')
    }
  }

  const clearChat = () => {
    triggerHaptic()
    setTicket(null)
    setMessage('')
    setAttachments([])
    setOptimisticMessages([])
    setFeedbackRating(0)
    setFeedbackComment('')
    setFeedbackSubmitted(false)
    setIsOpen(false)
    setIsAwaitingReply(false)
    if (!isLoggedIn) {
      setGuestToken('')
      setGuestTicketId('')
    }
  }

  const openGuestTicket = async (ticketId: string, token: string) => {
    triggerHaptic()
    setIsLoading(true)
    try {
      const response = await fetch(`/api/support/inquiry?ticketId=${ticketId}&token=${token}`)
      if (response.ok) {
        const result = await response.json()
        setTicket(result.ticket || null)
        setGuestTicketId(ticketId)
        setGuestToken(token)
      }
    } catch (error) {
      console.error('Error loading guest ticket:', error)
    }
    setIsLoading(false)
  }

  const deleteGuestTicket = async (ticketId: string, token: string) => {
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Delete this ticket permanently? This cannot be undone.')
      : false
    if (!confirmed) return
    triggerHaptic()
    try {
      const response = await fetch('/api/support/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_ticket', ticketId, token }),
      })
      if (response.ok) {
        setGuestHistory((prev) => prev.filter((item) => item.ticketId !== ticketId))
        if (guestTicketId === ticketId) {
          setTicket(null)
          setGuestTicketId('')
          setGuestToken('')
        }
      }
    } catch (error) {
      console.error('Error deleting guest ticket:', error)
    }
  }

  if (shouldHideWidget) return null
  if (isLoggedIn) return null
  if (!hasReachedAnchor) return null

  const containerClassName = isOpen
    ? 'fixed inset-0 z-[60] md:inset-auto md:bottom-24 md:right-5'
    : 'fixed bottom-5 right-4 md:bottom-24 md:right-5 z-[60] max-w-[calc(100vw-2rem)]'

  const handleHideWidget = () => {
    triggerHaptic()
    setIsOpen(false)
    setIsWidgetHidden(true)
  }

  const handleShowWidget = () => {
    triggerHaptic()
    setIsWidgetHidden(false)
  }

  return (
    <div className={containerClassName}>
      {isWidgetHidden && (
        <button
          type="button"
          onClick={handleShowWidget}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-100 bg-white/90 text-emerald-600 shadow-lg transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] backdrop-blur"
          aria-label="Show chat"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M4 4h16v11H7l-3 3V4zm3 5h10v2H7V9zm0-4h10v2H7V5z" />
          </svg>
        </button>
      )}

      {!isWidgetHidden && (
        <div className={`transition-all duration-500 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          {!isOpen && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  triggerHaptic()
                  setIsOpen(true)
                }}
                className="group flex items-center gap-3 rounded-full border border-emerald-100 bg-white/90 px-4 py-2 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] backdrop-blur"
              >
                <Image
                  src={agent.avatar}
                  alt={`${agent.name} avatar`}
                  width={36}
                  height={36}
                  className="rounded-full object-cover ring-2 ring-white"
                />
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Chat with {agent.name}</div>
                  <div className="text-xs text-gray-500">Questions? We’re here.</div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleHideWidget}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 bg-white/90 text-gray-500 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:text-gray-700 hover:shadow-lg active:scale-[0.98] backdrop-blur"
                aria-label="Hide chat widget"
                title="Hide"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M10 12l-6-7h12l-6 7z" />
                </svg>
              </button>
            </div>
          )}

          {isOpen && (
            <div className="w-full h-full max-w-none max-h-none bg-white rounded-none shadow-none border-0 flex flex-col min-h-0 md:w-[360px] md:max-w-[92vw] md:h-[520px] md:max-h-[80vh] md:rounded-2xl md:shadow-[0_18px_60px_rgba(16,24,40,0.18)] md:border md:border-gray-100">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/95 backdrop-blur-md rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Image
                      src={agent.avatar}
                      alt={`${agent.name} avatar`}
                      width={36}
                      height={36}
                      className="rounded-full object-cover border border-gray-100"
                    />
                    <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                  </div>
                  <div className="flex flex-col">
                    <div className="text-sm font-bold text-gray-900">{agent.name}</div>
                    <div className={`text-[11px] font-semibold ${isChatClosed ? 'text-gray-400' : 'text-emerald-600'}`}>
                      {isChatClosed ? 'Chat Closed' : 'Active Support'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="flex items-center gap-1 text-emerald-600 text-[11px] font-bold bg-emerald-50 px-2.5 py-1.5 rounded-full transition-colors active:scale-95"
                  >
                    <span className="text-sm">+</span>
                    Ticket
                  </button>
                  <button
                    type="button"
                    onClick={handleHideWidget}
                    className="text-gray-400 hover:text-gray-600 active:scale-95 transition-transform"
                    aria-label="Hide chat widget"
                    title="Hide"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <path d="M10 12l-6-7h12l-6 7z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic()
                      setIsOpen(false)
                    }}
                    className="text-gray-400 hover:text-gray-600 active:scale-95 transition-transform"
                    aria-label="Close chat"
                  >
                    ✕
                  </button>
                </div>
              </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="space-y-5">
              {isLoading && !ticket && (
                <div className="text-xs text-gray-500 text-center">Loading chat...</div>
              )}

              {!ticket && !isLoggedIn && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600">
                    Hi! I am {agent.name}. Share your question to start the chat.
                  </p>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-gray-100 border border-gray-200 rounded-full px-4 py-2 text-sm"
                  />
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="Your email"
                    className="w-full bg-gray-100 border border-gray-200 rounded-full px-4 py-2 text-sm"
                  />
                  {guestHistory.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.18em] mb-2">
                        Past tickets
                      </div>
                      <div className="space-y-2">
                        {guestHistory.map((item) => (
                          <div key={item.ticketId} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-gray-800 truncate">{item.subject}</div>
                              <div className="text-[10px] text-gray-400">
                                {new Date(item.updatedAt || item.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openGuestTicket(item.ticketId, item.token)}
                                className="text-[11px] font-semibold text-emerald-600"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteGuestTicket(item.ticketId, item.token)}
                                className="text-[11px] font-semibold text-red-500"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {ticket && isChatClosed && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  This chat is closed. Start a new chat if you need more help.
                </div>
              )}

              {conversationItems.length === 0 && !isLoading && (
                <div className="text-[11px] text-gray-400 text-center">No messages yet.</div>
              )}

              {conversationItems.map((item) => {
                const timeLabel = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
                const isAdmin = item.isAdminResponse
                const fileTag = (attType?: string) => (attType?.includes('pdf') ? 'PDF' : 'FILE')
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
                      <div
                        className={`text-base font-normal leading-relaxed max-w-[85%] rounded-2xl px-4 py-2.5 break-words ${isAdmin ? 'rounded-bl-none bg-gray-100 text-gray-800' : 'rounded-br-none bg-helfi-green text-white shadow-sm'}`}
                      >
                        {renderMessageWithLinks(item.message)}
                      </div>
                      {item.attachments?.length > 0 && (
                        <div className={`flex flex-col gap-2 w-full ${isAdmin ? 'items-start' : 'items-end'}`}>
                          {item.attachments.map((att: SupportAttachment) => {
                            const isImage = att.type?.startsWith('image/')
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
                                    <div className="relative w-full h-28">
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
                                    <div className="bg-emerald-100 flex items-center justify-center rounded-lg w-9 h-9 text-emerald-600 text-[11px] font-bold">
                                      {fileTag(att.type)}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                      <p className="text-gray-900 text-xs font-semibold truncate">{att.name}</p>
                                      <p className="text-gray-400 text-[10px] font-medium uppercase tracking-wider">
                                        {att.type || 'Document'}
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
              <div ref={messagesEndRef} />
            </div>
          </div>

          {ticket && isChatClosed && (
            <div className="bg-gray-50 border-t border-gray-100 px-4 py-4 space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="w-full text-[11px] border border-gray-300 text-gray-700 rounded-full px-3 py-2 active:scale-[0.98] transition-transform"
                >
                  Start a new chat
                </button>
                <button
                  type="button"
                  onClick={clearChat}
                  className="w-full text-[11px] border border-gray-300 text-gray-700 rounded-full px-3 py-2 active:scale-[0.98] transition-transform"
                >
                  Clear chat
                </button>
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-gray-900 text-[13px] font-bold tracking-tight">How was your support experience?</h3>
                <p className="text-gray-400 text-[11px] font-medium">Your feedback helps us improve.</p>
              </div>
              {feedbackSubmitted ? (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                  Thanks for the feedback.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between gap-2">
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
                        <span className="text-sm font-bold">{rating}</span>
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs"
                    placeholder="Optional comment..."
                  />
                  <button
                    type="button"
                    onClick={submitFeedback}
                    disabled={feedbackRating < 1 || isLoading}
                    className="w-full bg-helfi-green text-white rounded-full px-3 py-2 text-xs disabled:opacity-50 active:scale-[0.98] transition-transform"
                  >
                    {isLoading ? 'Submitting...' : 'Submit feedback'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isChatClosed && (
            <div className="border-t border-gray-100 px-4 py-3">
              {attachmentError && <p className="mb-2 text-xs text-red-600">{attachmentError}</p>}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div key={att.url} className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded-full text-[11px]">
                      <span className="truncate max-w-[140px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic()
                          setAttachments((prev) => prev.filter((item) => item.url !== att.url))
                        }}
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
                    onChange={(e) => handleUploadFiles(Array.from(e.target.files || []))}
                  />
                </label>
                <div className="flex-1">
                  <textarea
                    rows={1}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onPaste={handlePasteUpload}
                    onKeyDown={handleChatKeyDown}
                    className="w-full bg-gray-100 border-none rounded-full px-4 py-2.5 text-base focus:ring-1 focus:ring-emerald-200 placeholder:text-gray-400"
                    placeholder="Type a message..."
                  />
                </div>
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={isUploading || isLoading || (!message.trim() && attachments.length === 0) || (!isLoggedIn && !guestEmail.trim())}
                  className="inline-flex items-center justify-center w-10 h-10 bg-helfi-green text-white rounded-full shadow-md disabled:opacity-50 active:scale-95 transition-transform"
                  aria-label="Send message"
                  title="Send"
                >
                  {isLoading || isUploading ? (
                    <span className="text-[10px]">...</span>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                {ticket && (
                  <button
                    type="button"
                    onClick={endChat}
                    className="text-emerald-600 hover:text-emerald-700"
                  >
                    End chat
                  </button>
                )}
                {!isLoggedIn && !guestEmail.trim() && (
                  <span>Add your email to start the chat.</span>
                )}
              </div>
            </div>
          )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
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
