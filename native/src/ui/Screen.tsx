import React from 'react'
import { SafeAreaView, StyleProp, ViewStyle } from 'react-native'

import { theme } from './theme'

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
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
