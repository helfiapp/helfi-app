'use client'

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline'
import { formatChatContent } from '@/lib/chatFormatting'

interface SectionChatProps {
  issueSlug: string
  section: string
  issueName: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatThread = { id: string; title: string | null; createdAt: string; updatedAt: string }

export default function SectionChat({ issueSlug, section, issueName }: SectionChatProps) {
  const storageKey = useMemo(() => `helfi:insights:thread:${issueSlug}:${section}`, [issueSlug, section])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [showThreadMenu, setShowThreadMenu] = useState(false)
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showExpandControl, setShowExpandControl] = useState(false)
  const scrollPositionRef = useRef<number>(0)
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const enabled = (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || 'true').toLowerCase() === 'true' || (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || '') === '1'
  const recognitionRef = useRef<any>(null)
  const resizeRafRef = useRef<number | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Smooth single-frame resize to prevent jitter when text grows/shrinks quickly
  const resizeTextarea = useCallback(() => {
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    resizeRafRef.current = requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      const minHeight = 52
      const maxHeight = 200
      textarea.style.height = 'auto'
      const desired = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
      if (textarea.style.height !== `${desired}px`) {
        textarea.style.height = `${desired}px`
      }
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'

      // Show expand control when textarea height exceeds ~3-4 lines (around 156px for 3 lines)
      // Using scrollHeight which reflects actual content height
      const shouldShow = textarea.scrollHeight > 140 || (textarea.value.match(/\n/g) || []).length >= 2
      setShowExpandControl(shouldShow)
    })
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return
    
