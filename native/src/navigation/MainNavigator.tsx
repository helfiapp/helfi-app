import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NavigatorScreenParams } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Feather } from '@expo/vector-icons'

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
import { DevicesScreen } from '../screens/DevicesScreen'
import { HelpScreen } from '../screens/HelpScreen'
import { HealthJournalScreen } from '../screens/HealthJournalScreen'
import { HealthImageNotesScreen } from '../screens/HealthImageNotesScreen'
import { SymptomNotesScreen } from '../screens/SymptomNotesScreen'
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
import { InsightIssueScreen } from '../screens/InsightIssueScreen'
import { VoiceAssistantIconButton } from '../voice/VoiceAssistantIconButton'
import type { VoiceAssistantLaunchContext } from '../voice/VoiceAssistant'
import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { theme } from '../ui/theme'

export type MainStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined
  Profile: undefined
  ProfilePhoto: undefined
  AccountSettings: undefined
  Billing: undefined
  Devices: undefined
  Help: { activeTab?: NativeBottomNavKey } | undefined
  HealthJournal:
    | {
        initialTab?: 'entry' | 'history'
        selectedDate?: string
        voiceActionNonce?: number
      }
    | undefined
  HealthImageNotes: undefined
  SymptomNotes:
    | {
        voiceAction?: 'prefill'
        voiceActionNonce?: number
        voiceSymptoms?: string[]
        voiceDuration?: string
        voiceNotes?: string
      }
    | undefined
  Notifications: undefined
  NotificationsInbox: undefined
  NotificationsAIInsights: undefined
  SmartHealthCoach: { tab?: 'today' | 'history'; activeTab?: NativeBottomNavKey } | undefined
  NotificationsQuietHours: undefined
  NotificationsAccountSecurity: undefined
  PrivacySettings: undefined
  Support: undefined
  HealthSetup: undefined
  Reminders: { focus?: 'checkin' | 'mood'; returnToMoodTracker?: boolean } | undefined
  DailyCheckIn: { tab?: 'today' | 'history' } | undefined
  MoodTracker: { tab?: 'checkin' | 'history' | 'journal' } | undefined
  TrackCalories:
    | {
        voiceAction?: string
        voiceMeal?: string
        voiceRecipeDraft?: any
        voiceActionNonce?: number
      }
    | undefined
  AddIngredient:
    | {
        meal?: string
        date?: string
        creditsRemaining?: number | null
        creditsPercentUsed?: number | null
      }
    | undefined
  FoodAnalysis: undefined
  WaterIntake:
    | {
        meal?: string
        date?: string
      }
    | undefined
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
  InsightIssue: { issue: any }
}

const Stack = createNativeStackNavigator<MainStackParamList>()
const LAST_NATIVE_TAB_KEY = 'helfi:lastNativeTab'
const SAFE_NATIVE_TABS = new Set<keyof MainTabParamList>(['Dashboard', 'Insights', 'Food', 'More', 'Settings'])

function HeaderBackButton({ navigation }: { navigation: any }) {
  if (!navigation.canGoBack?.()) return null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => navigation.goBack()}
      hitSlop={10}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingRight: 8,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Feather name="chevron-left" size={25} color="#111827" />
      <Text style={{ color: '#111827', fontSize: 16, fontWeight: '700' }}>Back</Text>
    </Pressable>
  )
}

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
const DevicesWithBottomNav = withBottomNav(DevicesScreen, 'More')
const HealthJournalWithBottomNav = withBottomNav(HealthJournalScreen, 'More')
const HealthImageNotesWithBottomNav = withBottomNav(HealthImageNotesScreen, 'More')
const SymptomNotesWithBottomNav = withBottomNav(SymptomNotesScreen, 'More')
function HelpWithBottomNav(props: React.ComponentProps<typeof HelpScreen>) {
  const active = props.route?.params?.activeTab || 'More'
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <HelpScreen {...props} />
      </View>
      <NativeBottomNav active={active} />
    </View>
  )
}
const NotificationsWithBottomNav = withBottomNav(NotificationsScreen, 'Settings')
const NotificationInboxWithBottomNav = withBottomNav(NotificationInboxScreen, 'Settings')
const NotificationsAiInsightsWithBottomNav = withBottomNav(NotificationsAiInsightsScreen, 'Settings')
function SmartHealthCoachWithBottomNav(props: React.ComponentProps<typeof SmartHealthCoachScreen>) {
  const active = props.route?.params?.activeTab || 'Insights'
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <SmartHealthCoachScreen {...props} />
      </View>
      <NativeBottomNav active={active} />
    </View>
  )
}
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
const InsightIssueWithBottomNav = withBottomNav(InsightIssueScreen, 'Insights')

function activeTabForNativeWebPath(path: string): NativeBottomNavKey {
  if (path === '/dashboard') return 'Dashboard'
  if (path.startsWith('/insights')) return 'Insights'
  if (path.startsWith('/food')) return 'Food'
  if (path.startsWith('/settings') || path.startsWith('/notifications')) return 'Settings'
  return 'More'
}

