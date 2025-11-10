'use client'

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState, useCallback } from 'react'

interface SectionChatProps {
  issueSlug: string
  section: string
  issueName: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function SectionChat({ issueSlug, section, issueName }: SectionChatProps) {
  const storageKey = useMemo(() => `helfi:insights:thread:${issueSlug}:${section}`, [issueSlug, section])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const enabled = (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || 'true').toLowerCase() === 'true' || (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || '') === '1'
  const [threadId, setThreadId] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced resize function to prevent pulsating
  const resizeTextarea = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current)
    }
    resizeTimeoutRef.current = setTimeout(() => {
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement | null
      if (!textarea) return
      textarea.style.height = 'auto'
      const maxHeight = 200
      const newHeight = Math.min(textarea.scrollHeight, maxHeight)
      textarea.style.height = `${newHeight}px`
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }, 50)
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return
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
  }, [enabled])

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

  // Initial load from server (persistent thread). Falls back to localStorage if server unavailable
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/chat`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && typeof data?.threadId === 'string') setThreadId(data.threadId)
          const serverMessages = Array.isArray(data?.messages)
            ? data.messages.map((m: any) => ({ role: m.role, content: m.content })).filter((m: any) => m?.content)
            : []
          if (!cancelled && serverMessages.length) setMessages(serverMessages)
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
      setHasUserInteracted(true) // Mark that user has interacted
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
        body: JSON.stringify({ message: text }),
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
        // Fallback to non-streaming JSON
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

  if (!enabled) return null
  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-0 overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Chat about {issueName} ({section})</h3>
          <p className="text-xs text-gray-500">{threadId ? 'History saved for this section' : 'Start a conversation – it will be saved here'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Typical cost: ~1–2 credits</p>
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

      <div className="px-5 py-4 h-[420px] overflow-y-auto overflow-x-hidden space-y-3" aria-live="polite">
        {messages.length === 0 && !loading && (
          <div className="text-sm text-gray-400">
            Ask follow‑ups like:
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                `How do these recommendations help ${issueName}?`,
                'Are there safety interactions to watch?',
                'What should I try first this week?',
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
            <div className={`flex-1 ${m.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block px-4 py-2.5 rounded-2xl ${
                m.role === 'user' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-900'
              }`}>
                <div className="text-[15px] leading-relaxed break-words">
                  {m.content.split(/\n\n+/).map((para, paraIdx) => {
                    if (!para.trim()) return null
                    const lines = para.split('\n')
                    return (
                      <div key={paraIdx} className={paraIdx > 0 ? 'mt-4' : ''}>
                        {lines.map((line, lineIdx) => {
                          const trimmed = line.trim()
                          if (!trimmed) return null
                          
                          if (/^[\d]+\.\s/.test(trimmed)) {
                            const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                            return (
                              <div key={lineIdx} className="ml-4 mb-1">
                                {parts.map((part, j) => {
                                  if (part.startsWith('**') && part.endsWith('**')) {
                                    return <strong key={j}>{part.slice(2, -2)}</strong>
                                  }
                                  return <span key={j}>{part}</span>
                                })}
                              </div>
                            )
                          }
                          
                          if (/^[-*•]\s/.test(trimmed)) {
                            const parts = trimmed.replace(/^[-*•]\s/, '').split(/(\*\*.*?\*\*)/g)
                            return (
                              <div key={lineIdx} className="ml-4 mb-1">
                                <span className="mr-2">•</span>
                                {parts.map((part, j) => {
                                  if (part.startsWith('**') && part.endsWith('**')) {
                                    return <strong key={j}>{part.slice(2, -2)}</strong>
                                  }
                                  return <span key={j}>{part}</span>
                                })}
                              </div>
                            )
                          }
                          
                          const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                          return (
                            <div key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
                              {parts.map((part, j) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return <strong key={j}>{part.slice(2, -2)}</strong>
                                }
                                return <span key={j}>{part}</span>
                              })}
                            </div>
                          )
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

      <form className="border-t border-gray-200 px-4 py-3 bg-white" onSubmit={handleSubmit}>
        <div className="flex items-center gap-2">
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
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                resizeTextarea()
              }}
              onKeyDown={onComposerKeyDown}
              placeholder={recognitionRef.current ? `Type or use voice input...` : `Message AI about ${issueName} (${section})`}
              rows={1}
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 pr-12 text-[15px] leading-6 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 resize-none transition-all duration-200 min-h-[52px] max-h-[200px]"
              style={{ height: '52px' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || isListening}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      </form>
    </section>
  )
}
