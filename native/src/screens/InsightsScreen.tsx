import React from 'react'
import { Text, View } from 'react-native'

import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function InsightsScreen() {
  return (
    <Screen style={{ padding: theme.spacing.lg }}>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text }}>Insights</Text>
        <Text style={{ marginTop: theme.spacing.md, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
          This will show your personalized health insights once sign-in is connected.
        </Text>
      </View>
    </Screen>
  )
}

