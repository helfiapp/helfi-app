'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'

type SupportAttachment = {
  id?: string
  name: string
  url: string
  type?: string
  size?: number
}

const SUPPORT_AGENT_NAME = 'Maya'
const SUPPORT_AGENT_ROLE = 'Helfi Support'
const SUPPORT_AGENT_AVATAR = '/support/maya.jpg'
const ATTACHMENTS_MARKER = '[[ATTACHMENTS]]'

const STORAGE_KEYS = {
  open: 'helfi:support:widget:open',
  guestTicketId: 'helfi:support:guest:ticketId',
  guestToken: 'helfi:support:guest:token',
  guestName: 'helfi:support:guest:name',
  guestEmail: 'helfi:support:guest:email',
}

export default function SupportChatWidget() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const isLoggedIn = Boolean(session?.user?.email)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [ticket, setTicket] = useState<any | null>(null)
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<SupportAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestToken, setGuestToken] = useState('')
  const [guestTicketId, setGuestTicketId] = useState('')
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  const isChatClosed = ticket && ['RESOLVED', 'CLOSED'].includes(ticket.status)
  const shouldHideWidget = pathname === '/support' || pathname.startsWith('/admin-panel') || pathname.startsWith('/main-admin')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOpen(window.localStorage.getItem(STORAGE_KEYS.open) === 'true')
    setGuestTicketId(window.localStorage.getItem(STORAGE_KEYS.guestTicketId) || '')
    setGuestToken(window.localStorage.getItem(STORAGE_KEYS.guestToken) || '')
    setGuestName(window.localStorage.getItem(STORAGE_KEYS.guestName) || '')
    setGuestEmail(window.localStorage.getItem(STORAGE_KEYS.guestEmail) || '')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.open, String(isOpen))
  }, [isOpen])

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
      type: att.type,
      size: att.size,
    }))
    return `${text}\n\n${ATTACHMENTS_MARKER}\n${JSON.stringify(payload)}`
  }

  const conversationItems = useMemo(() => {
    if (!ticket) return []
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
    return [...base, ...responses]
  }, [ticket])

  const loadTicket = useCallback(async () => {
    if (!isOpen) return
    setIsLoading(true)
    try {
      if (isLoggedIn) {
        const response = await fetch('/api/support/tickets?activeOnly=1')
        if (response.ok) {
          const result = await response.json()
          setTicket(result.ticket || null)
          setFeedbackSubmitted(Boolean(result.ticket?.responses?.some((res: any) => String(res.message || '').startsWith('[FEEDBACK]'))))
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
  }, [isOpen, isLoggedIn, guestTicketId, guestToken])

  useEffect(() => {
    if (isOpen) {
      loadTicket()
    }
  }, [isOpen, loadTicket])

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

  const createGuestChat = async () => {
    if (!guestEmail.trim() || !message.trim()) return
    setIsLoading(true)
    try {
      const response = await fetch('/api/support/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: guestName.trim(),
          email: guestEmail.trim(),
          message: serializeMessageWithAttachments(message.trim(), attachments),
        }),
      })
      if (response.ok) {
        const result = await response.json()
        setTicket(result.ticket || null)
        setGuestToken(result.token || '')
        setGuestTicketId(result.ticket?.id || '')
        setMessage('')
        setAttachments([])
      }
    } catch (error) {
      console.error('Error starting inquiry chat:', error)
    }
    setIsLoading(false)
  }

  const sendMessage = async () => {
    if (!message.trim() && attachments.length === 0) return
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
            setMessage('')
            setAttachments([])
          }
        } catch (error) {
          console.error('Error creating support chat:', error)
        }
        setIsLoading(false)
      } else {
        await createGuestChat()
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
        setMessage('')
        setAttachments([])
      }
    } catch (error) {
      console.error('Error sending support message:', error)
    }
    setIsLoading(false)
  }

  const endChat = async () => {
    if (!ticket) return
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
  }

  const submitFeedback = async () => {
    if (!ticket || feedbackRating < 1) return
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
    setTicket(null)
    setMessage('')
    setAttachments([])
    setFeedbackRating(0)
    setFeedbackComment('')
    setFeedbackSubmitted(false)
    if (!isLoggedIn) {
      setGuestToken('')
      setGuestTicketId('')
    }
  }

  if (shouldHideWidget) return null

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 bg-white border border-gray-200 shadow-lg rounded-full px-4 py-2 hover:shadow-xl transition-shadow"
        >
          <Image
            src={SUPPORT_AGENT_AVATAR}
            alt={`${SUPPORT_AGENT_NAME} avatar`}
            width={36}
            height={36}
            className="rounded-full object-cover"
          />
          <div className="text-left">
            <div className="text-sm font-semibold text-gray-900">Chat with {SUPPORT_AGENT_NAME}</div>
            <div className="text-xs text-gray-500">Questions? We’re here.</div>
          </div>
        </button>
      )}

      {isOpen && (
        <div className="w-[360px] max-w-[92vw] h-[520px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Image
                src={SUPPORT_AGENT_AVATAR}
                alt={`${SUPPORT_AGENT_NAME} avatar`}
                width={36}
                height={36}
                className="rounded-full object-cover"
              />
              <div>
                <div className="text-sm font-semibold text-gray-900">{SUPPORT_AGENT_NAME}</div>
                <div className="text-xs text-gray-500">{SUPPORT_AGENT_ROLE}</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {isLoading && !ticket && (
              <div className="text-xs text-gray-500">Loading chat...</div>
            )}

            {!ticket && !isLoggedIn && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Hi! I’m {SUPPORT_AGENT_NAME}. Ask me anything about Helfi and I’ll help out.
                </p>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="Your email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            {ticket && isChatClosed && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                This chat is closed. Start a new chat if you need more help.
              </div>
            )}

            {conversationItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg p-3 ${item.isAdminResponse ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'bg-gray-50 border-l-4 border-gray-300'}`}
              >
                <div className="flex items-center justify-between mb-1 text-[11px] text-gray-500">
                  <span className="flex items-center gap-2">
                    {item.isAdminResponse ? (
                      <>
                        <Image
                          src={SUPPORT_AGENT_AVATAR}
                          alt={`${SUPPORT_AGENT_NAME} avatar`}
                          width={18}
                          height={18}
                          className="rounded-full object-cover"
                        />
                        {SUPPORT_AGENT_NAME}
                      </>
                    ) : (
                      'You'
                    )}
                  </span>
                  <span>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : ''}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.message}</p>
                {item.attachments?.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {item.attachments.map((att: SupportAttachment) => (
                      <a
                        key={`${item.id}-${att.url}`}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-gray-200 rounded-lg p-2 bg-white hover:bg-gray-50 transition-colors"
                      >
                        {att.type?.startsWith('image/') ? (
                          <div className="space-y-2">
                            <div className="relative w-full h-32">
                              <Image
                                src={att.url}
                                alt={att.name}
                                fill
                                className="object-cover rounded-md"
                              />
                            </div>
                            <div className="text-xs text-gray-600 truncate">{att.name}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-700">
                            <div className="font-medium">{att.name}</div>
                            <div className="text-[11px] text-gray-500">{att.type || 'Document'}</div>
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {ticket && isChatClosed && (
            <div className="px-4 pb-3">
              <button
                type="button"
                onClick={startNewChat}
                className="mb-3 w-full text-xs border border-gray-300 text-gray-700 rounded-lg px-3 py-2"
              >
                Start a new chat
              </button>
              {feedbackSubmitted ? (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  Thanks for the feedback.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">How was your support experience?</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setFeedbackRating(rating)}
                        className={`px-2 py-1 rounded border text-xs ${feedbackRating === rating ? 'bg-emerald-500 text-white border-emerald-500' : 'border-gray-300 text-gray-700'}`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    placeholder="Optional comment..."
                  />
                  <button
                    type="button"
                    onClick={submitFeedback}
                    disabled={feedbackRating < 1 || isLoading}
                    className="w-full bg-helfi-green text-white rounded-lg px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {isLoading ? 'Submitting...' : 'Submit feedback'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isChatClosed && (
            <div className="border-t border-gray-200 px-4 py-3 space-y-2">
              {attachmentError && <p className="text-xs text-red-600">{attachmentError}</p>}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div key={att.url} className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded-full text-[11px]">
                      <span className="truncate max-w-[140px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((item) => item.url !== att.url))}
                        className="text-gray-500 hover:text-gray-700"
                        aria-label={`Remove ${att.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onPaste={handlePasteUpload}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                placeholder="Type your message..."
              />
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-600 cursor-pointer border border-gray-300 rounded-lg px-2 py-1">
                  Attach
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => handleUploadFiles(Array.from(e.target.files || []))}
                  />
                </label>
                <div className="flex items-center gap-2">
                  {ticket && (
                    <button
                      type="button"
                      onClick={endChat}
                      className="text-xs border border-emerald-500 text-emerald-700 rounded-lg px-2 py-1"
                    >
                      End chat
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={isUploading || isLoading || (!message.trim() && attachments.length === 0) || (!isLoggedIn && !guestEmail.trim())}
                    className="text-xs bg-helfi-green text-white rounded-lg px-3 py-1 disabled:opacity-50"
                  >
                    {isLoading || isUploading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
              {!isLoggedIn && !guestEmail.trim() && (
                <p className="text-[11px] text-gray-500">Add your email to start the chat.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
