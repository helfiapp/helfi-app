import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type GenderOption = '' | 'male' | 'female' | 'other' | 'prefer-not-to-say'

type ProfileForm = {
  firstName: string
  lastName: string
  email: string
  bio: string
  dateOfBirth: string
  gender: GenderOption
}

const emptyProfile: ProfileForm = {
  firstName: '',
  lastName: '',
  email: '',
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
      <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export function ProfileScreen() {
  const { session, mode } = useAppMode()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)
  const [initialHash, setInitialHash] = useState('')
  const [accountImage, setAccountImage] = useState<string | null>(null)
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
        email: String(session?.user?.email || info?.email || '').trim(),
        bio: String(info?.bio || '').trim(),
        dateOfBirth: String(info?.dateOfBirth || '').trim(),
        gender: selectedGender,
      }

      setAccountImage(typeof data?.profileImage === 'string' && data.profileImage ? data.profileImage : session?.user?.image || null)
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

  const saveProfile = async () => {
    try {
      if (mode !== 'signedIn' || !session?.token) return

      setSaving(true)
      const res = await fetch(`${API_BASE_URL}/api/user-data`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ profileInfo: profile }),
      })

      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Could not save profile')
      }

      setInitialHash(JSON.stringify(profile))
      Alert.alert('Saved', 'Your profile has been updated.')
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const uploadPickedImage = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      if (mode !== 'signedIn' || !session?.token) return
      setUploadingImage(true)

      const fileType = asset.mimeType || (asset.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
      const fileName = asset.fileName || `profile-${Date.now()}.${fileType.includes('png') ? 'png' : 'jpg'}`
      const formData = new FormData()
      formData.append(
        'image',
        {
          uri: asset.uri,
          name: fileName,
          type: fileType,
        } as any,
      )

      const res = await fetch(`${API_BASE_URL}/api/native-upload-profile-image`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.token}`,
        },
        body: formData,
      })

      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Could not upload photo')
      }

      if (typeof data?.imageUrl === 'string' && data.imageUrl) {
        setAccountImage(data.imageUrl)
      }
      Alert.alert('Profile photo updated', 'Your new photo is saved.')
    } catch (error: any) {
      Alert.alert('Photo upload failed', error?.message || 'Please try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  const onPickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to change your profile image.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      })

      if (result.canceled || !result.assets?.[0]) return
      await uploadPickedImage(result.assets[0])
    } catch (error: any) {
      Alert.alert('Could not open photos', error?.message || 'Please try again.')
    }
  }

  const onTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to take a profile photo.')
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      })

      if (result.canceled || !result.assets?.[0]) return
      await uploadPickedImage(result.assets[0])
    } catch (error: any) {
      Alert.alert('Could not open camera', error?.message || 'Please try again.')
    }
  }

  const onRemovePhoto = async () => {
    Alert.alert('Remove profile photo?', 'This will remove your current profile image.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            if (mode !== 'signedIn' || !session?.token) return
            setUploadingImage(true)
            const res = await fetch(`${API_BASE_URL}/api/native-upload-profile-image`, {
              method: 'DELETE',
              headers: {
                authorization: `Bearer ${session.token}`,
              },
            })
            const data: any = await res.json().catch(() => ({}))
            if (!res.ok) {
              throw new Error(data?.error || 'Could not remove photo')
            }
            setAccountImage(null)
            Alert.alert('Removed', 'Your profile photo was removed.')
          } catch (error: any) {
            Alert.alert('Remove failed', error?.message || 'Please try again.')
          } finally {
            setUploadingImage(false)
          }
        },
      },
    ])
  }

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
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text }}>Profile Information</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>This is your native app profile page.</Text>

          <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 16 }}>
            {accountImage ? (
              <Image source={{ uri: accountImage }} style={{ width: 84, height: 84, borderRadius: 42 }} />
            ) : (
              <View
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#EAF5EF',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.primary }}>
                  {String(profile.firstName || session?.user?.name || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={{ marginTop: 12, width: '100%', gap: 8 }}>
              <HelfiButton label={uploadingImage ? 'Uploading...' : 'Choose From Photos'} onPress={onPickPhoto} disabled={uploadingImage} />
              <HelfiButton label={uploadingImage ? 'Uploading...' : 'Take Photo'} onPress={onTakePhoto} disabled={uploadingImage} variant="secondary" />
              {accountImage ? <HelfiButton label={uploadingImage ? 'Please wait...' : 'Remove Photo'} onPress={onRemovePhoto} disabled={uploadingImage} variant="secondary" /> : null}
            </View>
          </View>

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
            label="Email"
            value={profile.email}
            onChangeText={(email) => setProfile((prev) => ({ ...prev, email }))}
            placeholder="Enter your email"
          />
          <Field
            label="Bio"
            value={profile.bio}
            onChangeText={(bio) => setProfile((prev) => ({ ...prev, bio }))}
            placeholder="Tell us about yourself"
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
            {genderMenuOpen ? (
              <Pressable onPress={() => setGenderMenuOpen(false)} style={{ marginTop: 10 }}>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Tap again to close</Text>
              </Pressable>
            ) : null}
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Matches web profile dropdown behavior.</Text>
            </View>
          </View>

          <HelfiButton label={saving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'} onPress={saveProfile} disabled={saving || !isDirty} />
        </View>
      </ScrollView>
    </Screen>
  )
}
