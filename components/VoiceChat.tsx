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
  entryContext?: 'general' | 'food'
  selectedDate?: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatThread = { id: string; title: string | null; chargedOnce: boolean; createdAt: string; updatedAt: string }
type PhotoMode = 'inventory' | 'menu' | 'meal' | 'label'

export default function VoiceChat({
  context,
  onCostEstimate,
  className = '',
  onExit,
  startExpanded = false,
  hideExpandToggle = false,
  entryContext = 'general',
  selectedDate,
}: VoiceChatProps) {
  const router = useRouter()
  const VOICE_CHAT_COST_CREDITS = 10
  const PHOTO_ANALYSIS_COST_CREDITS = 10
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const [photoMode, setPhotoMode] = useState<PhotoMode>('inventory')
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'scanning' | 'loading'>('idle')
  const [barcodeStatusHint, setBarcodeStatusHint] = useState('Ready')
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [barcodeValue, setBarcodeValue] = useState('')
  const [showManualBarcodeInput, setShowManualBarcodeInput] = useState(false)
  const [pendingBarcodeContext, setPendingBarcodeContext] = useState<{
    label: string
    foodContext: string
  } | null>(null)
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
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([])
  const [bulkActionPending, setBulkActionPending] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null)
  const barcodeScannerRef = useRef<{ reader: any; controls: any } | null>(null)
  const inputRef = useRef<string>('')
  const sendChatMessageRef = useRef<
    ((messageText: string, options?: { foodContextOverride?: string }) => Promise<void> | void) | null
  >(null)
  const [dynamicExampleQuestions, setDynamicExampleQuestions] = useState<string[] | null>(null)
  const storageKey = useMemo(() => `helfi:chat:talk:${entryContext}`, [entryContext])
  const archivedKey = useMemo(() => `helfi:chat:talk:${entryContext}:archived`, [entryContext])
  const threadsUrl = useMemo(
    () => (entryContext === 'food' ? '/api/chat/threads?context=food' : '/api/chat/threads'),
    [entryContext]
  )
  const hasHealthTipContext = !!context?.healthTipSummary
  const isFoodEntry = entryContext === 'food'
  const healthTipTitle = context?.healthTipTitle
  const healthTipCategory = context?.healthTipCategory
  const healthTipSuggestedQuestions = context?.healthTipSuggestedQuestions
  const estimatedChatCost = currentThreadCharged ? 0 : VOICE_CHAT_COST_CREDITS
  const estimatedPhotoCost = pendingPhotos.length * PHOTO_ANALYSIS_COST_CREDITS
  const estimatedCost = estimatedChatCost + estimatedPhotoCost

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

  const exampleQuestions = useMemo(
    () => [
      'What supplements should I take?',
      'How are my medications interacting?',
      'Why am I feeling tired?',
      'What should I eat today?',
    ],
    []
  )

  const effectiveExampleQuestions =
    isFoodEntry && dynamicExampleQuestions?.length ? dynamicExampleQuestions : exampleQuestions

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

  useEffect(() => {
    setThreads([])
    setCurrentThreadId(null)
    setCurrentThreadCharged(false)
    setMessages([])
    setLastChargedCost(null)
    setLastChargedAt(null)
    setThreadsOpen(false)
    setSelectionMode(false)
    setSelectedThreadIds([])
  }, [entryContext])

  const showExitButton = Boolean(onExit)
  const selectedCount = selectedThreadIds.length
  const allThreadIds = useMemo(() => threads.map((thread) => thread.id), [threads])
  const allSelected = selectedCount > 0 && selectedCount === allThreadIds.length

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

  const toggleSelectMode = () => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedThreadIds([])
      }
      return !prev
    })
  }

  const toggleThreadSelection = (threadId: string) => {
    setSelectedThreadIds((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId]
    )
  }

  const toggleSelectAllThreads = () => {
    if (allSelected) {
      setSelectedThreadIds([])
      return
    }
    setSelectedThreadIds(allThreadIds)
  }

  const archiveSelectedThreads = () => {
    if (selectedThreadIds.length === 0) return
    setArchivedThreadIds((prev) => Array.from(new Set([...prev, ...selectedThreadIds])))
    setSelectedThreadIds([])
    setSelectionMode(false)
  }

  const deleteSelectedThreads = async () => {
    if (selectedThreadIds.length === 0) return
    const confirmed = window.confirm(`Delete ${selectedThreadIds.length} chat${selectedThreadIds.length > 1 ? 's' : ''}?`)
    if (!confirmed) return
    setBulkActionPending(true)
    try {
      await Promise.all(
        selectedThreadIds.map((threadId) =>
          fetch('/api/chat/threads', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId }),
          })
        )
      )
      const threadsRes = await fetch(threadsUrl)
      if (threadsRes.ok) {
        const threadsData = await threadsRes.json()
        if (threadsData.threads) {
          setThreads(threadsData.threads)
          if (currentThreadId && selectedThreadIds.includes(currentThreadId)) {
            setCurrentThreadId(null)
            setCurrentThreadCharged(false)
            setMessages([])
            setLastChargedCost(null)
            setLastChargedAt(null)
          }
        }
      }
      setArchivedThreadIds((prev) => prev.filter((id) => !selectedThreadIds.includes(id)))
      setSelectedThreadIds([])
      setSelectionMode(false)
    } catch (err) {
      console.error('Failed to delete chats:', err)
    } finally {
      setBulkActionPending(false)
    }
  }
  
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const resizeRafRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const latestAssistantRef = useRef<HTMLDivElement | null>(null)
  const lastMessageCountRef = useRef(0)

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
    if (currentThreadId) return
    async function loadThreads() {
      try {
        const res = await fetch(threadsUrl)
        if (res.ok) {
          const data = await res.json()
          if (data.threads && Array.isArray(data.threads)) {
            setThreads(data.threads)
          }
        }
      } catch (err) {
        console.error('Failed to load threads:', err)
      }
    }
    loadThreads()
  }, [currentThreadId, isFoodEntry, threadsUrl])

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendChatMessage(input)
  }

  const resetBarcodeState = useCallback(() => {
    setBarcodeStatus('idle')
    setBarcodeStatusHint('Ready')
    setBarcodeError(null)
    setBarcodeValue('')
    setShowManualBarcodeInput(false)
  }, [])

  const stopBarcodeScanner = useCallback(() => {
    const current = barcodeScannerRef.current
    if (current?.controls?.stop) {
      try {
        current.controls.stop()
      } catch {}
    }
    if (current?.reader?.reset) {
      try {
        current.reader.reset()
      } catch {}
    }
    barcodeScannerRef.current = null
    const videoEl = barcodeVideoRef.current
    const stream = videoEl?.srcObject as MediaStream | null
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    if (videoEl) {
      videoEl.srcObject = null
    }
  }, [])

  const lookupBarcodeAndAsk = useCallback(
    async (codeRaw: string) => {
      const normalized = String(codeRaw || '').replace(/[^0-9A-Za-z]/g, '')
      if (!normalized) {
        setBarcodeError('Enter a valid barcode to search.')
        return
      }
      setBarcodeStatus('loading')
      setBarcodeStatusHint('Looking up barcode…')
      setBarcodeError(null)

      try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(normalized)}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.found) {
        const fallbackMessage =
          (typeof data?.message === 'string' && data.message.trim()) ||
          'No product found for that barcode.'
        setBarcodeError(fallbackMessage)
        setBarcodeStatus('scanning')
        setBarcodeStatusHint('Scanning…')
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `${fallbackMessage} Would you like to scan the nutrition label instead?`,
          },
        ])
        return
      }

        const food = data.food || {}
        const formatValue = (value: any) => {
          const num = Number(value)
          if (!Number.isFinite(num)) return null
          return Math.round(num * 10) / 10
        }
        const macros = {
          calories: formatValue(food.calories),
          protein: formatValue(food.protein_g),
          carbs: formatValue(food.carbs_g),
          fat: formatValue(food.fat_g),
          fiber: formatValue(food.fiber_g),
          sugar: formatValue(food.sugar_g),
        }
        const macroLine = [
          macros.calories != null ? `${macros.calories} kcal` : 'unknown kcal',
          macros.protein != null ? `${macros.protein} g protein` : 'unknown protein',
          macros.carbs != null ? `${macros.carbs} g carbs` : 'unknown carbs',
          macros.fat != null ? `${macros.fat} g fat` : 'unknown fat',
          macros.fiber != null ? `${macros.fiber} g fiber` : 'unknown fiber',
          macros.sugar != null ? `${macros.sugar} g sugar` : 'unknown sugar',
        ].join(' - ')

        const itemName =
          typeof food.name === 'string' && food.name.trim().length > 0 ? food.name.trim() : 'this item'
        const brand =
          typeof food.brand === 'string' && food.brand.trim().length > 0 ? food.brand.trim() : null
        const serving =
          typeof food.serving_size === 'string' && food.serving_size.trim().length > 0
            ? food.serving_size.trim()
            : null

        const foodContextOverride = [
          `Barcode item: ${brand ? `${itemName} (${brand})` : itemName}`,
          serving ? `Serving: ${serving}` : null,
          `Macros: ${macroLine}`,
        ]
          .filter(Boolean)
          .join('\n')

        const question =
          inputRef.current.trim() ||
          `I scanned a barcode for ${itemName}. How does it fit my macros today?`

        setShowBarcodeScanner(false)
        resetBarcodeState()
        setPendingBarcodeContext({
          label: brand ? `${itemName} (${brand})` : itemName,
          foodContext: foodContextOverride,
        })
      } catch (err) {
        setBarcodeError('Barcode lookup failed. Please try again.')
        setBarcodeStatus('idle')
      }
    },
    [resetBarcodeState]
  )

  const handleBarcodeDetected = useCallback(
    (rawCode: string) => {
      const cleaned = String(rawCode || '').trim()
      if (!cleaned) return
      stopBarcodeScanner()
      setBarcodeValue(cleaned)
      lookupBarcodeAndAsk(cleaned)
    },
    [lookupBarcodeAndAsk, stopBarcodeScanner]
  )

  const startBarcodeScanner = useCallback(async () => {
    setBarcodeError(null)
    setBarcodeStatus('loading')
    setBarcodeStatusHint('Starting camera…')
    try {
      if (barcodeScannerRef.current) return
      stopBarcodeScanner()
      const videoEl = barcodeVideoRef.current
      if (!videoEl) {
        setBarcodeError('Camera area missing. Close and reopen the scanner.')
        setBarcodeStatusHint('Camera area missing')
        setBarcodeStatus('idle')
        return
      }

      videoEl.setAttribute('playsinline', 'true')
      videoEl.muted = true
      videoEl.autoplay = true
      videoEl.playsInline = true

      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser')
      const { DecodeHintType } = await import('@zxing/library')

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.ITF,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserMultiFormatReader()
      reader.setHints(hints)

      const constraints: any = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }

      const controls = await reader.decodeFromConstraints(constraints, videoEl, (result: any) => {
        const text = result?.getText ? result.getText() : result?.text
        if (text) handleBarcodeDetected(text)
      })

      barcodeScannerRef.current = { reader, controls }
      try {
        await videoEl.play()
      } catch {}
      setBarcodeStatus('scanning')
      setBarcodeStatusHint('Scanning…')
    } catch (err) {
      console.error('Barcode scanner start error', err)
      setBarcodeError('Could not start the camera. Please allow camera access and retry.')
      setBarcodeStatusHint('Camera start failed')
      setBarcodeStatus('idle')
      stopBarcodeScanner()
    }
  }, [handleBarcodeDetected, stopBarcodeScanner])

  useEffect(() => {
    if (showBarcodeScanner) {
      startBarcodeScanner()
    } else {
      stopBarcodeScanner()
      resetBarcodeState()
    }
    return () => {
      stopBarcodeScanner()
    }
  }, [resetBarcodeState, showBarcodeScanner, startBarcodeScanner, stopBarcodeScanner])

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
        body: JSON.stringify({ context: entryContext }),
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
        const threadsRes = await fetch(threadsUrl)
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
        const threadsRes = await fetch(threadsUrl)
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          if (threadsData.threads) {
            setThreads(threadsData.threads)
            if (currentThreadId === threadId) {
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
        const threadsRes = await fetch(threadsUrl)
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
      setCurrentThreadId(null)
      setCurrentThreadCharged(false)
      setMessages([])
      setLastChargedCost(null)
      setLastChargedAt(null)
    }
    closeThreadActions()
  }

  useEffect(() => {
    // Start with a blank chat unless the user explicitly selects a thread.
  }, [])

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
    inputRef.current = input
  }, [input])

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

  useEffect(() => {
    if (selectedThreadIds.length === 0) return
    const threadIds = new Set(threads.map((thread) => thread.id))
    setSelectedThreadIds((prev) => prev.filter((id) => threadIds.has(id)))
  }, [threads, selectedThreadIds.length])

  // Auto-scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (messages.length === 0 && !loading) return

    const isNewMessage = messages.length !== lastMessageCountRef.current
    if (isNewMessage) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage?.role === 'assistant' && latestAssistantRef.current) {
        latestAssistantRef.current.scrollIntoView({ block: 'start' })
      } else {
        container.scrollTop = container.scrollHeight
      }
      lastMessageCountRef.current = messages.length
    }

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

  const buildLocalDatePayload = () => {
    const now = new Date()
    const tzOffsetMin = now.getTimezoneOffset()
    const fallbackDate = new Date(now.getTime() - tzOffsetMin * 60 * 1000).toISOString().slice(0, 10)
    const dateFromSelection =
      typeof selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
        ? selectedDate
        : fallbackDate
    return { localDate: dateFromSelection, tzOffsetMin }
  }

  const exampleDatePayload = useMemo(() => buildLocalDatePayload(), [selectedDate])

  const photoModeLabel = useMemo(() => {
    switch (photoMode) {
      case 'menu':
        return 'Menu photo'
      case 'meal':
        return 'Meal photo'
      case 'label':
        return 'Nutrition label photo'
      default:
        return 'Fridge/pantry photo'
    }
  }, [photoMode])

  useEffect(() => {
    if (!isFoodEntry) {
      setDynamicExampleQuestions(null)
      return
    }
    const { localDate, tzOffsetMin } = exampleDatePayload
    const params = new URLSearchParams({
      context: 'food',
      localDate,
      tzOffsetMin: String(tzOffsetMin),
    })
    fetch(`/api/chat/examples?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.questions) && data.questions.length > 0) {
          setDynamicExampleQuestions(
            data.questions.filter((q: any) => typeof q === 'string' && q.trim().length > 0)
          )
        } else {
          setDynamicExampleQuestions(null)
        }
      })
      .catch(() => {
        setDynamicExampleQuestions(null)
      })
  }, [exampleDatePayload, isFoodEntry])

  const openPhotoPicker = () => {
    if (loading) return
    photoInputRef.current?.click()
  }

  const openPhotoMenu = () => {
    if (loading || isListening) return
    if (!isFoodEntry) {
      openPhotoPicker()
      return
    }
    setPhotoMenuOpen(true)
  }

  const selectPhotoMode = (mode: PhotoMode) => {
    if (pendingPhotos.length > 0 && mode !== photoMode) {
      clearPendingPhotos()
    }
    setPhotoMode(mode)
    setPhotoMenuOpen(false)
    openPhotoPicker()
  }

  const openBarcodeMenu = () => {
    setPhotoMenuOpen(false)
    clearPendingPhotos()
    setShowBarcodeScanner(true)
  }

  const clearPendingPhotos = () => {
    setPendingPhotos([])
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
  }

  const clearPendingBarcodeContext = () => {
    setPendingBarcodeContext(null)
  }

  const removePendingPhoto = (index: number) => {
    setPendingPhotos((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handlePhotoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setPendingPhotos((prev) => [...prev, ...files])
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
  }

  const sendFridgePhoto = async (note: string) => {
    if (pendingPhotos.length === 0) return
    setLoading(true)
    setError(null)
    stopListening()
    setLastChargedCost(null)
    setLastChargedAt(null)

    const photoLabel = pendingPhotos.length > 1
      ? `${photoModeLabel} set (${pendingPhotos.length})`
      : photoModeLabel
    const userMessage = note ? `${photoLabel}: ${note}` : photoLabel
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setInput('')

    const { localDate, tzOffsetMin } = buildLocalDatePayload()
    const formData = new FormData()
    pendingPhotos.forEach((file) => {
      formData.append('image', file)
    })
    formData.append('message', note)
    const forceNewThread = !currentThreadId
    formData.append('threadId', currentThreadId || '')
    formData.append('newThread', forceNewThread ? 'true' : 'false')
    formData.append('entryContext', entryContext)
    formData.append('photoMode', photoMode)
    formData.append('localDate', localDate)
    formData.append('tzOffsetMin', String(tzOffsetMin))

    try {
      const res = await fetch('/api/chat/fridge', {
        method: 'POST',
        body: formData,
      })

      if (res.status === 402) {
        const data = await res.json()
        setError(`Insufficient credits. Estimated cost: ${data.estimatedCost} credits. Available: ${data.availableCredits} credits.`)
        setLoading(false)
        return
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError('Unable to analyze the photo right now.')
        setLoading(false)
        return
      }

      if (typeof data?.assistant === 'string') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.assistant }])
      }

      if (data?.threadId) {
        setCurrentThreadId(data.threadId)
      }

      if (typeof data?.chargedCents === 'number') {
        setLastChargedCost(data.chargedCents)
        setLastChargedAt(new Date().toISOString())
      }
      if (data?.chargedChat) {
        setCurrentThreadCharged(true)
      }

      try { window.dispatchEvent(new Event('credits:refresh')) } catch {}

      const threadsRes = await fetch(threadsUrl)
      if (threadsRes.ok) {
        const threadsData = await threadsRes.json()
        if (threadsData.threads) {
          setThreads(threadsData.threads)
        }
      }

      clearPendingPhotos()
    } catch (err) {
      console.error('Failed to analyze photo:', err)
      setError('Unable to analyze the photo right now.')
    } finally {
      setLoading(false)
    }
  }


  async function sendChatMessage(messageText: string, options?: { foodContextOverride?: string }) {
    const text = messageText.trim()
    if (!text && pendingPhotos.length === 0) {
      if (pendingBarcodeContext) {
        setError('Type a question about the scanned item, then send.')
      } else {
        setError('Enter a question or use voice input.')
      }
      return
    }

    if (pendingPhotos.length > 0) {
      await sendFridgePhoto(text)
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
      const inlineOverride = options?.foodContextOverride?.trim()
      const foodContextOverride =
        inlineOverride || pendingBarcodeContext?.foodContext || undefined
      if (!inlineOverride && pendingBarcodeContext) {
        setPendingBarcodeContext(null)
      }

      if (onCostEstimate) onCostEstimate(estimatedCost)

      const url = `/api/chat/voice`
      const wantsStream = entryContext !== 'food'
      const { localDate, tzOffsetMin } = buildLocalDatePayload()
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: wantsStream ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify({
          message: text,
          threadId: currentThreadId || undefined,
          newThread: !currentThreadId,
          entryContext,
          localDate,
          tzOffsetMin,
          ...(foodContextOverride ? { foodContextOverride } : {}),
          ...context,
        }),
      })
      if (res.status === 402) {
        const data = await res.json()
        setError(`Insufficient credits. Estimated cost: ${data.estimatedCost} credits. Available: ${data.availableCredits} credits.`)
        setLoading(false)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message =
          (typeof data?.message === 'string' && data.message.trim()) ||
          (typeof data?.error === 'string' && data.error.trim()) ||
          'Sorry, something went wrong. Please try again.'
        const safeMessage =
          message.toLowerCase().includes('prisma') || message.toLowerCase().includes('transaction')
            ? 'Something went wrong. Please try again.'
            : message
        setError(safeMessage)
        setLoading(false)
        return
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase()
      const isEventStream = contentType.includes('text/event-stream')
      const resClone = isEventStream ? null : res.clone()

      const recoverAssistantMessage = async () => {
        try {
          let threadId = currentThreadId
          if (!threadId) {
            const threadsRes = await fetch(threadsUrl)
            if (threadsRes.ok) {
              const threadsData = await threadsRes.json()
              const latest = threadsData?.threads?.[0]
              if (latest?.id) {
                threadId = latest.id
                setCurrentThreadId(latest.id)
                setCurrentThreadCharged(Boolean(latest.chargedOnce))
              }
            }
          }
          if (!threadId) return false
          const messagesRes = await fetch(`/api/chat/voice?threadId=${threadId}`)
          if (!messagesRes.ok) return false
          const messagesData = await messagesRes.json().catch(() => null)
          const messageList = Array.isArray(messagesData?.messages) ? messagesData.messages : []
          const lastAssistant = [...messageList].reverse().find((msg) => msg.role === 'assistant')
          if (!lastAssistant?.content) return false
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.content === lastAssistant.content) return prev
            return [...prev, { role: 'assistant', content: lastAssistant.content }]
          })
          return true
        } catch {
          return false
        }
      }

      const parseSsePayload = async (rawPayload: string) => {
        const chunks = rawPayload.split('\n\n')
        let fullResponse = ''
        let sawEnd = false
        for (const chunk of chunks) {
          const trimmed = chunk.trim()
          if (!trimmed) continue
          if (trimmed.startsWith('event: charged')) {
            const dataLine = trimmed
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
          } else if (trimmed.startsWith('data:')) {
            const raw = trimmed.replace(/^data:\s*/, '')
            let token = ''
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
          } else if (trimmed.startsWith('event: end')) {
            sawEnd = true
          }
        }

        if (fullResponse) {
          setMessages((prev) => [...prev, { role: 'assistant', content: fullResponse }])
        } else {
          await recoverAssistantMessage()
        }

        if (sawEnd) {
          const threadsRes = await fetch(threadsUrl)
          if (threadsRes.ok) {
            const threadsData = await threadsRes.json()
            if (threadsData.threads) {
              setThreads(threadsData.threads)
                if (!currentThreadId && threadsData.threads.length > 0 && !isFoodEntry) {
                  setCurrentThreadId(threadsData.threads[0].id)
                }
            }
          }
        }
      }

      if (res.ok && isEventStream && res.body) {
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
              const threadsRes = await fetch(threadsUrl)
              if (threadsRes.ok) {
                const threadsData = await threadsRes.json()
                if (threadsData.threads) {
                  setThreads(threadsData.threads)
                  // Update currentThreadId if we created a new thread
                  if (!currentThreadId && threadsData.threads.length > 0 && !isFoodEntry) {
                    setCurrentThreadId(threadsData.threads[0].id)
                  }
                }
              }
            }
          }
        }
        if (!hasAssistant && !fullResponse) {
          const recovered = await recoverAssistantMessage()
          if (!recovered) {
            setError('No response received. Please try again.')
          }
        }
      } else if (res.ok && isEventStream) {
        const raw = await res.text()
        await parseSsePayload(raw)
      } else {
        const data = await res.json().catch(() => null)
        const textOut = data?.assistant as string | undefined
        if (textOut) {
          setMessages((prev) => [...prev, { role: 'assistant', content: textOut }])
        } else {
          const raw = resClone ? await resClone.text().catch(() => '') : ''
          if (raw.includes('data:')) {
            await parseSsePayload(raw)
          } else {
            const recovered = await recoverAssistantMessage()
            if (!recovered) {
              setError('No response received. Please try again.')
            }
          }
        }
        if (typeof data?.threadId === 'string' && data.threadId) {
          setCurrentThreadId(data.threadId)
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
      const raw = err?.message || 'Something went wrong'
      const safeMessage =
        raw.toLowerCase().includes('prisma') || raw.toLowerCase().includes('transaction')
          ? 'Something went wrong. Please try again.'
          : raw
      setError(safeMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    sendChatMessageRef.current = sendChatMessage
  }, [sendChatMessage])

  const renderFormattedContent = (content: string, enableMacroColors = false) => {
    const formatted = formatChatContent(content)
    const paragraphs = formatted.split(/\n\n+/)
    const macroColorMap: Record<string, string> = {
      protein: '#ef4444',
      carbs: '#22c55e',
      fat: '#6366f1',
      fiber: '#12adc9',
      fibre: '#12adc9',
      sugar: '#f97316',
    }
    const headingLabels = ['Macros', 'After eating', 'Current totals', 'Consumed', 'Targets', 'Remaining']
    const headingRegex = new RegExp(`^(${headingLabels.join('|')}):\\s*`, 'i')
    const optionRegex = /^Option\s+\d+:\s*/i
    const shouldNormalizeMacros = (value: string) =>
      /(?:kcal|calories|protein|carbs|fat|fiber|fibre|sugar)/i.test(value) &&
      /(?:\d|kcal|\bg\b|unknown|approximate)/i.test(value)
    const normalizeMacroSeparators = (value: string) => {
      if (!enableMacroColors) return value
      if (!shouldNormalizeMacros(value)) return value
      return value.replace(/,\s+/g, ' - ').replace(/\s+-\s+/g, ' - ').trim()
    }
    const renderMacroSegments = (line: string) => {
      const normalized = normalizeMacroSeparators(line)
      const parts = normalized.split(' - ').filter(Boolean)
      return parts.map((part, idx) => {
        const lower = part.toLowerCase()
        const macroKey = enableMacroColors && shouldNormalizeMacros(part)
          ? Object.keys(macroColorMap).find((key) => lower.includes(key))
          : undefined
        const style = macroKey ? { color: macroColorMap[macroKey] } : undefined
        return (
          <span key={`${part}-${idx}`} style={style} className={macroKey ? 'font-semibold' : undefined}>
            {part}
            {idx < parts.length - 1 ? ' - ' : ''}
          </span>
        )
      })
    }
    return paragraphs.map((para, paraIdx) => {
      const trimmed = para.trim()
      if (!trimmed) return null
      const lines = trimmed.split('\n')
      return (
        <div key={paraIdx} className={paraIdx > 0 ? 'mt-4' : ''}>
          {lines.map((line, lineIdx) => {
            const lineTrimmed = line.trim()
            if (!lineTrimmed) return <div key={lineIdx} className="h-2" />

            const boldLine =
              lineTrimmed.startsWith('**') && lineTrimmed.endsWith('**') && lineTrimmed.length > 4
            const lineContent = boldLine ? lineTrimmed.slice(2, -2).trim() : lineTrimmed
            const headingSource = lineContent.replace(/^\*\*([^*]+)\*\*/, '$1')
            const optionSource = headingSource.replace(/^\*\*(Option\s+\d+:)\*\*/i, '$1')

            const macroHeadingMatch = headingSource.match(/^Macros(?:\s*\([^)]+\))?:?\s*(.*)$/i)
            if (macroHeadingMatch) {
              const label = headingSource.split(':')[0].trim() || 'Macros'
              const rest = macroHeadingMatch[1] || ''
              return (
                <div key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
                  <strong className="font-semibold text-gray-900">{label}:</strong>{' '}
                  {renderMacroSegments(rest)}
                </div>
              )
            }

            const headingMatch = headingSource.match(headingRegex)
            if (headingMatch) {
              const label = headingMatch[1]
              const rest = headingSource.replace(headingRegex, '')
              return (
                <div key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
                  <strong className="font-semibold text-gray-900">{label}:</strong>{' '}
                  {renderMacroSegments(rest)}
                </div>
              )
            }

            const optionMatch = optionSource.match(optionRegex)
            if (optionMatch) {
              const label = optionMatch[0].trim()
              const rest = optionSource.replace(optionRegex, '')
              return (
                <div key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
                  <strong className="font-semibold text-gray-900">{label}</strong>{' '}
                  {rest}
                </div>
              )
            }

            const numberedMatch = lineContent.match(/^(\d+)\.\s+(.+)$/)
            if (numberedMatch) {
              const parts = numberedMatch[2].split(/(\*\*.*?\*\*)/g)
              return (
                <div key={lineIdx} className="ml-4 mb-1.5">
                  <span className="font-medium">{numberedMatch[1]}.</span>{' '}
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                    }
                    const lower = part.toLowerCase()
                    const macroKey =
                      enableMacroColors && shouldNormalizeMacros(part)
                        ? Object.keys(macroColorMap).find((key) => lower.includes(key))
                        : undefined
                    const style = macroKey ? { color: macroColorMap[macroKey] } : undefined
                    return (
                      <span
                        key={j}
                        style={style}
                        className={
                          macroKey
                            ? 'font-semibold'
                            : boldLine
                            ? 'font-semibold'
                            : undefined
                        }
                      >
                        {part}
                      </span>
                    )
                  })}
                </div>
              )
            }

            const bulletMatch = lineContent.match(/^[-•*]\s+(.+)$/)
            if (bulletMatch) {
              const parts = bulletMatch[1].split(/(\*\*.*?\*\*)/g)
              return (
                <div key={lineIdx} className="ml-4 mb-1.5">
                  <span className="mr-2">•</span>
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                    }
                    const lower = part.toLowerCase()
                    const macroKey =
                      enableMacroColors && shouldNormalizeMacros(part)
                        ? Object.keys(macroColorMap).find((key) => lower.includes(key))
                        : undefined
                    const style = macroKey ? { color: macroColorMap[macroKey] } : undefined
                    return (
                      <span
                        key={j}
                        style={style}
                        className={
                          macroKey
                            ? 'font-semibold'
                            : boldLine
                            ? 'font-semibold'
                            : undefined
                        }
                      >
                        {part}
                      </span>
                    )
                  })}
                </div>
              )
            }

            const normalized = normalizeMacroSeparators(lineContent)
            const parts = normalized.split(/(\*\*.*?\*\*)/g)
            return (
              <div key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
                {parts.map((part, j) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                  }
                  const lower = part.toLowerCase()
                  const macroKey =
                    enableMacroColors && shouldNormalizeMacros(part)
                      ? Object.keys(macroColorMap).find((key) => lower.includes(key))
                      : undefined
                  const style = macroKey ? { color: macroColorMap[macroKey] } : undefined
                  return (
                    <span
                      key={j}
                      style={style}
                      className={
                        macroKey
                          ? 'font-semibold'
                          : boldLine
                          ? 'font-semibold'
                          : undefined
                      }
                    >
                      {part}
                    </span>
                  )
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
            <span className="text-[16px] md:text-sm font-medium text-gray-600">New chat</span>
          </div>
          <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 18 }}>edit_square</span>
        </button>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleSelectMode}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[13px] md:text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {selectionMode ? 'check_circle' : 'checklist'}
            </span>
            {selectionMode ? 'Done selecting' : 'Select chats'}
          </button>
          {selectionMode && (
            <button
              type="button"
              onClick={toggleSelectAllThreads}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[13px] md:text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {allSelected ? 'remove_done' : 'select_all'}
              </span>
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {threadGroups.map((group) => (
          group.items.length > 0 ? (
            <div key={group.label} className="flex flex-col gap-1">
              <h3 className="text-[12px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-2">
                {group.label}
              </h3>
              {group.items.map((thread) => {
                const isSelected = selectedThreadIds.includes(thread.id)
                return (
                  <div key={thread.id} className="flex items-center gap-2 group">
                    {selectionMode && (
                      <button
                        type="button"
                        onClick={() => toggleThreadSelection(thread.id)}
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          isSelected ? 'border-[#10a27e] bg-[#10a27e]' : 'border-gray-300 bg-white'
                        }`}
                        aria-label={isSelected ? 'Deselect chat' : 'Select chat'}
                      >
                        {isSelected && (
                          <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>
                            check
                          </span>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectionMode) {
                          toggleThreadSelection(thread.id)
                          return
                        }
                        if (longPressTriggeredRef.current) {
                          longPressTriggeredRef.current = false
                          return
                        }
                        handleSelectThread(thread.id)
                      }}
                      onPointerDown={(event) => {
                        if (selectionMode) return
                        startLongPress(event, thread.id)
                      }}
                      onPointerUp={() => {
                        if (selectionMode) return
                        endLongPress()
                      }}
                      onPointerCancel={() => {
                        if (selectionMode) return
                        endLongPress()
                      }}
                      onContextMenu={(event) => {
                        if (selectionMode) return
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
                      <span className={`flex-1 min-w-0 truncate text-[15px] md:text-[13px] font-medium ${
                        currentThreadId === thread.id ? 'text-gray-900' : 'text-gray-500'
                      }`}>
                        {thread.title || 'New chat'}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null
        ))}
        {archivedThreads.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-[12px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-2">
              Archived
            </h3>
            {archivedThreads.map((thread) => {
              const isSelected = selectedThreadIds.includes(thread.id)
              return (
                <div key={thread.id} className="flex items-center gap-2 group">
                  {selectionMode && (
                    <button
                      type="button"
                      onClick={() => toggleThreadSelection(thread.id)}
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        isSelected ? 'border-[#10a27e] bg-[#10a27e]' : 'border-gray-300 bg-white'
                      }`}
                      aria-label={isSelected ? 'Deselect chat' : 'Select chat'}
                    >
                      {isSelected && (
                        <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>
                          check
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectionMode) {
                        toggleThreadSelection(thread.id)
                        return
                      }
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false
                        return
                      }
                      handleSelectThread(thread.id)
                    }}
                    onPointerDown={(event) => {
                      if (selectionMode) return
                      startLongPress(event, thread.id)
                    }}
                    onPointerUp={() => {
                      if (selectionMode) return
                      endLongPress()
                    }}
                    onPointerCancel={() => {
                      if (selectionMode) return
                      endLongPress()
                    }}
                    onContextMenu={(event) => {
                      if (selectionMode) return
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
                    <span className={`flex-1 min-w-0 truncate text-[15px] md:text-[13px] font-medium ${
                      currentThreadId === thread.id ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {thread.title || 'New chat'}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {!hasVisibleThreads && archivedThreads.length === 0 && (
          <div className="px-3 text-[13px] md:text-xs text-gray-400">No chats yet.</div>
        )}
      </div>
      {selectionMode && (
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center justify-between text-[13px] md:text-[11px] text-gray-500">
            <span>{selectedCount} selected</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={archiveSelectedThreads}
                disabled={selectedCount === 0 || bulkActionPending}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={deleteSelectedThreads}
                disabled={selectedCount === 0 || bulkActionPending}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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
          <div className="text-[16px] md:text-sm font-semibold text-gray-900">Talk to Helfi</div>
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
                      <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900">
                        {isFoodEntry ? 'Food Diary Macro Coach' : 'How can I help you today?'}
                      </h1>
                      <div className="mt-4 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-4 text-left text-[16px] md:text-sm text-gray-600 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          {isFoodEntry ? 'What this can do' : 'How Talk to Helfi works'}
                        </div>
                        {isFoodEntry ? (
                          <ul className="mt-3 space-y-2 text-[15px] md:text-[13px] text-gray-600">
                            <li>Uses your current Food Diary totals to spot macro gaps.</li>
                            <li>Suggests what to eat right now based on what you are missing.</li>
                            <li>Upload a menu, meal, fridge, pantry, or nutrition label photo.</li>
                            <li>Photo analysis costs an extra 10 credits per image. Barcode scans cost 3 credits.</li>
                          </ul>
                        ) : (
                          <ul className="mt-3 space-y-2 text-[15px] md:text-[13px] text-gray-600">
                            <li>Each chat costs 10 credits once (not per response).</li>
                            <li>We show the estimate before sending and confirm the charge after the first response.</li>
                            <li>Your chats are saved unless you delete them, so you can revisit past conversations.</li>
                            <li>Helfi can reference older chats when it helps answer a new question.</li>
                          </ul>
                        )}
                      </div>
                      <div className="mt-8 w-full max-w-sm">
                        <div className="flex items-center justify-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-[#10a27e] text-xl">lightbulb</span>
                          <h3 className="text-[12px] md:text-xs font-bold uppercase tracking-wider text-gray-400">Examples</h3>
                        </div>
                        <div className="flex flex-col gap-3">
                          {effectiveExampleQuestions.map((q) => (
                            <button
                              key={q}
                              onClick={() => setInput(q)}
                              className="rounded-xl border border-gray-200 bg-white p-4 text-[16px] md:text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
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

              {messages.map((m, idx) => {
                const isLast = idx === messages.length - 1
                const assistantRef = m.role === 'assistant' && isLast ? latestAssistantRef : undefined
                return (
                <div ref={assistantRef} key={idx} className={`group flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
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
                      <div className="w-full space-y-2 rounded-2xl border border-gray-100 bg-[#fcfcfc] px-6 py-5 shadow-sm">
                        <div className="text-[12px] md:text-[11px] font-bold uppercase tracking-wide text-gray-400">Health Assistant</div>
                        <div className="text-[18px] md:text-[16px] leading-7 text-gray-800">
                          {renderFormattedContent(m.content, true)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[18px] md:text-[16px] leading-7 text-gray-900 font-medium">
                        {renderFormattedContent(m.content, false)}
                      </div>
                    )}
                  </div>
                </div>
              )})}

              {loading && (
                <div className="group flex gap-4">
                  <div className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-100 bg-white text-black shadow-sm">
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
              {pendingBarcodeContext && (
                <div className="mb-3 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[14px] md:text-[12px] text-blue-900">
                  <span>Scanned item ready: {pendingBarcodeContext.label}</span>
                  <button
                    type="button"
                    onClick={clearPendingBarcodeContext}
                    className="rounded-lg px-2 py-1 text-[12px] md:text-[11px] font-semibold text-blue-900 hover:bg-blue-100"
                  >
                    Remove
                  </button>
                </div>
              )}
              {(estimatedCost !== null || lastChargedCost !== null) && (
                <div className="flex flex-wrap gap-4 text-[13px] md:text-[11px] text-gray-500 mb-3">
                  {estimatedChatCost !== null && (
                    <span>
                      Estimated <span className="font-semibold text-gray-700">{estimatedChatCost} credits</span>{' '}
                      {currentThreadCharged ? '(already covered)' : 'per chat'}
                    </span>
                  )}
                  {estimatedPhotoCost > 0 && (
                    <span>
                      Photo analysis <span className="font-semibold text-gray-700">{estimatedPhotoCost} credits</span>
                      {' '}for {pendingPhotos.length} photo{pendingPhotos.length > 1 ? 's' : ''}
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
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={handlePhotoSelected}
                />
                {pendingPhotos.length > 0 && (
                  <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] md:text-[12px] text-amber-800">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {pendingPhotos.length} {photoModeLabel}
                        {pendingPhotos.length > 1 ? 's' : ''} selected (adds{' '}
                        {PHOTO_ANALYSIS_COST_CREDITS * pendingPhotos.length} credits)
                      </span>
                      <button
                        type="button"
                        onClick={clearPendingPhotos}
                        className="rounded-lg px-2 py-1 text-[13px] md:text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Remove all
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pendingPhotos.map((photo, idx) => (
                        <button
                          key={`${photo.name}-${idx}`}
                          type="button"
                          onClick={() => removePendingPhoto(idx)}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-3 py-1 text-[12px] md:text-[11px] text-amber-900 hover:bg-amber-100"
                        >
                          <span className="truncate max-w-[160px]">{photo.name || `Photo ${idx + 1}`}</span>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Message Talk to Helfi..."
                  rows={1}
                  className="max-h-[200px] min-h-[60px] w-full resize-none bg-transparent px-4 py-[18px] text-[18px] md:text-[16px] text-black placeholder-gray-400 focus:outline-none border-none focus:ring-0"
                />
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openPhotoMenu}
                    disabled={loading || isListening}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                    aria-label="Add photo or scan barcode"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>photo_camera</span>
                  </button>
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
                    disabled={loading || isListening || (!input.trim() && pendingPhotos.length === 0)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-sm"
                    aria-label="Send message"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>
                  </button>
                </div>
              </form>
              {error && <div className="mt-2 text-[13px] md:text-xs text-red-600">{error}</div>}
              <div className="mt-3 text-center text-[13px] md:text-[11px] text-gray-400">
                AI can make mistakes. Please verify important information.
              </div>
            </div>
          </div>
        </section>
      </div>

      {photoMenuOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setPhotoMenuOpen(false)}
            aria-label="Close photo menu"
          />
          <div className="relative w-full max-w-none sm:max-w-md bg-white rounded-t-3xl shadow-2xl pb-3">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="text-base font-semibold text-gray-900">Add a photo</div>
              <div className="text-xs text-gray-500 mt-1">Choose what you want the photo to represent.</div>
            </div>
            <div className="px-3 py-4">
              <button
                type="button"
                onClick={() => selectPhotoMode('menu')}
                className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-gray-900 hover:bg-gray-50 rounded-xl"
              >
                Menu photo
                <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 24 }}>restaurant</span>
              </button>
              <button
                type="button"
                onClick={() => selectPhotoMode('meal')}
                className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-gray-900 hover:bg-gray-50 rounded-xl"
              >
                Meal photo
                <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 24 }}>lunch_dining</span>
              </button>
              <button
                type="button"
                onClick={() => selectPhotoMode('inventory')}
                className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-gray-900 hover:bg-gray-50 rounded-xl"
              >
                Fridge or pantry photo
                <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 24 }}>kitchen</span>
              </button>
              <button
                type="button"
                onClick={() => selectPhotoMode('label')}
                className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-gray-900 hover:bg-gray-50 rounded-xl"
              >
                Nutrition label photo
                <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 24 }}>fact_check</span>
              </button>
              <button
                type="button"
                onClick={openBarcodeMenu}
                className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-gray-900 hover:bg-gray-50 rounded-xl"
              >
                Scan barcode
                <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 24 }}>qr_code_scanner</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showBarcodeScanner && (
        <div className="fixed inset-0 z-[9999] bg-black text-white">
          <div className="flex items-center justify-between px-4 py-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
            <div className="text-base font-semibold">Scan barcode</div>
            <button
              type="button"
              onClick={() => {
                stopBarcodeScanner()
                setShowBarcodeScanner(false)
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Close barcode scanner"
            >
              <span className="material-symbols-outlined text-2xl text-white">close</span>
            </button>
          </div>
          <div className="px-4 pb-6 space-y-4">
            <div className="rounded-3xl overflow-hidden bg-black border border-white/10">
              <video ref={barcodeVideoRef} className="h-[65vh] w-full object-cover" />
            </div>
            <div className="text-sm text-gray-200">{barcodeStatusHint}</div>
            {barcodeError && <div className="text-sm text-red-300">{barcodeError}</div>}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowManualBarcodeInput((prev) => !prev)}
                className="self-start rounded-lg border border-white/30 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                {showManualBarcodeInput ? 'Hide barcode input' : 'Type barcode instead'}
              </button>
              {showManualBarcodeInput && (
                <div className="flex items-center gap-2">
                  <input
                    value={barcodeValue}
                    onChange={(event) => setBarcodeValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        lookupBarcodeAndAsk(barcodeValue)
                      }
                    }}
                    placeholder="Enter barcode"
                    className="flex-1 rounded-lg border border-white/30 bg-black/40 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => lookupBarcodeAndAsk(barcodeValue)}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-100"
                  >
                    Search
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                stopBarcodeScanner()
                setShowBarcodeScanner(false)
              }}
              className="mt-2 w-full rounded-full border border-white/40 px-4 py-3 text-sm font-semibold text-white"
            >
              Close scanner
            </button>
          </div>
        </div>
      )}

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
          <div className="relative w-full max-w-none sm:max-w-md bg-white rounded-t-3xl shadow-2xl pb-3">
            {!renameOpen && !deleteConfirmOpen && (
              <div className="px-3 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setRenameValue(actionThread?.title || '')
                    setRenameOpen(true)
                    setRenameCleared(false)
                  }}
                  className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-gray-900 hover:bg-gray-50 rounded-xl"
                >
                  Rename
                  <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 24 }}>edit_square</span>
                </button>
                <button
                  type="button"
                  onClick={() => actionThreadId && handleArchiveThread(actionThreadId)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-gray-900 hover:bg-gray-50 rounded-xl"
                >
                  {actionThreadArchived ? 'Unarchive' : 'Archive'}
                  <span className="material-symbols-outlined text-gray-500" style={{ fontSize: 24 }}>
                    {actionThreadArchived ? 'unarchive' : 'archive'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left text-base text-red-600 hover:bg-red-50 active:bg-red-100 active:translate-y-[1px] active:scale-[0.99] transition rounded-xl"
                >
                  Delete
                  <span className="material-symbols-outlined text-red-500" style={{ fontSize: 24 }}>delete</span>
                </button>
              </div>
            )}

            {renameOpen && (
              <div className="px-6 py-5 overflow-hidden">
                <div className="text-base font-semibold text-gray-900 mb-3">Rename chat</div>
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
                  className="w-full min-w-0 max-w-full rounded-xl border border-gray-200 px-4 py-3 text-[16px] leading-6 focus:outline-none focus:ring-0 overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ WebkitTextSizeAdjust: '100%' }}
                />
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={closeThreadActions}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-600 hover:bg-gray-50"
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
                    className="flex-1 rounded-xl bg-black px-4 py-3 text-base text-white hover:bg-gray-800"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {deleteConfirmOpen && (
              <div className="px-6 py-5">
                <div className="text-base font-semibold text-gray-900 mb-2">Delete this chat?</div>
                <div className="text-sm text-gray-500 mb-5">This can’t be undone.</div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeThreadActions}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-600 hover:bg-gray-50"
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
                    className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-base text-white hover:bg-red-700 active:bg-red-700 active:translate-y-[1px] active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
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
