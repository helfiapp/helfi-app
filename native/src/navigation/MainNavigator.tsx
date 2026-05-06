import React from 'react'
import { View } from 'react-native'
import type { NavigatorScreenParams } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { MainTabs } from './MainTabs'
import type { MainTabParamList } from './MainTabs'
import { NativeBottomNav } from './NativeBottomNav'
import type { NativeBottomNavKey } from './NativeBottomNav'
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
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined
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

function withBottomNav<P extends object>(
  Component: React.ComponentType<P>,
  active?: NativeBottomNavKey
) {
  return function ScreenWithBottomNav(props: P) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Component {...props} />
        </View>
        <NativeBottomNav active={active} />
      </View>
    )
  }
}

const ProfileWithBottomNav = withBottomNav(ProfileScreen, 'More')
const ProfilePhotoWithBottomNav = withBottomNav(ProfilePhotoScreen, 'More')
const AccountSettingsWithBottomNav = withBottomNav(AccountSettingsScreen, 'Settings')
const BillingWithBottomNav = withBottomNav(BillingScreen, 'Settings')
const NotificationsWithBottomNav = withBottomNav(NotificationsScreen, 'Settings')
const NotificationInboxWithBottomNav = withBottomNav(NotificationInboxScreen, 'Settings')
const NotificationsAiInsightsWithBottomNav = withBottomNav(NotificationsAiInsightsScreen, 'Settings')
const SmartHealthCoachWithBottomNav = withBottomNav(SmartHealthCoachScreen, 'Insights')
const NotificationsQuietHoursWithBottomNav = withBottomNav(NotificationsQuietHoursScreen, 'Settings')
const NotificationsAccountSecurityWithBottomNav = withBottomNav(NotificationsAccountSecurityScreen, 'Settings')
const PrivacySettingsWithBottomNav = withBottomNav(PrivacySettingsScreen, 'Settings')
const SupportWithBottomNav = withBottomNav(SupportScreen, 'More')
const HealthSetupWithBottomNav = withBottomNav(HealthSetupScreen, 'More')
const RemindersWithBottomNav = withBottomNav(RemindersScreen, 'Settings')
const DailyCheckInWithBottomNav = withBottomNav(DailyCheckInScreen, 'More')
const MoodTrackerWithBottomNav = withBottomNav(MoodTrackerScreen, 'More')
const TrackCaloriesWithBottomNav = withBottomNav(TrackCaloriesScreen, 'Food')
const AddIngredientWithBottomNav = withBottomNav(AddIngredientScreen, 'Food')
const WaterIntakeWithBottomNav = withBottomNav(WaterIntakeScreen, 'Food')
const FoodDiarySettingsWithBottomNav = withBottomNav(FoodDiarySettingsScreen, 'Settings')

function activeTabForNativeWebPath(path: string): NativeBottomNavKey {
  if (path === '/dashboard') return 'Dashboard'
  if (path.startsWith('/insights')) return 'Insights'
  if (path.startsWith('/food')) return 'Food'
  if (path.startsWith('/settings') || path.startsWith('/notifications')) return 'Settings'
  return 'More'
}

function NativeWebToolWithBottomNav(props: React.ComponentProps<typeof NativeWebToolScreen>) {
  const path = String(props.route?.params?.path || '')
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <NativeWebToolScreen {...props} />
      </View>
      <NativeBottomNav active={activeTabForNativeWebPath(path)} />
    </View>
  )
}

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileWithBottomNav} options={{ title: 'Profile', headerTitleAlign: 'center', headerBackTitle: '' }} />
      <Stack.Screen
        name="AccountSettings"
        component={AccountSettingsWithBottomNav}
        options={{ title: 'Account Settings', headerTitleAlign: 'center', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="ProfilePhoto"
        component={ProfilePhotoWithBottomNav}
        options={{ title: 'Profile Picture', headerTitleAlign: 'center', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="Billing"
        component={BillingWithBottomNav}
        options={{
          title: 'Subscription & Billing',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsWithBottomNav}
        options={{
          title: 'Notifications',
          headerTitleAlign: 'center',
          // Avoid showing "< Tabs" in the back button on iPhone.
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsInbox"
        component={NotificationInboxWithBottomNav}
        options={{
          title: 'Notifications',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsAIInsights"
        component={NotificationsAiInsightsWithBottomNav}
        options={{
          title: 'Smart Health Coach',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="SmartHealthCoach"
        component={SmartHealthCoachWithBottomNav}
        options={{
          title: 'Smart Health Coach',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsQuietHours"
        component={NotificationsQuietHoursWithBottomNav}
        options={{
          title: 'Quiet hours',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="NotificationsAccountSecurity"
        component={NotificationsAccountSecurityWithBottomNav}
        options={{
          title: 'Account & security',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="PrivacySettings"
        component={PrivacySettingsWithBottomNav}
        options={{
          title: 'Privacy Settings',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="Support"
        component={SupportWithBottomNav}
        options={{
          title: 'Help & Support',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen name="HealthSetup" component={HealthSetupWithBottomNav} options={{ title: 'Health Intake' }} />
      <Stack.Screen
        name="Reminders"
        component={RemindersWithBottomNav}
        options={{
          title: 'Reminders',
          headerTitleAlign: 'center',
          // Avoid showing "< Tabs" in the back button on iPhone.
          headerBackTitle: '',
        }}
      />
      <Stack.Screen name="DailyCheckIn" component={DailyCheckInWithBottomNav} options={{ title: "Today's Check-in" }} />
      <Stack.Screen name="MoodTracker" component={MoodTrackerWithBottomNav} options={{ title: 'Mood Tracker' }} />
      <Stack.Screen
        name="TrackCalories"
        component={TrackCaloriesWithBottomNav}
        options={{
          title: 'Track Calories',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="AddIngredient"
        component={AddIngredientWithBottomNav}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="FoodAnalysis"
        component={TrackCaloriesWithBottomNav}
        options={{
          title: 'Food Analysis',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="WaterIntake"
        component={WaterIntakeWithBottomNav}
        options={{
          title: 'Water Intake',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="FoodDiarySettings"
        component={FoodDiarySettingsWithBottomNav}
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
        component={NativeWebToolWithBottomNav}
        options={({ route }) => ({
          title: String(route?.params?.title || 'Page'),
          headerTitleAlign: 'center',
          headerBackTitle: '',
        })}
      />
    </Stack.Navigator>
  )
}
