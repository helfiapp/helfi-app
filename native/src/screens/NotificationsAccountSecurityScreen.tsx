import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

function Row({
  title,
  subtitle,
  first,
}: {
  title: string
  subtitle: string
  first?: boolean
}) {
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{title}</Text>
        <Text style={{ marginTop: 2, color: theme.colors.muted, fontSize: 12 }}>{subtitle}</Text>
      </View>
      <View
        style={{
          borderRadius: 999,
          backgroundColor: '#ECFDF3',
          borderWidth: 1,
          borderColor: '#BBF7D0',
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Text style={{ color: '#15803D', fontWeight: '800', fontSize: 12 }}>On</Text>
      </View>
    </View>
  )
}

export function NotificationsAccountSecurityScreen({ navigation }: { navigation: any }) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            padding: 16,
            gap: 14,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Account alerts</Text>
            <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>
              These alerts are always on to keep your account safe.
            </Text>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              overflow: 'hidden',
            }}
          >
            <Row first title="Login alerts" subtitle="We email you when a new device signs in." />
            <Row title="Password changes" subtitle="We email you after a password update." />
            <Row title="Account updates" subtitle="We email you when key profile details change." />
          </View>

          <Pressable
            onPress={() => navigation.navigate('AccountSettings')}
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
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Manage account settings</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  )
}
