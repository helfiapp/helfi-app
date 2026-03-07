import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type InboxItem = {
  id: string
  title: string
  body: string | null
  url: string | null
  status: 'read' | 'unread'
  createdAt: string
}

function ActionLink({
  label,
  disabled,
  danger,
  onPress,
}: {
  label: string
  disabled?: boolean
  danger?: boolean
  onPress: () => void
}) {
  const activeColor = danger ? '#DC2626' : theme.colors.text
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.35 : 1 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: activeColor }}>{label}</Text>
    </Pressable>
  )
}

function formatTimestamp(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function appendNotificationId(path: string, notificationId: string) {
  if (!path || !notificationId) return path
  if (path.includes('notificationId=')) return path
  return `${path}${path.includes('?') ? '&' : '?'}notificationId=${encodeURIComponent(notificationId)}`
}

function extractPath(url: string) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw)
      return `${parsed.pathname || ''}${parsed.search || ''}`
    } catch {
      return ''
    }
  }
  return raw
}

export function NotificationInboxScreen({ navigation }: { navigation: any }) {
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
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<InboxItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'unread').length,
    [items],
  )

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.length === items.length,
    [items, selectedIds],
  )

  const loadInbox = useCallback(async () => {
    if (mode !== 'signedIn' || !authHeaders) {
      setItems([])
      setSelectedIds([])
      setLoading(false)
      setError('Please log in again.')
      return
    }

    try {
      setLoading(true)
      setError('')
      const res = await fetch(`${API_BASE_URL}/api/notifications/inbox?limit=50`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Could not load notifications')
      }
      const list = Array.isArray(data?.items) ? (data.items as InboxItem[]) : []
      setItems(list)
      setSelectedIds((prev) => prev.filter((id) => list.some((item) => item.id === id)))
    } catch (e: any) {
      setError(e?.message || 'Could not load notifications.')
      setItems([])
      setSelectedIds([])
    } finally {
      setLoading(false)
    }
  }, [authHeaders, mode])

  useFocusEffect(
    useCallback(() => {
      void loadInbox()
      return () => {}
    }, [loadInbox]),
  )

  const markRead = useCallback(
    async (id: string) => {
      if (!id || !authHeaders) return
      await fetch(`${API_BASE_URL}/api/notifications/inbox`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'mark_read', id }),
      }).catch(() => {})

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'read' } : item)),
      )
    },
    [authHeaders],
  )

  const postInboxAction = useCallback(
    async (body: any) => {
      if (!authHeaders) return false
      const res = await fetch(`${API_BASE_URL}/api/notifications/inbox`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      return res.ok
    },
    [authHeaders],
  )

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([])
      return
    }
    setSelectedIds(items.map((item) => item.id))
  }

  const deleteSelected = async () => {
    if (deleting || selectedIds.length === 0) return
    Alert.alert('Delete selected notifications?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true)
            await postInboxAction({ action: 'delete_selected', ids: selectedIds })
            await loadInbox()
            setSelectedIds([])
          } finally {
            setDeleting(false)
          }
        },
      },
    ])
  }

  const deleteAll = async () => {
    if (deleting || items.length === 0) return
    Alert.alert('Delete all notifications?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true)
            await postInboxAction({ action: 'delete_all' })
            await loadInbox()
            setSelectedIds([])
          } finally {
            setDeleting(false)
          }
        },
      },
    ])
  }

  const deleteOne = async (id: string) => {
    if (deleting || !id) return
    Alert.alert('Delete this notification?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true)
            await postInboxAction({ action: 'delete_selected', ids: [id] })
            await loadInbox()
            setSelectedIds((prev) => prev.filter((entry) => entry !== id))
          } finally {
            setDeleting(false)
          }
        },
      },
    ])
  }

  const markAllRead = async () => {
    if (busy || unreadCount === 0) return
    try {
      setBusy(true)
      await postInboxAction({ action: 'mark_all_read' })
      setItems((prev) => prev.map((item) => ({ ...item, status: 'read' })))
    } finally {
      setBusy(false)
    }
  }

  const openNotificationUrl = useCallback(
    async (url: string | null, notificationId: string) => {
      const rawPath = extractPath(String(url || ''))
      const path = appendNotificationId(rawPath, notificationId)
      if (!path) {
        const rawUrl = String(url || '').trim()
        if (!rawUrl) return
        try {
          await Linking.openURL(rawUrl)
        } catch {
          Alert.alert('Could not open', 'Please try again.')
        }
        return
      }

      const openNativeTool = (title: string, routePath: string) => {
        navigation.navigate('NativeWebTool', {
          title,
          path: routePath,
        })
      }

      if (path.startsWith('/check-in')) {
        openNativeTool(NATIVE_WEB_PAGES.dailyCheckIn.title, NATIVE_WEB_PAGES.dailyCheckIn.path)
        return
      }
      if (path.startsWith('/mood')) {
        openNativeTool(NATIVE_WEB_PAGES.moodTracker.title, NATIVE_WEB_PAGES.moodTracker.path)
        return
      }
      if (path.startsWith('/notifications/inbox')) {
        navigation.navigate('NotificationsInbox')
        return
      }
      if (path.startsWith('/notifications/reminders')) {
        navigation.navigate('Reminders')
        return
      }
      if (path.startsWith('/notifications/ai-insights')) {
        navigation.navigate('NotificationsAIInsights')
        return
      }
      if (path.startsWith('/notifications/quiet-hours')) {
        navigation.navigate('NotificationsQuietHours')
        return
      }
      if (path.startsWith('/notifications/account-security')) {
        navigation.navigate('NotificationsAccountSecurity')
        return
      }
      if (path.startsWith('/health-tips/history')) {
        navigation.navigate('SmartHealthCoach', { tab: 'history' })
        return
      }
      if (path.startsWith('/health-tips')) {
        navigation.navigate('SmartHealthCoach', { tab: 'today' })
        return
      }
      if (path.startsWith('/account')) {
        navigation.navigate('AccountSettings')
        return
      }
      if (path.startsWith('/billing')) {
        navigation.navigate('Billing')
        return
      }

      if (path.startsWith('/')) {
        openNativeTool('Page', path)
        return
      }

      const destination = String(url || '').trim()
      if (!destination) return
      try {
        await Linking.openURL(destination)
      } catch {
        Alert.alert('Could not open', 'Please try again.')
      }
    },
    [navigation],
  )

  const handleOpen = async (item: InboxItem) => {
    if (item.status === 'unread') {
      await markRead(item.id)
    }
    await openNotificationUrl(item.url, item.id)
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text }}>Notification inbox</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted, lineHeight: 19 }}>
            Missed a pop-up? It will show here so you can open it later.
          </Text>

          <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <ActionLink
              label={allSelected ? 'Clear selection' : 'Select all'}
              disabled={items.length === 0}
              onPress={handleSelectAll}
            />
            <ActionLink
              label="Delete selected"
              disabled={selectedIds.length === 0 || deleting}
              danger
              onPress={deleteSelected}
            />
            <ActionLink
              label="Delete all"
              disabled={items.length === 0 || deleting}
              danger
              onPress={deleteAll}
            />
            <ActionLink
              label="Mark all as read"
              disabled={busy || unreadCount === 0}
              onPress={markAllRead}
            />
          </View>

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ color: theme.colors.muted }}>
              Unread: <Text style={{ fontWeight: '800', color: theme.colors.text }}>{unreadCount}</Text>
            </Text>
            {selectedIds.length > 0 ? (
              <Text style={{ color: theme.colors.muted }}>
                Selected: <Text style={{ fontWeight: '800', color: theme.colors.text }}>{selectedIds.length}</Text>
              </Text>
            ) : null}
          </View>

          {loading ? (
            <View style={{ marginTop: 18, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ marginTop: 8, color: theme.colors.muted }}>Loading notifications...</Text>
            </View>
          ) : error ? (
            <Text style={{ marginTop: 16, color: '#B45309' }}>{error}</Text>
          ) : items.length === 0 ? (
            <Text style={{ marginTop: 16, color: theme.colors.muted }}>
              No notifications yet. When new alerts arrive, they will show up here.
            </Text>
          ) : (
            <View style={{ marginTop: 14, gap: 10 }}>
              {items.map((item) => {
                const selected = selectedIds.includes(item.id)
                const unread = item.status === 'unread'
                return (
                  <View
                    key={item.id}
                    style={{
                      borderWidth: 1,
                      borderColor: unread ? '#8ED0A0' : theme.colors.border,
                      backgroundColor: unread ? '#F2FBF4' : theme.colors.card,
                      borderRadius: theme.radius.md,
                      padding: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Pressable
                        onPress={() => {
                          setSelectedIds((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((entry) => entry !== item.id)
                              : [...prev, item.id],
                          )
                        }}
                        style={{
                          marginTop: 1,
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: selected ? theme.colors.primary : '#9FB9B2',
                          backgroundColor: selected ? '#EAF5EF' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected ? <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>✓</Text> : null}
                      </Pressable>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>{item.title}</Text>
                        {item.body ? (
                          <Text style={{ marginTop: 4, color: theme.colors.muted, lineHeight: 18 }}>{item.body}</Text>
                        ) : null}
                        <Text style={{ marginTop: 8, fontSize: 12, color: '#94A3B8' }}>
                          {formatTimestamp(item.createdAt)}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 8 }}>
                        <Pressable onPress={() => deleteOne(item.id)} disabled={deleting}>
                          <Text style={{ color: deleting ? '#FCA5A5' : '#DC2626', fontWeight: '800' }}>Delete</Text>
                        </Pressable>
                        {unread ? (
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: theme.colors.primary,
                            }}
                          />
                        ) : null}
                      </View>
                    </View>

                    <View style={{ marginTop: 10, flexDirection: 'row', gap: 16 }}>
                      {item.url ? (
                        <Pressable onPress={() => void handleOpen(item)}>
                          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Open</Text>
                        </Pressable>
                      ) : null}
                      {unread ? (
                        <Pressable onPress={() => void markRead(item.id)}>
                          <Text style={{ color: theme.colors.muted, fontWeight: '800' }}>Mark as read</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}
