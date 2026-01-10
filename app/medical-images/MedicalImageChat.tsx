'use client'

import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { formatChatContent } from '@/lib/chatFormatting'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type ChatThread = {
  id: string
  title: string | null
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
  lastChargedCost?: number | null
  lastChargedAt?: string | null
  lastChargeCovered?: boolean | null
}

type MedicalAnalysisResult = {
  summary?: string | null
  possibleCauses?: Array<{ name: string; whyLikely: string; confidence: string }>
  redFlags?: string[]
  nextSteps?: string[]
  analysisText?: string
}

interface MedicalImageChatProps {
  analysisResult: MedicalAnalysisResult
}

const SECTION_HEADINGS = [
  // Current chat structure
  '**Short answer**',
  '**Why this matters**',
  '**When to see a doctor**',
  '**What you can do at home**',
  // Legacy headings kept for backwards compatibility
  '**Summary of what the analysis found**',
  '**Most likely condition (high confidence)**',
  '**Other possible explanations (medium / low)**',
  '**Red-flag signs to watch for**',
  '**What you can do next**',
]

const COST_PREFIX = '__cost__'

function normaliseMedicalChatContent(raw: string): string {
  return formatChatContent(raw, { headings: SECTION_HEADINGS })
}

export default function MedicalImageChat({ analysisResult }: MedicalImageChatProps) {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [actionThreadId, setActionThreadId] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameCleared, setRenameCleared] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  const currentThread = useMemo(
    () => threads.find((thread) => thread.id === currentThreadId) || null,
    [threads, currentThreadId]
  )

  const currentThreadTitle = useMemo(() => {
    if (!currentThreadId) return 'New chat'
    return threads.find((thread) => thread.id === currentThreadId)?.title || 'New chat'
  }, [currentThreadId, threads])

  const actionThread = actionThreadId ? threads.find((thread) => thread.id === actionThreadId) : null
  const actionThreadArchived = actionThreadId ? Boolean(actionThread?.archivedAt) : false

  const threadGroups = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const visibleThreads = threads.filter((thread) => !thread.archivedAt)
    const sortedThreads = [...visibleThreads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    const groups = {
      today: [] as ChatThread[],
      yesterday: [] as ChatThread[],
      week: [] as ChatThread[],
      older: [] as ChatThread[],
    }
    sortedThreads.forEach((thread) => {
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

  const hasVisibleThreads = threadGroups.some((group) => group.items.length > 0)
  const archivedThreads = useMemo(
    () => threads.filter((thread) => thread.archivedAt),
    [threads]
  )

  const buildTitle = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return 'New chat'
    return trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed
  }, [])

  // Smooth, single-frame resize to keep composer steady during rapid updates (typing/voice)
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
      if (shouldStick && container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }, [])

  // Track client-side mount so we can safely use portals
  useEffect(() => {
    setIsClient(true)
  }, [])

  const loadThreadMessages = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/medical-images/chat?threadId=${threadId}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.messages && Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: typeof m.content === 'string' ? m.content : '',
            }))
          )
        } else {
          setMessages([])
        }
      }
    } catch {
      setMessages([])
    }
  }, [])

  const loadThreads = useCallback(
    async (preferredThreadId?: string | null) => {
      try {
        const res = await fetch('/api/medical-images/threads')
        if (res.ok) {
          const data = await res.json()
          const nextThreads = Array.isArray(data?.threads) ? data.threads : []
          setThreads(nextThreads)
          const selectedId = preferredThreadId || currentThreadId
          if (selectedId && nextThreads.some((thread: ChatThread) => thread.id === selectedId)) {
            setCurrentThreadId(selectedId)
            return
          }
          const fallback =
            nextThreads.find((thread: ChatThread) => !thread.archivedAt) || nextThreads[0] || null
          setCurrentThreadId(fallback ? fallback.id : null)
        }
      } catch {
        setThreads([])
        setCurrentThreadId(null)
      }
    },
    [currentThreadId]
  )

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!currentThreadId) {
      setMessages([])
      return
    }
    loadThreadMessages(currentThreadId)
  }, [currentThreadId, loadThreadMessages])

  // Scroll to bottom inside chat container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (messages.length === 0 && !loading) return
    container.scrollTop = container.scrollHeight

    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    }
  }, [messages, loading])

  useEffect(() => {
    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    }
  }, [])

  // Auto-resize textarea pre-paint to reduce flicker
  useLayoutEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const form = (event.target as HTMLTextAreaElement).closest('form') as HTMLFormElement | null
      form?.requestSubmit()
    }
  }

  function openThreadActions(targetThreadId: string) {
    setActionThreadId(targetThreadId)
    setRenameOpen(false)
    setDeleteConfirmOpen(false)
    longPressTriggeredRef.current = true
  }

  function closeThreadActions() {
    setActionThreadId(null)
    setRenameOpen(false)
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

  function handleSelectThread(threadId: string) {
    setCurrentThreadId(threadId)
    setThreadsOpen(false)
  }

  async function handleNewChat() {
    try {
      const res = await fetch('/api/medical-images/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { analysisResult },
        }),
      })
      if (!res.ok) return
      const data = await res.json()
      const newThreadId = data?.threadId
      if (newThreadId) {
        setCurrentThreadId(newThreadId)
        setMessages([])
        setThreadsOpen(false)
        await loadThreads(newThreadId)
      }
    } catch {
      setError('Unable to start a new chat right now.')
    }
  }

  async function handleArchiveThread(threadId: string) {
    const targetThread = threads.find((thread) => thread.id === threadId)
    if (!targetThread) return
    const nextArchived = !targetThread.archivedAt
    let nextThreadId = currentThreadId
    if (nextArchived && currentThreadId === threadId) {
      const fallback = threads.find((thread) => thread.id !== threadId && !thread.archivedAt)
      nextThreadId = fallback ? fallback.id : null
    }
    try {
      const res = await fetch('/api/medical-images/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, archived: nextArchived }),
      })
      if (res.ok) {
        await loadThreads(nextThreadId)
        if (!nextThreadId) {
          setMessages([])
        }
      }
    } catch {
      setError('Unable to update this chat right now.')
    }
    closeThreadActions()
  }

  async function handleRenameThread(threadId: string, nextTitle: string) {
    const title = nextTitle.trim()
    if (!title) return
    try {
      const res = await fetch('/api/medical-images/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, title }),
      })
      if (res.ok) {
        await loadThreads(threadId)
      }
    } catch {
      setError('Unable to rename this chat right now.')
    }
  }

  async function handleDeleteThread(threadId: string) {
    try {
      const res = await fetch('/api/medical-images/threads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      })
      if (!res.ok) return
      const remaining = threads.filter((thread) => thread.id !== threadId)
      const fallback =
        remaining.find((thread) => !thread.archivedAt) || remaining[0] || null
      await loadThreads(fallback ? fallback.id : null)
      if (!fallback) {
        setMessages([])
      }
    } catch {
      setError('Unable to delete this chat right now.')
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

      let activeThreadId = currentThreadId
      if (!activeThreadId) {
        const createRes = await fetch('/api/medical-images/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: { analysisResult },
          }),
        })
        if (createRes.ok) {
          const data = await createRes.json()
          activeThreadId = data?.threadId || null
          if (activeThreadId) {
            setCurrentThreadId(activeThreadId)
            setMessages([])
            await loadThreads(activeThreadId)
          }
        }
      }

      if (!activeThreadId) {
        throw new Error('Unable to start a chat right now.')
      }

      const now = new Date().toISOString()
      setMessages((prev) => [...prev, { role: 'user', content: text }])
      setThreads((prev) => {
        const hasThread = prev.some((thread) => thread.id === activeThreadId)
        if (!hasThread) {
          return [
            {
              id: activeThreadId,
              title: buildTitle(text),
              archivedAt: null,
              createdAt: now,
              updatedAt: now,
              lastChargedCost: null,
              lastChargedAt: null,
              lastChargeCovered: null,
            },
            ...prev,
          ]
        }
        return prev.map((thread) =>
          thread.id === activeThreadId
            ? {
                ...thread,
                updatedAt: now,
                title: thread.title || buildTitle(text),
              }
            : thread
        )
      })
      setInput('')

      const res = await fetch('/api/medical-images/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          threadId: activeThreadId,
          message: text,
          analysisResult,
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
              const token = chunk.slice(6)
              if (token.startsWith(COST_PREFIX)) {
                try {
                  const payload = JSON.parse(token.slice(COST_PREFIX.length))
                  if (payload && typeof payload.costCents === 'number') {
                    const costNow = new Date().toISOString()
                    setThreads((prev) =>
                      prev.map((thread) =>
                        thread.id === activeThreadId
                          ? {
                              ...thread,
                              lastChargedCost: payload.costCents,
                              lastChargedAt: costNow,
                              lastChargeCovered: Boolean(payload.covered),
                            }
                          : thread
                      )
                    )
                  }
                } catch {}
                continue
              }
              if (!hasAssistant) {
                setMessages((prev) => [...prev, { role: 'assistant', content: token }])
                hasAssistant = true
              } else {
                setMessages((prev) => {
                  const copy = prev.slice()
                  const last = copy[copy.length - 1]
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = {
                      role: 'assistant',
                      content: last.content + token,
                    }
                  }
                  return copy
                })
              }
            }
          }
        }
      } else {
        const data = await res.json().catch(() => null)
        const textOut = data?.assistant as string | undefined
        if (textOut) {
          setMessages((prev) => [...prev, { role: 'assistant', content: textOut }])
        }
        if (typeof data?.costCents === 'number') {
          setThreads((prev) =>
            prev.map((thread) =>
              thread.id === activeThreadId
                ? {
                    ...thread,
                    lastChargedCost: data.costCents,
                    lastChargedAt: new Date().toISOString(),
                    lastChargeCovered: Boolean(data.covered),
                  }
                : thread
            )
          )
        }
      }
      await loadThreads(activeThreadId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const sectionClass = expanded
    ? 'fixed inset-0 z-[9999] bg-[#f6f8f7] flex flex-col h-[100dvh] overflow-hidden'
    : 'bg-[#f6f8f7] overflow-hidden md:rounded-2xl md:border md:shadow-sm relative flex flex-col h-[70dvh] md:h-[640px]'

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
                      currentThreadId === thread.id
                        ? 'bg-white shadow-sm border border-gray-100'
                        : 'hover:bg-gray-100/80'
                    }`}
                    style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                  >
                    <span className={`flex-1 min-w-0 truncate text-[13px] font-medium ${
                      currentThreadId === thread.id ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {thread.title || 'New chat'}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ) : null
        ))}
        {archivedThreads.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-2">
              Archived
            </h3>
            {archivedThreads.map((thread) => (
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
                    currentThreadId === thread.id
                      ? 'bg-white shadow-sm border border-gray-100'
                      : 'hover:bg-gray-100/80'
                  }`}
                  style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                >
                  <span className={`flex-1 min-w-0 truncate text-[13px] font-medium ${
                    currentThreadId === thread.id ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {thread.title || 'New chat'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
        {!hasVisibleThreads && archivedThreads.length === 0 && (
          <div className="px-3 text-xs text-gray-400">No chats yet.</div>
        )}
      </div>
    </div>
  )

  const chatUI = (
    <section
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
      <header className="sticky top-0 z-20 flex items-center justify-between bg-[#f6f8f7]/95 backdrop-blur px-4 py-3 border-b border-gray-200/60">
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
          <div className="text-sm font-semibold text-gray-900">Medical image chat</div>
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
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center text-center">
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900">Need more detail?</h1>
                  <p className="mt-2 text-sm text-gray-500">
                    Ask about likely causes, red flags, or next steps.
                  </p>
                  <div className="mt-6 grid w-full max-w-md gap-3">
                    {[
                      'What should I do about these red flags?',
                      'Can you explain the most likely condition in more detail?',
                      'When should I see a doctor about this image?',
                      'What everyday things can make this better or worse?',
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
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Medical image analysis</div>
                        <div className="text-[16px] md:text-[15px] leading-7 text-gray-800">
                          {normaliseMedicalChatContent(m.content).split('\n').map((line, i) => {
                            const trimmed = line.trim()
                            if (!trimmed) {
                              return <div key={i} className="h-3" />
                            }

                            if (trimmed.startsWith('**')) {
                              const endIndex = trimmed.indexOf('**', 2)
                              if (endIndex > 2) {
                                const headingText = trimmed.slice(2, endIndex)
                                const rest = trimmed.slice(endIndex + 2).trim()

                                if (!rest) {
                                  return (
                                    <div
                                      key={i}
                                      className="font-bold text-gray-900 mb-2 mt-3 first:mt-0"
                                    >
                                      {headingText}
                                    </div>
                                  )
                                }

                                return (
                                  <div key={i}>
                                    <div className="font-bold text-gray-900 mb-1 mt-3 first:mt-0">
                                      {headingText}
                                    </div>
                                    <div className="mb-2">{rest}</div>
                                  </div>
                                )
                              }
                            }

                            const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                            if (numberedMatch) {
                              return (
                                <div key={i} className="ml-4 mb-1.5">
                                  <span className="font-medium">{numberedMatch[1]}.</span>{' '}
                                  {numberedMatch[2]}
                                </div>
                              )
                            }

                            const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/)
                            if (bulletMatch) {
                              return (
                                <div key={i} className="ml-4 mb-1.5">
                                  <span className="mr-2">•</span> {bulletMatch[1]}
                                </div>
                              )
                            }

                            const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                            return (
                              <div key={i} className="mb-2">
                                {parts.map((part, j) => {
                                  if (part.startsWith('**') && part.endsWith('**')) {
                                    return (
                                      <strong key={j} className="font-semibold">
                                        {part.slice(2, -2)}
                                      </strong>
                                    )
                                  }
                                  return <span key={j}>{part}</span>
                                })}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[16px] md:text-[15px] leading-7 text-gray-900 font-medium">
                        {normaliseMedicalChatContent(m.content).split('\n').map((line, i) => {
                          const trimmed = line.trim()
                          if (!trimmed) {
                            return <div key={i} className="h-3" />
                          }

                          const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                          if (numberedMatch) {
                            return (
                              <div key={i} className="ml-4 mb-1.5">
                                <span className="font-medium">{numberedMatch[1]}.</span>{' '}
                                {numberedMatch[2]}
                              </div>
                            )
                          }

                          const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/)
                          if (bulletMatch) {
                            return (
                              <div key={i} className="ml-4 mb-1.5">
                                <span className="mr-2">•</span> {bulletMatch[1]}
                              </div>
                            )
                          }

                          const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                          return (
                            <div key={i} className="mb-2">
                              {parts.map((part, j) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return (
                                    <strong key={j} className="font-semibold">
                                      {part.slice(2, -2)}
                                    </strong>
                                  )
                                }
                                return <span key={j}>{part}</span>
                              })}
                            </div>
                          )
                        })}
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
              <div ref={endRef} />
            </div>
          </div>

          <div className="relative bg-gradient-to-t from-[#f6f8f7] via-[#f6f8f7]/95 to-transparent pt-8 pb-6">
            <div className="mx-auto max-w-3xl px-4">
              <div className="flex flex-wrap gap-4 text-[11px] text-gray-500 mb-3">
                <span>AI replies use credits. Cost depends on length.</span>
                {currentThread?.lastChargedCost !== null && currentThread?.lastChargedCost !== undefined && (
                  <span>
                    {currentThread.lastChargeCovered ? 'Estimated' : 'Charged'}{' '}
                    <span className="font-semibold text-gray-700">{currentThread.lastChargedCost} credits</span>
                    {currentThread.lastChargeCovered ? ' (covered)' : ''}
                  </span>
                )}
              </div>
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
                  placeholder="Message AI about your medical image analysis"
                  rows={1}
                  className="max-h-[200px] min-h-[60px] w-full resize-none bg-transparent px-4 py-[18px] text-[16px] text-black placeholder-gray-400 focus:outline-none border-none focus:ring-0"
                />
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
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
            {!renameOpen && !deleteConfirmOpen && (
              <div className="px-2 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setRenameValue(actionThread?.title || '')
                    setRenameOpen(true)
                    setRenameCleared(false)
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  Rename
                  <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 20 }}>edit_square</span>
                </button>
                <button
                  type="button"
                  onClick={() => actionThreadId && handleArchiveThread(actionThreadId)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 rounded-lg"
                >
                  {actionThreadArchived ? 'Unarchive' : 'Archive'}
                  <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 20 }}>
                    {actionThreadArchived ? 'unarchive' : 'archive'}
                  </span>
                </button>
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

            {renameOpen && (
              <div className="px-4 py-4 overflow-hidden">
                <div className="text-sm font-semibold text-gray-900 mb-3">Rename chat</div>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onFocus={() => {
                    if (!renameCleared) {
                      setRenameValue('')
                      setRenameCleared(true)
                    }
                  }}
                  placeholder="Chat title"
                  className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 py-2 text-[16px] leading-6 focus:outline-none focus:ring-0 overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ WebkitTextSizeAdjust: '100%' }}
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={closeThreadActions}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!actionThreadId) return
                      handleRenameThread(actionThreadId, renameValue)
                      closeThreadActions()
                    }}
                    className="flex-1 rounded-lg bg-black px-3 py-2 text-sm text-white hover:bg-gray-800"
                  >
                    Save
                  </button>
                </div>
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
                    onClick={() => {
                      if (!actionThreadId) return
                      handleDeleteThread(actionThreadId)
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
    </section>
  )

  if (expanded && isClient && typeof document !== 'undefined') {
    return createPortal(chatUI, document.body)
  }

  return chatUI
}
