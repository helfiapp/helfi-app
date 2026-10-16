import React from 'react'
import { Pressable, StyleProp, ViewStyle } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import { theme } from '../ui/theme'
import { useVoiceAssistant, type VoiceAssistantLaunchContext } from './VoiceAssistant'

export function VoiceAssistantIconButton({
  size = 42,
  iconSize = 21,
  style,
  onPress,
  context,
}: {
  size?: number
  iconSize?: number
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  context?: VoiceAssistantLaunchContext
}) {
  const { openVoiceAssistant } = useVoiceAssistant()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Talk to Helfi"
      accessibilityHint="Tap to start voice. Touch and hold to read your recent conversation or type a message without starting the microphone."
      accessibilityActions={[{ name: 'conversation', label: 'Read recent conversation or type a message' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'conversation') openVoiceAssistant({ source: 'button', context, mode: 'conversation' })
      }}
      onLongPress={() => openVoiceAssistant({ source: 'button', context, mode: 'conversation' })}
      onPress={onPress || (() => openVoiceAssistant({ source: 'button', context }))}
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
