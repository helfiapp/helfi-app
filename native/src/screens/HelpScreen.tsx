import React from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type HelpCardProps = {
  icon: keyof typeof Feather.glyphMap
  title: string
  body: string
  actionLabel: string
  primary?: boolean
  onPress: () => void
}

function HelpCard({ icon, title, body, actionLabel, primary = false, onPress }: HelpCardProps) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 210,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.card,
        padding: 16,
        gap: 10,
      }}
    >
      <Feather name={icon} size={22} color={primary ? theme.colors.primary : theme.colors.muted} />
      <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>{title}</Text>
      <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>{body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        onPress={onPress}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          borderRadius: theme.radius.md,
          paddingHorizontal: 14,
          paddingVertical: 10,
          opacity: pressed ? 0.88 : 1,
          backgroundColor: primary ? theme.colors.primary : '#F3F4F6',
        })}
      >
        <Text style={{ color: primary ? '#FFFFFF' : theme.colors.text, fontWeight: '800' }}>{actionLabel}</Text>
      </Pressable>
    </View>
  )
}

export function HelpScreen({ navigation }: { navigation: any; route?: any }) {
  const { width } = useWindowDimensions()
  const isWide = width >= 720

  const goToStackScreen = (screen: string, params?: any) => {
    if (navigation.navigate) {
      navigation.navigate(screen, params)
      return
    }
    navigation.getParent?.()?.navigate?.(screen, params)
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: theme.spacing.xl }}>
        <View
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 760,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.card,
            padding: 18,
            gap: 16,
          }}
        >
          <View>
            <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>How can we help you?</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 6 }}>Get help with your health journey</Text>
          </View>

          <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>
            <HelpCard
              icon="message-circle"
              title="Contact Support"
              body="Get personalized help from our team"
              actionLabel="Contact Us"
              primary
              onPress={() => goToStackScreen('Support')}
            />
            <HelpCard
              icon="help-circle"
              title="FAQ"
              body="Find answers to common questions"
              actionLabel="View FAQ"
              onPress={() => goToStackScreen('NativeWebTool', NATIVE_WEB_PAGES.faq)}
            />
            <HelpCard
              icon="share-2"
              title="Affiliate Program"
              body="Apply, read terms, or open your portal"
              actionLabel="Affiliate Help"
              onPress={() => goToStackScreen('NativeWebTool', NATIVE_WEB_PAGES.affiliateApply)}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}
