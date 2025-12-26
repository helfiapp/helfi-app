'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodTabs from '@/components/mood/MoodTabs'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'

export const dynamic = 'force-dynamic'

type JournalEntry = {
  id: string
  localDate: string
  title: string
  content: string
  images: any
  tags?: any
  audio?: any
  prompt?: string
  template?: string
  createdAt: string
}

const PROMPTS = [
  'What went well today?',
  'What felt hard today?',
  'What am I grateful for?',
  'What do I need tomorrow?',
  'What surprised me today?',
]

const TEMPLATES = [
  {
    name: 'Daily reflection',
    body: '<p><strong>Wins</strong></p><p><br></p><p><strong>Challenges</strong></p><p><br></p><p><strong>What I learned</strong></p><p><br></p>',
  },
  {
    name: 'Gratitude',
    body: '<p><strong>Today I am grateful for...</strong></p><p><br></p><p><strong>Someone I appreciate</strong></p><p><br></p><p><strong>One small win</strong></p><p><br></p>',
  },
  {
    name: 'Stress check',
    body: '<p><strong>What caused stress?</strong></p><p><br></p><p><strong>How I responded</strong></p><p><br></p><p><strong>What could help next time</strong></p><p><br></p>',
  },
]

function asDateString(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateLabel(localDate: string) {
  const today = asDateString(new Date())
  const yesterday = asDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))
  if (localDate === today) return 'Today'
  if (localDate === yesterday) return 'Yesterday'
  const d = new Date(`${localDate}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateLong(localDate: string) {
  const d = new Date(`${localDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return localDate
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeImages(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter((item) => typeof item === 'string' && item.trim())
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string' && item.trim())
      }
    } catch {}
  }
  return []
}

function normalizeTags(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter((item) => typeof item === 'string' && item.trim())
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string' && item.trim())
      }
    } catch {}
  }
  return []
}

