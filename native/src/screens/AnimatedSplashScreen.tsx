import AsyncStorage from '@react-native-async-storage/async-storage'
import { ResizeMode, Video } from 'expo-av'
import React, { useEffect, useRef, useState } from 'react'
import { Image, Platform, Pressable, Text, View } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { theme } from '../ui/theme'
import type { AuthStackParamList } from '../navigation/AuthNavigator'

const STORAGE_KEY = 'helfi_has_seen_splash_v1'
const WEB_AUTO_CONTINUE_MS = 900

type Props = NativeStackScreenProps<AuthStackParamList, 'Splash'>

export function AnimatedSplashScreen({ navigation }: Props) {
  const videoRef = useRef<Video | null>(null)
  const [canSkip, setCanSkip] = useState(false)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const seen = await AsyncStorage.getItem(STORAGE_KEY)
      if (!mounted) return

      // Don’t force the intro animation every time the app opens.
      if (seen === '1') {
        navigation.replace('Login')
        return
      }

      // The browser preview doesn’t reliably play the MP4.
      // Don’t trap the user on a blank screen there.
      if (Platform.OS === 'web') {
        setTimeout(() => mounted && finish(), WEB_AUTO_CONTINUE_MS)
        return
      }

      // Enable “Skip” after a short moment so the user is never trapped.
      setTimeout(() => mounted && setCanSkip(true), 800)
    })().catch(() => {
      navigation.replace('Login')
    })

    return () => {
      mounted = false
    }
  }, [navigation])

  const finish = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Even if storage fails, we still move on.
    }
    navigation.replace('Login')
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Image
        source={require('../../assets/static-splash.png')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        resizeMode="cover"
      />

      {Platform.OS !== 'web' ? (
        <Video
          ref={(v) => {
            videoRef.current = v
          }}
          source={require('../../assets/animated-splash.mp4')}
          style={{ position: 'absolute', inset: 0 }}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping={false}
          onPlaybackStatusUpdate={(status) => {
            if (!status.isLoaded) return
            if (status.didJustFinish) {
              finish()
            }
          }}
          onError={() => finish()}
        />
      ) : null}

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: theme.spacing.xl, alignItems: 'center' }}>
        {canSkip ? (
          <Pressable
            onPress={finish}
            style={({ pressed }) => ({
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.75)',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>Skip</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
