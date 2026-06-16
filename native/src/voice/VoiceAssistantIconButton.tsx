import React from 'react'
import { Pressable, StyleProp, ViewStyle } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import { theme } from '../ui/theme'
import { useVoiceAssistant } from './VoiceAssistant'

export function VoiceAssistantIconButton({
  size = 42,
  iconSize = 21,
  style,
  onPress,
}: {
  size?: number
  iconSize?: number
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}) {
  const { openVoiceAssistant } = useVoiceAssistant()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Talk to Helfi"
      onPress={onPress || (() => openVoiceAssistant({ source: 'button' }))}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.82 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="microphone" size={iconSize} color="#FFFFFF" />
    </Pressable>
  )
}
