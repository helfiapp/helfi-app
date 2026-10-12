import { StatusBar } from 'expo-status-bar'
import { LogBox } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { enableScreens } from 'react-native-screens'

import { AppModeProvider } from './src/state/AppModeContext'
import { RootNavigator } from './src/navigation/RootNavigator'
import { VoiceAssistantProvider } from './src/voice/VoiceAssistant'
import { AppleHealthSyncProvider } from './src/health/AppleHealthSyncProvider'

enableScreens(true)

if (__DEV__) {
  LogBox.ignoreAllLogs(true)
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppModeProvider>
        <AppleHealthSyncProvider>
          <VoiceAssistantProvider>
            <RootNavigator />
          </VoiceAssistantProvider>
          <StatusBar style="auto" />
        </AppleHealthSyncProvider>
      </AppModeProvider>
    </SafeAreaProvider>
  )
}
