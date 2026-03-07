import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'

import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type FoodTileProps = {
  title: string
  subtitle: string
  onPress: () => void
}

function FoodTile({ title, subtitle, onPress }: FoodTileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.card,
        padding: 14,
      })}
    >
      <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>{title}</Text>
      <Text style={{ marginTop: 4, color: theme.colors.muted }}>{subtitle}</Text>
    </Pressable>
  )
}

export function FoodScreen() {
  const navigation = useNavigation<any>()

  return (
    <Screen style={{ padding: 14 }}>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 14,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 30, fontWeight: '900', color: theme.colors.text }}>Food</Text>
        <Text style={{ color: theme.colors.muted }}>
          Real native food tools.
        </Text>

        <FoodTile
          title="Food Diary"
          subtitle="Log meals, edit entries, and manage daily totals."
          onPress={() => navigation.getParent()?.navigate('TrackCalories')}
        />
        <FoodTile
          title="Food Analysis"
          subtitle="Open the same main Food Diary experience."
          onPress={() => navigation.getParent()?.navigate('FoodAnalysis')}
        />
        <FoodTile
          title="Water Intake"
          subtitle="Track drinks, hydration goal, and history."
          onPress={() => navigation.getParent()?.navigate('WaterIntake')}
        />
        <FoodTile
          title="Food Diary Settings"
          subtitle="Health-check prompts and threshold settings."
          onPress={() => navigation.getParent()?.navigate('FoodDiarySettings')}
        />
      </View>
    </Screen>
  )
}
