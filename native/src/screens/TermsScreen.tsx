import React from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { termsOfUse } from '../content/legal'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

export function TermsScreen({ navigation }: { navigation: any }) {
  const onEmail = async () => {
    if (!termsOfUse.contactEmail) return
    try {
      await Linking.openURL(`mailto:${termsOfUse.contactEmail}`)
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
        <Text style={{ flex: 1, textAlign: 'center', marginRight: 44, color: theme.colors.text, fontWeight: '900' }}>Terms of Use</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
        <View style={{ alignItems: 'center', paddingTop: theme.spacing.lg }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.text, textAlign: 'center' }}>{termsOfUse.title}</Text>
          <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.muted, textAlign: 'center' }}>
            Last updated: {termsOfUse.lastUpdated}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 12, color: theme.colors.muted, textAlign: 'center', lineHeight: 16 }}>
            {termsOfUse.companyLine}
          </Text>
        </View>

        <View style={{ marginTop: theme.spacing.lg, backgroundColor: '#E9F6F1', borderRadius: theme.radius.md, padding: theme.spacing.md }}>
          {termsOfUse.intro.map((p) => (
            <Text key={p} style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20 }}>
              {p}
            </Text>
          ))}
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          {termsOfUse.sections.map((section) => (
            <View key={section.title} style={{ marginBottom: theme.spacing.lg }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 8 }}>{section.title}</Text>

              {section.paragraphs?.map((p) => (
                <Text key={p} style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>
                  {p}
                </Text>
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

        {termsOfUse.closingNote ? (
          <View style={{ marginTop: theme.spacing.lg, backgroundColor: '#E9F6F1', borderRadius: theme.radius.md, padding: theme.spacing.md }}>
            <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{termsOfUse.closingNote}</Text>
          </View>
        ) : null}

        {termsOfUse.contactEmail ? (
          <View style={{ marginTop: theme.spacing.lg, paddingTop: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
              For questions or legal inquiries, please contact us at:{' '}
              <Text onPress={onEmail} style={{ color: theme.colors.primary, fontWeight: '900' }}>
                {termsOfUse.contactEmail}
              </Text>
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
