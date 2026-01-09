'use client'

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
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
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [actionThreadId, setActionThreadId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const enabled = (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || 'true').toLowerCase() === 'true' || (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || '') === '1'
  const recognitionRef = useRef<any>(null)
  const resizeRafRef = useRef<number | null>(null)
  const [isClient, setIsClient] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  const currentThreadTitle = useMemo(() => {
    if (!threadId) return 'New chat'
    return threads.find((thread) => thread.id === threadId)?.title || 'New chat'
  }, [threadId, threads])

  const threadGroups = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const groups = {
      today: [] as ChatThread[],
      yesterday: [] as ChatThread[],
      week: [] as ChatThread[],
      older: [] as ChatThread[],
    }
    threads.forEach((thread) => {
      const updated = new Date(thread.updatedAt)
      updated.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((startOfToday.getTime() - updated.getTime()) / 86400000)
      if (diffDays <= 0) {
        groups.today.push(thread)
      } else if (diffDays === 1) {
        groups.yesterday.push(thread)
      } else if (diffDays < 7) {
        groups.week.push(thread)
      } else {
        groups.older.push(thread)
      }
    })
    return [
      { label: 'Today', items: groups.today },
      { label: 'Yesterday', items: groups.yesterday },
      { label: 'Previous 7 days', items: groups.week },
      { label: 'Older', items: groups.older },
    ]
  }, [threads])

  const hasThreads = threadGroups.some((group) => group.items.length > 0)
  // Smooth single-frame resize to prevent jitter when text grows/shrinks quickly
  const resizeTextarea = useCallback(() => {
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    resizeRafRef.current = requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      const container = containerRef.current
      const shouldStick =
        container && container.scrollHeight - container.scrollTop - container.clientHeight < 24
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
      if (shouldStick && container) {
        container.scrollTop = container.scrollHeight
      }
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

  // Auto-resize textarea pre-paint to reduce flicker
  useLayoutEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

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

  function handleSelectThread(threadIdToSelect: string) {
    setThreadId(threadIdToSelect)
    loadThreadMessages(threadIdToSelect)
    setThreadsOpen(false)
  }

  function openThreadActions(targetThreadId: string) {
    setActionThreadId(targetThreadId)
    setDeleteConfirmOpen(false)
    longPressTriggeredRef.current = true
  }

  function closeThreadActions() {
    setActionThreadId(null)
    setDeleteConfirmOpen(false)
    longPressTriggeredRef.current = false
  }

  function startLongPress(event: PointerEvent, targetThreadId: string) {
    if (event.pointerType !== 'touch') return
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = window.setTimeout(() => {
      openThreadActions(targetThreadId)
    }, 500)
  }

  function endLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
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
        setThreadsOpen(false)
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
        setThreadsOpen(false)
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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (messages.length === 0 && !loading) return
    container.scrollTop = container.scrollHeight
  }, [messages, loading])

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
    ? 'fixed inset-0 z-[9999] bg-[#f6f8f7] flex flex-col h-[100dvh] overflow-hidden'
    : 'flex flex-col h-[70dvh] md:h-[640px] bg-[#f6f8f7] md:rounded-2xl md:border md:shadow-sm relative overflow-hidden'

  const threadList = (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg bg-white border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300 h-10 px-3 transition-all duration-200"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 20 }}>add</span>
            <span className="text-sm font-medium text-gray-600">New chat</span>
          </div>
          <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 18 }}>edit_square</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {threadGroups.map((group) => (
          group.items.length > 0 ? (
            <div key={group.label} className="flex flex-col gap-1">
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-2">
                {group.label}
              </h3>
              {group.items.map((thread) => (
                <div key={thread.id} className="flex items-center gap-2 group">
                  <button
                    type="button"
                    onClick={() => {
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false
                        return
                      }
                      handleSelectThread(thread.id)
                    }}
                    onPointerDown={(event) => startLongPress(event, thread.id)}
                    onPointerUp={endLongPress}
                    onPointerCancel={endLongPress}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      openThreadActions(thread.id)
                    }}
                    className={`flex-1 min-w-0 flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      threadId === thread.id
                        ? 'bg-white shadow-sm border border-gray-100'
                        : 'hover:bg-gray-100/80'
                    }`}
                    style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                  >
                    <span className={`flex-1 min-w-0 truncate text-[13px] font-medium ${
                      threadId === thread.id ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {thread.title || 'New chat'}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ) : null
        ))}
        {!hasThreads && (
          <div className="px-3 text-xs text-gray-400">No chats yet.</div>
        )}
      </div>
    </div>
  )

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
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#f6f8f7]/95 backdrop-blur px-4 py-3 border-b border-gray-200/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setThreadsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 lg:hidden"
            aria-label="Open chat list"
          >
            <span className="material-symbols-outlined text-2xl text-gray-700">menu</span>
          </button>
        </div>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold text-gray-900">Insights chat</div>
          <div className="text-[11px] text-gray-400 hidden md:block truncate">{currentThreadTitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label="New chat"
          >
            <span className="material-symbols-outlined text-2xl text-gray-700">edit_square</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label={expanded ? 'Exit full screen' : 'Full screen'}
          >
            <span className="material-symbols-outlined text-2xl text-gray-700">
              {expanded ? 'close_fullscreen' : 'open_in_full'}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden lg:flex w-[260px] flex-col bg-[#f9fafb] border-r border-gray-100">
          {threadList}
        </aside>

        <section className="flex flex-col flex-1 min-h-0">
          <div
            ref={containerRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-6"
            aria-live="polite"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-10">
              <div className="text-[11px] text-gray-400">
                AI replies use credits (billed at 2× OpenAI cost). Typical: 2–4 credits per reply.
              </div>

              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center text-center">
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900">How can I help you today?</h2>
                  <div className="mt-6 grid w-full max-w-md gap-3">
                    {[
                      `How do these recommendations help ${issueName}?`,
                      'Are there safety interactions to watch?',
                      'What should I try first this week?',
                      `Tell me more about ${issueName}`,
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setInput(q)}
                        className="rounded-xl border border-gray-200 bg-white p-4 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
                        type="button"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, idx) => (
                <div key={idx} className={`group flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    m.role === 'user'
                      ? 'bg-black text-white shadow-md'
                      : 'border border-gray-100 bg-white text-black shadow-sm'
                  }`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {m.role === 'user' ? 'person' : 'smart_toy'}
                    </span>
                  </div>
                  <div className={`${m.role === 'user' ? 'max-w-[85%] text-right' : 'flex-1'}`}>
                    {m.role === 'assistant' ? (
                      <div className="space-y-2 rounded-2xl border border-gray-100 bg-[#fcfcfc] px-6 py-5 shadow-sm">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Insights</div>
                        <div className="text-[16px] md:text-[15px] leading-7 text-gray-800">
                          {(() => {
                            const formatted = formatChatContent(m.content)
                            const paragraphs = formatted.split(/\n\n+/)
                            return paragraphs.map((para, paraIdx) => {
                              const trimmed = para.trim()
                              if (!trimmed) return null
                              const lines = trimmed.split('\n')
                              return (
                                <div key={paraIdx} className={paraIdx > 0 ? 'mt-4' : ''}>
                                  {lines.map((line, lineIdx) => {
                                    const lineTrimmed = line.trim()
                                    if (!lineTrimmed) return <div key={lineIdx} className="h-2" />

                                    if (lineTrimmed.startsWith('**') && lineTrimmed.endsWith('**') && lineTrimmed.length > 4) {
                                      return (
                                        <div key={lineIdx} className="font-bold text-gray-900 mb-2 mt-3 first:mt-0">
                                          {lineTrimmed.slice(2, -2)}
                                        </div>
                                      )
                                    }

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
                    ) : (
                      <div className="text-[16px] md:text-[15px] leading-7 text-gray-900 font-medium">
                        {(() => {
                          const formatted = formatChatContent(m.content)
                          const paragraphs = formatted.split(/\n\n+/)
                          return paragraphs.map((para, paraIdx) => {
                            const trimmed = para.trim()
                            if (!trimmed) return null
                            const lines = trimmed.split('\n')
                            return (
                              <div key={paraIdx} className={paraIdx > 0 ? 'mt-4' : ''}>
                                {lines.map((line, lineIdx) => {
                                  const lineTrimmed = line.trim()
                                  if (!lineTrimmed) return <div key={lineIdx} className="h-2" />

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
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="group flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-100 bg-white text-black shadow-sm">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>smart_toy</span>
                  </div>
                  <div className="flex-1">
                    <div className="inline-block rounded-2xl border border-gray-100 bg-[#fcfcfc] px-6 py-5 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative bg-gradient-to-t from-[#f6f8f7] via-[#f6f8f7]/95 to-transparent pt-8 pb-6">
            <div className="mx-auto max-w-3xl px-4">
              <form
                className="relative flex w-full flex-col rounded-2xl border border-gray-200 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all focus-within:shadow-lg focus-within:border-gray-300"
                onSubmit={handleSubmit}
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Ask anything"
                  rows={1}
                  className="max-h-[200px] min-h-[60px] w-full resize-none bg-transparent px-4 py-[18px] text-[16px] text-black placeholder-gray-400 focus:outline-none border-none focus:ring-0"
                />
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
                  {hasSpeechRecognition && (
                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      disabled={loading}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        isListening
                          ? 'bg-red-500 text-white'
                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                      } disabled:opacity-50`}
                      aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>mic</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading || !input.trim() || isListening}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-sm"
                    aria-label="Send message"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>
                  </button>
                </div>
              </form>
              {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
              <div className="mt-3 text-center text-[11px] text-gray-400">
                AI can make mistakes. Please verify important information.
              </div>
            </div>
          </div>
        </section>
      </div>

      {threadsOpen && (
        <div className="fixed inset-0 z-[9999] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setThreadsOpen(false)}
            aria-label="Close chat list"
          />
          <div className="absolute left-0 top-0 h-full w-[280px] bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">Chats</div>
              <button
                type="button"
                onClick={() => setThreadsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100"
                aria-label="Close chat list"
              >
                <span className="material-symbols-outlined text-xl text-gray-700">close</span>
              </button>
            </div>
            {threadList}
          </div>
        </div>
      )}

      {actionThreadId && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={closeThreadActions}
            aria-label="Close chat actions"
          />
          <div className="relative w-full max-w-sm bg-white rounded-t-2xl shadow-xl">
            {!deleteConfirmOpen && (
              <div className="px-2 py-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete
                  <span className="material-symbols-outlined text-red-500" style={{ fontSize: 20 }}>delete</span>
                </button>
              </div>
            )}

            {deleteConfirmOpen && (
              <div className="px-4 py-4">
                <div className="text-sm font-semibold text-gray-900 mb-2">Delete this chat?</div>
                <div className="text-xs text-gray-500 mb-4">This can’t be undone.</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeThreadActions}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!actionThreadId) return
                      await handleDeleteThread(actionThreadId)
                      closeThreadActions()
                    }}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  if (expanded && isClient && typeof document !== 'undefined') {
    return createPortal(chatUI, document.body)
  }

  return chatUI
}
