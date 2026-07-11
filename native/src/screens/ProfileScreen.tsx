import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { useFocusEffect, useNavigation } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type GenderOption = '' | 'male' | 'female' | 'other' | 'prefer-not-to-say'

type ProfileForm = {
  firstName: string
  lastName: string
  bio: string
  dateOfBirth: string
  gender: GenderOption
}

const emptyProfile: ProfileForm = {
  firstName: '',
  lastName: '',
  bio: '',
  dateOfBirth: '',
  gender: '',
}

const genderLabelByValue: Record<GenderOption, string> = {
  '': 'Select gender',
  male: 'Male',
  female: 'Female',
  other: 'Other',
  'prefer-not-to-say': 'Prefer not to say',
}

function normalizeGender(value: any): GenderOption {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'male') return 'male'
  if (v === 'female') return 'female'
  if (v === 'other') return 'other'
  if (v === 'prefer-not-to-say') return 'prefer-not-to-say'
  return ''
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8AA39D"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: multiline ? 110 : 48,
          color: theme.colors.text,
          fontSize: 16,
        }}
      />
    </View>
  )
}

function DropdownOption({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? '#EAF5EF' : theme.colors.card,
        paddingVertical: 11,
        paddingHorizontal: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export function ProfileScreen() {
  const { session, mode } = useAppMode()
  const navigation = useNavigation<any>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)
  const [initialHash, setInitialHash] = useState('')
  const [genderMenuOpen, setGenderMenuOpen] = useState(false)

  const isDirty = useMemo(() => JSON.stringify(profile) !== initialHash, [profile, initialHash])

  const loadProfile = async () => {
    try {
      if (mode !== 'signedIn' || !session?.token) {
        setProfile(emptyProfile)
        setInitialHash(JSON.stringify(emptyProfile))
        return
      }

      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/user-data?scope=health-setup`, {
        headers: {
          authorization: `Bearer ${session.token}`,
          'cache-control': 'no-store',
        },
      })

      const payload: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Could not load profile')
      }

      const data = payload?.data || {}
      const info = data?.profileInfo || {}
      const selectedGender = normalizeGender(info?.gender || data?.gender)
      const next: ProfileForm = {
        firstName: String(info?.firstName || '').trim(),
        lastName: String(info?.lastName || '').trim(),
        bio: String(info?.bio || '').trim(),
        dateOfBirth: String(info?.dateOfBirth || '').trim(),
        gender: selectedGender,
      }

      setProfile(next)
      setInitialHash(JSON.stringify(next))
      setGenderMenuOpen(false)
    } catch (error: any) {
      Alert.alert('Could not load profile', error?.message || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(
    React.useCallback(() => {
      void loadProfile()
      return () => {}
    }, [mode, session?.token]),
  )

  const saveProfile = async (profileToSave: ProfileForm = profile) => {
    try {
      if (mode !== 'signedIn' || !session?.token) return

      setSaving(true)
      const res = await fetch(`${API_BASE_URL}/api/user-data`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ profileInfo: profileToSave }),
      })

      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Could not save profile')
      }

      setInitialHash(JSON.stringify(profileToSave))
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (loading || !isDirty || saving) return
    const timer = setTimeout(() => {
      void saveProfile(profile)
    }, 900)
    return () => clearTimeout(timer)
  }, [profile, loading, isDirty, saving])

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading profile...</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View style={{ backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: 16 }}>
          <Text style={{ fontSize: theme.fontSize.pageTitle, fontWeight: '700', color: theme.colors.text }}>Profile Information</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>Auto-save enabled: Your changes save automatically when you leave this page.</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change Profile Photo"
            onPress={() => navigation.navigate('ProfilePhoto')}
            style={({ pressed }) => ({
              marginTop: 16,
              marginBottom: 16,
              alignSelf: 'flex-start',
              borderRadius: theme.radius.md,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: '#EAF5EF',
              borderWidth: 1,
              borderColor: '#CFE8D4',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Change Profile Photo</Text>
          </Pressable>

          <Field
            label="First Name"
            value={profile.firstName}
            onChangeText={(firstName) => setProfile((prev) => ({ ...prev, firstName }))}
            placeholder="Enter your first name"
          />
          <Field
            label="Last Name"
            value={profile.lastName}
            onChangeText={(lastName) => setProfile((prev) => ({ ...prev, lastName }))}
            placeholder="Enter your last name"
          />
          <Field
            label="Bio"
            value={profile.bio}
            onChangeText={(bio) => setProfile((prev) => ({ ...prev, bio }))}
            placeholder="Tell us about yourself..."
            multiline
          />
          <Field
            label="Date of Birth"
            value={profile.dateOfBirth}
            onChangeText={(dateOfBirth) => setProfile((prev) => ({ ...prev, dateOfBirth }))}
            placeholder="YYYY-MM-DD"
          />

          <View style={{ marginBottom: theme.spacing.lg }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginBottom: 8 }}>Gender</Text>
            <Pressable
              onPress={() => setGenderMenuOpen((v) => !v)}
              style={({ pressed }) => ({
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: profile.gender ? theme.colors.text : '#8AA39D', fontSize: 16 }}>
                {genderLabelByValue[profile.gender]}
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 16 }}>{genderMenuOpen ? '▴' : '▾'}</Text>
            </Pressable>

            {genderMenuOpen ? (
              <View
                style={{
                  marginTop: 8,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.card,
                  padding: 8,
                  gap: 6,
                }}
              >
                <DropdownOption
                  label="Male"
                  selected={profile.gender === 'male'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'male' }))
                    setGenderMenuOpen(false)
                  }}
                />
                <DropdownOption
                  label="Female"
                  selected={profile.gender === 'female'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'female' }))
                    setGenderMenuOpen(false)
                  }}
                />
                <DropdownOption
                  label="Other"
                  selected={profile.gender === 'other'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'other' }))
                    setGenderMenuOpen(false)
                  }}
                />
                <DropdownOption
                  label="Prefer not to say"
                  selected={profile.gender === 'prefer-not-to-say'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'prefer-not-to-say' }))
                    setGenderMenuOpen(false)
                  }}
                />
              </View>
            ) : null}
          </View>
          <Text style={{ color: saving ? theme.colors.primary : theme.colors.muted, fontSize: 12 }}>
            {saving ? 'Saving...' : isDirty ? 'Saving changes automatically...' : 'All changes saved.'}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  )
}
