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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type SaveState = 'idle' | 'saving' | 'saved'

type AccountForm = {
  fullName: string
  email: string
}

type PasswordForm = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const ACCOUNT_STORAGE_KEY = 'helfi_native_account_settings_v1'

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
  const { mode, session, signOut } = useAppMode()

  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveState>('idle')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [accountData, setAccountData] = useState<AccountForm>(emptyAccount)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordData, setPasswordData] = useState<PasswordForm>(emptyPassword)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const accountRef = useRef(accountData)
  const accountSnapshotRef = useRef('')
  const dirtyRef = useRef(false)
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    accountRef.current = accountData
    if (!hasInitializedRef.current) return
    const snapshot = JSON.stringify(accountData)
    const dirty = snapshot !== accountSnapshotRef.current
    dirtyRef.current = dirty
    setHasUnsavedChanges(dirty)
  }, [accountData])

  const saveAccount = useCallback(async (options?: { silent?: boolean; payload?: AccountForm }) => {
    const payload = options?.payload ?? accountRef.current
    if (!options?.silent) setSaveStatus('saving')
    try {
      await AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(payload))
      accountSnapshotRef.current = JSON.stringify(payload)
      dirtyRef.current = false
      setHasUnsavedChanges(false)
      if (!options?.silent) {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }
    } catch {
      if (!options?.silent) setSaveStatus('idle')
    }
  }, [])

  const loadAccount = useCallback(async () => {
    try {
      setLoading(true)
      const seeded = {
        fullName: String(session?.user?.name || '').trim(),
        email: String(session?.user?.email || '').trim(),
      }

      const raw = await AsyncStorage.getItem(ACCOUNT_STORAGE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<AccountForm>
          const next: AccountForm = {
            fullName: String(parsed?.fullName || seeded.fullName || '').trim(),
            email: String(parsed?.email || seeded.email || '').trim(),
          }
          setAccountData(next)
          hasInitializedRef.current = true
          accountSnapshotRef.current = JSON.stringify(next)
          dirtyRef.current = false
          setHasUnsavedChanges(false)
          return
        } catch {
          // fall through and use seeded values
        }
      }

      setAccountData(seeded)
      hasInitializedRef.current = true
      accountSnapshotRef.current = JSON.stringify(seeded)
      dirtyRef.current = false
      setHasUnsavedChanges(false)
    } finally {
      setLoading(false)
    }
  }, [session?.user?.name, session?.user?.email])

  useFocusEffect(
    React.useCallback(() => {
      void loadAccount()
      return () => {
        if (dirtyRef.current) {
          void saveAccount({ silent: true, payload: accountRef.current })
        }
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

  const submitPasswordChange = () => {
    Alert.alert('Coming soon', 'Password change functionality coming soon!')
    closePasswordModal()
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
            <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text }}>Account Settings</Text>
            <View>
              {saveStatus === 'saving' ? <Text style={{ color: '#2563EB', fontWeight: '700' }}>Saving...</Text> : null}
              {saveStatus === 'saved' ? <Text style={{ color: '#16A34A', fontWeight: '700' }}>Saved</Text> : null}
              {saveStatus === 'idle' && hasUnsavedChanges ? <Text style={{ color: '#B45309', fontWeight: '700' }}>Will save on exit</Text> : null}
            </View>
          </View>

          <View style={{ marginTop: 12, backgroundColor: '#EAF5EF', borderWidth: 1, borderColor: '#CBE8D7', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#15803D', fontWeight: '700' }}>
              <Text style={{ fontWeight: '900' }}>Auto-save enabled:</Text> Changes save automatically when you leave this page.
            </Text>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Account Information</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginTop: 10, marginBottom: 8 }}>Full Name</Text>
            <TextInput
              value={accountData.fullName}
              onChangeText={(fullName) => setAccountData((prev) => ({ ...prev, fullName }))}
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
                backgroundColor: '#F3F4F6',
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: theme.colors.muted,
                fontSize: 16,
              }}
            />
            <Text style={{ marginTop: 6, color: theme.colors.muted, fontSize: 12 }}>Email cannot be changed</Text>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Security</Text>
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12 }}>
              <Text style={{ fontWeight: '800', color: theme.colors.text, fontSize: 18 }}>Password</Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Change your account password</Text>
              <HelfiButton label="Change Password" onPress={() => setShowPasswordModal(true)} style={{ marginTop: 10 }} />
            </View>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Account Actions</Text>
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontWeight: '800', color: '#991B1B', fontSize: 18 }}>Delete Account</Text>
              <Text style={{ color: '#991B1B', marginTop: 4 }}>Permanently delete your account and all data</Text>
              <HelfiButton label="Delete Account" onPress={() => setShowDeleteConfirm(true)} style={{ marginTop: 10 }} />
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showPasswordModal} transparent animationType="fade" onRequestClose={closePasswordModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Change Password</Text>
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
              <HelfiButton label="Change Password" onPress={submitPasswordChange} disabled={!passwordValid} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#991B1B' }}>Delete Account</Text>
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
