import React from 'react'
import { Text, View } from 'react-native'

import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function FoodScreen() {
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
        <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text }}>Food</Text>
        <Text style={{ marginTop: theme.spacing.md, color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
          This will become your Food Diary and food analysis screens.
        </Text>
      </View>
    </Screen>
  )
}

