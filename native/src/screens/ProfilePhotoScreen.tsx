import React, { useState } from 'react'
import { ActivityIndicator, Alert, Image, ScrollView, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { HelfiButton } from '../ui/HelfiButton'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function ProfilePhotoScreen() {
  const { session, mode } = useAppMode()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [accountImage, setAccountImage] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('User')

  const loadProfile = async () => {
    try {
      if (mode !== 'signedIn' || !session?.token) {
        setAccountImage(null)
        setDisplayName('User')
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
      if (!res.ok) throw new Error(payload?.error || 'Could not load profile')

      const data = payload?.data || {}
      const info = data?.profileInfo || {}
      const firstName = String(info?.firstName || '').trim()
      const fallbackName = String(session?.user?.name || session?.user?.email?.split('@')[0] || 'User').trim()
      setDisplayName(firstName || fallbackName || 'User')
      setAccountImage(typeof data?.profileImage === 'string' && data.profileImage ? data.profileImage : session?.user?.image || null)
    } catch (error: any) {
      Alert.alert('Could not load profile photo', error?.message || 'Please try again.')
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

  const uploadPickedImage = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      if (mode !== 'signedIn' || !session?.token) return
      setUploading(true)

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
      if (!res.ok) throw new Error(data?.error || 'Could not upload photo')

      if (typeof data?.imageUrl === 'string' && data.imageUrl) {
        setAccountImage(data.imageUrl)
      }
      Alert.alert('Profile photo updated', 'Your new photo is saved.')
    } catch (error: any) {
      Alert.alert('Photo upload failed', error?.message || 'Please try again.')
    } finally {
      setUploading(false)
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
            setUploading(true)
            const res = await fetch(`${API_BASE_URL}/api/native-upload-profile-image`, {
              method: 'DELETE',
              headers: {
                authorization: `Bearer ${session.token}`,
              },
            })
            const data: any = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Could not remove photo')
            setAccountImage(null)
            Alert.alert('Removed', 'Your profile photo was removed.')
          } catch (error: any) {
            Alert.alert('Remove failed', error?.message || 'Please try again.')
          } finally {
            setUploading(false)
          }
        },
      },
    ])
  }

  const initial = String(displayName || 'U').charAt(0).toUpperCase()

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading profile photo...</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text }}>Upload/Change Profile Photo</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>Changes are automatically saved.</Text>

          <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 14 }}>
            {accountImage ? (
              <Image source={{ uri: accountImage }} style={{ width: 120, height: 120, borderRadius: 60 }} />
            ) : (
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#EAF5EF',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 36, fontWeight: '900', color: theme.colors.primary }}>{initial}</Text>
              </View>
            )}
          </View>

          <Text style={{ textAlign: 'center', color: theme.colors.muted, marginBottom: 12 }}>PNG, JPG up to 15MB</Text>
          <HelfiButton label={uploading ? 'Uploading...' : 'Choose Photo'} onPress={onPickPhoto} disabled={uploading} />
          <HelfiButton label={uploading ? 'Uploading...' : 'Take a photo'} onPress={onTakePhoto} disabled={uploading} variant="secondary" style={{ marginTop: 10 }} />
          {accountImage ? <HelfiButton label={uploading ? 'Please wait...' : 'Remove photo'} onPress={onRemovePhoto} disabled={uploading} variant="secondary" style={{ marginTop: 10 }} /> : null}
        </View>
      </ScrollView>
    </Screen>
  )
}
