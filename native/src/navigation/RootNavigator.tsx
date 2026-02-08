import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { useAppMode } from '../state/AppModeContext'
import { AuthNavigator } from './AuthNavigator'
import { MainTabs } from './MainTabs'

export type RootStackParamList = {
  Auth: undefined
  Main: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const { mode } = useAppMode()

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {mode === 'signedOut' ? <Stack.Screen name="Auth" component={AuthNavigator} /> : <Stack.Screen name="Main" component={MainTabs} />}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
