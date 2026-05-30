import { ColorSchemeName, DynamicColorIOS, Platform } from 'react-native'

const lightColors = {
  bg: '#F7FAF9',
  card: '#FFFFFF',
  text: '#0B1B17',
  muted: '#45615B',
  border: '#D8E6E2',
  primary: '#439A45',
  primaryText: '#FFFFFF',
  danger: '#DC2626',
}

const darkColors = {
  bg: '#07130F',
  card: '#102019',
  text: '#F3FAF6',
  muted: '#A9BDB5',
  border: '#284238',
  primary: '#439A45',
  primaryText: '#FFFFFF',
  danger: '#F87171',
}

function adaptiveColor(light: string, dark: string) {
  if (Platform.OS === 'ios') {
    return DynamicColorIOS({ light, dark })
  }
  return light
}

export function getThemeColors(colorScheme: ColorSchemeName) {
  return colorScheme === 'dark' ? darkColors : lightColors
}

export const theme = {
  colors: {
    bg: adaptiveColor(lightColors.bg, darkColors.bg),
    card: adaptiveColor(lightColors.card, darkColors.card),
    text: adaptiveColor(lightColors.text, darkColors.text),
    muted: adaptiveColor(lightColors.muted, darkColors.muted),
    border: adaptiveColor(lightColors.border, darkColors.border),
    primary: lightColors.primary,
    primaryText: lightColors.primaryText,
    danger: adaptiveColor(lightColors.danger, darkColors.danger),
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  fontSize: {
    pageTitle: 24,
    heroTitle: 28,
    sectionTitle: 19,
    cardTitle: 17,
    navLabel: 10,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
  },
} as const
