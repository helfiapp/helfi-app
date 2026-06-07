import React, { useEffect } from 'react'
import { Linking } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { useAppMode } from '../state/AppModeContext'
import { AuthNavigator } from './AuthNavigator'
import { MainNavigator } from './MainNavigator'
import { recordAffiliateClickFromUrl } from '../lib/affiliateAttribution'

export type RootStackParamList = {
  Auth: undefined
  Main: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const { hydrated, mode, session } = useAppMode()

  useEffect(() => {
    let active = true

    Linking.getInitialURL()
      .then((url) => {
        if (!active || !url) return
        void recordAffiliateClickFromUrl(url)
      })
      .catch(() => {})

    const sub = Linking.addEventListener('url', ({ url }) => {
      void recordAffiliateClickFromUrl(url)
    })

    return () => {
      active = false
      sub.remove()
    }
  }, [])

  // Don't mount the navigator until we've loaded session state.
  // If we render a navigator with zero screens, React Navigation will crash.
  if (!hydrated) return null

  return (
    <NavigationContainer key={`${mode}:${session?.user?.id || 'signed-out'}`}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {mode === 'signedOut' ? <Stack.Screen name="Auth" component={AuthNavigator} /> : <Stack.Screen name="Main" component={MainNavigator} />}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
