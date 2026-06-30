import React, { useCallback, useRef } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { Feather } from '@expo/vector-icons'

import { NATIVE_WEB_PAGES, type NativeWebPageRoute } from '../config/nativePageRoutes'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'
import { useVoiceAssistant } from '../voice/VoiceAssistant'

function Row({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        paddingVertical: 16,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 22, alignItems: 'center' }}>{icon}</View>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.text }}>{label}</Text>
          {subtitle ? (
            <Text style={{ marginTop: 2, fontSize: 12, color: theme.colors.muted }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={theme.colors.muted} />
    </Pressable>
  )
}

export function MoreScreen({ navigation }: { navigation: any }) {
  const { openVoiceAssistant } = useVoiceAssistant()
  const scrollRef = useRef<ScrollView>(null)

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, []),
  )

  const openNativeTool = (page: NativeWebPageRoute) => {
    navigation.getParent()?.navigate('NativeWebTool', {
      title: page.title,
      path: page.path,
    })
  }
  const openMoodTracker = () => {
    navigation.getParent()?.navigate('MoodTracker', { tab: 'checkin' })
  }

  return (
    <Screen>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <Text style={{ fontSize: theme.fontSize.pageTitle, fontWeight: '900', color: theme.colors.text, marginBottom: theme.spacing.md }}>More</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: '900', letterSpacing: 1, marginBottom: 10 }}>
          HEALTH & ANALYSIS
        </Text>

        <View style={{ gap: 10 }}>
          <Row icon={<Feather name="mic" size={18} color={theme.colors.muted} />} label="Talk to Helfi" onPress={() => openVoiceAssistant({ source: 'button' })} />
          <Row icon={<Feather name="book-open" size={18} color={theme.colors.muted} />} label="Health Journal" onPress={() => navigation.getParent()?.navigate('HealthJournal')} />
          <Row icon={<Feather name="bookmark" size={18} color={theme.colors.muted} />} label="Health Coach" onPress={() => navigation.getParent()?.navigate('SmartHealthCoach', { tab: 'today', activeTab: 'More' })} />
          <Row
            icon={<Feather name="check-square" size={18} color={theme.colors.muted} />}
            label="Today's Check-in"
            onPress={() => navigation.getParent()?.navigate('DailyCheckIn')}
          />
          <Row icon={<Feather name="smile" size={18} color={theme.colors.muted} />} label="Mood Tracker" onPress={openMoodTracker} />
          <Row icon={<Feather name="clipboard" size={18} color={theme.colors.muted} />} label="Symptom Notes" onPress={() => navigation.getParent()?.navigate('SymptomNotes')} />
          <Row icon={<Feather name="image" size={18} color={theme.colors.muted} />} label="Health Image Notes" onPress={() => navigation.getParent()?.navigate('HealthImageNotes')} />
          <Row icon={<Feather name="clipboard" size={18} color={theme.colors.muted} />} label="Health Intake" onPress={() => openNativeTool(NATIVE_WEB_PAGES.healthIntake)} />
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: '900', letterSpacing: 1, marginTop: theme.spacing.lg, marginBottom: 10 }}>
          ACCOUNT & SETTINGS
        </Text>

        <View style={{ gap: 10 }}>
          <Row icon={<Feather name="watch" size={18} color={theme.colors.muted} />} label="Devices" onPress={() => navigation.getParent()?.navigate('Devices')} />
          <Row icon={<Feather name="user" size={18} color={theme.colors.muted} />} label="Profile" onPress={() => navigation.getParent()?.navigate('Profile')} />
          <Row
            icon={<Feather name="settings" size={18} color={theme.colors.muted} />}
            label="Settings"
            onPress={() => navigation.navigate?.('Settings')}
          />
          <Row icon={<Feather name="credit-card" size={18} color={theme.colors.muted} />} label="Billing" onPress={() => navigation.getParent()?.navigate('Billing')} />
          <Row
            icon={<Feather name="help-circle" size={18} color={theme.colors.muted} />}
            label="Help & Support"
            onPress={() => navigation.getParent()?.navigate('Help', { activeTab: 'More' })}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}
