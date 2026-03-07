import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type SupportAttachment = {
  id?: string
  name: string
  url: string
  path?: string
  type?: string
  size?: number
}

type SupportResponse = {
  id?: string
  message: string
  isAdminResponse?: boolean
  createdAt?: string
}

type SupportTicket = {
  id: string
  subject: string
  message: string
  status?: string
  createdAt?: string
  updatedAt?: string
  responses?: SupportResponse[]
}

type TicketHistoryItem = {
  id: string
  subject: string
  status: string
  priority: string
  category: string
  createdAt: string
  updatedAt: string
}

type ConversationItem = {
  id: string
  message: string
  attachments: SupportAttachment[]
  isAdminResponse: boolean
  createdAt?: string
}

type InquiryTypeOption = {
  value: string
  label: string
}

const ATTACHMENTS_MARKER = '[[ATTACHMENTS]]'

const inquiryTypes: InquiryTypeOption[] = [
  { value: 'account', label: 'Account/Login Issue' },
  { value: 'billing', label: 'Billing Question' },
  { value: 'technical', label: 'Technical Support' },
  { value: 'general', label: 'General Inquiry' },
  { value: 'feedback', label: 'Feedback / Suggestion' },
]

function formatDateTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

function formatTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function splitMessageAttachments(message: string) {
  const markerIndex = message.indexOf(ATTACHMENTS_MARKER)
  if (markerIndex === -1) {
    return { text: message, attachments: [] as SupportAttachment[] }
  }

  const text = message.slice(0, markerIndex).trim()
  const raw = message.slice(markerIndex + ATTACHMENTS_MARKER.length).trim()
  if (!raw) return { text, attachments: [] as SupportAttachment[] }

  try {
    const parsed = JSON.parse(raw)
    const attachments = Array.isArray(parsed)
      ? parsed
          .map((item: any) => ({
            id: item?.id ? String(item.id) : undefined,
            name: String(item?.name || ''),
            url: String(item?.url || ''),
            path: item?.path ? String(item.path) : undefined,
            type: item?.type ? String(item.type) : undefined,
            size: typeof item?.size === 'number' ? item.size : undefined,
          }))
          .filter((item) => item.name && item.url)
      : []

    return { text, attachments }
  } catch {
    return { text: message, attachments: [] as SupportAttachment[] }
  }
}

function serializeMessageWithAttachments(text: string, attachments: SupportAttachment[]) {
  if (!attachments.length) return text
  const payload = attachments.map((att) => ({
    id: att.id,
    name: att.name,
    url: att.url,
    path: att.path,
    type: att.type,
    size: att.size,
  }))
  return `${text}\n\n${ATTACHMENTS_MARKER}\n${JSON.stringify(payload)}`
}

function normalizeCategory(value: string) {
  const upper = String(value || '').trim().toUpperCase()
  if (upper === 'ACCOUNT') return 'ACCOUNT'
  if (upper === 'BILLING') return 'BILLING'
  if (upper === 'TECHNICAL') return 'TECHNICAL'
  if (upper === 'FEEDBACK') return 'FEATURE_REQUEST'
  return 'GENERAL'
}

function normalizePriority(value: string) {
  const base = String(value || '').trim().toLowerCase()
  return base === 'account' || base === 'billing' ? 'HIGH' : 'MEDIUM'
}

function DropdownRow({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: theme.colors.card,
      })}
    >
      <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 3 }}>{value || 'Select an option'}</Text>
    </Pressable>
  )
}

