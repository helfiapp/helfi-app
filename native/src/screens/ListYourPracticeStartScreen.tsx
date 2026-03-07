import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function ListYourPracticeStartScreen({ navigation }: { navigation: any }) {
  const goToDashboard = () => {
    navigation.navigate('Tabs', { screen: 'Dashboard' })
  }

  const onCreatePractitionerAccount = () => {
    navigation.navigate('Signup', {
      accountType: 'practitioner',
      loginRouteName: 'ListYourPracticeStart',
    })
  }

  const onPractitionerSignIn = () => {
    navigation.navigate('Login', {
      accountType: 'practitioner',
      signupRouteName: 'Signup',
    })
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl, gap: 12 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable
            onPress={goToDashboard}
            style={{
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: '#9FD6A1',
              backgroundColor: '#EEF9EE',
              paddingVertical: 8,
              paddingHorizontal: 10,
            }}
          >
            <Text style={{ color: '#2E7D32', fontWeight: '900' }}>Back to dashboard</Text>
          </Pressable>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#D7EEE0',
            borderRadius: 16,
            padding: 16,
            backgroundColor: '#FFFFFF',
            gap: 10,
          }}
        >
          <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>
            LIST YOUR PRACTICE
          </Text>
          <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '900' }}>
            Start your practitioner listing
          </Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            Create an account to manage your listing, subscriptions, and boosts. If you already have an account, just
            sign in.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>New to Helfi?</Text>
          <Text style={{ color: theme.colors.muted }}>
            Create your practitioner account and start your listing.
          </Text>
          <Pressable
            onPress={onCreatePractitionerAccount}
            style={{
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.primary,
              paddingVertical: 12,
              paddingHorizontal: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Create practitioner account</Text>
          </Pressable>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Already have an account?</Text>
          <Text style={{ color: theme.colors.muted }}>
            Sign in to manage your listing and boosts.
          </Text>
          <Pressable
            onPress={onPractitionerSignIn}
            style={{
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: '#9FD6A1',
              backgroundColor: '#EEF9EE',
              paddingVertical: 12,
              paddingHorizontal: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#2E7D32', fontWeight: '900' }}>Sign in</Text>
          </Pressable>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#EEF9EE', padding: 14 }}>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            Not ready yet?{' '}
            <Text
              onPress={() => navigation.navigate('ListYourPractice')}
              style={{ color: theme.colors.primary, fontWeight: '900' }}
            >
              See what we offer
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </Screen>
  )
}
