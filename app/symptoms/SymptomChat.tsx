'use client'

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'

interface SymptomChatProps {
  analysisResult: {
    summary?: string | null
    possibleCauses?: Array<{ name: string; whyLikely: string; confidence: string }>
    redFlags?: string[]
    nextSteps?: string[]
    analysisText?: string
  }
  symptoms: string[]
  duration?: string
  notes?: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function SymptomChat({ analysisResult, symptoms, duration, notes }: SymptomChatProps) {
  const storageKey = useMemo(() => `helfi:symptoms:chat`, [])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showExpandControl, setShowExpandControl] = useState(false)
  const scrollPositionRef = useRef<number>(0)
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const resizeRafRef = useRef<number | null>(null)

  // Smooth, single-frame resize to avoid jumpiness when text grows/shrinks rapidly (typing or voice)
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
    if (typeof window === 'undefined') return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

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

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setMessages(parsed.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-24))
        }
      }
    } catch {}
  }, [storageKey])

  // Persist messages locally
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storageKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Scroll inside the chat container only, avoid scrolling the whole page
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

  // Handle expand/collapse with scroll position preservation
  useEffect(() => {
    if (expanded) {
      // Store current scroll position before expanding
      scrollPositionRef.current = window.scrollY
      // Lock body scroll
      document.body.style.overflow = 'hidden'
      // Scroll chat to bottom
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'auto' })
      })
    } else {
      // Restore scroll position when collapsing
      document.body.style.overflow = ''
      // Restore scroll position after a brief delay to ensure layout is stable
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'auto' })
      })
    }
  }, [expanded])

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const form = (event.target as HTMLTextAreaElement).closest('form') as HTMLFormElement | null
      form?.requestSubmit()
    }
  }

  async function handleClear() {
    try {
      setLoading(true)
      setError(null)
      setMessages([])
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

      const url = `/api/analyze-symptoms/chat`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          message: text,
          symptoms,
          duration,
          notes,
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
            }
          }
        }
      } else {
        const data = await res.json().catch(() => null)
        const textOut = data?.assistant as string | undefined
        if (textOut) setMessages((prev) => [...prev, { role: 'assistant', content: textOut }])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const sectionClass = expanded
    ? 'fixed inset-0 z-50 bg-white flex flex-col'
    : 'bg-white mt-6 overflow-hidden md:rounded-2xl md:border md:shadow-sm relative flex flex-col h-[calc(100vh-140px)] md:h-auto'

  return (
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
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 w-full max-w-3xl mx-auto">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Chat about your symptom analysis</h3>
          <p className="text-xs text-gray-500">Ask follow-up questions – history saved locally</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            disabled={loading}
            className="text-xs rounded-md border border-gray-300 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Reset
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        className={`px-4 py-6 overflow-y-auto overflow-x-hidden space-y-6 min-w-0 w-full max-w-3xl mx-auto ${expanded ? 'flex-1 min-h-0' : 'min-h-[220px]'}`}
        aria-live="polite"
        style={{
          maxWidth: '100%',
          wordWrap: 'break-word',
          paddingBottom: expanded ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)' : 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        }}
      >
        {messages.length === 0 && !loading && (
          <div className="text-sm text-gray-400">
            Ask follow‑ups like:
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                'What should I do about these red flags?',
                'Can you explain these likely causes in more detail?',
                'When should I see a doctor?',
                'What lifestyle changes can help?',
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
          <div key={idx} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
                <div className="text-lg leading-relaxed break-words" style={{ whiteSpace: 'pre-wrap' }}>
                  {m.content.split('\n').map((line, idx) => {
                    const trimmed = line.trim()
                    if (!trimmed) {
                      return <div key={idx} className="h-3" />
                    }
                    
                    if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
                      return (
                        <div key={idx} className="font-bold text-gray-900 mb-2 mt-3 first:mt-0">
                          {trimmed.slice(2, -2)}
                        </div>
                      )
                    }
                    
                    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                    if (numberedMatch) {
                      return (
                        <div key={idx} className="ml-4 mb-1.5">
                          <span className="font-medium">{numberedMatch[1]}.</span> {numberedMatch[2]}
                        </div>
                      )
                    }
                    
                    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/)
                    if (bulletMatch) {
                      return (
                        <div key={idx} className="ml-4 mb-1.5">
                          <span className="mr-2">•</span> {bulletMatch[1]}
                        </div>
                      )
                    }
                    
                    const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                    return (
                      <div key={idx} className="mb-2">
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
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-4">
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

      <form
        className="sticky bottom-0 left-0 right-0 border-t border-gray-200 px-4 py-3 bg-white z-40 shadow-[0_-6px_18px_rgba(0,0,0,0.08)] flex-shrink-0"
        onSubmit={handleSubmit}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-2 w-full max-w-3xl mx-auto">
          {recognitionRef.current && (
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
          <div className="flex-1 relative flex items-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                resizeTextarea()
              }}
              onKeyDown={onComposerKeyDown}
              placeholder={recognitionRef.current ? "Type or use voice input..." : "Message AI about your symptom analysis"}
              rows={1}
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 pr-14 text-[16px] leading-6 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 resize-none transition-all duration-200 min-h-[52px] max-h-[200px]"
            />
            {(showExpandControl || expanded) && (
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6m0-6l-6 6" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2 2l2 2-2 2V2zm10-2v4l-2-2 2-2zm0 10l-2-2 2-2v4zm-10 0v-4l2 2-2 2z" />
                  </svg>
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
        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      </form>
    </section>
  )
}
