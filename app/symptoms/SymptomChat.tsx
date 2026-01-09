'use client'

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { formatChatContent } from '@/lib/chatFormatting'

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
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const resizeRafRef = useRef<number | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Smooth, single-frame resize to avoid jumpiness when text grows/shrinks rapidly (typing or voice)
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

  // NOTE: We intentionally do NOT manipulate page scroll here.
  // The expanded chat is rendered in a fullscreen portal overlay,
  // so closing it just removes the overlay and leaves the page
  // exactly where it was.

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
    ? 'fixed inset-0 z-[9999] bg-[#f6f8f7] flex flex-col h-[100dvh] overflow-hidden'
    : 'bg-[#f6f8f7] mt-6 overflow-hidden md:rounded-2xl md:border md:shadow-sm relative flex flex-col h-[70dvh] md:h-[640px]'

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
        <div>
          <div className="text-sm font-semibold text-gray-900">Symptom chat</div>
          <div className="text-[11px] text-gray-400">Follow-up questions</div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className="text-xs rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label={expanded ? 'Exit full screen' : 'Full screen'}
          >
            <span className="material-symbols-outlined text-xl text-gray-700">
              {expanded ? 'close_fullscreen' : 'open_in_full'}
            </span>
          </button>
        </div>
      </header>

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
                Ask about causes, red flags, or next steps.
              </p>
              <div className="mt-6 grid w-full max-w-md gap-3">
                {[
                  'What should I do about these red flags?',
                  'Can you explain these likely causes in more detail?',
                  'When should I see a doctor?',
                  'What lifestyle changes can help?',
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
                    <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Symptom analysis</div>
                    <div className="text-[16px] md:text-[15px] leading-7 text-gray-800">
                      {formatChatContent(m.content).split('\n').map((line, lineIdx) => {
                        const trimmed = line.trim()
                        if (!trimmed) {
                          return <div key={lineIdx} className="h-3" />
                        }

                        if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
                          return (
                            <div key={lineIdx} className="font-bold text-gray-900 mb-2 mt-3 first:mt-0">
                              {trimmed.slice(2, -2)}
                            </div>
                          )
                        }

                        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                        if (numberedMatch) {
                          return (
                            <div key={lineIdx} className="ml-4 mb-1.5">
                              <span className="font-medium">{numberedMatch[1]}.</span> {numberedMatch[2]}
                            </div>
                          )
                        }

                        const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/)
                        if (bulletMatch) {
                          return (
                            <div key={lineIdx} className="ml-4 mb-1.5">
                              <span className="mr-2">•</span> {bulletMatch[1]}
                            </div>
                          )
                        }

                        const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                        return (
                          <div key={lineIdx} className="mb-2">
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
                ) : (
                  <div className="text-[16px] md:text-[15px] leading-7 text-gray-900 font-medium">
                    {formatChatContent(m.content).split('\n').map((line, lineIdx) => {
                      const trimmed = line.trim()
                      if (!trimmed) {
                        return <div key={lineIdx} className="h-3" />
                      }

                      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                      if (numberedMatch) {
                        return (
                          <div key={lineIdx} className="ml-4 mb-1.5">
                            <span className="font-medium">{numberedMatch[1]}.</span> {numberedMatch[2]}
                          </div>
                        )
                      }

                      const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/)
                      if (bulletMatch) {
                        return (
                          <div key={lineIdx} className="ml-4 mb-1.5">
                            <span className="mr-2">•</span> {bulletMatch[1]}
                          </div>
                        )
                      }

                      const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                      return (
                        <div key={lineIdx} className="mb-2">
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
              placeholder={recognitionRef.current ? 'Type or use voice input...' : 'Message AI about your symptom analysis'}
              rows={1}
              className="max-h-[200px] min-h-[60px] w-full resize-none bg-transparent px-4 py-[18px] text-[16px] text-black placeholder-gray-400 focus:outline-none border-none focus:ring-0"
            />
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
              {recognitionRef.current && (
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
  )

  // When expanded, render the chat as a true fullscreen overlay
  // using a portal so it is independent of the page layout.
  if (expanded && isClient && typeof document !== 'undefined') {
    return createPortal(chatUI, document.body)
  }

  return chatUI
}
