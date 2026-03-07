import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Feather } from '@expo/vector-icons'

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
  subtitle: string
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
        borderRadius: theme.radius.lg,
        paddingVertical: 14,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.text }}>{label}</Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: theme.colors.muted }} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={theme.colors.muted} />
    </Pressable>
  )
}

export function NotificationsScreen({ navigation }: { navigation: any }) {
  const goToInbox = () => navigation.navigate('NotificationsInbox')
  const goToReminders = () => navigation.navigate('Reminders')
  const goToAiInsights = () => navigation.navigate('NotificationsAIInsights')
  const goToQuietHours = () => navigation.navigate('NotificationsQuietHours')
  const goToAccountSecurity = () => navigation.navigate('NotificationsAccountSecurity')

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, marginBottom: 6 }}>
          Notification settings
        </Text>
        <Text style={{ color: theme.colors.muted, lineHeight: 20, marginBottom: 12 }}>
          Choose a section to manage alerts and reminder schedules.
        </Text>

        <View style={{ gap: 10 }}>
          <Row
            icon={<Feather name="inbox" size={18} color={theme.colors.muted} />}
            label="Notification inbox"
            subtitle="View alerts you might have missed."
            onPress={goToInbox}
          />
          <Row
            icon={<Feather name="clock" size={18} color={theme.colors.muted} />}
            label="Reminders"
            subtitle="Push setup plus check-in and mood reminders."
            onPress={goToReminders}
          />
          <Row
            icon={<Feather name="zap" size={18} color={theme.colors.muted} />}
            label="Smart Health Coach"
            subtitle="Paid proactive alerts based on your logs and habits."
            onPress={goToAiInsights}
          />
          <Row
            icon={<Feather name="moon" size={18} color={theme.colors.muted} />}
            label="Quiet hours"
            subtitle="Pause reminders overnight."
            onPress={goToQuietHours}
          />
          <Row
            icon={<Feather name="lock" size={18} color={theme.colors.muted} />}
            label="Account & security"
            subtitle="Login and password alerts."
            onPress={goToAccountSecurity}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}
