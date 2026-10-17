import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, DeviceEventEmitter, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { useFocusEffect, useNavigation } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'
import { createVoiceActionReadGuard } from '../voice/voiceActionReadRefresh'
import { mergeProfileRead, normalizeVoiceProfile, profilePatchMatches, profileVoicePatch } from '../voice/profileVoiceRefresh'

type GenderOption = '' | 'male' | 'female' | 'other' | 'prefer-not-to-say'

type ProfileForm = {
  firstName: string
  lastName: string
  bio: string
  dateOfBirth: string
  gender: GenderOption
}

const emptyProfile: ProfileForm = {
  firstName: '',
  lastName: '',
  bio: '',
  dateOfBirth: '',
  gender: '',
}

const genderLabelByValue: Record<GenderOption, string> = {
  '': 'Select gender',
  male: 'Male',
  female: 'Female',
  other: 'Other',
  'prefer-not-to-say': 'Prefer not to say',
}


function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8AA39D"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: multiline ? 110 : 48,
          color: theme.colors.text,
          fontSize: 16,
        }}
      />
    </View>
  )
}

function DropdownOption({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? '#EAF5EF' : theme.colors.card,
        paddingVertical: 11,
        paddingHorizontal: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export function ProfileScreen() {
  const { session, mode } = useAppMode()
  const navigation = useNavigation<any>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)
  const [initialHash, setInitialHash] = useState('')
  const [genderMenuOpen, setGenderMenuOpen] = useState(false)

  const isDirty = useMemo(() => JSON.stringify(profile) !== initialHash, [profile, initialHash])

  const profileRef = useRef(profile)
  profileRef.current = profile
  const baselineRef = useRef<ProfileForm | null>(null)
  const mountedRef = useRef(false)
  const focusedRef = useRef(false)
  const accountRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingSavesRef = useRef(0)
  const voicePatchRef = useRef<Partial<ProfileForm>>({})
  const latestVoicePatchRef = useRef<Partial<ProfileForm>>({})
  const voiceRevisionRef = useRef(0)
  const repairAllowedRef = useRef(false)
  const completionIdsRef = useRef<string[]>([])
  const failedProfileRef = useRef('')
  const readGuardRef = useRef<ReturnType<typeof createVoiceActionReadGuard> | null>(null)
  if (!readGuardRef.current) readGuardRef.current = createVoiceActionReadGuard()
  const account = mode === 'signedIn' && session?.token && session.user?.id ? JSON.stringify([session.user.id, session.token]) : null
  if (accountRef.current !== account) {
    accountRef.current = account; generationRef.current++; saveQueueRef.current = Promise.resolve(); pendingSavesRef.current = 0
    voicePatchRef.current = {}; latestVoicePatchRef.current = {}; voiceRevisionRef.current++; repairAllowedRef.current = false; completionIdsRef.current = []; baselineRef.current = null; failedProfileRef.current = ''
  }
  readGuardRef.current.setAccount(account)
  useEffect(() => {
    mountedRef.current = true; readGuardRef.current!.mount()
    return () => { mountedRef.current = false; generationRef.current++; readGuardRef.current!.unmount() }
  }, [])
  useEffect(() => {
    profileRef.current = emptyProfile; setProfile(emptyProfile); setInitialHash(''); setSaving(false); setGenderMenuOpen(false)
  }, [account])

  const publish = (next: ProfileForm, baseline: ProfileForm) => {
    profileRef.current = next; baselineRef.current = baseline
    setProfile(next); setInitialHash(JSON.stringify(baseline))
  }
  const loadProfile = async () => {
    if (!account || !session?.token) {
      profileRef.current = emptyProfile; baselineRef.current = emptyProfile
      setProfile(emptyProfile); setInitialHash(JSON.stringify(emptyProfile)); setLoading(false)
      return
    }
    const read = readGuardRef.current!.begin(account, 'profile-read')
    if (!read) return
    try {
      setLoading(true)
      await saveQueueRef.current.catch(() => {})
      if (!read.isCurrent()) return
      const res = await fetch(`${API_BASE_URL}/api/user-data?scope=health-setup&voiceReadOnly=1`, {
        headers: { authorization: `Bearer ${session.token}`, 'cache-control': 'no-store' }, signal: read.signal,
      })
      const payload: any = await res.json().catch(() => ({}))
      if (!read.isCurrent()) return
      if (!res.ok || payload.readOnly !== true) throw new Error(payload?.error || 'Could not load profile')
      const server = normalizeVoiceProfile(payload)
      if (!profilePatchMatches(server, voicePatchRef.current)) throw new Error('The latest voice profile change could not be confirmed. Please check Profile again.')
      voicePatchRef.current = {}; repairAllowedRef.current = false
      publish(mergeProfileRead(server, profileRef.current, baselineRef.current), server)
      setGenderMenuOpen(false)
    } catch (error: any) {
      if (read.isCurrent()) Alert.alert('Could not load profile', error?.message || 'Please try again.')
    } finally {
      if (read.isCurrent()) setLoading(false)
      read.finish()
    }
  }

  useFocusEffect(
    React.useCallback(() => {
      focusedRef.current = true
      void loadProfile()
      return () => { focusedRef.current = false }
    }, [account]),
  )

  const saveProfile = async (profileToSave: ProfileForm = profile) => {
    if (!account || !session?.token || !mountedRef.current || accountRef.current !== account) return
    const owner = account, generation = generationRef.current, submitted = { ...profileToSave }, submittedRevision = voiceRevisionRef.current
    const current = () => mountedRef.current && accountRef.current === owner && generationRef.current === generation
    pendingSavesRef.current++; setSaving(true)
    const save = async () => {
      const ticket = readGuardRef.current!.begin(owner, 'profile-save')
      if (!ticket || !current()) return
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` }
      let lastVerifiedServer: ProfileForm | null = null
      const readback = async () => {
        const res = await fetch(`${API_BASE_URL}/api/user-data?scope=health-setup&voiceReadOnly=1`, { headers, signal: ticket.signal })
        const data: any = await res.json().catch(() => ({}))
        if (!current() || !ticket.isCurrent()) return null
        if (!res.ok || data.readOnly !== true) throw new Error(data?.error || 'Could not confirm the saved profile')
        lastVerifiedServer = normalizeVoiceProfile(data)
        return lastVerifiedServer
      }
      let failure: any = null
      const sent = { ...submitted, ...(submittedRevision !== voiceRevisionRef.current ? latestVoicePatchRef.current : {}), ...voicePatchRef.current }
      try {
        try {
          const res = await fetch(`${API_BASE_URL}/api/user-data`, { method: 'POST', headers, signal: ticket.signal, body: JSON.stringify({ profileInfo: sent }) })
          const data: any = await res.json().catch(() => ({}))
          if (!current() || !ticket.isCurrent()) return
          if (!res.ok) throw new Error(data?.error || 'Could not save profile')
        } catch (error) { failure = error }
        if (!current() || !ticket.isCurrent()) return
        let server = await readback()
        if (!server) return
        for (let attempt = 0; attempt < 4 && !profilePatchMatches(server, voicePatchRef.current); attempt++) {
          if (!repairAllowedRef.current) throw new Error('The latest voice profile change could not be confirmed.')
          const revision = voiceRevisionRef.current, patch = { ...voicePatchRef.current }
          // A previously submitted full manual save may have arrived after the
          // verified voice write. Repair only the voice fields, never the form.
          const repair = await fetch(`${API_BASE_URL}/api/user-data`, { method: 'POST', headers, signal: ticket.signal, body: JSON.stringify({ profileInfo: patch }) })
          const repaired: any = await repair.json().catch(() => ({}))
          if (!current() || !ticket.isCurrent()) return
          if (!repair.ok) throw new Error(repaired?.error || 'Could not restore the voice profile change')
          server = await readback()
          if (!server) return
          if (revision !== voiceRevisionRef.current) continue
        }
        if (!profilePatchMatches(server, voicePatchRef.current)) throw new Error('The latest voice profile change could not be confirmed.')
        const expected = normalizeVoiceProfile({ data: { profileInfo: { ...sent, ...voicePatchRef.current } } })
        if (!failure && !profilePatchMatches(server, expected)) throw new Error('The saved profile did not match the requested changes. Please review it again.')
        voicePatchRef.current = {}; repairAllowedRef.current = false
        publish(mergeProfileRead(server, profileRef.current, failure ? baselineRef.current : submitted), server)
        if (failure) throw failure
        failedProfileRef.current = ''
      } catch (error: any) {
        if (current() && ticket.isCurrent()) {
          if (lastVerifiedServer) publish({ ...mergeProfileRead(lastVerifiedServer, profileRef.current, baselineRef.current), ...voicePatchRef.current }, lastVerifiedServer)
          failedProfileRef.current = JSON.stringify(profileRef.current)
          Alert.alert('Save failed', error?.message || 'Please try again.')
        }
      } finally { ticket.finish() }
    }
    const queued = saveQueueRef.current.then(save, save)
    saveQueueRef.current = queued
    try { await queued } finally {
      if (current()) { pendingSavesRef.current--; setSaving(pendingSavesRef.current > 0) }
    }
  }

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('helfi:settings-changed', payload => {
      if (!mountedRef.current || !focusedRef.current || accountRef.current !== account) return
      const patch = profileVoicePatch(payload, session?.user?.id)
      if (!patch || completionIdsRef.current.includes(payload.completionId)) return
      completionIdsRef.current = [...completionIdsRef.current, payload.completionId].slice(-100)
      voiceRevisionRef.current++; voicePatchRef.current = { ...voicePatchRef.current, ...patch }
      latestVoicePatchRef.current = { ...latestVoicePatchRef.current, ...patch }
      repairAllowedRef.current = repairAllowedRef.current || pendingSavesRef.current > 0
      const baseline = baselineRef.current || profileRef.current
      publish({ ...profileRef.current, ...patch }, { ...baseline, ...patch })
      void loadProfile()
    })
    return () => subscription.remove()
  }, [account, session?.user?.id])

  useEffect(() => {
    if (loading || !isDirty || saving || failedProfileRef.current === JSON.stringify(profile)) return
    const timer = setTimeout(() => {
      void saveProfile(profile)
    }, 900)
    return () => clearTimeout(timer)
  }, [profile, loading, isDirty, saving])

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading profile...</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View style={{ backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: 16 }}>
          <Text style={{ fontSize: theme.fontSize.pageTitle, fontWeight: '700', color: theme.colors.text }}>Profile Information</Text>
          <Text style={{ marginTop: 6, color: theme.colors.muted }}>Auto-save enabled: Your changes save automatically when you leave this page.</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change Profile Photo"
            onPress={() => navigation.navigate('ProfilePhoto')}
            style={({ pressed }) => ({
              marginTop: 16,
              marginBottom: 16,
              alignSelf: 'flex-start',
              borderRadius: theme.radius.md,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: '#EAF5EF',
              borderWidth: 1,
              borderColor: '#CFE8D4',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Change Profile Photo</Text>
          </Pressable>

          <Field
            label="First Name"
            value={profile.firstName}
            onChangeText={(firstName) => setProfile((prev) => ({ ...prev, firstName }))}
            placeholder="Enter your first name"
          />
          <Field
            label="Last Name"
            value={profile.lastName}
            onChangeText={(lastName) => setProfile((prev) => ({ ...prev, lastName }))}
            placeholder="Enter your last name"
          />
          <Field
            label="Bio"
            value={profile.bio}
            onChangeText={(bio) => setProfile((prev) => ({ ...prev, bio }))}
            placeholder="Tell us about yourself..."
            multiline
          />
          <Field
            label="Date of Birth"
            value={profile.dateOfBirth}
            onChangeText={(dateOfBirth) => setProfile((prev) => ({ ...prev, dateOfBirth }))}
            placeholder="YYYY-MM-DD"
          />

          <View style={{ marginBottom: theme.spacing.lg }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.muted, marginBottom: 8 }}>Gender</Text>
            <Pressable
              onPress={() => setGenderMenuOpen((v) => !v)}
              style={({ pressed }) => ({
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: profile.gender ? theme.colors.text : '#8AA39D', fontSize: 16 }}>
                {genderLabelByValue[profile.gender]}
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 16 }}>{genderMenuOpen ? '▴' : '▾'}</Text>
            </Pressable>

            {genderMenuOpen ? (
              <View
                style={{
                  marginTop: 8,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.card,
                  padding: 8,
                  gap: 6,
                }}
              >
                <DropdownOption
                  label="Male"
                  selected={profile.gender === 'male'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'male' }))
                    setGenderMenuOpen(false)
                  }}
                />
                <DropdownOption
                  label="Female"
                  selected={profile.gender === 'female'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'female' }))
                    setGenderMenuOpen(false)
                  }}
                />
                <DropdownOption
                  label="Other"
                  selected={profile.gender === 'other'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'other' }))
                    setGenderMenuOpen(false)
                  }}
                />
                <DropdownOption
                  label="Prefer not to say"
                  selected={profile.gender === 'prefer-not-to-say'}
                  onPress={() => {
                    setProfile((prev) => ({ ...prev, gender: 'prefer-not-to-say' }))
                    setGenderMenuOpen(false)
                  }}
                />
              </View>
            ) : null}
          </View>
          <Text style={{ color: saving ? theme.colors.primary : theme.colors.muted, fontSize: 12 }}>
            {saving ? 'Saving...' : isDirty ? 'Saving changes automatically...' : 'All changes saved.'}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  )
}
