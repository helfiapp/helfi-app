import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { enableScreens } from 'react-native-screens'

import { AppModeProvider } from './src/state/AppModeContext'
import { RootNavigator } from './src/navigation/RootNavigator'

enableScreens(true)

export default function App() {
  return (
    <SafeAreaProvider>
      <AppModeProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </AppModeProvider>
    </SafeAreaProvider>
  )
}
