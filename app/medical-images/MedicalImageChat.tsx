'use client'

import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatChatContent } from '@/lib/chatFormatting'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

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

function normaliseMedicalChatContent(raw: string): string {
  return formatChatContent(raw, { headings: SECTION_HEADINGS })
}

export default function MedicalImageChat({ analysisResult }: MedicalImageChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const [isClient, setIsClient] = useState(false)

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

  // Track client-side mount so we can safely use portals
  useEffect(() => {
    setIsClient(true)
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
      setLoading(true)
      setError(null)
      setMessages([])
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

      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
      setMessages(nextMessages)
      setInput('')

      const res = await fetch('/api/medical-images/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
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
              if (!hasAssistant) {
                setMessages((prev) => [...prev, { role: 'assistant', content: token }])
                hasAssistant = true
              } else {
                setMessages((prev) => {
                  const copy = prev.slice()
                  copy[copy.length - 1] = {
                    role: 'assistant',
                    content: (copy[copy.length - 1] as any).content + token,
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
    : 'bg-[#f6f8f7] overflow-hidden md:rounded-2xl md:border md:shadow-sm relative flex flex-col h-[70dvh] md:h-[640px]'

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
          <div className="text-sm font-semibold text-gray-900">Medical image chat</div>
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
  )

  if (expanded && isClient && typeof document !== 'undefined') {
    return createPortal(chatUI, document.body)
  }

  return chatUI
}
