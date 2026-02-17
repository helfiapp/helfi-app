'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodTabs from '@/components/mood/MoodTabs'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'
import {
  deleteLocalMoodMedia,
  getAllEntryMediaMap,
  getEntryMediaIds,
  getLocalMoodMedia,
  getLocalMoodMediaMany,
  removeEntryMediaIds,
  saveLocalMoodMedia,
  setEntryMediaIds,
  type LocalMoodMediaKind,
} from '@/lib/mood-local-media'

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

type LocalMediaPreview = {
  id: string
  kind: LocalMoodMediaKind
  url: string
  fileName: string
}

type EntryLocalMedia = {
  images: LocalMediaPreview[]
  audio: LocalMediaPreview[]
  missingCount: number
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

function createLocalMediaId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `media-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function sanitizeDownloadName(name: string) {
  return String(name || 'media')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)
}

function withMediaSummary(content: string, summaries: string[]) {
  const cleanedSummaries = summaries.map((item) => item.trim()).filter(Boolean)
  if (cleanedSummaries.length === 0) return content
  const withoutOldBlock = content.replace(
    /<hr data-media-summary="true"\s*\/?>[\s\S]*$/i,
    '',
  )
  const bullets = cleanedSummaries
    .map((item) => `<li>${item.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`)
    .join('')
  return `${withoutOldBlock}<hr data-media-summary="true" /><p><strong>Media notes (auto-analyzed)</strong></p><ul>${bullets}</ul>`
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
  const [localImageIds, setLocalImageIds] = useState<string[]>([])
  const [localAudioIds, setLocalAudioIds] = useState<string[]>([])
  const [localPreviews, setLocalPreviews] = useState<Record<string, LocalMediaPreview>>({})
  const [localMediaNotes, setLocalMediaNotes] = useState<Record<string, string>>({})
  const [analyzingMediaIds, setAnalyzingMediaIds] = useState<Set<string>>(new Set())
  const [entryLocalMedia, setEntryLocalMedia] = useState<Record<string, EntryLocalMedia>>({})
  const [brokenRemoteMedia, setBrokenRemoteMedia] = useState<Set<string>>(new Set())
  const [downloadingAll, setDownloadingAll] = useState(false)
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
  const localPreviewsRef = useRef<Record<string, LocalMediaPreview>>({})
  const entryLocalMediaRef = useRef<Record<string, EntryLocalMedia>>({})

  const releaseObjectUrl = (url?: string | null) => {
    if (!url) return
    if (!url.startsWith('blob:')) return
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }

  const appendAnalyzingId = (id: string) => {
    setAnalyzingMediaIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const removeAnalyzingId = (id: string) => {
    setAnalyzingMediaIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const analyzeLocalMedia = async (
    params: { id: string; file: File; kind: LocalMoodMediaKind },
  ) => {
    appendAnalyzingId(params.id)
    try {
      const formData = new FormData()
      formData.append('kind', params.kind)
      formData.append('file', params.file)
      const res = await fetch('/api/mood/journal/extract-media', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.error || 'Could not analyze media')
      }
      const payload = await res.json().catch(() => ({}))
      const summary = String(payload?.summary || '').trim()
      if (summary) {
        setLocalMediaNotes((prev) => ({ ...prev, [params.id]: summary }))
      }
    } catch (e: any) {
      const fallback =
        params.kind === 'image'
          ? 'Image uploaded and analyzed for journal context.'
          : 'Voice note uploaded and analyzed for journal context.'
      setLocalMediaNotes((prev) => ({ ...prev, [params.id]: fallback }))
      setError((current) => current || (e?.message || 'Could not analyze media right now.'))
    } finally {
      removeAnalyzingId(params.id)
    }
  }

  const addLocalMedia = async (params: {
    blob: Blob
    fileName: string
    mimeType: string
    kind: LocalMoodMediaKind
  }) => {
    const id = createLocalMediaId()
    const fileName = sanitizeDownloadName(params.fileName)
    await saveLocalMoodMedia({
      id,
      kind: params.kind,
      blob: params.blob,
      fileName,
      mimeType: params.mimeType || params.blob.type || 'application/octet-stream',
      createdAt: Date.now(),
    })

    const url = URL.createObjectURL(params.blob)
    setLocalPreviews((prev) => ({ ...prev, [id]: { id, kind: params.kind, url, fileName } }))
    if (params.kind === 'image') {
      setLocalImageIds((prev) => [...prev, id])
    } else {
      setLocalAudioIds((prev) => [...prev, id])
    }

    const file = new File([params.blob], fileName, {
      type: params.mimeType || params.blob.type || 'application/octet-stream',
    })
    void analyzeLocalMedia({ id, file, kind: params.kind })
    return id
  }

  const removeLocalMedia = async (id: string, kind: LocalMoodMediaKind) => {
    const preview = localPreviews[id]
    if (preview) releaseObjectUrl(preview.url)
    setLocalPreviews((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setLocalMediaNotes((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (kind === 'image') {
      setLocalImageIds((prev) => prev.filter((item) => item !== id))
    } else {
      setLocalAudioIds((prev) => prev.filter((item) => item !== id))
    }
    await deleteLocalMoodMedia(id).catch(() => {})
  }

  const downloadLocalMedia = async (id: string) => {
    const media = await getLocalMoodMedia(id)
    if (!media) {
      setError('That local file is no longer available on this device.')
      return
    }
    const url = URL.createObjectURL(media.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = sanitizeDownloadName(media.fileName || `${media.kind}-${id}`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => releaseObjectUrl(url), 0)
  }

  const downloadAllLocalMedia = async () => {
    setDownloadingAll(true)
    setError(null)
    try {
      const allMap = getAllEntryMediaMap()
      const fromEntries = Object.values(allMap).flat()
      const ids = Array.from(new Set([...fromEntries, ...localImageIds, ...localAudioIds]))
      let downloaded = 0
      for (const id of ids) {
        const media = await getLocalMoodMedia(id)
        if (!media) continue
        const url = URL.createObjectURL(media.blob)
        const link = document.createElement('a')
        link.href = url
        link.download = sanitizeDownloadName(media.fileName || `${media.kind}-${id}`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => releaseObjectUrl(url), 0)
        downloaded += 1
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
      if (!downloaded) {
        setError('No local media files were found on this device.')
      } else {
        setNotice(`Started download for ${downloaded} local media file${downloaded === 1 ? '' : 's'}.`)
        setTimeout(() => setNotice(null), 2500)
      }
    } finally {
      setDownloadingAll(false)
    }
  }

  const loadEntryLocalMedia = async (rows: JournalEntry[]) => {
    const next: Record<string, EntryLocalMedia> = {}
    for (const entry of rows) {
      const ids = getEntryMediaIds(entry.id)
      if (ids.length === 0) continue
      const records = await getLocalMoodMediaMany(ids)
      const found = new Set(records.map((item) => item.id))
      const previews = records.map((item) => ({
        id: item.id,
        kind: item.kind,
        fileName: item.fileName,
        url: URL.createObjectURL(item.blob),
      }))
      next[entry.id] = {
        images: previews.filter((item) => item.kind === 'image'),
        audio: previews.filter((item) => item.kind === 'audio'),
        missingCount: ids.filter((id) => !found.has(id)).length,
      }
    }

    setEntryLocalMedia((prev) => {
      Object.values(prev).forEach((state) => {
        state.images.forEach((item) => releaseObjectUrl(item.url))
        state.audio.forEach((item) => releaseObjectUrl(item.url))
      })
      return next
    })
  }

  const loadComposerLocalMediaFromEntry = async (entryId: string | null) => {
    Object.values(localPreviews).forEach((item) => releaseObjectUrl(item.url))
    setLocalPreviews({})
    setLocalMediaNotes({})
    if (!entryId) {
      setLocalImageIds([])
      setLocalAudioIds([])
      return
    }

    const ids = getEntryMediaIds(entryId)
    if (ids.length === 0) {
      setLocalImageIds([])
      setLocalAudioIds([])
      return
    }

    const records = await getLocalMoodMediaMany(ids)
    const previews: Record<string, LocalMediaPreview> = {}
    const imageIds: string[] = []
    const audioIds: string[] = []
    records.forEach((item) => {
      previews[item.id] = {
        id: item.id,
        kind: item.kind,
        url: URL.createObjectURL(item.blob),
        fileName: item.fileName,
      }
      if (item.kind === 'image') imageIds.push(item.id)
      if (item.kind === 'audio') audioIds.push(item.id)
    })
    setLocalPreviews(previews)
    setLocalImageIds(imageIds)
    setLocalAudioIds(audioIds)
  }

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
      const rows = Array.isArray(data?.entries) ? data.entries : []
      setEntries(rows)
      await loadEntryLocalMedia(rows)
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
    localPreviewsRef.current = localPreviews
  }, [localPreviews])

  useEffect(() => {
    entryLocalMediaRef.current = entryLocalMedia
  }, [entryLocalMedia])

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      Object.values(localPreviewsRef.current).forEach((item) => releaseObjectUrl(item.url))
      Object.values(entryLocalMediaRef.current).forEach((state) => {
        state.images.forEach((item) => releaseObjectUrl(item.url))
        state.audio.forEach((item) => releaseObjectUrl(item.url))
      })
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
      const uploads = Array.from(files).slice(0, 6 - localImageIds.length)
      for (const file of uploads) {
        await addLocalMedia({
          blob: file,
          fileName: file.name || `mood-image-${Date.now()}.jpg`,
          mimeType: file.type || 'image/jpeg',
          kind: 'image',
        })
      }
      setNotice('Photo saved to this device only. Server copies are not stored.')
      setTimeout(() => setNotice(null), 2500)
    } catch (e: any) {
      setError(e?.message || 'Failed to add image')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const uploadAudioBlob = async (blob: Blob) => {
    setUploadingAudio(true)
    setError(null)
    try {
      const ext = blob.type.includes('mp4')
        ? 'm4a'
        : blob.type.includes('mpeg')
          ? 'mp3'
          : blob.type.includes('wav')
            ? 'wav'
            : 'webm'
      await addLocalMedia({
        blob,
        fileName: `voice-note-${Date.now()}.${ext}`,
        mimeType: blob.type || 'audio/webm',
        kind: 'audio',
      })
      setNotice('Voice note saved to this device only. Server copies are not stored.')
      setTimeout(() => setNotice(null), 2500)
    } catch (e: any) {
      setError(e?.message || 'Failed to add audio')
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
    if (
      !title.trim() &&
      !content &&
      images.length === 0 &&
      audioClips.length === 0 &&
      localImageIds.length === 0 &&
      localAudioIds.length === 0
    ) {
      setError('Add a title, some text, a photo, or a voice note first.')
      return
    }
    if (analyzingMediaIds.size > 0) {
      setError('Please wait a moment while media analysis finishes.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const localIds = [...localImageIds, ...localAudioIds]
      const localSummaries = localIds
        .map((id) => localMediaNotes[id] || '')
        .map((text) => text.trim())
        .filter(Boolean)
      const contentWithNotes = withMediaSummary(content, localSummaries)

      const payload = {
        title,
        content: contentWithNotes,
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
      const data = await res.json().catch(() => ({}))
      const savedEntryId =
        (editingId || String(data?.id || '').trim() || null) as string | null
      if (savedEntryId) {
        const uniqueLocalIds = Array.from(new Set(localIds))
        if (uniqueLocalIds.length > 0) {
          setEntryMediaIds(savedEntryId, uniqueLocalIds)
        } else {
          removeEntryMediaIds(savedEntryId)
        }
      }

      setTitle('')
      setContentHtml('')
      setImages([])
      setAudioClips([])
      setLocalImageIds([])
      setLocalAudioIds([])
      Object.values(localPreviews).forEach((item) => releaseObjectUrl(item.url))
      setLocalPreviews({})
      setLocalMediaNotes({})
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
    void loadComposerLocalMediaFromEntry(entry.id)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setTitle('')
    setContentHtml('')
    setImages([])
    setAudioClips([])
    setLocalImageIds([])
    setLocalAudioIds([])
    Object.values(localPreviews).forEach((item) => releaseObjectUrl(item.url))
    setLocalPreviews({})
    setLocalMediaNotes({})
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
      const mediaIds = getEntryMediaIds(entryId)
      for (const mediaId of mediaIds) {
        await deleteLocalMoodMedia(mediaId).catch(() => {})
      }
      removeEntryMediaIds(entryId)
      if (editingId === entryId) handleCancelEdit()
      loadEntries(searchTerm)
    } catch (e: any) {
      setError(e?.message || 'Failed to delete entry')
    }
  }

  const visibleEntries = useMemo(() => entries, [entries])
  const dateLabel = useMemo(() => formatDateLong(localDate), [localDate])
  const localImagePreviews = useMemo(
    () => localImageIds.map((id) => localPreviews[id]).filter(Boolean),
    [localImageIds, localPreviews],
  )
  const localAudioPreviews = useMemo(
    () => localAudioIds.map((id) => localPreviews[id]).filter(Boolean),
    [localAudioIds, localPreviews],
  )

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
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
          <p>
            For security, photos and voice notes are analyzed and not kept on Helfi servers.
            Local copies stay on this device only.
          </p>
          <p className="mt-1">
            If browser/app data is cleared, local media may disappear. Use download to keep your own copy.
          </p>
          <div className="mt-2">
            <button
              type="button"
              onClick={downloadAllLocalMedia}
              disabled={downloadingAll}
              className="rounded-full border border-blue-300 bg-white px-3 py-1 text-xs font-semibold text-blue-800 disabled:opacity-60"
            >
              {downloadingAll ? 'Preparing downloads...' : 'Download local media from this device'}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">
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
              className={`group inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                uploading
                  ? 'cursor-wait border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-900/30 dark:text-emerald-200'
                  : 'border-emerald-200 bg-gradient-to-b from-emerald-50 to-white text-emerald-700 shadow-sm hover:border-emerald-300 hover:shadow-md active:scale-[0.98] dark:border-emerald-500/40 dark:from-emerald-900/35 dark:to-gray-900 dark:text-emerald-200'
              }`}
            >
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                uploading
                  ? 'border-emerald-300 bg-emerald-100 dark:border-emerald-500/50 dark:bg-emerald-800/40'
                  : 'border-emerald-200 bg-white dark:border-emerald-500/40 dark:bg-gray-900'
              }`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]">
                  <path d="M4 8a2 2 0 0 1 2-2h2.2a1.5 1.5 0 0 0 1.2-.6l.7-.8A1.5 1.5 0 0 1 11.2 4h1.6a1.5 1.5 0 0 1 1.1.6l.7.8a1.5 1.5 0 0 0 1.2.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
              </span>
              {uploading ? 'Saving locally...' : 'Add photo'}
            </button>
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              className={`group inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                recording
                  ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-400 hover:shadow-md active:scale-[0.98] dark:border-rose-500/50 dark:bg-rose-900/30 dark:text-rose-200'
                  : 'border-gray-200 bg-gradient-to-b from-white to-gray-50 text-gray-700 shadow-sm hover:border-gray-300 hover:shadow-md active:scale-[0.98] dark:border-gray-600 dark:from-gray-800 dark:to-gray-900 dark:text-gray-100'
              }`}
            >
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                recording
                  ? 'border-rose-300 bg-rose-100 dark:border-rose-500/50 dark:bg-rose-800/40'
                  : 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800'
              }`}>
                {recording ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                    <rect x="7" y="7" width="10" height="10" rx="1.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]">
                    <path d="M12 4a3 3 0 0 1 3 3v4a3 3 0 1 1-6 0V7a3 3 0 0 1 3-3Z" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <path d="M12 18v3" />
                  </svg>
                )}
              </span>
              {recording ? `Stop ${formatSeconds(recordSeconds)}` : 'Record voice note'}
            </button>
            {uploadingAudio && (
              <span className="text-xs text-gray-500 dark:text-gray-400 self-center">Saving audio locally...</span>
            )}
            {analyzingMediaIds.size > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
                Analyzing media...
              </span>
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
                  {brokenRemoteMedia.has(url) ? (
                    <div className="h-20 w-20 rounded-xl border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700 flex items-center justify-center text-center">
                      Media expired
                    </div>
                  ) : (
                    <img
                      src={url}
                      alt="Journal"
                      className="h-20 w-20 rounded-xl object-cover"
                      onError={() =>
                        setBrokenRemoteMedia((prev) => {
                          const next = new Set(prev)
                          next.add(url)
                          return next
                        })
                      }
                    />
                  )}
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

          {localImagePreviews.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">Local photos (this device only)</div>
              <div className="flex flex-wrap gap-3">
                {localImagePreviews.map((item) => (
                  <div key={item.id} className="relative">
                    <img src={item.url} alt="Journal local" className="h-20 w-20 rounded-xl object-cover" />
                    <button
                      type="button"
                      onClick={() => removeLocalMedia(item.id, 'image')}
                      className="absolute -top-2 -right-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full p-1 text-xs"
                      aria-label="Remove"
                    >
                      x
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadLocalMedia(item.id)}
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-700"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {audioClips.length > 0 && (
            <div className="space-y-2">
              {audioClips.map((url) => (
                <div key={url} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                  {brokenRemoteMedia.has(url) ? (
                    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Voice note expired
                    </div>
                  ) : (
                    <audio
                      controls
                      src={url}
                      className="w-full"
                      onError={() =>
                        setBrokenRemoteMedia((prev) => {
                          const next = new Set(prev)
                          next.add(url)
                          return next
                        })
                      }
                    />
                  )}
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

          {localAudioPreviews.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">Local voice notes (this device only)</div>
              {localAudioPreviews.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2"
                >
                  <audio controls src={item.url} className="w-full" />
                  {localMediaNotes[item.id] && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-300">{localMediaNotes[item.id]}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadLocalMedia(item.id)}
                      className="text-xs text-gray-500"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLocalMedia(item.id, 'audio')}
                      className="text-xs text-gray-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || analyzingMediaIds.size > 0}
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
              const localMedia = entryLocalMedia[entry.id]
              const localEntryImages = localMedia?.images || []
              const localEntryAudio = localMedia?.audio || []
              const missingLocalCount = localMedia?.missingCount || 0
              const preview = stripHtml(entry.content || '').slice(0, 140)
              const createdAt = entry.createdAt ? new Date(entry.createdAt) : null
              const time = createdAt ? createdAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
              return (
                <div key={entry.id} className="bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
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
                        brokenRemoteMedia.has(url) ? (
                          <div
                            key={url}
                            className="h-16 w-16 rounded-xl border border-amber-200 bg-amber-50 px-1 text-[10px] text-amber-700 flex items-center justify-center text-center"
                          >
                            Media expired
                          </div>
                        ) : (
                          <img
                            key={url}
                            src={url}
                            alt="Journal"
                            className="h-16 w-16 rounded-xl object-cover"
                            onError={() =>
                              setBrokenRemoteMedia((prev) => {
                                const next = new Set(prev)
                                next.add(url)
                                return next
                              })
                            }
                          />
                        )
                      ))}
                    </div>
                  )}
                  {localEntryImages.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {localEntryImages.map((item) => (
                        <div key={item.id} className="relative">
                          <img src={item.url} alt="Local journal" className="h-16 w-16 rounded-xl object-cover" />
                          <button
                            type="button"
                            onClick={() => downloadLocalMedia(item.id)}
                            className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-700"
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {entryAudio.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {entryAudio.map((url: string) => (
                        brokenRemoteMedia.has(url) ? (
                          <div
                            key={url}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
                          >
                            Voice note expired
                          </div>
                        ) : (
                          <audio
                            key={url}
                            controls
                            src={url}
                            className="w-full"
                            onError={() =>
                              setBrokenRemoteMedia((prev) => {
                                const next = new Set(prev)
                                next.add(url)
                                return next
                              })
                            }
                          />
                        )
                      ))}
                    </div>
                  )}
                  {localEntryAudio.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {localEntryAudio.map((item) => (
                        <div key={item.id} className="space-y-1">
                          <audio controls src={item.url} className="w-full" />
                          <button
                            type="button"
                            onClick={() => downloadLocalMedia(item.id)}
                            className="text-xs text-gray-500"
                          >
                            Download voice note
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {missingLocalCount > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                      Some local media for this entry is not available on this device (it may have been cleared).
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
