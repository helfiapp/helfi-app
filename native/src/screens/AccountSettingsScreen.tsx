import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { getCurrentNativeAuthSession } from '../lib/nativeAuthSession'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type AccountForm = {
  fullName: string
  email: string
}

type PasswordForm = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const emptyAccount: AccountForm = {
  fullName: '',
  email: '',
}

const emptyPassword: PasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

function PasswordField({
  label,
  value,
  visible,
  onToggleVisible,
  onChangeText,
  placeholder,
}: {
  label: string
  value: string
  visible: boolean
  onToggleVisible: () => void
  onChangeText: (value: string) => void
  placeholder: string
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginBottom: 8 }}>{label}</Text>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8AA39D"
          secureTextEntry={!visible}
          style={{ flex: 1, color: theme.colors.text, fontSize: 16, paddingVertical: 8 }}
        />
        <Pressable onPress={onToggleVisible}>
          <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function AccountSettingsScreen() {
  const { mode, session, signOut, refreshProfile } = useAppMode()

  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveState>('idle')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [accountData, setAccountData] = useState<AccountForm>(emptyAccount)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordData, setPasswordData] = useState<PasswordForm>(emptyPassword)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const accountRef = useRef(accountData)
  const accountSnapshotRef = useRef('')
  const dirtyRef = useRef(false)
  const hasInitializedRef = useRef(false)
  const saveQueue = useRef(Promise.resolve())
  const formIdentityRef = useRef(getCurrentNativeAuthSession())
  const sessionRef = useRef(session)
  sessionRef.current = session
  const refreshProfileRef = useRef(refreshProfile)
  refreshProfileRef.current = refreshProfile

  useEffect(() => {
    accountRef.current = accountData
    if (!hasInitializedRef.current) return
    const snapshot = JSON.stringify(accountData)
    const dirty = snapshot !== accountSnapshotRef.current
    dirtyRef.current = dirty
    setHasUnsavedChanges(dirty)
  }, [accountData])

  const saveAccount = useCallback((options?: { silent?: boolean; payload?: AccountForm }) => {
    const payload = options?.payload ?? accountRef.current
    const identity = getCurrentNativeAuthSession()
    const current = sessionRef.current
    const fullName = payload.fullName.trim().replace(/\s+/g, ' ')
    const pending = saveQueue.current.then(async () => {
      if (!identity || !current || formIdentityRef.current !== identity || getCurrentNativeAuthSession() !== identity) return
      if (JSON.stringify({ ...payload, fullName }) === accountSnapshotRef.current) {
        if (accountRef.current.fullName === payload.fullName) {
          const next = { ...payload, fullName }
          accountRef.current = next
          setAccountData(next)
          dirtyRef.current = false
          setHasUnsavedChanges(false)
          setSaveStatus('idle')
        }
        return
      }
      if (!fullName) { setSaveStatus('error'); return }
      setSaveStatus('saving')
      try {
        const headers = buildNativeAuthHeaders(current.token, { json: true, includeCookie: true })
        const [firstName, ...remaining] = fullName.split(' ')
        const response = await fetch(`${API_BASE_URL}/api/user-data`, {
          method: 'POST', headers,
          body: JSON.stringify({ accountNameOwnerId: current.user.id, profileInfo: { firstName, lastName: remaining.join(' ') } }),
        })
        if (!response.ok) throw new Error('Name could not be saved')
        if (getCurrentNativeAuthSession() !== identity) return
        const readback = await fetch(`${API_BASE_URL}/api/native-auth/me`, { headers })
        const result = await readback.json()
        if (getCurrentNativeAuthSession() !== identity) return
        if (!readback.ok || result?.user?.id !== current.user.id || result.user.email !== current.user.email || result.user.name !== fullName) {
          throw new Error('Name could not be confirmed')
        }
        if (!await refreshProfileRef.current(identity, result.user)) return
        accountSnapshotRef.current = JSON.stringify({ ...payload, fullName })
        if (accountRef.current.fullName === payload.fullName) {
          const next = { ...payload, fullName }
          accountRef.current = next
          setAccountData(next)
          dirtyRef.current = false
          setHasUnsavedChanges(false)
          setSaveStatus('saved')
        } else {
          dirtyRef.current = JSON.stringify(accountRef.current) !== accountSnapshotRef.current
          setHasUnsavedChanges(dirtyRef.current)
          setSaveStatus('idle')
        }
      } catch {
        if (getCurrentNativeAuthSession() === identity) setSaveStatus('error')
      }
    })
    saveQueue.current = pending.catch(() => {})
    return pending
  }, [])

  const loadAccount = useCallback(async () => {
    const identity = getCurrentNativeAuthSession()
    const current = sessionRef.current
    setLoading(true)
    if (identity && current && formIdentityRef.current !== identity) {
      dirtyRef.current = false
      hasInitializedRef.current = false
    }
    formIdentityRef.current = identity
    if (current && !dirtyRef.current) {
      const seeded = { fullName: current.user.name || '', email: current.user.email }
      accountRef.current = seeded
      accountSnapshotRef.current = JSON.stringify(seeded)
      hasInitializedRef.current = true
      setAccountData(seeded)
      setHasUnsavedChanges(false)
    }
    const initialSnapshot = accountSnapshotRef.current
    try {
      if (!identity || !current) return
      const response = await fetch(`${API_BASE_URL}/api/native-auth/me`, {
        headers: buildNativeAuthHeaders(current.token, { includeCookie: true }),
      })
      const result = await response.json()
      if (getCurrentNativeAuthSession() !== identity || !response.ok || result?.user?.id !== current.user.id || result.user.email !== current.user.email) return
      const next = { fullName: String(result.user.name || ''), email: current.user.email }
      if (!dirtyRef.current && accountSnapshotRef.current === initialSnapshot) {
        accountRef.current = next
        accountSnapshotRef.current = JSON.stringify(next)
        hasInitializedRef.current = true
        setAccountData(next)
        setHasUnsavedChanges(false)
        void refreshProfileRef.current(identity, result.user)
      }
    } catch {
      if (getCurrentNativeAuthSession() === identity) setSaveStatus('error')
    } finally {
      if (getCurrentNativeAuthSession() === identity) setLoading(false)
    }
  }, [session?.user?.id, session?.token])

  useFocusEffect(
    React.useCallback(() => {
      void loadAccount()
      return () => {
        void saveAccount({ silent: true, payload: accountRef.current })
      }
    }, [loadAccount, saveAccount]),
  )

  const closePasswordModal = () => {
    setShowPasswordModal(false)
    setPasswordData(emptyPassword)
    setShowCurrentPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  const submitPasswordChange = async () => {
    if (mode !== 'signedIn' || !session?.token) {
      Alert.alert('Please sign in again', 'Please sign in again before changing your password.')
      return
    }

    if (passwordData.newPassword.length < 8) {
      Alert.alert('Password too short', 'New password must be at least 8 characters long.')
      return
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Alert.alert('Passwords do not match', 'New password and confirmation must match.')
      return
    }

    setIsChangingPassword(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/change-password`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { json: true, includeCookie: true }),
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) throw new Error(data?.error || 'Password could not be changed. Please try again.')
      closePasswordModal()
      Alert.alert('Password changed', 'Password changed successfully.')
    } catch (error: any) {
      Alert.alert('Password could not be changed', error?.message || 'Please try again.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const closeDeleteModal = () => {
    setShowDeleteConfirm(false)
    setDeleteConfirmText('')
  }

  const deleteAccount = async () => {
    try {
      if (deleteConfirmText !== 'DELETE') return
      if (mode !== 'signedIn' || !session?.token) {
        Alert.alert('Not signed in', 'Please log in again and try.')
        return
      }

      setIsDeleting(true)
      const response = await fetch(`${API_BASE_URL}/api/account/delete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
      })

      const data: any = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.message || data?.error || 'Failed to delete account')
      }

      closeDeleteModal()
      Alert.alert('Account deleted', 'Your account has been permanently deleted. You will now be signed out.', [
        {
          text: 'OK',
          onPress: () => {
            void signOut()
          },
        },
      ])
    } catch (error: any) {
      Alert.alert('Account deletion failed', error?.message || 'Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const passwordValid =
    passwordData.currentPassword.trim().length > 0 &&
    passwordData.newPassword.trim().length > 0 &&
    passwordData.newPassword === passwordData.confirmPassword

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading account settings...</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: theme.colors.text }}>Account Settings</Text>
            <View>
              {saveStatus === 'saving' ? <Text style={{ color: '#2563EB', fontWeight: '700' }}>Saving...</Text> : null}
              {saveStatus === 'error' ? <Text accessibilityRole="alert" style={{ color: '#DC2626' }}>Name could not be saved. Enter a name and try again.</Text> : null}
              {saveStatus === 'saved' ? <Text style={{ color: '#16A34A', fontWeight: '700' }}>Saved</Text> : null}
              {saveStatus === 'idle' && hasUnsavedChanges ? <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Changes save when you leave the field</Text> : null}
            </View>
          </View>

          <View style={{ marginTop: 12, backgroundColor: '#EAF5EF', borderWidth: 1, borderColor: '#CBE8D7', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#15803D', fontWeight: '700' }}>
              <Text style={{ fontWeight: '700' }}>Auto-save enabled:</Text> Changes save automatically when you leave this page.
            </Text>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.text }}>Account Information</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginTop: 10, marginBottom: 8 }}>Full Name</Text>
            <TextInput
              value={accountData.fullName}
              onChangeText={(fullName) => {
                const next = { ...accountRef.current, fullName }
                accountRef.current = next
                dirtyRef.current = JSON.stringify(next) !== accountSnapshotRef.current
                setAccountData(next)
                setSaveStatus('idle')
              }}
              onBlur={() => { void saveAccount() }}
              placeholder="Enter your full name"
              placeholderTextColor="#8AA39D"
              style={{
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />

            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginTop: 12, marginBottom: 8 }}>Email Address</Text>
            <TextInput
              value={accountData.email}
              editable={false}
              style={{
                backgroundColor: theme.colors.bg,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.muted,
                fontSize: 16,
              }}
            />
            <Text style={{ marginTop: 6, color: theme.colors.muted, fontSize: 12 }}>Changing email requires verification and is not available here.</Text>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.text }}>Security</Text>
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12 }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text, fontSize: 18 }}>Password</Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Change your account password</Text>
              <HelfiButton label="Change Password" onPress={() => setShowPasswordModal(true)} style={{ marginTop: 10 }} />
            </View>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.text }}>Account Actions</Text>
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontWeight: '600', color: '#991B1B', fontSize: 18 }}>Delete Account</Text>
              <Text style={{ color: '#991B1B', marginTop: 4 }}>Permanently delete your account and all data</Text>
              <HelfiButton label="Delete Account" onPress={() => setShowDeleteConfirm(true)} style={{ marginTop: 10 }} />
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showPasswordModal} transparent animationType="fade" onRequestClose={closePasswordModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text }}>Change Password</Text>
            <View style={{ marginTop: 12 }}>
              <PasswordField
                label="Current Password"
                value={passwordData.currentPassword}
                visible={showCurrentPassword}
                onToggleVisible={() => setShowCurrentPassword((v) => !v)}
                onChangeText={(currentPassword) => setPasswordData((prev) => ({ ...prev, currentPassword }))}
                placeholder="Enter current password"
              />
              <PasswordField
                label="New Password"
                value={passwordData.newPassword}
                visible={showNewPassword}
                onToggleVisible={() => setShowNewPassword((v) => !v)}
                onChangeText={(newPassword) => setPasswordData((prev) => ({ ...prev, newPassword }))}
                placeholder="Enter new password"
              />
              <PasswordField
                label="Confirm New Password"
                value={passwordData.confirmPassword}
                visible={showConfirmPassword}
                onToggleVisible={() => setShowConfirmPassword((v) => !v)}
                onChangeText={(confirmPassword) => setPasswordData((prev) => ({ ...prev, confirmPassword }))}
                placeholder="Confirm new password"
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <HelfiButton label="Cancel" onPress={closePasswordModal} variant="secondary" />
              <HelfiButton
                label={isChangingPassword ? 'Changing...' : 'Change Password'}
                onPress={() => void submitPasswordChange()}
                disabled={!passwordValid || isChangingPassword}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#991B1B' }}>Delete Account</Text>
            <Text style={{ marginTop: 10, color: theme.colors.muted }}>
              This action is irreversible. All your data will be permanently deleted including:
            </Text>
            <Text style={{ marginTop: 8, color: theme.colors.muted }}>• Profile information</Text>
            <Text style={{ color: theme.colors.muted }}>• Health data and goals</Text>
            <Text style={{ color: theme.colors.muted }}>• Food diary entries</Text>
            <Text style={{ color: theme.colors.muted }}>• All account settings</Text>

            <Text style={{ marginTop: 10, color: '#991B1B', fontWeight: '700' }}>Type "DELETE" to confirm account deletion:</Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Type DELETE"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              style={{
                marginTop: 8,
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: '#FCA5A5',
                borderRadius: theme.radius.md,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <HelfiButton label="Cancel" onPress={closeDeleteModal} variant="secondary" />
              <HelfiButton label={isDeleting ? 'Deleting...' : 'Delete Account'} onPress={deleteAccount} disabled={deleteConfirmText !== 'DELETE' || isDeleting} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