    // Check for speech recognition support immediately
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      setHasSpeechRecognition(true)
    } else {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let finalTranscript = ''

    recognition.onstart = () => {
      setIsListening(true)
      finalTranscript = ''
    }

    recognition.onresult = (event: any) => {
      let interimTranscript = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript
        }
      }
      
      setInput(finalTranscript + interimTranscript)
    }

    recognition.onerror = (event: any) => {
      setIsListening(false)
      if (event.error !== 'no-speech') {
        setError('Speech recognition error. Please try again.')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      if (finalTranscript.trim()) {
        setInput(finalTranscript.trim())
      }
    }

    recognitionRef.current = recognition
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop()
    }
  }, [enabled])

  // Track client-side mount so we can safely use portals
  useEffect(() => {
    setIsClient(true)
  }, [])

  function startListening() {
    if (!recognitionRef.current || isListening) return
    try {
      recognitionRef.current.start()
    } catch (err) {
      setError('Failed to start voice recognition')
    }
  }

  function stopListening() {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  // Load threads and current thread on mount
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ;(async () => {
      try {
        let hasThreads = false
        // Load threads
        const threadsRes = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/threads`, { cache: 'no-store' })
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          if (!cancelled && threadsData.threads && Array.isArray(threadsData.threads)) {
            setThreads(threadsData.threads)
            hasThreads = threadsData.threads.length > 0
            if (threadsData.threads.length > 0 && !threadId) {
              // Load most recent thread
              const latestThreadId = threadsData.threads[0].id
              setThreadId(latestThreadId)
              loadThreadMessages(latestThreadId)
            }
          }
        }
        // Only try backward compatibility if we have NO threads (to avoid creating duplicates)
        if (!cancelled && !hasThreads && !threadId) {
          const res = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/chat`, { cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            if (!cancelled && typeof data?.threadId === 'string') {
              setThreadId(data.threadId)
              const serverMessages = Array.isArray(data?.messages)
                ? data.messages.map((m: any) => ({ role: m.role, content: m.content })).filter((m: any) => m?.content)
                : []
              if (!cancelled && serverMessages.length) setMessages(serverMessages)
            }
          }
        }
      } catch {}
      // Also hydrate from localStorage if server has nothing yet
      if (!cancelled && messages.length === 0) {
        try {
          const saved = localStorage.getItem(storageKey)
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) {
              setMessages(parsed.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-24))
            }
          }
        } catch {}
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, issueSlug, section])

  async function loadThreadMessages(threadIdToLoad: string) {
    try {
      const res = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/chat?threadId=${threadIdToLoad}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const serverMessages = Array.isArray(data?.messages)
          ? data.messages.map((m: any) => ({ role: m.role, content: m.content })).filter((m: any) => m?.content)
          : []
        setMessages(serverMessages)
      }
    } catch (err) {
      console.error('Failed to load thread messages:', err)
    }
  }

  async function handleNewChat() {
    try {
      const res = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        const newThreadId = data.threadId
        setThreadId(newThreadId)
        setMessages([])
        // Reload threads
        const threadsRes = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/threads`, { cache: 'no-store' })
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          if (threadsData.threads) setThreads(threadsData.threads)
        }
      }
    } catch (err) {
      console.error('Failed to create new thread:', err)
    }
  }

  async function handleDeleteThread(threadIdToDelete: string) {
    if (!confirm('Delete this chat?')) return
    try {
      const res = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/threads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadIdToDelete }),
      })
      if (res.ok) {
        // Reload threads
        const threadsRes = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/threads`, { cache: 'no-store' })
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          if (threadsData.threads) {
            setThreads(threadsData.threads)
            if (threadsData.threads.length > 0) {
              const newThreadId = threadsData.threads[0].id
              setThreadId(newThreadId)
              loadThreadMessages(newThreadId)
            } else {
              setThreadId(null)
              setMessages([])
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete thread:', err)
    }
  }

  // Persist a lightweight copy locally for UX continuity
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storageKey])

  // Only auto-scroll when user sends a message, not on initial load
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  
  useEffect(() => {
    // Only scroll if user has interacted (sent a message)
    if (hasUserInteracted && messages.length > 0) {
      // Use setTimeout to ensure scroll happens after render
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [messages, loading, hasUserInteracted])

  // NOTE: We intentionally do NOT manipulate page scroll when expanding.
  // The expanded chat is rendered in a fullscreen portal overlay,
  // so closing it simply removes the overlay and leaves page scroll
  // exactly where it was.

  useEffect(() => {
    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    }
  }, [])

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const form = (event.target as HTMLTextAreaElement).closest('form') as HTMLFormElement | null
      form?.requestSubmit()
    }
  }

  async function handleClear() {
    try {
      if (!enabled) return
      setLoading(true)
      setError(null)
      await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/chat`, { method: 'DELETE' })
      setMessages([])
      setThreadId(null)
      try { localStorage.removeItem(storageKey) } catch {}
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text) {
      setError('Enter a question to ask the AI.')
      return
    }
    try {
      setLoading(true)
      setError(null)
      stopListening()
      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
      setMessages(nextMessages)
      setInput('')

      // Attempt streaming via SSE to new chat endpoint
      const url = `/api/insights/issues/${issueSlug}/sections/${section}/chat`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ 
          message: text,
          threadId: threadId || undefined,
          newThread: false, // Never create a new thread automatically - user must click "+ New"
        }),
      })
      if (res.ok && (res.headers.get('content-type') || '').includes('text/event-stream') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let hasAssistant = false
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const chunk of parts) {
            if (chunk.startsWith('data: ')) {
              const raw = chunk.slice(6).trim()
              let token = ''
              // Prefer JSON payloads to preserve newlines; fall back to raw
              try {
                const parsed = JSON.parse(raw)
                if (typeof parsed === 'string') {
                  token = parsed
                } else if (parsed && typeof parsed.token === 'string') {
                  token = parsed.token
                } else {
                  token = raw
                }
              } catch {
                token = raw
              }
              if (!hasAssistant) {
                setMessages((prev) => [...prev, { role: 'assistant', content: token }])
                hasAssistant = true
              } else {
                setMessages((prev) => {
                  const copy = prev.slice()
                  copy[copy.length - 1] = { role: 'assistant', content: (copy[copy.length - 1] as any).content + token }
                  return copy
                })
              }
            } else if (chunk.startsWith('event: end')) {
              // Response complete - reload threads to get updated title
              const threadsRes = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/threads`, { cache: 'no-store' })
              if (threadsRes.ok) {
                const threadsData = await threadsRes.json()
                if (threadsData.threads) {
                  setThreads(threadsData.threads)
                  // Update threadId if we created a new thread
                  if (!threadId && threadsData.threads.length > 0) {
                    setThreadId(threadsData.threads[0].id)
                  }
                }
              }
            }
          }
        }
      } else {
        // Fallback to non-streaming JSON
        const data = await res.json().catch(() => null)
        const textOut = data?.assistant as string | undefined
        if (textOut) {
          setMessages((prev) => [...prev, { role: 'assistant', content: textOut }])
        }
        // Update threadId if returned
        if (data?.threadId) {
          setThreadId(data.threadId)
          // Reload threads to get updated titles
          const threadsRes = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/threads`, { cache: 'no-store' })
          if (threadsRes.ok) {
            const threadsData = await threadsRes.json()
            if (threadsData.threads) setThreads(threadsData.threads)
          }
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!enabled) return null
  const sectionClass = expanded
    ? 'fixed inset-0 z-[9999] bg-white flex flex-col h-[100dvh]'
    : 'flex flex-col h-[calc(100vh-140px)] md:h-full bg-white md:rounded-2xl md:border md:shadow-sm relative'

  const chatUI = (
    <div
      className={sectionClass}
      style={
        expanded
          ? {
              paddingTop: 'calc(env(safe-area-inset-top, 16px))',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }
          : undefined
      }
    >
      {/* Thread Selector Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center justify-between relative">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setShowThreadMenu(!showThreadMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors min-w-0 flex-1"
          >
            <span className="truncate text-sm font-medium text-gray-700">
              {threadId ? threads.find(t => t.id === threadId)?.title || 'New Chat' : 'New Chat'}
            </span>
            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showThreadMenu && (
            <div className="absolute left-4 top-12 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto min-w-[200px]">
              <button
                type="button"
                onClick={() => {
                  handleNewChat()
                  setShowThreadMenu(false)
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 border-b border-gray-100"
              >
                + New Chat
              </button>
              {threads.map((thread) => (
                <div key={thread.id} className="flex items-center group">
                  <button
                    type="button"
                    onClick={() => {
                      setThreadId(thread.id)
                      loadThreadMessages(thread.id)
                      setShowThreadMenu(false)
                    }}
                    className={`flex-1 px-4 py-2 text-left text-sm hover:bg-gray-100 truncate ${
                      threadId === thread.id ? 'bg-gray-50' : ''
                    }`}
                  >
                    {thread.title || 'New Chat'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteThread(thread.id)}
                    className="px-2 py-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleNewChat}
          className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          + New
        </button>
      </div>
      {/* Messages Area - ChatGPT style */}
      <div className="px-4 pb-2 text-sm text-gray-500">
        AI replies use credits (billed at 2× OpenAI cost). Typical: 2–4 credits per reply, depending on length.
      </div>
      <div
        ref={containerRef}
        className={`overflow-y-auto overflow-x-hidden px-4 py-6 space-y-6 min-w-0 w-full max-w-3xl mx-auto ${expanded ? 'flex-1 min-h-0' : 'min-h-[220px]'}`}
        aria-live="polite"
        style={{
          maxWidth: '100%',
          wordWrap: 'break-word',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        }}
      >
        {messages.length === 0 && !loading && (
          <div className="w-full md:max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">How can I help you today?</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                `How do these recommendations help ${issueName}?`,
                'Are there safety interactions to watch?',
                'What should I try first this week?',
                `Tell me more about ${issueName}`,
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm text-gray-700 transition-colors"
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={`flex gap-4 w-full md:max-w-3xl mx-auto ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              {m.role === 'user' ? (
                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              )}
            </div>
            <div className={`flex-1 min-w-0 ${m.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block max-w-full px-4 py-2.5 rounded-2xl ${
                m.role === 'user' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-900'
              }`} style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                <div className="text-lg leading-relaxed break-words">
                  {(() => {
                    const formatted = formatChatContent(m.content)
                    // Split by double newlines first to get paragraphs
                    const paragraphs = formatted.split(/\n\n+/)
                    return paragraphs.map((para, paraIdx) => {
                      const trimmed = para.trim()
                      if (!trimmed) return null
                      
                      // Split paragraph into lines
                      const lines = trimmed.split('\n')
                      
                      return (
                        <div key={paraIdx} className={paraIdx > 0 ? 'mt-4' : ''}>
                          {lines.map((line, lineIdx) => {
                            const lineTrimmed = line.trim()
                            if (!lineTrimmed) return <div key={lineIdx} className="h-2" />
                            
                            // Check for bold heading (entire line is bold)
                            if (lineTrimmed.startsWith('**') && lineTrimmed.endsWith('**') && lineTrimmed.length > 4) {
                              return (
                                <div key={lineIdx} className="font-bold text-gray-900 mb-2 mt-3 first:mt-0">
                                  {lineTrimmed.slice(2, -2)}
                                </div>
                              )
                            }
                            
                            // Check for numbered list
                            const numberedMatch = lineTrimmed.match(/^(\d+)\.\s+(.+)$/)
                            if (numberedMatch) {
                              const parts = numberedMatch[2].split(/(\*\*.*?\*\*)/g)
                              return (
                                <div key={lineIdx} className="ml-4 mb-1.5">
                                  <span className="font-medium">{numberedMatch[1]}.</span>{' '}
                                  {parts.map((part, j) => {
                                    if (part.startsWith('**') && part.endsWith('**')) {
                                      return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                                    }
                                    return <span key={j}>{part}</span>
                                  })}
                                </div>
                              )
                            }
                            
                            // Check for bullet point
                            const bulletMatch = lineTrimmed.match(/^[-•*]\s+(.+)$/)
                            if (bulletMatch) {
                              const parts = bulletMatch[1].split(/(\*\*.*?\*\*)/g)
                              return (
                                <div key={lineIdx} className="ml-4 mb-1.5">
                                  <span className="mr-2">•</span>
                                  {parts.map((part, j) => {
                                    if (part.startsWith('**') && part.endsWith('**')) {
                                      return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                                    }
                                    return <span key={j}>{part}</span>
                                  })}
                                </div>
                              )
                            }
                            
                            // Regular paragraph line - parse inline bold
                            const parts = lineTrimmed.split(/(\*\*.*?\*\*)/g)
                            return (
                              <div key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
                                {parts.map((part, j) => {
                                  if (part.startsWith('**') && part.endsWith('**')) {
                                    return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                                  }
                                  return <span key={j}>{part}</span>
                                })}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-4 w-full md:max-w-3xl mx-auto">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="inline-block px-4 py-2.5 rounded-2xl bg-gray-100">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area - ChatGPT style */}
      <div className="border-t border-gray-200 bg-white">
        {error && (
          <div className="px-4 py-2 text-sm text-red-600 bg-red-50">{error}</div>
        )}
        <form
          className="px-4 py-3 sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 shadow-[0_-6px_18px_rgba(0,0,0,0.08)] flex-shrink-0"
          onSubmit={handleSubmit}
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <div className="w-full md:max-w-3xl mx-auto flex items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="px-3 h-10 rounded-full text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                aria-label="Clear chat"
              >
                Reset
              </button>
            )}
            {hasSpeechRecognition && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={loading}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={isListening ? 'Stop listening' : 'Start voice input'}
              >
                {isListening ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                )}
              </button>
            )}
            <div className="flex-1 relative flex items-center min-w-0">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value)
                  resizeTextarea()
                }}
                onKeyDown={onComposerKeyDown}
                placeholder="Ask anything"
                rows={1}
                className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 pr-14 text-[16px] leading-6 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 resize-none transition-all duration-200 min-h-[52px] max-h-[200px]"
              />
              {false && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setExpanded((v) => !v)
                  }}
                  className="absolute right-14 top-2.5 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors z-10"
                  aria-label={expanded ? 'Exit expanded chat view' : 'Expand chat area'}
                >
                  {expanded ? (
                    <ArrowsPointingInIcon className="w-4 h-4" />
                  ) : (
                    <ArrowsPointingOutIcon className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !input.trim() || isListening}
                className="absolute right-2 bottom-2 w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )

  if (expanded && isClient && typeof document !== 'undefined') {
    return createPortal(chatUI, document.body)
  }

  return chatUI
}
