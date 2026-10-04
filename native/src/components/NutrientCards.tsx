import React, { useState } from 'react'
import { Text, View } from 'react-native'

export type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar'
export type NutrientValues = Partial<Record<NutrientKey, number | null>>

const CARDS = [
  { key: 'calories', label: 'Calories', bg: '#FFF7ED', border: '#FED7AA', color: '#F97316' },
  { key: 'protein', label: 'Protein', bg: '#EFF6FF', border: '#BFDBFE', color: '#3B82F6' },
  { key: 'carbs', label: 'Carbs', bg: '#ECFDF5', border: '#A7F3D0', color: '#22C55E' },
  { key: 'fat', label: 'Fat', bg: '#F5F3FF', border: '#DDD6FE', color: '#8B5CF6' },
  { key: 'fiber', label: 'Fibre', bg: '#FEFCE8', border: '#FDE68A', color: '#EAB308' },
  { key: 'sugar', label: 'Sugar', bg: '#FDF2F8', border: '#FBCFE8', color: '#EC4899' },
] as const

export function NutrientCards({ values, energyUnit = 'kcal' }: { values: NutrientValues; energyUnit?: 'kcal' | 'kj' }) {
  const [width, setWidth] = useState(0)
  const columns = width >= 600 ? 3 : 2
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {CARDS.map((card) => {
        const value = values[card.key]
        const known = typeof value === 'number' && Number.isFinite(value)
        const label = card.key === 'calories' && energyUnit === 'kj' ? 'Kilojoules' : card.label
        const display = !known ? '—' : card.key === 'calories'
          ? `${Math.round(value * (energyUnit === 'kj' ? 4.184 : 1))} ${energyUnit === 'kj' ? 'kJ' : 'kcal'}`
          : `${Math.round(value * 10) / 10} g`
        return (
          <View key={card.key} accessible accessibilityLabel={`${label}: ${display}`}
            style={{ width: width > 0 ? (width - (columns - 1) * 10) / columns : '47%', minHeight: 86, borderWidth: 1, borderColor: card.border, borderRadius: 16, padding: 14, backgroundColor: card.bg }}>
            <Text style={{ color: card.color, fontSize: 20, fontWeight: '700' }}>{display}</Text>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase' }}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}