function formatSeconds(total: number) {
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default function MoodJournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [localDate, setLocalDate] = useState(asDateString(new Date()))
  const [contentHtml, setContentHtml] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [audioClips, setAudioClips] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [selectedPrompt, setSelectedPrompt] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const editorRef = useRef<HTMLDivElement | null>(null)
  const selectionRef = useRef<Range | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadEntries = async (query?: string) => {
    setLoading(true)
    setError(null)
    try {
      const q = query?.trim()
      const url = q
        ? `/api/mood/journal/entries?limit=50&q=${encodeURIComponent(q)}`
        : '/api/mood/journal/entries?limit=50'
      const res = await fetch(url, { cache: 'no-store' as any })
      if (!res.ok) throw new Error('Failed to load journal')
      const data = await res.json()
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load journal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => {
      loadEntries(searchTerm)
    }, 300)
    return () => clearTimeout(handle)
  }, [searchTerm])

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  useEffect(() => {
    const handleSelectionChange = () => {
      const el = editorRef.current
      const sel = window.getSelection()
      if (!el || !sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (!el.contains(range.startContainer)) return
      selectionRef.current = range.cloneRange()
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  const syncSelectionRef = () => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!el.contains(range.startContainer)) return
    selectionRef.current = range.cloneRange()
  }

  const restoreEditorSelection = () => {
    const el = editorRef.current
    const range = selectionRef.current
    const sel = window.getSelection()
    if (!el || !range || !sel) return false
    if (!el.contains(range.startContainer)) return false
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  }

  const ensureEditorSelection = () => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    if (!el.innerHTML || el.innerHTML === '<br>') {
      el.innerHTML = '<p><br></p>'
    }
    if (restoreEditorSelection()) return
    const sel = window.getSelection()
    if (!sel) return
    if (sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    syncSelectionRef()
  }

  const insertHtmlAtSelection = (html: string) => {
    const el = editorRef.current
    if (!el) return false
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    if (!el.contains(range.startContainer)) return false
    range.deleteContents()
    const temp = document.createElement('div')
    temp.innerHTML = html
    const frag = document.createDocumentFragment()
    let node: ChildNode | null = null
    let lastNode: ChildNode | null = null
    while ((node = temp.firstChild)) {
      lastNode = frag.appendChild(node)
    }
    range.insertNode(frag)
    if (lastNode) {
      range.setStartAfter(lastNode)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    selectionRef.current = range.cloneRange()
    return true
  }

  const wrapSelection = (tag: 'strong' | 'em' | 'u') => {
    const el = editorRef.current
    if (!el) return false
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    if (!el.contains(range.startContainer)) return false
    const wrapper = document.createElement(tag)
    const selectedText = range.toString()
    range.deleteContents()
    if (selectedText) {
      wrapper.textContent = selectedText
      range.insertNode(wrapper)
      range.setStartAfter(wrapper)
      range.collapse(true)
    } else {
      const zwsp = document.createTextNode('\u200B')
      wrapper.appendChild(zwsp)
      range.insertNode(wrapper)
      range.setStart(zwsp, 1)
      range.collapse(true)
    }
    sel.removeAllRanges()
    sel.addRange(range)
    selectionRef.current = range.cloneRange()
    return true
  }

  const insertListElement = (ordered: boolean) => {
    const el = editorRef.current
    if (!el) return false
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    if (!el.contains(range.startContainer)) return false
    range.deleteContents()
    const list = document.createElement(ordered ? 'ol' : 'ul')
    const li = document.createElement('li')
    li.appendChild(document.createElement('br'))
    list.appendChild(li)
    range.insertNode(list)
    range.setStart(li, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    selectionRef.current = range.cloneRange()
    return true
  }

  const insertLineBreak = () => {
    const el = editorRef.current
    if (!el) return false
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    if (!el.contains(range.startContainer)) return false
    range.deleteContents()
    const br = document.createElement('br')
    range.insertNode(br)
    range.setStartAfter(br)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    selectionRef.current = range.cloneRange()
    return true
  }

  const handleCommand = (command: string) => {
    const el = editorRef.current
    if (!el) return
    ensureEditorSelection()
    const before = el.innerHTML
    let ok = document.execCommand(command)
    const isListCommand = command === 'insertUnorderedList' || command === 'insertOrderedList'
    if (isListCommand && before === el.innerHTML) ok = false
    if (!ok) {
      if (command === 'bold') ok = wrapSelection('strong')
      if (command === 'italic') ok = wrapSelection('em')
      if (command === 'underline') ok = wrapSelection('u')
      if (command === 'insertUnorderedList') ok = insertListElement(false)
      if (command === 'insertOrderedList') ok = insertListElement(true)
    }
    if (!ok) {
      if (command === 'insertUnorderedList') {
        insertHtmlAtSelection('<ul><li><br></li></ul>')
      } else if (command === 'insertOrderedList') {
        insertHtmlAtSelection('<ol><li><br></li></ol>')
      }
    }
    setContentHtml(el.innerHTML)
    syncSelectionRef()
  }

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') return
    const el = editorRef.current
    if (!el) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
    const before = el.innerHTML
    const execOk = document.execCommand('insertParagraph') || document.execCommand('insertLineBreak')
    if (execOk && el.innerHTML !== before) {
      setContentHtml(el.innerHTML)
      syncSelectionRef()
      event.preventDefault()
      return
    }
    let node: Node | null = sel.anchorNode
    while (node && node !== el) {
      if (node.nodeName === 'LI') return
      node = node.parentNode
    }
    if (insertLineBreak()) {
      setContentHtml(el.innerHTML)
      event.preventDefault()
    }
  }

  const insertHtml = (html: string) => {
    const el = editorRef.current
    if (!el) return
    ensureEditorSelection()
    const ok = document.execCommand('insertHTML', false, html)
    if (!ok && !insertHtmlAtSelection(html)) {
      el.innerHTML = `${el.innerHTML}${html}`
    }
    setContentHtml(el.innerHTML)
    syncSelectionRef()
  }

  const removePromptBlock = (prompt?: string) => {
    const el = editorRef.current
    if (!el) return
    const marked = Array.from(el.querySelectorAll('[data-journal-prompt="true"]'))
    if (marked.length > 0) {
      marked.forEach((node) => node.remove())
    } else if (prompt) {
      const candidates = Array.from(el.querySelectorAll('p'))
      const match = candidates.find((node) => node.textContent?.trim() === prompt)
      if (match) match.remove()
    }
    setContentHtml(el.innerHTML)
    syncSelectionRef()
  }

  const applyPrompt = (prompt: string) => {
    removePromptBlock(selectedPrompt)
    setSelectedPrompt(prompt)
    insertHtml(`<p data-journal-prompt="true"><strong>${prompt}</strong></p><p><br></p>`)
  }

  const clearPrompt = () => {
    removePromptBlock(selectedPrompt)
    setSelectedPrompt('')
  }

  const clearEditor = () => {
    setContentHtml('')
    if (editorRef.current) editorRef.current.innerHTML = ''
    ensureEditorSelection()
  }

  const applyTemplate = (template: typeof TEMPLATES[number]) => {
    setSelectedTemplate(template.name)
    insertHtml(template.body)
  }

  const clearTemplate = () => {
    setSelectedTemplate('')
    clearEditor()
  }

  const handleImagePick = () => {
    fileInputRef.current?.click()
  }

  const handleImages = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      const uploads = Array.from(files).slice(0, 6)
      for (const file of uploads) {
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch('/api/mood/journal/upload', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const msg = await res.json().catch(() => null)
          throw new Error(msg?.error || 'Upload failed')
        }
        const data = await res.json()
        if (data?.url) {
          setImages((prev) => [...prev, data.url])
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to upload image')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const uploadAudioBlob = async (blob: Blob) => {
    setUploadingAudio(true)
    setError(null)
    try {
      const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
      const formData = new FormData()
      formData.append('audio', file)
      const res = await fetch('/api/mood/journal/upload-audio', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        throw new Error(msg?.error || 'Audio upload failed')
      }
      const data = await res.json()
      if (data?.url) {
        setAudioClips((prev) => [...prev, data.url])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to upload audio')
    } finally {
      setUploadingAudio(false)
    }
  }

  const startRecording = async () => {
    if (recording) return
    setError(null)
    try {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Voice notes are not supported on this device.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 0) {
          await uploadAudioBlob(blob)
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordSeconds(0)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      recordTimerRef.current = setInterval(() => setRecordSeconds((prev) => prev + 1), 1000)
    } catch (e) {
      setError('Microphone permission was not granted.')
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    mediaRecorderRef.current = null
    setRecording(false)
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
  }

  const handleAddTag = () => {
    const value = tagInput.trim()
    if (!value) return
    if (tags.includes(value)) {
      setTagInput('')
      return
    }
    setTags((prev) => [...prev, value])
    setTagInput('')
  }

  const handleSave = async () => {
    const content = editorRef.current?.innerHTML?.trim() || ''
    if (!title.trim() && !content && images.length === 0 && audioClips.length === 0) {
      setError('Add a title, some text, a photo, or a voice note first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title,
        content,
        images,
        audio: audioClips,
        tags,
        prompt: selectedPrompt,
        template: selectedTemplate,
        localDate,
      }
      const url = editingId ? `/api/mood/journal/entries/${editingId}` : '/api/mood/journal/entries'
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        throw new Error(msg?.error || 'Failed to save entry')
      }
      setTitle('')
      setContentHtml('')
      setImages([])
      setAudioClips([])
      setTags([])
      setSelectedPrompt('')
      setSelectedTemplate('')
      setEditingId(null)
      if (editorRef.current) editorRef.current.innerHTML = ''
      setNotice(editingId ? 'Journal entry updated.' : 'Journal entry saved.')
      setTimeout(() => setNotice(null), 2000)
      loadEntries(searchTerm)
    } catch (e: any) {
      setError(e?.message || 'Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (entry: JournalEntry) => {
    setEditingId(entry.id)
    setTitle(entry.title || '')
    setLocalDate(entry.localDate || asDateString(new Date()))
    setImages(normalizeImages(entry.images))
    setAudioClips(normalizeImages(entry.audio))
    setTags(normalizeTags(entry.tags))
    setSelectedPrompt(entry.prompt || '')
    setSelectedTemplate(entry.template || '')
    const html = entry.content || ''
    setContentHtml(html)
    if (editorRef.current) editorRef.current.innerHTML = html
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setTitle('')
    setContentHtml('')
    setImages([])
    setAudioClips([])
    setTags([])
    setSelectedPrompt('')
    setSelectedTemplate('')
    setLocalDate(asDateString(new Date()))
    if (editorRef.current) editorRef.current.innerHTML = ''
  }

  const handleDelete = async (entryId: string) => {
    if (!window.confirm('Delete this journal entry?')) return
    setError(null)
    try {
      const res = await fetch(`/api/mood/journal/entries/${entryId}`, { method: 'DELETE' })
      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        throw new Error(msg?.error || 'Failed to delete entry')
      }
      if (editingId === entryId) handleCancelEdit()
      loadEntries(searchTerm)
    } catch (e: any) {
      setError(e?.message || 'Failed to delete entry')
    }
  }

  const visibleEntries = useMemo(() => entries, [entries])
  const dateLabel = useMemo(() => formatDateLong(localDate), [localDate])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 overflow-x-hidden">
      <PageHeader title="Mood" backHref="/mood" />
      <MoodTabs />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 touch-pan-y overscroll-x-none">
        {notice && (
          <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Journal</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Write it out, add photos, and keep the story of your day.</p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const el = dateInputRef.current
                  if (!el) return
                  if (typeof (el as any).showPicker === 'function') {
                    ;(el as any).showPicker()
                  } else {
                    el.click()
                  }
                }}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap"
              >
                {dateLabel}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={localDate}
                onChange={(e) => setLocalDate(e.target.value)}
                className="absolute inset-0 opacity-0 pointer-events-none"
                aria-label="Journal date"
              />
            </div>
          </div>

          <input
            type="text"
            placeholder="Entry title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-helfi-green/10"
          />

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">Prompts</div>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => applyPrompt(prompt)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    selectedPrompt === prompt
                      ? 'border-helfi-green text-helfi-green'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-200'
                  }`}
                >
                  {prompt}
                </button>
              ))}
              {selectedPrompt && (
                <button
                  type="button"
                  onClick={clearPrompt}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600"
                >
                  Clear prompt
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">Templates</div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    selectedTemplate === template.name
                      ? 'border-helfi-green text-helfi-green'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-200'
                  }`}
                >
                  {template.name}
                </button>
              ))}
              {selectedTemplate && (
                <button
                  type="button"
                  onClick={clearTemplate}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600"
                >
                  Clear template
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">Tags</div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-1 text-xs text-gray-600 dark:text-gray-200">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    className="text-xs text-gray-400"
                    aria-label="Remove tag"
                  >
                    x
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="Add tag"
                  className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-200"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              { cmd: 'bold', label: 'B' },
              { cmd: 'italic', label: 'I' },
              { cmd: 'underline', label: 'U' },
              { cmd: 'insertUnorderedList', label: 'Bullet list' },
              { cmd: 'insertOrderedList', label: '1. List' },
            ] as const).map((btn) => (
              <button
                key={btn.cmd}
                type="button"
                onClick={() => handleCommand(btn.cmd)}
                className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-200"
              >
                {btn.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleImagePick}
              className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-semibold text-helfi-green"
            >
              {uploading ? 'Uploading...' : 'Add photo'}
            </button>
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-200"
            >
              {recording ? `Stop ${formatSeconds(recordSeconds)}` : 'Record voice note'}
            </button>
            {uploadingAudio && (
              <span className="text-xs text-gray-500 dark:text-gray-400 self-center">Uploading audio...</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => handleImages(e.target.files)}
              className="hidden"
            />
          </div>

          <div className="relative rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 min-h-[180px] overflow-x-hidden">
            {!contentHtml && (
              <div className="pointer-events-none absolute left-4 top-3 text-sm text-gray-400">Start writing...</div>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                setContentHtml(editorRef.current?.innerHTML || '')
                syncSelectionRef()
              }}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={syncSelectionRef}
              onMouseUp={syncSelectionRef}
              onTouchEnd={syncSelectionRef}
              onFocus={syncSelectionRef}
              role="textbox"
              aria-multiline="true"
              tabIndex={0}
              className="journal-editor min-h-[140px] text-sm text-gray-900 dark:text-gray-100 focus:outline-none break-words whitespace-pre-wrap max-w-full"
            />
          </div>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="Journal" className="h-20 w-20 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((item) => item !== url))}
                    className="absolute -top-2 -right-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full p-1 text-xs"
                    aria-label="Remove"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {audioClips.length > 0 && (
            <div className="space-y-2">
              {audioClips.map((url) => (
                <div key={url} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                  <audio controls src={url} className="w-full" />
                  <button
                    type="button"
                    onClick={() => setAudioClips((prev) => prev.filter((item) => item !== url))}
                    className="text-xs text-gray-500"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-helfi-green text-white text-sm font-semibold py-3 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Update entry' : 'Save entry'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold py-3 text-gray-600 dark:text-gray-200"
              >
                Cancel edit
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent journal entries</h3>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search journal"
              className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200"
            />
          </div>

          {loading ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
              Loading journal entries...
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
              No journal entries yet.
            </div>
          ) : (
            visibleEntries.map((entry) => {
              const entryImages = normalizeImages(entry.images)
              const entryAudio = normalizeImages(entry.audio)
              const entryTags = normalizeTags(entry.tags)
              const preview = stripHtml(entry.content || '').slice(0, 140)
              const createdAt = entry.createdAt ? new Date(entry.createdAt) : null
              const time = createdAt ? createdAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
              return (
                <div key={entry.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{formatDateLabel(entry.localDate)}</span>
                    <span>{time}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {entry.title || 'Untitled entry'}
                  </div>
                  {(entry.prompt || entry.template) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-300">
                      {entry.prompt && <span className="px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700">{entry.prompt}</span>}
                      {entry.template && <span className="px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700">{entry.template}</span>}
                    </div>
                  )}
                  {entryTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entryTags.map((tag) => (
                        <span key={tag} className="px-2 py-1 rounded-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[11px] text-gray-600 dark:text-gray-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {preview && (
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {preview}
                    </div>
                  )}
                  {entryImages.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entryImages.slice(0, 4).map((url: string) => (
                        <img key={url} src={url} alt="Journal" className="h-16 w-16 rounded-xl object-cover" />
                      ))}
                    </div>
                  )}
                  {entryAudio.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {entryAudio.map((url: string) => (
                        <audio key={url} controls src={url} className="w-full" />
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(entry)}
                      className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>

      <InsightsBottomNav />
    </div>
  )
}