function voiceContextForStackRoute(routeName: string, params?: any): VoiceAssistantLaunchContext {
  if (routeName === 'Profile' || routeName === 'ProfilePhoto' || routeName === 'AccountSettings') return { section: 'profile', title: 'Profile' }
  if (routeName === 'Billing') return { section: 'billing', title: 'Billing' }
  if (routeName === 'Devices') return { section: 'devices', title: 'Devices' }
  if (routeName === 'Help' || routeName === 'Support') return { section: 'support', title: 'Help & Support' }
  if (routeName === 'HealthJournal') return { section: 'journal', title: 'Health Journal' }
  if (routeName === 'SymptomNotes') return { section: 'symptoms', title: 'Symptom Notes' }
  if (routeName === 'HealthImageNotes') return { section: 'health-image', title: 'Health Image Notes', mode: 'health-image' }
  if (routeName === 'Notifications' || routeName.startsWith('Notifications') || routeName === 'Reminders') return { section: 'settings', title: 'Notifications' }
  if (routeName === 'SmartHealthCoach') return { section: 'health-coach', title: 'Health Coach' }
  if (routeName === 'PrivacySettings') return { section: 'settings', title: 'Privacy Settings' }
  if (routeName === 'HealthSetup') return { section: 'health-intake', title: 'Health Intake' }
  if (routeName === 'DailyCheckIn') return { section: 'check-in', title: "Today's Check-in" }
  if (routeName === 'MoodTracker') return { section: 'mood', title: 'Mood Tracker' }
  if (routeName === 'TrackCalories' || routeName === 'AddIngredient' || routeName === 'FoodAnalysis' || routeName === 'FoodDiarySettings') {
    return { section: 'food', title: 'Food Diary', meal: typeof params?.meal === 'string' ? params.meal : 'breakfast' }
  }
  if (routeName === 'WaterIntake') return { section: 'water', title: 'Water Intake' }
  if (routeName === 'Practitioners' || routeName === 'PractitionerAZ' || routeName === 'PractitionerProfile' || routeName === 'ListYourPractice' || routeName === 'ListYourPracticeStart') {
    return { section: 'practitioner', title: 'Practitioners' }
  }
  if (routeName === 'NativeWebTool') {
    const path = String(params?.path || '')
    if (path.startsWith('/food')) return { section: 'food', title: 'Food Diary', meal: 'breakfast' }
    if (path.startsWith('/insights')) return { section: 'insights', title: 'Insights' }
    if (path.startsWith('/medical-images')) return { section: 'health-image', title: 'Health Image Notes', mode: 'health-image' }
    if (path.startsWith('/symptoms')) return { section: 'symptoms', title: 'Symptom Notes' }
    if (path.startsWith('/health-journal')) return { section: 'journal', title: 'Health Journal' }
    if (path.startsWith('/onboarding')) return { section: 'health-intake', title: 'Health Intake' }
    if (path.startsWith('/billing')) return { section: 'billing', title: 'Billing' }
    if (path.startsWith('/settings') || path.startsWith('/notifications')) return { section: 'settings', title: 'Settings' }
    return { section: 'more', title: String(params?.title || 'Helfi') }
  }
  return { section: 'generic', title: 'Helfi' }
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
  const { session } = useAppMode()
  const [startRoute, setStartRoute] = useState<'Tabs' | 'HealthSetup' | null>(null)
  const [initialTab, setInitialTab] = useState<keyof MainTabParamList>('Dashboard')

  useEffect(() => {
    let cancelled = false
    const resolveStart = async () => {
      const savedTab = await AsyncStorage.getItem(LAST_NATIVE_TAB_KEY).catch(() => null)
      if (savedTab && SAFE_NATIVE_TABS.has(savedTab as keyof MainTabParamList) && !cancelled) {
        setInitialTab(savedTab as keyof MainTabParamList)
      }

      if (!session?.token) {
        if (!cancelled) setStartRoute('Tabs')
        return
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/health-setup-status`, {
          headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
        })
        const data: any = await res.json().catch(() => ({}))
        if (!cancelled) setStartRoute(res.ok && data?.complete !== true ? 'HealthSetup' : 'Tabs')
      } catch {
        if (!cancelled) setStartRoute('Tabs')
      }
    }
    void resolveStart()
    return () => {
      cancelled = true
    }
  }, [session?.token])

  if (!startRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <Stack.Navigator
      initialRouteName={startRoute}
      screenOptions={({ navigation, route }) => ({
        headerBackVisible: false,
        headerLeft: () => <HeaderBackButton navigation={navigation} />,
        headerRight: () => (
          <VoiceAssistantIconButton size={36} iconSize={18} context={voiceContextForStackRoute(route.name, route.params)} />
        ),
      })}
    >
      <Stack.Screen
        name="Tabs"
        component={MainTabs}
        initialParams={{ screen: initialTab }}
        options={{ headerShown: false }}
      />
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
        name="Devices"
        component={DevicesWithBottomNav}
        options={{
          title: 'Devices',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="Help"
        component={HelpWithBottomNav}
        options={{
          title: 'Help & Support',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="HealthJournal"
        component={HealthJournalWithBottomNav}
        options={{
          title: 'Health Journal',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="SymptomNotes"
        component={SymptomNotesWithBottomNav}
        options={{
          title: 'Symptom Notes',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="HealthImageNotes"
        component={HealthImageNotesWithBottomNav}
        options={{
          title: 'Health Image Notes',
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
          title: 'Health Coach',
          headerTitleAlign: 'center',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="SmartHealthCoach"
        component={SmartHealthCoachWithBottomNav}
        options={{
          title: 'Health Coach',
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
          title: 'Food Photo Notes',
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
        name="InsightIssue"
        component={InsightIssueWithBottomNav}
        options={{ title: 'Insight', headerTitleAlign: 'center', headerBackTitle: '' }}
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
