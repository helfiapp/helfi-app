import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const AI_DATA_SHARING_PERMISSION_KEY = 'helfi_ai_data_sharing_permission_v1'

export async function hasAiDataSharingPermission() {
  try {
    return (await AsyncStorage.getItem(AI_DATA_SHARING_PERMISSION_KEY)) === 'granted'
  } catch {
    return false
  }
}

export async function grantAiDataSharingPermission() {
  try {
    await AsyncStorage.setItem(AI_DATA_SHARING_PERMISSION_KEY, 'granted')
  } catch {
    // Keep going if local storage fails; the user's tap still counts for this session.
  }
}

export async function requestAiDataSharingPermission() {
  if (await hasAiDataSharingPermission()) return true

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Allow AI help?',
      'To use AI features, Helfi may send what you choose to share, such as typed text, voice audio, photos, notes, food logs, health profile details, or lab report text, to OpenAI, LLC. OpenAI processes it so Helfi can create your AI response. You can say no and still use non-AI tracking like food, water, mood, and device logs.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'I agree',
          onPress: () => {
            grantAiDataSharingPermission()
              .then(() => resolve(true))
              .catch(() => resolve(true))
          },
        },
      ],
    )
  })
}
