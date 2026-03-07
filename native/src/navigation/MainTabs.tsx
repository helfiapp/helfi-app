import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'

import { DashboardScreen } from '../screens/DashboardScreen'
import { InsightsScreen } from '../screens/InsightsScreen'
import { MoreScreen } from '../screens/MoreScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { TrackCaloriesScreen } from '../screens/TrackCaloriesScreen'
import { theme } from '../ui/theme'

export type MainTabParamList = {
  Dashboard: undefined
  Food: undefined
  Insights: undefined
  More: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<MainTabParamList>()

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Food"
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTitleStyle: { color: theme.colors.text },
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: { fontWeight: '800' },
      }}
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
        name="Food"
        component={TrackCaloriesScreen}
        options={{
          headerShown: false,
          // Match the web app bottom nav icon (bag) more closely.
          tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" color={color} size={size} />,
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
