import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { useAppMode } from '../state/AppModeContext'
import { AuthNavigator } from './AuthNavigator'
import { MainNavigator } from './MainNavigator'

export type RootStackParamList = {
  Auth: undefined
  Main: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const { hydrated, mode } = useAppMode()

  // Don't mount the navigator until we've loaded session state.
  // If we render a navigator with zero screens, React Navigation will crash.
  if (!hydrated) return null

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {mode === 'signedOut' ? <Stack.Screen name="Auth" component={AuthNavigator} /> : <Stack.Screen name="Main" component={MainNavigator} />}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
