'use client'

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { formatChatContent } from '@/lib/chatFormatting'
import UsageMeter from '@/components/UsageMeter'

interface VoiceChatContext {
  symptoms?: string[]
  duration?: string
  notes?: string
  analysisResult?: any
  issueSlug?: string
  section?: string
  // Optional: summary of a specific health tip to keep the AI focused on that advice
  healthTipSummary?: string
  healthTipTitle?: string
  healthTipCategory?: string
  healthTipSuggestedQuestions?: string[]
}

interface VoiceChatProps {
  context?: VoiceChatContext
  onCostEstimate?: (cost: number) => void
  className?: string
  onExit?: () => void
  startExpanded?: boolean
  hideExpandToggle?: boolean
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatThread = { id: string; title: string | null; chargedOnce: boolean; createdAt: string; updatedAt: string }

export default function VoiceChat({
  context,
  onCostEstimate,
  className = '',
  onExit,
  startExpanded = false,
  hideExpandToggle = false,
}: VoiceChatProps) {
  const router = useRouter()
  const VOICE_CHAT_COST_CREDITS = 10
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [currentThreadCharged, setCurrentThreadCharged] = useState(false)
  const [lastChargedCost, setLastChargedCost] = useState<number | null>(null)
  const [lastChargedAt, setLastChargedAt] = useState<string | null>(null)
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false)
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [expanded, setExpanded] = useState(startExpanded)
  const [isClient, setIsClient] = useState(false)
  const [actionThreadId, setActionThreadId] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameCleared, setRenameCleared] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [archivedThreadIds, setArchivedThreadIds] = useState<string[]>([])
  const storageKey = useMemo(() => 'helfi:chat:talk', [])
  const archivedKey = useMemo(() => 'helfi:chat:talk:archived', [])
  const hasHealthTipContext = !!context?.healthTipSummary
  const healthTipTitle = context?.healthTipTitle
  const healthTipCategory = context?.healthTipCategory
  const healthTipSuggestedQuestions = context?.healthTipSuggestedQuestions
  const estimatedCost = currentThreadCharged ? 0 : VOICE_CHAT_COST_CREDITS

  const healthTipSuggestionQuestions = useMemo(() => {
    if (!hasHealthTipContext) return []

    // Prefer AI-generated, tip-specific suggestions when available
    if (Array.isArray(healthTipSuggestedQuestions) && healthTipSuggestedQuestions.length > 0) {
      return healthTipSuggestedQuestions
        .filter((q) => typeof q === 'string' && q.trim().length > 0)
        .slice(0, 3)
    }

    // Fallback: template questions tied to the tip title + category
    const titleSnippet = healthTipTitle || 'this tip'
    const typeLabel =
      healthTipCategory === 'supplement'
        ? 'supplement tip'
        : healthTipCategory === 'lifestyle'
        ? 'lifestyle tip'
        : 'food tip'
    return [
      `Can you explain how the "${titleSnippet}" ${typeLabel} fits with my current health issues?`,
      `Are there any safety concerns, interactions, or situations where I should avoid following this "${titleSnippet}" tip?`,
      `How could I adapt the "${titleSnippet}" tip to better fit my daily routine and preferences?`,
    ]
  }, [hasHealthTipContext, healthTipTitle, healthTipCategory, healthTipSuggestedQuestions])

  const currentThreadTitle = useMemo(() => {
    if (!currentThreadId) return 'New chat'
    return threads.find((thread) => thread.id === currentThreadId)?.title || 'New chat'
  }, [currentThreadId, threads])
  const actionThread = actionThreadId ? threads.find((thread) => thread.id === actionThreadId) : null
  const actionThreadArchived = actionThreadId ? archivedThreadIds.includes(actionThreadId) : false

  const threadGroups = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const visibleThreads = threads.filter((thread) => !archivedThreadIds.includes(thread.id))
    const groups = {
      today: [] as ChatThread[],
      yesterday: [] as ChatThread[],
      week: [] as ChatThread[],
      older: [] as ChatThread[],
    }
    visibleThreads.forEach((thread) => {
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
  }, [threads, archivedThreadIds])
  const hasVisibleThreads = threadGroups.some((group) => group.items.length > 0)
  const archivedThreads = useMemo(
    () => threads.filter((thread) => archivedThreadIds.includes(thread.id)),
    [threads, archivedThreadIds]
  )

  const showExitButton = Boolean(onExit)

  const handleExit = useCallback(() => {
    if (onExit) {
      onExit()
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/dashboard')
  }, [onExit, router])
  
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const resizeRafRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  // Smooth, single-frame resize to avoid jumpiness when typing.
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

  // Load threads and current thread on mount
  useEffect(() => {
    async function loadThreads() {
      try {
        const res = await fetch('/api/chat/threads')
        if (res.ok) {
          const data = await res.json()
          if (data.threads && Array.isArray(data.threads)) {
            setThreads(data.threads)
            if (data.threads.length > 0 && !currentThreadId) {
              // Load most recent thread
              const latestThread = data.threads[0]
              const threadId = latestThread.id
              setCurrentThreadId(threadId)
              setCurrentThreadCharged(Boolean(latestThread.chargedOnce))
              loadThreadMessages(threadId)
            }
          }
        }
      } catch (err) {
        console.error('Failed to load threads:', err)
      }
    }
    loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadThreadMessages(threadId: string) {
    try {
      const res = await fetch(`/api/chat/voice?threadId=${threadId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages.map((m: any) => ({ role: m.role, content: m.content })))
        }
      }
    } catch (err) {
      console.error('Failed to load thread messages:', err)
    }
  }

  function handleSelectThread(threadId: string) {
    const thread = threads.find((item) => item.id === threadId)
    setCurrentThreadId(threadId)
    setCurrentThreadCharged(Boolean(thread?.chargedOnce))
    loadThreadMessages(threadId)
    setThreadsOpen(false)
  }

  async function handleNewChat() {
    try {
      const res = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        const newThreadId = data.threadId
        setCurrentThreadId(newThreadId)
        setCurrentThreadCharged(false)
        setMessages([])
        setLastChargedCost(null)
        setLastChargedAt(null)
        setThreadsOpen(false)
        // Reload threads
        const threadsRes = await fetch('/api/chat/threads')
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          if (threadsData.threads) setThreads(threadsData.threads)
        }
      }
    } catch (err) {
      console.error('Failed to create new thread:', err)
    }
  }

  async function handleDeleteThread(threadId: string) {
    try {
      const res = await fetch('/api/chat/threads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      })
      if (res.ok) {
        // Reload threads
        const threadsRes = await fetch('/api/chat/threads')
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          if (threadsData.threads) {
            setThreads(threadsData.threads)
            if (threadsData.threads.length > 0) {
              const nextThread = threadsData.threads[0]
              const newThreadId = nextThread.id
              setCurrentThreadId(newThreadId)
              setCurrentThreadCharged(Boolean(nextThread.chargedOnce))
              loadThreadMessages(newThreadId)
            } else {
              setCurrentThreadId(null)
              setCurrentThreadCharged(false)
              setMessages([])
              setLastChargedCost(null)
              setLastChargedAt(null)
            }
          }
        }
        setThreadsOpen(false)
      }
    } catch (err) {
      console.error('Failed to delete thread:', err)
    }
  }

  async function handleRenameThread(threadId: string, nextTitle: string) {
    const trimmed = nextTitle.trim()
    if (!trimmed) return
    try {
      const res = await fetch('/api/chat/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, title: trimmed }),
      })
      if (res.ok) {
        const threadsRes = await fetch('/api/chat/threads')
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          if (threadsData.threads) setThreads(threadsData.threads)
        }
      }
    } catch (err) {
      console.error('Failed to rename thread:', err)
    }
  }

  function openThreadActions(threadId: string) {
    setActionThreadId(threadId)
    setRenameOpen(false)
    setDeleteConfirmOpen(false)
    setRenameCleared(false)
    setDeletePending(false)
    longPressTriggeredRef.current = true
  }

  function closeThreadActions() {
    setActionThreadId(null)
    setRenameOpen(false)
    setDeleteConfirmOpen(false)
    setRenameCleared(false)
    setDeletePending(false)
    longPressTriggeredRef.current = false
  }

  function startLongPress(event: React.PointerEvent, threadId: string) {
    if (event.pointerType !== 'touch') return
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = window.setTimeout(() => {
      openThreadActions(threadId)
    }, 500)
  }

  function endLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
    }
  }

  function handleArchiveThread(threadId: string) {
    const isArchived = archivedThreadIds.includes(threadId)
    const nextArchived = isArchived
      ? archivedThreadIds.filter((id) => id !== threadId)
      : [...archivedThreadIds, threadId]
    setArchivedThreadIds(nextArchived)
    if (!isArchived && currentThreadId === threadId) {
      const nextThread = threads.find((thread) => !nextArchived.includes(thread.id))
      if (nextThread) {
        handleSelectThread(nextThread.id)
      } else {
        handleNewChat()
      }
    }
    closeThreadActions()
  }

  // Load saved conversation on mount
  useEffect(() => {
    // Only load from localStorage if no thread is loaded from server
    if (currentThreadId) return
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setMessages(parsed.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-50))
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadId])

  useEffect(() => {
    setLastChargedCost(null)
    setLastChargedAt(null)
  }, [currentThreadId])

  useEffect(() => {
    if (!currentThreadId) return
    const thread = threads.find((t) => t.id === currentThreadId)
    if (thread) setCurrentThreadCharged(Boolean(thread.chargedOnce))
  }, [currentThreadId, threads])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return

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
      
      // Update input with both final and interim results
      setInput(finalTranscript + interimTranscript)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please enable microphone access.')
      } else if (event.error !== 'no-speech') {
        setError('Speech recognition error. Please try again.')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      // Only set final transcript if we have one
      if (finalTranscript.trim()) {
        setInput(finalTranscript.trim())
      }
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(archivedKey) : null
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setArchivedThreadIds(parsed.filter((id) => typeof id === 'string'))
        }
      }
    } catch {}
  }, [archivedKey])

  useEffect(() => {
    try {
      localStorage.setItem(archivedKey, JSON.stringify(archivedThreadIds))
    } catch {}
  }, [archivedThreadIds, archivedKey])

  useEffect(() => {
    if (!currentThreadId) return
    if (!archivedThreadIds.includes(currentThreadId)) return
    const nextThread = threads.find((thread) => !archivedThreadIds.includes(thread.id))
    if (nextThread) {
      handleSelectThread(nextThread.id)
    } else {
      handleNewChat()
    }
  }, [archivedThreadIds, currentThreadId, threads])

  // Auto-scroll
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

  // Auto-resize textarea pre-paint to reduce visible flicker
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

  function startListening() {
    if (!recognitionRef.current || isListening) return
    try {
      recognitionRef.current.start()
    } catch (err) {
      console.error('Failed to start recognition:', err)
      setError('Failed to start voice recognition')
    }
  }

  function stopListening() {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text) {
      setError('Enter a question or use voice input.')
      return
    }

    try {
      setLoading(true)
      setError(null)
      stopListening()
      setLastChargedCost(null)
      setLastChargedAt(null)
      
      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
      setMessages(nextMessages)
      setInput('')

      if (onCostEstimate) onCostEstimate(estimatedCost)

      const url = `/api/chat/voice`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ 
          message: text, 
          threadId: currentThreadId || undefined,
          newThread: false, // Never create a new thread automatically - user must click "+ New Chat"
          ...context 
        }),
      })

      if (res.status === 402) {
        const data = await res.json()
        setError(`Insufficient credits. Estimated cost: ${data.estimatedCost} credits. Available: ${data.availableCredits} credits.`)
        setLoading(false)
        return
      }

      if (res.ok && (res.headers.get('content-type') || '').includes('text/event-stream') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let hasAssistant = false
        let fullResponse = ''
        
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const chunk of parts) {
            if (chunk.startsWith('event: charged')) {
              const dataLine = chunk
                .split('\n')
                .map((line) => line.trim())
                .find((line) => line.startsWith('data:'))
              const raw = dataLine ? dataLine.replace(/^data:\s*/, '') : ''
              try {
                const payload = JSON.parse(raw)
                if (typeof payload?.chargedCents === 'number') {
                  setLastChargedCost(payload.chargedCents)
                  setLastChargedAt(new Date().toISOString())
                  if (typeof payload?.chargedOnce === 'boolean') {
                    setCurrentThreadCharged(payload.chargedOnce)
                  } else if (payload.chargedCents >= 0) {
                    setCurrentThreadCharged(true)
                  }
                  try { window.dispatchEvent(new Event('credits:refresh')) } catch {}
                }
              } catch {
                // Ignore malformed charge payloads
              }
            } else if (chunk.startsWith('data: ')) {
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
              fullResponse += token
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
              const threadsRes = await fetch('/api/chat/threads')
              if (threadsRes.ok) {
                const threadsData = await threadsRes.json()
                if (threadsData.threads) {
                  setThreads(threadsData.threads)
                  // Update currentThreadId if we created a new thread
                  if (!currentThreadId && threadsData.threads.length > 0) {
                    setCurrentThreadId(threadsData.threads[0].id)
                  }
                }
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
        if (typeof data?.chargedCostCents === 'number') {
          setLastChargedCost(data.chargedCostCents)
          setLastChargedAt(new Date().toISOString())
          if (typeof data?.chargedOnce === 'boolean') {
            setCurrentThreadCharged(data.chargedOnce)
          } else {
            setCurrentThreadCharged(true)
          }
          try { window.dispatchEvent(new Event('credits:refresh')) } catch {}
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const renderFormattedContent = (content: string) => {
    const formatted = formatChatContent(content)
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
  }

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

  const wrapperClass = expanded
    ? `fixed inset-0 z-[9999] bg-[#f6f8f7] flex flex-col min-h-0 ${className}`
    : `flex flex-col min-h-0 h-full ${className}`

  const chatUI = (
    <div className={wrapperClass} style={expanded ? { paddingTop: 'env(safe-area-inset-top, 0px)' } : undefined}>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#f6f8f7]/95 backdrop-blur px-4 py-3 border-b border-gray-200/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExit}
            className={`flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 ${
              showExitButton ? '' : 'lg:hidden'
            }`}
            aria-label="Exit chat"
          >
            <span className="material-symbols-outlined text-2xl text-gray-700">arrow_back</span>
          </button>
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
          <div className="text-sm font-semibold text-gray-900">Talk to AI</div>
          <div className="text-[11px] text-gray-400 hidden md:block truncate">{currentThreadTitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex">
            <UsageMeter compact={true} className="mt-0" feature="voiceChat" />
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label="New chat"
          >
            <span className="material-symbols-outlined text-2xl text-gray-700">edit_square</span>
          </button>
          {!hideExpandToggle && (
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
          )}
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
                  {hasHealthTipContext ? (
                    <>
                      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Questions about this tip</h1>
                      {healthTipTitle && (
                        <p className="mt-2 text-sm text-gray-500 max-w-md">“{healthTipTitle}”</p>
                      )}
                      <div className="mt-8 grid w-full max-w-md gap-3">
                        {healthTipSuggestionQuestions.map((q) => (
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
                    </>
                  ) : (
                    <>
                      <div className="w-full max-w-md">
                        <UsageMeter inline className="w-full" feature="voiceChat" />
                      </div>
                      <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900">How can I help you today?</h1>
                      <div className="mt-4 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-4 text-left text-sm text-gray-600 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">How Talk to AI works</div>
                        <ul className="mt-3 space-y-2 text-[13px] text-gray-600">
                          <li>Each chat costs 10 credits once (not per response).</li>
                          <li>We show the estimate before sending and confirm the charge after the first response.</li>
                          <li>Your chat topics and key questions are summarized into your 7‑day report.</li>
                          <li>We connect those topics to your food, exercise, symptoms, mood, and check-ins.</li>
                        </ul>
                      </div>
                      <div className="mt-8 w-full max-w-sm">
                        <div className="flex items-center justify-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-[#10a27e] text-xl">lightbulb</span>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Examples</h3>
                        </div>
                        <div className="flex flex-col gap-3">
                          {[
                            'What supplements should I take?',
                            'How are my medications interacting?',
                            'Why am I feeling tired?',
                            'What should I eat today?',
                          ].map((q) => (
                            <button
                              key={q}
                              onClick={() => setInput(q)}
                              className="rounded-xl border border-gray-200 bg-white p-4 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
                              type="button"
                            >
                              “{q}”
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
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
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Health Assistant</div>
                        <div className="text-[16px] md:text-[15px] leading-7 text-gray-800">
                          {renderFormattedContent(m.content)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[16px] md:text-[15px] leading-7 text-gray-900 font-medium">
                        {renderFormattedContent(m.content)}
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
              {(estimatedCost !== null || lastChargedCost !== null) && (
                <div className="flex flex-wrap gap-4 text-[11px] text-gray-500 mb-3">
                  {estimatedCost !== null && (
                    <span>
                      Estimated <span className="font-semibold text-gray-700">{estimatedCost} credits</span>{' '}
                      {currentThreadCharged ? '(already covered)' : 'per chat'}
                    </span>
                  )}
                  {lastChargedCost !== null && (
                    <span>
                      Charged <span className="font-semibold text-gray-700">{lastChargedCost} credits</span>
                      {lastChargedCost === 0 && currentThreadCharged ? ' (already charged this chat)' : ''}
                    </span>
                  )}
                  {lastChargedAt && (
                    <span className="text-gray-400">
                      {new Date(lastChargedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
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
                  placeholder="Message AI Assistant..."
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
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 active:bg-red-100 active:translate-y-[1px] active:scale-[0.99] transition rounded-lg"
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
                    onClick={async () => {
                      if (!actionThreadId) return
                      await handleRenameThread(actionThreadId, renameValue)
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
                    onClick={async () => {
                      if (!actionThreadId) return
                      setDeletePending(true)
                      await handleDeleteThread(actionThreadId)
                      setDeletePending(false)
                      closeThreadActions()
                    }}
                    disabled={deletePending}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 active:bg-red-700 active:translate-y-[1px] active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deletePending ? 'Deleting…' : 'Delete'}
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
