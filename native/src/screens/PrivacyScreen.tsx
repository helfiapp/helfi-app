import React from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { privacyPolicy } from '../content/legal'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function PrivacyScreen({ navigation }: { navigation: any }) {
  const onEmail = async () => {
    if (!privacyPolicy.contactEmail) return
    try {
      await Linking.openURL(`mailto:${privacyPolicy.contactEmail}`)
    } catch {
      // Ignore failures (no crash).
    }
  }

  return (
    <Screen style={{ backgroundColor: '#FFFFFF' }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md }}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 8, paddingRight: 12 })}>
          <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 16 }}>Back</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', marginRight: 44, color: theme.colors.text, fontWeight: '900' }}>Privacy Policy</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
        <View style={{ alignItems: 'center', paddingTop: theme.spacing.lg }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.text, textAlign: 'center' }}>{privacyPolicy.title}</Text>
          <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.muted, textAlign: 'center' }}>
            Last updated: {privacyPolicy.lastUpdated}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 12, color: theme.colors.muted, textAlign: 'center', lineHeight: 16 }}>
            {privacyPolicy.companyLine}
          </Text>
        </View>

        <View style={{ marginTop: theme.spacing.lg, backgroundColor: '#E9F6F1', borderRadius: theme.radius.md, padding: theme.spacing.md }}>
          {privacyPolicy.intro.map((p) => (
            <Text key={p} style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 10 }}>
              {p}
            </Text>
          ))}
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          {privacyPolicy.sections.map((section) => (
            <View key={section.title} style={{ marginBottom: theme.spacing.lg }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 8 }}>{section.title}</Text>

              {section.paragraphs?.map((p) => (
                <Text key={p} style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>
                  {p}
                </Text>
              ))}

              {section.subsections?.map((sub) => (
                <View key={sub.title} style={{ marginTop: 10 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900', marginBottom: 6 }}>{sub.title}</Text>
                  {sub.paragraphs?.map((p) => (
                    <Text key={p} style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>
                      {p}
                    </Text>
                  ))}
                  {sub.bullets?.map((b) => (
                    <View key={b} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <Text style={{ marginTop: 2, color: theme.colors.muted, fontSize: 14 }}>{'\u2022'}</Text>
                      <Text style={{ flex: 1, color: theme.colors.text, fontSize: 14, lineHeight: 20 }}>{b}</Text>
                    </View>
                  ))}
                </View>
              ))}

              {section.bullets?.map((b) => (
                <View key={b} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <Text style={{ marginTop: 2, color: theme.colors.muted, fontSize: 14 }}>{'\u2022'}</Text>
                  <Text style={{ flex: 1, color: theme.colors.text, fontSize: 14, lineHeight: 20 }}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {privacyPolicy.closingNote ? (
          <View style={{ marginTop: theme.spacing.lg, backgroundColor: '#E9F6F1', borderRadius: theme.radius.md, padding: theme.spacing.md }}>
            <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{privacyPolicy.closingNote}</Text>
          </View>
        ) : null}

        {privacyPolicy.extraContactLines?.length ? (
          <View style={{ marginTop: theme.spacing.lg, paddingTop: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            {privacyPolicy.extraContactLines.map((line) => (
              <Text key={line} style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 8 }}>
                {line}
              </Text>
            ))}
            {privacyPolicy.contactEmail ? (
              <Text style={{ textAlign: 'center' }}>
                <Text onPress={onEmail} style={{ color: theme.colors.primary, fontWeight: '900' }}>
                  {privacyPolicy.contactEmail}
                </Text>
              </Text>
            ) : null}
          </View>
        ) : privacyPolicy.contactEmail ? (
          <View style={{ marginTop: theme.spacing.lg, paddingTop: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
              Contact:{' '}
              <Text onPress={onEmail} style={{ color: theme.colors.primary, fontWeight: '900' }}>
                {privacyPolicy.contactEmail}
              </Text>
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
