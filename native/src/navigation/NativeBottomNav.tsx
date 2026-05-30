import React from 'react'
import { Pressable, Text, useColorScheme, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { getThemeColors, theme } from '../ui/theme'

export type NativeBottomNavKey = 'Dashboard' | 'Insights' | 'Food' | 'More' | 'Settings'

const items: Array<{
  key: NativeBottomNavKey
  label: string
  icon: (color: string) => React.ReactNode
}> = [
  {
    key: 'Dashboard',
    label: 'Dashboard',
    icon: (color) => <Feather name="grid" color={color} size={21} />,
  },
  {
    key: 'Insights',
    label: 'Insights',
    icon: (color) => <MaterialCommunityIcons name="lightbulb-outline" color={color} size={23} />,
  },
  {
    key: 'Food',
    label: 'Food',
    icon: (color) => <Feather name="shopping-bag" color={color} size={21} />,
  },
  {
    key: 'More',
    label: 'More',
    icon: (color) => <Feather name="more-vertical" color={color} size={21} />,
  },
  {
    key: 'Settings',
    label: 'Settings',
    icon: (color) => <Feather name="settings" color={color} size={21} />,
  },
]

export function NativeBottomNav({ active }: { active?: NativeBottomNavKey }) {
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const colors = getThemeColors(useColorScheme())

  const goToTab = (screen: NativeBottomNavKey) => {
    navigation.navigate('Tabs', { screen })
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.card,
        paddingTop: 4,
        paddingBottom: Math.max(insets.bottom - 8, 4),
        paddingHorizontal: 16,
      }}
    >
      {items.map((item) => {
        const isActive = active === item.key
        const color = isActive ? colors.primary : colors.muted

        return (
          <Pressable
            key={item.key}
            onPress={() => goToTab(item.key)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 4,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            {item.icon(color)}
            <Text
              numberOfLines={1}
              style={{
                marginTop: 2,
                color,
                fontSize: theme.fontSize.navLabel,
                fontWeight: isActive ? '900' : '700',
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