export function SupportScreen() {
  const { mode, session } = useAppMode()

  const authHeaders = useMemo(() => {
    if (!session?.token) return null
    return {
      Authorization: `Bearer ${session.token}`,
      'x-native-token': session.token,
      'cache-control': 'no-store',
    }
  }, [session?.token])

  const [loading, setLoading] = useState(true)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [submittingForm, setSubmittingForm] = useState(false)
  const [sendingChat, setSendingChat] = useState(false)
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [uploadingFormAttachment, setUploadingFormAttachment] = useState(false)
  const [uploadingChatAttachment, setUploadingChatAttachment] = useState(false)

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [attachmentError, setAttachmentError] = useState('')
  const [showChatView, setShowChatView] = useState(false)
  const [showPostSubmitChoice, setShowPostSubmitChoice] = useState(false)
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null)

  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null)
  const [ticketHistory, setTicketHistory] = useState<TicketHistoryItem[]>([])

  const [chatMessage, setChatMessage] = useState('')
  const [chatAttachments, setChatAttachments] = useState<SupportAttachment[]>([])
  const [formAttachments, setFormAttachments] = useState<SupportAttachment[]>([])

  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    inquiryType: '',
    registeredEmail: '',
    subject: '',
    message: '',
    isRegisteredUser: true,
  })

  const [inquiryPickerOpen, setInquiryPickerOpen] = useState(false)

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      name: String(session?.user?.name || ''),
      email: String(session?.user?.email || ''),
      isRegisteredUser: true,
    }))
  }, [session?.user?.name, session?.user?.email])

  const requestJson = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!authHeaders) throw new Error('Please log in again.')
      const headers = {
        ...authHeaders,
        ...(init?.headers || {}),
      }
      const res = await fetch(url, { ...init, headers })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Request failed')
      }
      return data
    },
    [authHeaders],
  )

  const loadActiveTicket = useCallback(async () => {
    if (!authHeaders) return
    const data = await requestJson(`${API_BASE_URL}/api/support/tickets?activeOnly=1`)
    setActiveTicket(data?.ticket || null)
  }, [authHeaders, requestJson])

  const loadTicketHistory = useCallback(async () => {
    if (!authHeaders) return
    setIsLoadingHistory(true)
    try {
      const data = await requestJson(`${API_BASE_URL}/api/support/tickets?list=1&activeOnly=0`)
      setTicketHistory(Array.isArray(data?.tickets) ? data.tickets : [])
    } finally {
      setIsLoadingHistory(false)
    }
  }, [authHeaders, requestJson])

  useFocusEffect(
    useCallback(() => {
      if (mode !== 'signedIn' || !authHeaders) {
        setLoading(false)
        return
      }

      let cancelled = false
      const run = async () => {
        try {
          setLoading(true)
          await Promise.all([loadActiveTicket(), loadTicketHistory()])
        } catch (e: any) {
          if (!cancelled) {
            Alert.alert('Could not load support', e?.message || 'Please try again.')
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      }

      void run()
      return () => {
        cancelled = true
      }
    }, [mode, authHeaders, loadActiveTicket, loadTicketHistory]),
  )

  const conversationItems = useMemo(() => {
    if (!activeTicket) return [] as ConversationItem[]

    const items: ConversationItem[] = []
    const first = splitMessageAttachments(String(activeTicket.message || ''))
    items.push({
      id: `ticket-${activeTicket.id}`,
      message: first.text,
      attachments: first.attachments,
      isAdminResponse: false,
      createdAt: activeTicket.createdAt,
    })

    for (const response of activeTicket.responses || []) {
      const msg = String(response.message || '')
      if (msg.startsWith('[SYSTEM]') || msg.startsWith('[FEEDBACK]')) continue
      const parsed = splitMessageAttachments(msg)
      items.push({
        id: String(response.id || `${activeTicket.id}-${items.length}`),
        message: parsed.text,
        attachments: parsed.attachments,
        isAdminResponse: !!response.isAdminResponse,
        createdAt: response.createdAt,
      })
    }

    return items
  }, [activeTicket])

  const isChatClosed = !!activeTicket && ['RESOLVED', 'CLOSED'].includes(String(activeTicket.status || ''))

  const hasFeedback = useMemo(() => {
    if (!activeTicket) return false
    return (activeTicket.responses || []).some((res) => String(res.message || '').startsWith('[FEEDBACK]'))
  }, [activeTicket])

  const selectedInquiryLabel = useMemo(() => {
    const found = inquiryTypes.find((item) => item.value === formData.inquiryType)
    return found?.label || ''
  }, [formData.inquiryType])

  const uploadSupportImage = useCallback(
    async (target: 'form' | 'chat') => {
      if (!authHeaders) {
        Alert.alert('Please log in again.')
        return
      }

      const setUploading = target === 'form' ? setUploadingFormAttachment : setUploadingChatAttachment
      const setAttachments = target === 'form' ? setFormAttachments : setChatAttachments

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to attach images.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      })

      if (result.canceled || !result.assets?.length) return

      const asset = result.assets[0]
      if (!asset?.uri) return

      try {
        setAttachmentError('')
        setUploading(true)

        const fileName = asset.fileName || `support-${Date.now()}.jpg`
        const fileType = asset.mimeType || 'image/jpeg'

        const form = new FormData()
        form.append('file', {
          uri: asset.uri,
          name: fileName,
          type: fileType,
        } as any)

        const res = await fetch(`${API_BASE_URL}/api/support/uploads`, {
          method: 'POST',
          headers: authHeaders,
          body: form,
        })
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || 'Upload failed')
        }

        const attachment: SupportAttachment = {
          id: data?.fileId ? String(data.fileId) : undefined,
          name: String(data?.name || fileName),
          url: String(data?.url || ''),
          path: data?.path ? String(data.path) : undefined,
          type: data?.type ? String(data.type) : fileType,
          size: typeof data?.size === 'number' ? data.size : undefined,
        }

        if (!attachment.url) throw new Error('Upload failed')

        setAttachments((prev) => [...prev, attachment])
      } catch (e: any) {
        setAttachmentError(e?.message || 'Failed to upload image')
      } finally {
        setUploading(false)
      }
    },
    [authHeaders],
  )

  const sendChatMessage = useCallback(async () => {
    const text = chatMessage.trim()
    if (!text && chatAttachments.length === 0) return
    if (isChatClosed) return

    try {
      setSendingChat(true)
      const payload = activeTicket
        ? {
            action: 'add_response',
            ticketId: activeTicket.id,
            message: serializeMessageWithAttachments(text, chatAttachments),
          }
        : {
            action: 'create',
            subject: 'Support chat',
            message: serializeMessageWithAttachments(text || 'Support chat started', chatAttachments),
            category: 'TECHNICAL',
            priority: 'MEDIUM',
          }

      const data = await requestJson(`${API_BASE_URL}/api/support/tickets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setActiveTicket(data?.ticket || null)
      setChatMessage('')
      setChatAttachments([])
      await loadTicketHistory()
    } catch (e: any) {
      Alert.alert('Could not send message', e?.message || 'Please try again.')
    } finally {
      setSendingChat(false)
    }
  }, [chatMessage, chatAttachments, isChatClosed, activeTicket, requestJson, loadTicketHistory])

  const endChat = useCallback(async () => {
    if (!activeTicket?.id) return
    try {
      setSendingChat(true)
      const data = await requestJson(`${API_BASE_URL}/api/support/tickets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'end_chat', ticketId: activeTicket.id }),
      })
      setActiveTicket(data?.ticket || null)
      await loadTicketHistory()
    } catch (e: any) {
      Alert.alert('Could not end chat', e?.message || 'Please try again.')
    } finally {
      setSendingChat(false)
    }
  }, [activeTicket?.id, requestJson, loadTicketHistory])

  const submitFeedback = useCallback(async () => {
    if (!activeTicket?.id || feedbackRating < 1) return
    try {
      setSubmittingFeedback(true)
      const data = await requestJson(`${API_BASE_URL}/api/support/tickets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_feedback',
          ticketId: activeTicket.id,
          rating: feedbackRating,
          comment: feedbackComment.trim(),
        }),
      })
      setActiveTicket(data?.ticket || null)
      await loadTicketHistory()
      Alert.alert('Thanks for your feedback.')
    } catch (e: any) {
      Alert.alert('Could not submit feedback', e?.message || 'Please try again.')
    } finally {
      setSubmittingFeedback(false)
    }
  }, [activeTicket?.id, feedbackRating, feedbackComment, requestJson, loadTicketHistory])

  const openTicket = useCallback(
    async (ticketId: string) => {
      try {
        const data = await requestJson(
          `${API_BASE_URL}/api/support/tickets?ticketId=${encodeURIComponent(ticketId)}&activeOnly=0`,
        )
        setActiveTicket(data?.ticket || null)
        setShowChatView(true)
        setShowPostSubmitChoice(false)
      } catch (e: any) {
        Alert.alert('Could not open ticket', e?.message || 'Please try again.')
      }
    },
    [requestJson],
  )

  const deleteTicket = useCallback(
    async (ticketId: string) => {
      Alert.alert('Delete this ticket?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await requestJson(`${API_BASE_URL}/api/support/tickets`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: 'delete_ticket', ticketId }),
                })

                setTicketHistory((prev) => prev.filter((item) => item.id !== ticketId))
                if (activeTicket?.id === ticketId) {
                  setActiveTicket(null)
                  setShowChatView(false)
                }
              } catch (e: any) {
                Alert.alert('Could not delete ticket', e?.message || 'Please try again.')
              }
            })()
          },
        },
      ])
    },
    [requestJson, activeTicket?.id],
  )

  const submitSupportForm = useCallback(async () => {
    const name = formData.name.trim()
    const email = formData.email.trim().toLowerCase()
    const inquiryType = formData.inquiryType.trim()
    const subject = formData.subject.trim()
    const message = formData.message.trim()
    const registeredEmail = formData.registeredEmail.trim().toLowerCase()

    if (!name || !email || !inquiryType || !message) {
      Alert.alert('Please fill all required fields.')
      return
    }

    if (inquiryType === 'account' && !registeredEmail) {
      Alert.alert('Please add your registered email for account support.')
      return
    }

    try {
      setSubmittingForm(true)
      setSubmitStatus('idle')

      const payload = {
        action: 'create',
        subject:
          subject ||
          `${inquiryType} - ${inquiryTypes.find((entry) => entry.value === inquiryType)?.label || 'Support request'}`,
        message: serializeMessageWithAttachments(message, formAttachments),
        category: normalizeCategory(inquiryType),
        priority: normalizePriority(inquiryType),
      }

      const data = await requestJson(`${API_BASE_URL}/api/support/tickets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setSubmitStatus('success')
      setActiveTicket(data?.ticket || null)
      setSubmittedTicketId(String(data?.ticket?.id || ''))
      setShowPostSubmitChoice(true)
      setShowChatView(false)
      setFormAttachments([])
      setFormData((prev) => ({
        ...prev,
        inquiryType: '',
        registeredEmail: '',
        subject: '',
        message: '',
      }))
      await loadTicketHistory()
    } catch (e: any) {
      setSubmitStatus('error')
      Alert.alert('Could not send message', e?.message || 'Please try again.')
    } finally {
      setSubmittingForm(false)
    }
  }, [formData, formAttachments, requestJson, loadTicketHistory])

  const startSupportChat = () => {
    setShowChatView(true)
    setShowPostSubmitChoice(false)
  }

  const startChatFromSubmit = () => {
    setShowPostSubmitChoice(false)
    if (submittedTicketId) {
      void openTicket(submittedTicketId)
      return
    }
    setShowChatView(true)
  }

  const keepEmailOnly = () => {
    setShowPostSubmitChoice(false)
    setShowChatView(false)
  }

  if (mode !== 'signedIn') {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.colors.muted }}>Please log in again to open Help & Support.</Text>
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading support...</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        {showChatView ? (
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                padding: 14,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Support Chat</Text>
                <Text style={{ color: isChatClosed ? '#9CA3AF' : '#10B981', fontSize: 12, fontWeight: '700' }}>
                  {isChatClosed ? 'Chat Closed' : 'Active Support'}
                </Text>
              </View>
              <Pressable onPress={() => setShowChatView(false)}>
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Back</Text>
              </Pressable>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              {conversationItems.length === 0 ? (
                <Text style={{ color: theme.colors.muted }}>Start your support chat below.</Text>
              ) : (
                conversationItems.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      alignSelf: item.isAdminResponse ? 'flex-start' : 'flex-end',
                      width: '90%',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: item.isAdminResponse ? '#F3F4F6' : '#EAF5EF',
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, lineHeight: 20 }}>{item.message}</Text>
                    {item.attachments?.length ? (
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {item.attachments.map((att) => (
                          <Pressable
                            key={`${item.id}-${att.url}`}
                            onPress={() => {
                              void Linking.openURL(att.url).catch(() => {
                                Alert.alert('Could not open attachment')
                              })
                            }}
                          >
                            <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{att.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <Text style={{ marginTop: 6, color: theme.colors.muted, fontSize: 12 }}>{formatTime(item.createdAt)}</Text>
                  </View>
                ))
              )}
            </View>

            {!isChatClosed ? (
              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 14, gap: 10 }}>
                {attachmentError ? <Text style={{ color: '#DC2626' }}>{attachmentError}</Text> : null}

                {chatAttachments.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {chatAttachments.map((att) => (
                      <View
                        key={att.url}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          backgroundColor: '#F3F4F6',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Text style={{ color: theme.colors.text, maxWidth: 160 }} numberOfLines={1}>
                          {att.name}
                        </Text>
                        <Pressable onPress={() => setChatAttachments((prev) => prev.filter((x) => x.url !== att.url))}>
                          <Text style={{ color: theme.colors.muted, fontWeight: '900' }}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                <TextInput
                  value={chatMessage}
                  onChangeText={setChatMessage}
                  placeholder="Type a message..."
                  placeholderTextColor="#8AA39D"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 70,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => void uploadSupportImage('chat')}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: theme.colors.card,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                      {uploadingChatAttachment ? 'Uploading...' : 'Attach photo'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void sendChatMessage()}
                    disabled={sendingChat || uploadingChatAttachment || (!chatMessage.trim() && chatAttachments.length === 0)}
                    style={({ pressed }) => ({
                      flex: 1,
                      opacity:
                        sendingChat || uploadingChatAttachment || (!chatMessage.trim() && chatAttachments.length === 0)
                          ? 0.6
                          : pressed
                            ? 0.9
                            : 1,
                      borderRadius: theme.radius.md,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: theme.colors.primary,
                    })}
                  >
                    <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>
                      {sendingChat ? 'Sending...' : 'Send'}
                    </Text>
                  </Pressable>
                </View>

                {activeTicket ? (
                  <Pressable onPress={() => void endChat()} disabled={sendingChat} style={{ alignItems: 'flex-start', marginTop: 4 }}>
                    <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>End chat</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 14, gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>How was your support experience?</Text>
                <Text style={{ color: theme.colors.muted }}>Your feedback helps us improve.</Text>

                {hasFeedback ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#A7F3D0',
                      borderRadius: 10,
                      padding: 10,
                      backgroundColor: '#ECFDF5',
                    }}
                  >
                    <Text style={{ color: '#047857', fontWeight: '700' }}>Thanks for the feedback. We appreciate it.</Text>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <Pressable
                          key={rating}
                          onPress={() => setFeedbackRating(rating)}
                          style={({ pressed }) => ({
                            flex: 1,
                            opacity: pressed ? 0.9 : 1,
                            borderWidth: 1,
                            borderColor: feedbackRating === rating ? theme.colors.primary : theme.colors.border,
                            backgroundColor: feedbackRating === rating ? theme.colors.primary : theme.colors.card,
                            borderRadius: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 10,
                          })}
                        >
                          <Text style={{ color: feedbackRating === rating ? theme.colors.primaryText : theme.colors.text, fontWeight: '900' }}>
                            {rating}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <TextInput
                      value={feedbackComment}
                      onChangeText={setFeedbackComment}
                      placeholder="Optional comment..."
                      placeholderTextColor="#8AA39D"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.md,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 70,
                        color: theme.colors.text,
                        backgroundColor: theme.colors.card,
                      }}
                    />

                    <HelfiButton
                      label={submittingFeedback ? 'Submitting...' : 'Submit feedback'}
                      onPress={submitFeedback}
                      disabled={feedbackRating < 1 || submittingFeedback}
                    />
                  </>
                )}
              </View>
            )}
          </View>
        ) : (
          <>
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                padding: 16,
                marginBottom: 12,
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Need help right now?</Text>
              <Text style={{ color: theme.colors.muted }}>Start a support chat and we’ll assist you straight away.</Text>
              <HelfiButton label="Start support chat" onPress={startSupportChat} />
            </View>

            <View
              style={{
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                padding: 16,
                marginBottom: 12,
                gap: 10,
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Past tickets</Text>
              <Text style={{ color: theme.colors.muted }}>View or delete previous support chats.</Text>

              {isLoadingHistory ? <Text style={{ color: theme.colors.muted }}>Loading tickets...</Text> : null}
              {!isLoadingHistory && ticketHistory.length === 0 ? (
                <Text style={{ color: theme.colors.muted }}>No past tickets yet.</Text>
              ) : null}

              {!isLoadingHistory && ticketHistory.length > 0
                ? ticketHistory.map((ticket) => (
                    <View
                      key={ticket.id}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 12,
                        backgroundColor: '#F8FAFC',
                        padding: 12,
                        gap: 8,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{ticket.subject}</Text>
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                        {formatDateTime(ticket.updatedAt || ticket.createdAt)} • {ticket.status}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          onPress={() => void openTicket(ticket.id)}
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: '#BBF7D0',
                            borderRadius: 999,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#ECFDF5',
                          }}
                        >
                          <Text style={{ color: '#047857', fontWeight: '800' }}>View chat</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => void deleteTicket(ticket.id)}
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: '#FECACA',
                            borderRadius: 999,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#FEF2F2',
                          }}
                        >
                          <Text style={{ color: '#B91C1C', fontWeight: '800' }}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                : null}
            </View>

            <View
              style={{
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Contact Support</Text>
              <Text style={{ color: theme.colors.muted }}>
                Have a question or need help? Send us a message and we’ll get back to you as soon as possible.
              </Text>

              {submitStatus === 'success' ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#A7F3D0',
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: '#ECFDF5',
                  }}
                >
                  <Text style={{ color: '#065F46', fontWeight: '800' }}>Support ticket submitted successfully.</Text>
                  <Text style={{ color: '#047857', marginTop: 4 }}>You will receive a reply shortly.</Text>
                </View>
              ) : null}

              {submitStatus === 'error' ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: '#FEF2F2',
                  }}
                >
                  <Text style={{ color: '#991B1B', fontWeight: '800' }}>Error submitting ticket.</Text>
                  <Text style={{ color: '#B91C1C', marginTop: 4 }}>Please try again.</Text>
                </View>
              ) : null}

              {showPostSubmitChoice ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#A7F3D0',
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: '#ECFDF5',
                    gap: 8,
                  }}
                >
                  <Text style={{ color: '#065F46', fontWeight: '800' }}>Would you like to chat with support now?</Text>
                  <Text style={{ color: '#047857' }}>You can start a live chat or just submit by email.</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={startChatFromSubmit}
                      style={{
                        flex: 1,
                        borderRadius: 999,
                        paddingVertical: 8,
                        alignItems: 'center',
                        backgroundColor: theme.colors.primary,
                      }}
                    >
                      <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>Start chat now</Text>
                    </Pressable>
                    <Pressable
                      onPress={keepEmailOnly}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#86EFAC',
                        borderRadius: 999,
                        paddingVertical: 8,
                        alignItems: 'center',
                        backgroundColor: '#F0FDF4',
                      }}
                    >
                      <Text style={{ color: '#166534', fontWeight: '800' }}>Just email me</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={{ marginTop: 2 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: '700', marginBottom: 6 }}>Registered user</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.colors.text }}>I am a registered Helfi user</Text>
                  <Switch value={formData.isRegisteredUser} onValueChange={(next) => setFormData((prev) => ({ ...prev, isRegisteredUser: next }))} />
                </View>
              </View>

              <View>
                <Text style={{ color: theme.colors.muted, fontWeight: '700', marginBottom: 6 }}>Your Name *</Text>
                <TextInput
                  value={formData.name}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                  placeholder="John Doe"
                  placeholderTextColor="#8AA39D"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                  }}
                />
              </View>

              <View>
                <Text style={{ color: theme.colors.muted, fontWeight: '700', marginBottom: 6 }}>Email Address *</Text>
                <TextInput
                  value={formData.email}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, email: value }))}
                  placeholder="your@email.com"
                  placeholderTextColor="#8AA39D"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                  }}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>What can we help you with? *</Text>
                <DropdownRow
                  label="Inquiry type"
                  value={selectedInquiryLabel}
                  onPress={() => setInquiryPickerOpen((prev) => !prev)}
                />

                {inquiryPickerOpen ? (
                  <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, overflow: 'hidden' }}>
                    {inquiryTypes.map((entry) => (
                      <Pressable
                        key={entry.value}
                        onPress={() => {
                          setFormData((prev) => ({ ...prev, inquiryType: entry.value }))
                          setInquiryPickerOpen(false)
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          borderBottomWidth: 1,
                          borderBottomColor: theme.colors.border,
                          backgroundColor: formData.inquiryType === entry.value ? '#EAF5EF' : theme.colors.card,
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: formData.inquiryType === entry.value ? '900' : '700' }}>
                          {entry.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              {formData.inquiryType === 'account' ? (
                <View>
                  <Text style={{ color: theme.colors.muted, fontWeight: '700', marginBottom: 6 }}>Registered Email Address *</Text>
                  <TextInput
                    value={formData.registeredEmail}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, registeredEmail: value }))}
                    placeholder="Email on your Helfi account"
                    placeholderTextColor="#8AA39D"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      color: theme.colors.text,
                      backgroundColor: theme.colors.card,
                    }}
                  />
                </View>
              ) : null}

              <View>
                <Text style={{ color: theme.colors.muted, fontWeight: '700', marginBottom: 6 }}>Subject</Text>
                <TextInput
                  value={formData.subject}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, subject: value }))}
                  placeholder="Brief description of your issue"
                  placeholderTextColor="#8AA39D"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                  }}
                />
              </View>

              <View>
                <Text style={{ color: theme.colors.muted, fontWeight: '700', marginBottom: 6 }}>Message *</Text>
                <TextInput
                  value={formData.message}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, message: value }))}
                  placeholder="Please provide as much detail as possible about your issue or question..."
                  placeholderTextColor="#8AA39D"
                  multiline
                  textAlignVertical="top"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    minHeight: 120,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                  }}
                />

                <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => void uploadSupportImage('form')}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: theme.colors.card,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                      {uploadingFormAttachment ? 'Uploading...' : 'Attach photo'}
                    </Text>
                  </Pressable>
                </View>

                {formAttachments.length > 0 ? (
                  <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {formAttachments.map((att) => (
                      <View
                        key={att.url}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          backgroundColor: '#F3F4F6',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Text style={{ color: theme.colors.text, maxWidth: 160 }} numberOfLines={1}>
                          {att.name}
                        </Text>
                        <Pressable onPress={() => setFormAttachments((prev) => prev.filter((x) => x.url !== att.url))}>
                          <Text style={{ color: theme.colors.muted, fontWeight: '900' }}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                {attachmentError ? <Text style={{ color: '#DC2626', marginTop: 8 }}>{attachmentError}</Text> : null}
              </View>

              <HelfiButton
                label={submittingForm || uploadingFormAttachment ? 'Submitting...' : 'Send Message'}
                onPress={submitSupportForm}
                disabled={submittingForm || uploadingFormAttachment}
              />

              <View
                style={{
                  marginTop: 8,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 6 }}>Other Ways to Reach Us</Text>
                <Text style={{ color: theme.colors.muted }}>Email: support@helfi.ai</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Response Time: Usually within a few minutes</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Business Hours: Monday - Friday, 9 AM - 5 PM (AEST)</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
