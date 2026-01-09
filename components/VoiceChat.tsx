'use client'

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
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
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatThread = { id: string; title: string | null; createdAt: string; updatedAt: string }

export default function VoiceChat({ context, onCostEstimate, className = '' }: VoiceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)
  const [lastChargedCost, setLastChargedCost] = useState<number | null>(null)
  const [lastChargedAt, setLastChargedAt] = useState<string | null>(null)
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false)
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [showThreadMenu, setShowThreadMenu] = useState(false)
  const storageKey = useMemo(() => 'helfi:chat:talk', [])
  const hasHealthTipContext = !!context?.healthTipSummary
  const healthTipTitle = context?.healthTipTitle
  const healthTipCategory = context?.healthTipCategory
  const healthTipSuggestedQuestions = context?.healthTipSuggestedQuestions

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
  
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const resizeRafRef = useRef<number | null>(null)

  // Smooth, single-frame resize to avoid jumpiness when typing.
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
              const threadId = data.threads[0].id
              setCurrentThreadId(threadId)
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
        setMessages([])
        setEstimatedCost(null)
        setLastChargedCost(null)
        setLastChargedAt(null)
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
    if (!confirm('Delete this chat?')) return
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
              const newThreadId = threadsData.threads[0].id
              setCurrentThreadId(newThreadId)
              loadThreadMessages(newThreadId)
            } else {
              setCurrentThreadId(null)
              setMessages([])
              setEstimatedCost(null)
              setLastChargedCost(null)
              setLastChargedAt(null)
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete thread:', err)
    }
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
    setEstimatedCost(null)
    setLastChargedCost(null)
    setLastChargedAt(null)
  }, [currentThreadId])

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

  // Auto-scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
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

      // Estimate cost before sending
      const estimateRes = await fetch('/api/chat/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, estimateOnly: true }),
      })
      
      if (estimateRes.status === 402) {
        const estimateData = await estimateRes.json()
        setError(`Insufficient credits. Estimated cost: ${(estimateData.estimatedCost / 100).toFixed(2)} credits. Available: ${(estimateData.availableCredits / 100).toFixed(2)} credits.`)
        setLoading(false)
        return
      }
      
      if (estimateRes.ok) {
        const estimateData = await estimateRes.json()
        const cost = estimateData.estimatedCost || 0
        setEstimatedCost(cost)
        if (onCostEstimate) {
          onCostEstimate(cost)
        }
      }

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
        setError(`Insufficient credits. Estimated cost: ${(data.estimatedCost / 100).toFixed(2)} credits. Available: ${(data.availableCredits / 100).toFixed(2)} credits.`)
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
          try { window.dispatchEvent(new Event('credits:refresh')) } catch {}
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    try {
      setLoading(true)
      setError(null)
      setMessages([])
      setEstimatedCost(null)
      setLastChargedCost(null)
      setLastChargedAt(null)
      stopListening()
      try { localStorage.removeItem(storageKey) } catch {}
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Thread Selector Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center justify-between relative">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setShowThreadMenu(!showThreadMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors min-w-0 flex-1"
          >
            <span className="truncate text-sm font-medium text-gray-700">
              {currentThreadId ? threads.find(t => t.id === currentThreadId)?.title || 'New Chat' : 'New Chat'}
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
                      setCurrentThreadId(thread.id)
                      loadThreadMessages(thread.id)
                      setShowThreadMenu(false)
                    }}
                    className={`flex-1 px-4 py-2 text-left text-sm hover:bg-gray-100 truncate ${
                      currentThreadId === thread.id ? 'bg-gray-50' : ''
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
        <div className="flex items-center justify-center px-2">
          <UsageMeter compact={true} className="mt-0" feature="voiceChat" />
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
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-6 min-w-0" aria-live="polite" style={{ maxWidth: '100%', wordWrap: 'break-word' }}>
        {messages.length === 0 && !loading && (
          <div className="max-w-3xl mx-auto">
            {hasHealthTipContext ? (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Questions about this tip
                  </h2>
                  {healthTipTitle && (
                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                      “{healthTipTitle}”
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {healthTipSuggestionQuestions.map((q) => (
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
              </>
            ) : (
              <>
                <div className="max-w-3xl mx-auto mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="font-semibold text-gray-900">How Talk to AI works</div>
                  <ul className="mt-2 space-y-1 text-sm text-gray-600">
                    <li>We estimate credits before sending and show the actual charge after each response.</li>
                    <li>Your chat topics and key questions are summarized into your 7‑day report.</li>
                    <li>We connect those topics to your food, exercise, symptoms, mood, and check-ins.</li>
                  </ul>
                </div>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    How can I help you today?
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    'What supplements should I take?',
                    'How are my medications interacting?',
                    'Why am I feeling tired?',
                    'What should I eat today?',
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
              </>
            )}
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={`flex gap-4 max-w-3xl mx-auto ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
          <div className="flex gap-4 max-w-3xl mx-auto">
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
        {(estimatedCost !== null || lastChargedCost !== null) && (
          <div className="px-4 pt-2">
            <div className="max-w-3xl mx-auto flex flex-wrap gap-4 text-xs text-gray-500">
              {estimatedCost !== null && (
                <span>
                  Estimated: <span className="font-semibold text-gray-700">{(estimatedCost / 100).toFixed(2)} credits</span>
                </span>
              )}
              {lastChargedCost !== null && (
                <span>
                  Charged: <span className="font-semibold text-gray-700">{(lastChargedCost / 100).toFixed(2)} credits</span>
                </span>
              )}
              {lastChargedAt && (
                <span className="text-gray-400">
                  {new Date(lastChargedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        )}
        <form className="px-4 py-3" onSubmit={handleSubmit}>
          <div className="max-w-3xl mx-auto flex items-center gap-2">
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
                className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 pr-12 text-base leading-6 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 resize-none transition-all duration-200 min-h-[52px] max-h-[200px]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim() || isListening}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
