import React from 'react'
import { Text, TextInput, View } from 'react-native'

import { theme } from './theme'

export function HelfiTextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  keyboardType,
  textContentType,
  autoComplete,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  keyboardType?: 'default' | 'email-address'
  textContentType?: 'emailAddress' | 'password' | 'username'
  autoComplete?: 'email' | 'password' | 'username'
}) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginBottom: 8 }}>{label}</Text>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8AA39D"
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          textContentType={textContentType}
          autoComplete={autoComplete}
          style={{ fontSize: 16, color: theme.colors.text }}
        />
      </View>
    </View>
  )
}

