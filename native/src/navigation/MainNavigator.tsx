import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { MainTabs } from './MainTabs'
import { DailyCheckInScreen } from '../screens/DailyCheckInScreen'
import { HealthSetupScreen } from '../screens/HealthSetupScreen'
import { MoodTrackerScreen } from '../screens/MoodTrackerScreen'
import { RemindersScreen } from '../screens/RemindersScreen'
import { NotificationsScreen } from '../screens/NotificationsScreen'
import { NotificationInboxScreen } from '../screens/NotificationInboxScreen'
import { NotificationsAiInsightsScreen } from '../screens/NotificationsAiInsightsScreen'
import { NotificationsQuietHoursScreen } from '../screens/NotificationsQuietHoursScreen'
import { NotificationsAccountSecurityScreen } from '../screens/NotificationsAccountSecurityScreen'
import { SmartHealthCoachScreen } from '../screens/SmartHealthCoachScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { ProfilePhotoScreen } from '../screens/ProfilePhotoScreen'
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen'
import { BillingScreen } from '../screens/BillingScreen'
import { SupportScreen } from '../screens/SupportScreen'
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen'
import { PrivacyScreen } from '../screens/PrivacyScreen'
import { TermsScreen } from '../screens/TermsScreen'
import { LoginScreen } from '../screens/LoginScreen'
import { SignupScreen } from '../screens/SignupScreen'
import { TrackCaloriesScreen } from '../screens/TrackCaloriesScreen'
import { AddIngredientScreen } from '../screens/AddIngredientScreen'
import { WaterIntakeScreen } from '../screens/WaterIntakeScreen'
import { FoodDiarySettingsScreen } from '../screens/FoodDiarySettingsScreen'
import { PractitionerDirectoryScreen } from '../screens/PractitionerDirectoryScreen'
import { PractitionerAZScreen } from '../screens/PractitionerAZScreen'
import { PractitionerProfileScreen } from '../screens/PractitionerProfileScreen'
import { ListYourPracticeScreen } from '../screens/ListYourPracticeScreen'
import { ListYourPracticeStartScreen } from '../screens/ListYourPracticeStartScreen'
import { NativeWebToolScreen } from '../screens/NativeWebToolScreen'

export type MainStackParamList = {
  Tabs: undefined
  Profile: undefined
  ProfilePhoto: undefined
  AccountSettings: undefined
  Billing: undefined
  Notifications: undefined
  NotificationsInbox: undefined
  NotificationsAIInsights: undefined
  SmartHealthCoach: { tab?: 'today' | 'history' } | undefined
  NotificationsQuietHours: undefined
  NotificationsAccountSecurity: undefined
  PrivacySettings: undefined
  Support: undefined
  HealthSetup: undefined
  Reminders: { focus?: 'checkin' | 'mood'; returnToMoodTracker?: boolean } | undefined
  DailyCheckIn: undefined
  MoodTracker: undefined
  TrackCalories: undefined
  AddIngredient:
    | {
        meal?: string
        date?: string
      }
    | undefined
  FoodAnalysis: undefined
  WaterIntake: undefined
  FoodDiarySettings: undefined
  Login:
    | {
        accountType?: 'practitioner' | 'user'
        signupRouteName?: string
      }
    | undefined
  Signup:
    | {
        accountType?: 'practitioner' | 'user'
        loginRouteName?: string
      }
    | undefined
  Terms: undefined
  Privacy: undefined
  Practitioners: { categoryId?: string; subcategoryId?: string; q?: string } | undefined
  PractitionerAZ: undefined
  PractitionerProfile: { slug: string; name?: string }
  ListYourPractice: undefined
  ListYourPracticeStart: undefined
  NativeWebTool: { title?: string; path: string }
}

const Stack = createNativeStackNavigator<MainStackParamList>()

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile', headerTitleAlign: 'center', headerBackTitle: '' }} />
      <Stack.Screen
        name="AccountSettings"
        component={AccountSettingsScreen}
        options={{ title: 'Account Settings', headerTitleAlign: 'center', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="ProfilePhoto"
        component={ProfilePhotoScreen}
        options={{ title: 'Profile Picture', headerTitleAlign: 'center', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="Billing"
        component={BillingScreen}
        options={{
          title: 'Subscription & Billing',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Notifications',
          headerTitleAlign: 'center',
          // Avoid showing "< Tabs" in the back button on iPhone.
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsInbox"
        component={NotificationInboxScreen}
        options={{
          title: 'Notifications',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsAIInsights"
        component={NotificationsAiInsightsScreen}
        options={{
          title: 'Smart Health Coach',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="SmartHealthCoach"
        component={SmartHealthCoachScreen}
        options={{
          title: 'Smart Health Coach',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsQuietHours"
        component={NotificationsQuietHoursScreen}
        options={{
          title: 'Quiet hours',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsAccountSecurity"
        component={NotificationsAccountSecurityScreen}
        options={{
          title: 'Account & security',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="PrivacySettings"
        component={PrivacySettingsScreen}
        options={{
          title: 'Privacy Settings',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{
          title: 'Help & Support',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen name="HealthSetup" component={HealthSetupScreen} options={{ title: 'Health Intake' }} />
      <Stack.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{
          title: 'Reminders',
          headerTitleAlign: 'center',
          // Avoid showing "< Tabs" in the back button on iPhone.
          headerBackTitle: '',
        }}
      />
      <Stack.Screen name="DailyCheckIn" component={DailyCheckInScreen} options={{ title: "Today's Check-in" }} />
      <Stack.Screen name="MoodTracker" component={MoodTrackerScreen} options={{ title: 'Mood Tracker' }} />
      <Stack.Screen
        name="TrackCalories"
        component={TrackCaloriesScreen}
        options={{
          title: 'Track Calories',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="AddIngredient"
        component={AddIngredientScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="FoodAnalysis"
        component={TrackCaloriesScreen}
        options={{
          title: 'Food Analysis',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="WaterIntake"
        component={WaterIntakeScreen}
        options={{
          title: 'Water Intake',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="FoodDiarySettings"
        component={FoodDiarySettingsScreen}
        options={{
          title: 'Food Diary',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Signup"
        component={SignupScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Privacy"
        component={PrivacyScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Practitioners"
        component={PractitionerDirectoryScreen}
        options={{
          title: 'Find a Practitioner',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="PractitionerAZ"
        component={PractitionerAZScreen}
        options={{
          title: 'Categories A-Z',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="PractitionerProfile"
        component={PractitionerProfileScreen}
        options={({ route }) => ({
          title: String(route?.params?.name || 'Practitioner'),
          headerTitleAlign: 'center',
          headerBackTitle: '',
        })}
      />
      <Stack.Screen
        name="ListYourPractice"
        component={ListYourPracticeScreen}
        options={{
          title: 'List your practice',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="ListYourPracticeStart"
        component={ListYourPracticeStartScreen}
        options={{
          title: 'Start your listing',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NativeWebTool"
        component={NativeWebToolScreen}
        options={({ route }) => ({
          title: String(route?.params?.title || 'Page'),
          headerTitleAlign: 'center',
          headerBackTitle: '',
        })}
      />
    </Stack.Navigator>
  )
}
