import React, { useEffect } from 'react'
import { Platform, SafeAreaView, StatusBar, StyleSheet, StyleProp, ViewStyle, useColorScheme } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { SafeAreaView as AndroidSafeAreaView } from 'react-native-safe-area-context'

import { theme } from './theme'

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const isFocused = useIsFocused()
  const colorScheme = useColorScheme()
  const background = StyleSheet.flatten([{ backgroundColor: theme.colors.bg }, style]).backgroundColor
  const rgb = typeof background === 'string' ? /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(background) : null
  const isDarkBackground = rgb
    ? (parseInt(rgb[1], 16) * 299 + parseInt(rgb[2], 16) * 587 + parseInt(rgb[3], 16) * 114) / 1000 < 128
    : colorScheme === 'dark'

  useEffect(() => {
    if (Platform.OS !== 'android' || !isFocused) return
    // Run after the app's automatic status-bar update, using the visible screen
    // background rather than the system scheme for screens with a fixed colour.
    const frame = requestAnimationFrame(() => {
      StatusBar.setBarStyle(isDarkBackground ? 'light-content' : 'dark-content', true)
    })
    return () => cancelAnimationFrame(frame)
  }, [isFocused, isDarkBackground, colorScheme])

  if (Platform.OS === 'android') {
    return (
      <AndroidSafeAreaView
        edges={['top', 'left', 'right']}
        style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]}
      >
        {children}
      </AndroidSafeAreaView>
    )
  }

  return (
    <SafeAreaView
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors.bg,
        },
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  )
}
