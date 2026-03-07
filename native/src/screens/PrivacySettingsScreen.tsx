import React, { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { API_BASE_URL } from '../config'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type ProfileVisibility = 'private' | 'public' | 'friends'

const PROFILE_VISIBILITY_KEY = 'profileVisibility'
const DATA_ANALYTICS_KEY = 'dataAnalytics'

function VisibilityOption({
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
        opacity: pressed ? 0.92 : 1,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? '#EAF5EF' : theme.colors.card,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
      })}
    >
      <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export function PrivacySettingsScreen() {
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>('private')
  const [dataAnalytics, setDataAnalytics] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [savedVisibility, savedAnalytics] = await Promise.all([
          AsyncStorage.getItem(PROFILE_VISIBILITY_KEY),
          AsyncStorage.getItem(DATA_ANALYTICS_KEY),
        ])

        if (savedVisibility === 'private' || savedVisibility === 'public' || savedVisibility === 'friends') {
          setProfileVisibility(savedVisibility)
        }
        if (savedAnalytics !== null) {
          setDataAnalytics(savedAnalytics === 'true')
        }
      } finally {
        setLoaded(true)
      }
    }
    void load()
  }, [])

  useEffect(() => {
    if (!loaded) return
    void AsyncStorage.setItem(PROFILE_VISIBILITY_KEY, profileVisibility)
  }, [profileVisibility, loaded])

  useEffect(() => {
    if (!loaded) return
    void AsyncStorage.setItem(DATA_ANALYTICS_KEY, dataAnalytics.toString())
  }, [dataAnalytics, loaded])

  const openPolicy = async () => {
    try {
      await Linking.openURL(`${API_BASE_URL}/privacy`)
    } catch {
      // Ignore open failures (no crash).
    }
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
            gap: 16,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Privacy controls</Text>
            <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>
              Manage privacy options from your profile menu.
            </Text>
          </View>

          <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Profile Visibility</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Choose who can see your profile.</Text>
            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <VisibilityOption label="Private" selected={profileVisibility === 'private'} onPress={() => setProfileVisibility('private')} />
              <VisibilityOption label="Public" selected={profileVisibility === 'public'} onPress={() => setProfileVisibility('public')} />
              <VisibilityOption label="Friends Only" selected={profileVisibility === 'friends'} onPress={() => setProfileVisibility('friends')} />
            </View>
          </View>

          <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Data Analytics</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Share anonymous app usage data.</Text>
              </View>
              <Switch
                value={dataAnalytics}
                onValueChange={setDataAnalytics}
                trackColor={{ false: '#D1D5DB', true: '#86D2A2' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <Pressable
            onPress={openPolicy}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.card,
              paddingVertical: 12,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>View full Privacy Policy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  )
}
