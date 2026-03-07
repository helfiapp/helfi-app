import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Feather } from '@expo/vector-icons'

import { NATIVE_WEB_PAGES, type NativeWebPageRoute } from '../config/nativePageRoutes'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

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
  const openPractitioners = () => {
    const parent = navigation.getParent?.()
    if (parent?.navigate) {
      parent.navigate('Practitioners')
      return
    }
    navigation.navigate?.('Practitioners')
  }

  const openNativeTool = (page: NativeWebPageRoute) => {
    navigation.getParent()?.navigate('NativeWebTool', {
      title: page.title,
      path: page.path,
    })
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text, marginBottom: theme.spacing.md }}>More</Text>

        <Text style={{ color: theme.colors.muted, fontWeight: '900', letterSpacing: 1, marginBottom: 10 }}>
          SETTINGS
        </Text>

        <View style={{ gap: 10, marginBottom: theme.spacing.lg }}>
          <Row
            icon={<Feather name="bell" size={18} color={theme.colors.muted} />}
            label="Notifications"
            subtitle="Reminders and alerts."
            onPress={() => navigation.getParent()?.navigate('Notifications')}
          />
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: '900', letterSpacing: 1, marginBottom: 10 }}>
          HEALTH & ANALYSIS
        </Text>

        <View style={{ gap: 10 }}>
          <Row icon={<Feather name="mic" size={18} color={theme.colors.muted} />} label="Talk to Helfi" onPress={() => openNativeTool(NATIVE_WEB_PAGES.talkToHelfi)} />
          <Row icon={<Feather name="book-open" size={18} color={theme.colors.muted} />} label="Health Journal" onPress={() => openNativeTool(NATIVE_WEB_PAGES.healthJournal)} />
          <Row icon={<Feather name="bookmark" size={18} color={theme.colors.muted} />} label="Health Coach" onPress={() => navigation.getParent()?.navigate('SmartHealthCoach')} />
          <Row
            icon={<Feather name="check-square" size={18} color={theme.colors.muted} />}
            label="Today's Check-in"
            onPress={() => openNativeTool(NATIVE_WEB_PAGES.dailyCheckIn)}
          />
          <Row icon={<Feather name="smile" size={18} color={theme.colors.muted} />} label="Mood Tracker" onPress={() => openNativeTool(NATIVE_WEB_PAGES.moodTracker)} />
          <Row icon={<Feather name="activity" size={18} color={theme.colors.muted} />} label="Symptom Analysis" onPress={() => openNativeTool(NATIVE_WEB_PAGES.symptomAnalysis)} />
          <Row icon={<Feather name="image" size={18} color={theme.colors.muted} />} label="Medical Image Analyzer" onPress={() => openNativeTool(NATIVE_WEB_PAGES.medicalImageAnalyzer)} />
          <Row icon={<Feather name="clipboard" size={18} color={theme.colors.muted} />} label="Health Intake" onPress={() => navigation.getParent()?.navigate('HealthSetup')} />
          <Row
            icon={<Feather name="search" size={18} color={theme.colors.muted} />}
            label="Find a Practitioner"
            onPress={openPractitioners}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}
