import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

const WHAT_YOU_GET = [
  'A public profile that shows in search and on the map.',
  'Category and location filters so patients can find you quickly.',
  'Worldwide reach with fair placement by country.',
  'Optional boost upgrades for higher visibility.',
  'Listing stays hidden (not deleted) if payment lapses.',
]

const HOW_IT_WORKS = [
  'Create your listing and submit it.',
  'Our system runs an automated review process.',
  'If approved, your listing goes live and your free 2 months start.',
  'If flagged, your listing stays hidden until staff approves it.',
  'Manage your listing, subscription, and boosts in your dashboard.',
]

export function ListYourPracticeScreen({ navigation }: { navigation: any }) {
  const goToDashboard = () => {
    navigation.navigate('Tabs', { screen: 'Dashboard' })
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
            PRACTITIONER DIRECTORY
          </Text>
          <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '900' }}>
            List your practice on Helfi
          </Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            Reach people searching for trusted care. You get 2 months free, then it is $4.95/month (USD). No card is
            needed to start. Your free period begins only after your listing is approved.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable
              onPress={() => navigation.navigate('ListYourPracticeStart')}
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.primary,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Start your listing</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Practitioners')}
              style={{
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: '#9FD6A1',
                backgroundColor: '#EEF9EE',
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#2E7D32', fontWeight: '900' }}>Find a practitioner</Text>
            </Pressable>
          </View>
          <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
            Already have a practitioner account?{' '}
            <Text
              onPress={() => {
                navigation.navigate('Login', {
                  accountType: 'practitioner',
                  signupRouteName: 'Signup',
                })
              }}
              style={{ color: theme.colors.primary, fontWeight: '900' }}
            >
              Sign in here
            </Text>
            .
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>What you get</Text>
          {WHAT_YOU_GET.map((line) => (
            <Text key={line} style={{ color: theme.colors.muted, lineHeight: 20 }}>
              • {line}
            </Text>
          ))}
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Safety review</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            Every listing is reviewed for safety and fraud. If it looks good, it goes live and you are emailed right
            away. If it needs a closer look, the listing stays hidden until a staff member reviews it.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>How it works</Text>
          {HOW_IT_WORKS.map((line, index) => (
            <Text key={line} style={{ color: theme.colors.muted, lineHeight: 20 }}>
              {index + 1}. {line}
            </Text>
          ))}
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Pricing (USD)</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            Listing subscription: 2 months free (starts after approval), then $4.95/month per listing.
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Boosts (7 days)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['5 km - $5', '10 km - $10', '25 km - $15', '50 km - $20'].map((item) => (
              <View
                key={item}
                style={{
                  borderWidth: 1,
                  borderColor: '#D7EEE0',
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  backgroundColor: '#FBFEFC',
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            Boosts are optional and only available while your listing subscription is active.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Radius and visibility</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            You choose how far you want to appear from your location: 5 km, 10 km, 25 km, or 50 km. The default is
            10 km. This keeps results fair and local, even for online-only listings.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 14, gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Boost fairness</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            Boosted listings rotate fairly within the same category and country. This means no one is permanently at
            the top, and visibility stays balanced.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#D7EEE0', borderRadius: 16, backgroundColor: '#EEF9EE', padding: 16, gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>Ready to list your practice?</Text>
          <Text style={{ color: theme.colors.muted }}>
            Start your listing now. It takes a few minutes, and approval is usually quick.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable
              onPress={() => navigation.navigate('ListYourPracticeStart')}
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.primary,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Start your listing</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Practitioners')}
              style={{
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: '#9FD6A1',
                backgroundColor: '#FFFFFF',
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#2E7D32', fontWeight: '900' }}>See practitioners</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}
