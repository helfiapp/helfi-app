import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { AnimatedSplashScreen } from '../screens/AnimatedSplashScreen'
import { LoginScreen } from '../screens/LoginScreen'
import { PrivacyScreen } from '../screens/PrivacyScreen'
import { SignupScreen } from '../screens/SignupScreen'
import { TermsScreen } from '../screens/TermsScreen'

export type AuthStackParamList = {
  Splash: undefined
  Login: undefined
  Signup: undefined
  Terms: undefined
  Privacy: undefined
}

const Stack = createNativeStackNavigator<AuthStackParamList>()

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={AnimatedSplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
    </Stack.Navigator>
  )
}
