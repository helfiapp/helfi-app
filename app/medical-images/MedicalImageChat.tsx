'use client'

import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

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

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normaliseMedicalChatContent(raw: string): string {
  let text = raw || ''

  // Ensure each major section heading appears on its own line so the UI
  // can render it as a separate, nicely spaced block (even if the model
  // streams everything in one long paragraph).
  for (const heading of SECTION_HEADINGS) {
    const pattern = new RegExp(escapeForRegExp(heading), 'g')
    text = text.replace(pattern, `\n${heading}\n`)
  }

  // As a safety net, push any remaining **bold heading** patterns onto their own line.
  // This helps when the model forgets to add line breaks (e.g. "...sentence.**Why this matters** More text")
  // by turning them into:
  //   ...sentence.
  //   **Why this matters**
  //   More text
  text = text.replace(/(\*\*[A-Za-z][^*\n]{2,80}\*\*)/g, '\n$1\n')

  // Collapse any excessive blank lines so spacing stays neat.
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

export default function MedicalImageChat({ analysisResult }: MedicalImageChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const resizeRafRef = useRef<number | null>(null)

  // Smooth, single-frame resize to keep composer steady during rapid updates (typing/voice)
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

  // Scroll to bottom inside chat container
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

  return (
    <section className="bg-white overflow-hidden md:rounded-2xl md:border md:shadow-sm relative flex flex-col h-[calc(100vh-140px)] md:h-auto">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 w-full max-w-3xl mx-auto">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Chat about your medical image</h3>
          <p className="text-xs text-gray-500">
            Ask follow-up questions – chat resets when you leave this page or run a new analysis
          </p>
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
        className="px-4 py-6 overflow-y-auto overflow-x-hidden space-y-6 min-w-0 w-full max-w-3xl mx-auto min-h-[220px] flex-1"
        aria-live="polite"
        style={{
          maxWidth: '100%',
          wordWrap: 'break-word',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        }}
      >
        {messages.length === 0 && !loading && (
          <div className="text-sm text-gray-400">
            Ask follow‑ups like:
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                'What should I do about these red flags?',
                'Can you explain the most likely condition in more detail?',
                'When should I see a doctor about this image?',
                'What everyday things can make this better or worse?',
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
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              )}
            </div>
            <div className={`flex-1 min-w-0 ${m.role === 'user' ? 'text-right' : ''}`}>
              <div
                className={`inline-block max-w-full px-4 py-2.5 rounded-2xl ${
                  m.role === 'user'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
                style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}
              >
                <div
                  className="text-sm leading-relaxed break-words"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {normaliseMedicalChatContent(m.content).split('\n').map((line, i) => {
                    const trimmed = line.trim()
                    if (!trimmed) {
                      return <div key={i} className="h-3" />
                    }

                    // Section headings in **bold** – allow for cases where the model
                    // keeps the heading and the first sentence on the same line.
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

                    // Numbered list
                    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                    if (numberedMatch) {
                      return (
                        <div key={i} className="ml-4 mb-1.5">
                          <span className="font-medium">{numberedMatch[1]}.</span>{' '}
                          {numberedMatch[2]}
                        </div>
                      )
                    }

                    // Bullet list
                    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/)
                    if (bulletMatch) {
                      return (
                        <div key={i} className="ml-4 mb-1.5">
                          <span className="mr-2">•</span> {bulletMatch[1]}
                        </div>
                      )
                    }

                    // Inline bold handling for **text**
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
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="inline-block px-4 py-2.5 rounded-2xl bg-gray-100">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  ></span>
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  ></span>
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  ></span>
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
          <div className="flex-1 relative flex items-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                resizeTextarea()
              }}
              onKeyDown={onComposerKeyDown}
              placeholder="Message AI about your medical image analysis"
              rows={1}
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 pr-12 text-[16px] leading-6 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 resize-none transition-all duration-200 min-h-[52px] max-h-[200px]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
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
