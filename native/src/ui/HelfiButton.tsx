import React from 'react'
import { Pressable, Text, ViewStyle } from 'react-native'

import { theme } from './theme'

type Variant = 'primary' | 'secondary'

export function HelfiButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  style?: ViewStyle
}) {
  const isPrimary = variant === 'primary'
  const bg = isPrimary ? theme.colors.primary : theme.colors.card
  const fg = isPrimary ? theme.colors.primaryText : theme.colors.text
  const borderWidth = isPrimary ? 0 : 1
  const borderColor = isPrimary ? 'transparent' : theme.colors.border

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: theme.radius.md,
          backgroundColor: bg,
          borderWidth,
          borderColor,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  )
}

