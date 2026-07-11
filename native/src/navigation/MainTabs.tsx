import React, { useEffect } from 'react'
import { DeviceEventEmitter, useColorScheme, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'

import { DashboardScreen } from '../screens/DashboardScreen'
import { InsightsScreen } from '../screens/InsightsScreen'
import { MoreScreen } from '../screens/MoreScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { TrackCaloriesScreen } from '../screens/TrackCaloriesScreen'
import { getThemeColors, theme } from '../ui/theme'
import { VoiceAssistantIconButton } from '../voice/VoiceAssistantIconButton'
import type { VoiceAssistantLaunchContext } from '../voice/VoiceAssistant'

export type MainTabParamList = {
  Dashboard: undefined
  Insights: undefined
  Food:
    | {
        voiceAction?: string
        voiceMeal?: string
        voiceRecipeDraft?: any
        voiceActionNonce?: number
      }
    | undefined
  More: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<MainTabParamList>()
const LAST_NATIVE_TAB_KEY = 'helfi:lastNativeTab'

function voiceContextForTab(routeName: string): VoiceAssistantLaunchContext {
  if (routeName === 'Dashboard') return { section: 'dashboard', title: 'Dashboard' }
  if (routeName === 'Insights') return { section: 'insights', title: 'Insights' }
  if (routeName === 'Food') return { section: 'food', title: 'Food Diary', meal: 'breakfast' }
  if (routeName === 'More') return { section: 'more', title: 'More' }
  if (routeName === 'Settings') return { section: 'settings', title: 'Settings' }
  return { section: 'generic', title: 'Helfi' }
}

export function MainTabs({ navigation }: { navigation: any }) {
  const colors = getThemeColors(useColorScheme())

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('helfi:navigate-native-web-tool', (payload?: any) => {
      const path = typeof payload?.path === 'string' ? payload.path : ''
      const target = payload?.nativeTarget && typeof payload.nativeTarget === 'object' ? payload.nativeTarget : null
      if (target?.type === 'tab' && typeof target.tab === 'string') {
        navigation.navigate('Tabs', { screen: target.tab })
        return
      }
      if (target?.type === 'stack' && typeof target.route === 'string') {
        navigation.navigate(target.route, target.params || undefined)
        return
      }
      if (target?.type === 'foodAction' && typeof target.action === 'string') {
        const meal = typeof target.meal === 'string' ? target.meal : 'breakfast'
        navigation.navigate('Tabs', {
          screen: 'Food',
          params: {
            voiceAction: target.action,
            voiceMeal: meal,
            voiceRecipeDraft: target.recipeDraft || null,
            voiceActionNonce: Date.now(),
          },
        })
        const emitFoodAction = () => {
          DeviceEventEmitter.emit('helfi:food-voice-action', {
            action: target.action,
            meal,
            recipeDraft: target.recipeDraft || null,
          })
        }
        setTimeout(emitFoodAction, 350)
        setTimeout(emitFoodAction, 900)
        return
      }
      if (!path.startsWith('/')) return
      navigation.navigate('NativeWebTool', {
        title: typeof payload?.title === 'string' ? payload.title : 'Helfi',
        path,
      })
    })
    return () => sub.remove()
  }, [navigation])

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenListeners={({ route }) => ({
        focus: () => {
          void AsyncStorage.setItem(LAST_NATIVE_TAB_KEY, route.name)
        },
      })}
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text },
        headerLeft: () => (
          <View style={{ marginLeft: 12 }}>
            <VoiceAssistantIconButton size={36} iconSize={18} context={voiceContextForTab(route.name)} />
          </View>
        ),
        headerTitleAlign: 'center',
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingHorizontal: 14,
          paddingTop: 2,
          paddingBottom: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: '600', fontSize: theme.fontSize.navLabel },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Feather name="grid" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="lightbulb-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Food"
        component={TrackCaloriesScreen}
        options={{
          headerShown: false,
          // Match the web app bottom nav icon (bag) more closely.
          tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="more-vertical" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="settings" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  )
}
