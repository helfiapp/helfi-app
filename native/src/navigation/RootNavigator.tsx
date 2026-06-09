import React, { useEffect } from 'react'
import { Linking } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { useAppMode } from '../state/AppModeContext'
import { AuthNavigator } from './AuthNavigator'
import { MainNavigator } from './MainNavigator'
import { recordAffiliateClickFromUrl } from '../lib/affiliateAttribution'
import { useVoiceAssistant } from '../voice/VoiceAssistant'

export type RootStackParamList = {
  Auth: undefined
  Main: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

function parseVoiceAssistantUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    const host = url.host.toLowerCase()
    const path = url.pathname.toLowerCase()
    const isVoiceLink =
      host === 'voice' ||
      path === '/voice' ||
      path === '/native/voice' ||
      path === '/app/voice'
    if (!isVoiceLink) return null
    const transcript =
      url.searchParams.get('text') ||
      url.searchParams.get('request') ||
      url.searchParams.get('q') ||
      ''
    return {
      transcript: transcript.trim(),
      source: 'siri' as const,
      autoSubmit: transcript.trim().length > 0,
    }
  } catch {
    return null
  }
}

export function RootNavigator() {
  const { hydrated, mode, session } = useAppMode()
  const { openVoiceAssistant } = useVoiceAssistant()

  useEffect(() => {
    let active = true

    Linking.getInitialURL()
      .then((url) => {
        if (!active || !url) return
        const voiceLink = parseVoiceAssistantUrl(url)
        if (voiceLink) {
          openVoiceAssistant(voiceLink)
          return
        }
        void recordAffiliateClickFromUrl(url)
      })
      .catch(() => {})

    const sub = Linking.addEventListener('url', ({ url }) => {
      const voiceLink = parseVoiceAssistantUrl(url)
      if (voiceLink) {
        openVoiceAssistant(voiceLink)
        return
      }
      void recordAffiliateClickFromUrl(url)
    })

    return () => {
      active = false
      sub.remove()
    }
  }, [openVoiceAssistant])

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
