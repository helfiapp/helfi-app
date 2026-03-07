import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'

import { API_BASE_URL } from '../config'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type Listing = {
  id: string
  displayName: string
  slug: string
  description: string | null
  phone: string | null
  websiteUrl: string | null
  emailPublic: string | null
  addressLine1: string | null
  addressLine2: string | null
  suburbCity: string | null
  stateRegion: string | null
  postcode: string | null
  country: string | null
  lat: number | null
  lng: number | null
  serviceType: string
  languages: string[] | null
  tags: string[] | null
  hours: { notes?: string } | null
  images: { logoUrl?: string; gallery?: string[] } | null
  categoryName: string | null
  subcategoryName: string | null
  trackingToken?: string | null
}

function isValidEmail(value: string | null | undefined) {
  if (!value) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function PractitionerProfileScreen({ route }: { route: any }) {
  const slug = String(route?.params?.slug || '')
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const trackedRef = useRef(false)

  const trackClick = async (action: 'profile_view' | 'call' | 'website' | 'email') => {
    if (!listing?.id || !listing?.trackingToken) return
    try {
      await fetch(`${API_BASE_URL}/api/practitioners/contact-click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          action,
          token: listing.trackingToken,
        }),
      })
    } catch {
      // Non-blocking.
    }
  }

  const openUrl = async (url: string) => {
    try {
      const ok = await Linking.canOpenURL(url)
      if (!ok) return
      await Linking.openURL(url)
    } catch {
      // Non-blocking.
    }
  }

  useEffect(() => {
    const load = async () => {
      if (!slug) {
        setError('Listing not found.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE_URL}/api/practitioners/${encodeURIComponent(slug)}`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Listing not found.')
        setListing(data?.listing || null)
      } catch (err: any) {
        setError(err?.message || 'Listing not found.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [slug])

  useEffect(() => {
    if (!listing?.id || trackedRef.current) return
    trackedRef.current = true
    void trackClick('profile_view')
  }, [listing?.id])

  const galleryUrls = Array.isArray(listing?.images?.gallery) ? listing?.images?.gallery : []
  const lightboxOpen = lightboxIndex !== null && galleryUrls[lightboxIndex]

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={{ color: theme.colors.muted }}>Loading listing…</Text>
        </View>
      </Screen>
    )
  }

  if (error || !listing) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.muted, textAlign: 'center' }}>{error || 'Listing not found.'}</Text>
        </View>
      </Screen>
    )
  }

  const address = [
    listing.addressLine1,
    listing.addressLine2,
    listing.suburbCity,
    listing.stateRegion,
    listing.postcode,
    listing.country,
  ]
    .filter(Boolean)
    .join(', ')

  const logoUrl = listing.images?.logoUrl || null
  const hoursNotes = listing.hours?.notes || null

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl, gap: 12 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.card,
            padding: 14,
            gap: 8,
          }}
        >
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={{ width: 76, height: 76, borderRadius: 12, borderWidth: 1, borderColor: '#EFF4F2' }}
              resizeMode="contain"
            />
          ) : null}
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text }}>{listing.displayName}</Text>
          <Text style={{ color: theme.colors.muted }}>
            {listing.categoryName}
            {listing.subcategoryName ? ` · ${listing.subcategoryName}` : ''}
          </Text>
          {listing.serviceType ? (
            <Text style={{ color: '#2E7D32', fontSize: 12, fontWeight: '900' }}>
              {String(listing.serviceType).replace('_', ' ')}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.card,
            padding: 14,
            gap: 10,
          }}
        >
          {listing.description ? <Text style={{ color: theme.colors.text }}>{listing.description}</Text> : null}

          {listing.phone ? (
            <View>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800' }}>Phone</Text>
              <Pressable
                onPress={() => {
                  void trackClick('call')
                  void openUrl(`tel:${listing.phone}`)
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{listing.phone}</Text>
              </Pressable>
            </View>
          ) : null}

          {listing.websiteUrl ? (
            <View>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800' }}>Website</Text>
              <Pressable
                onPress={() => {
                  void trackClick('website')
                  void openUrl(listing.websiteUrl as string)
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '800' }} numberOfLines={1}>
                  {listing.websiteUrl}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {isValidEmail(listing.emailPublic) ? (
            <View>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800' }}>Email</Text>
              <Pressable
                onPress={() => {
                  void trackClick('email')
                  void openUrl(`mailto:${listing.emailPublic}`)
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{listing.emailPublic}</Text>
              </Pressable>
            </View>
          ) : null}

          {address ? (
            <View>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800' }}>Address</Text>
              <Text style={{ color: theme.colors.text }}>{address}</Text>
            </View>
          ) : null}

          {Array.isArray(listing.languages) && listing.languages.length > 0 ? (
            <View>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800' }}>Languages</Text>
              <Text style={{ color: theme.colors.text }}>{listing.languages.join(', ')}</Text>
            </View>
          ) : null}

          {hoursNotes ? (
            <View>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800' }}>Opening hours</Text>
              <Text style={{ color: theme.colors.text }}>{hoursNotes}</Text>
            </View>
          ) : null}

          {Array.isArray(listing.tags) && listing.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {listing.tags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    borderRadius: 999,
                    backgroundColor: '#EEF9EE',
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                  }}
                >
                  <Text style={{ color: '#2E7D32', fontWeight: '800', fontSize: 12 }}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {listing.lat != null && listing.lng != null ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.card,
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Map</Text>
            <Text style={{ color: theme.colors.muted }}>
              Open this location in your maps app for directions.
            </Text>
            <Pressable
              onPress={() => openUrl(`https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`)}
              style={{
                borderRadius: theme.radius.md,
                backgroundColor: '#EAF8EA',
                borderWidth: 1,
                borderColor: '#9FD6A1',
                alignSelf: 'flex-start',
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#2E7D32', fontWeight: '900' }}>Open map</Text>
            </Pressable>
          </View>
        ) : null}

        {galleryUrls.length > 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.card,
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Photos</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {galleryUrls.map((url, index) => (
                <Pressable key={`${url}-${index}`} onPress={() => setLightboxIndex(index)} style={{ width: '48%' }}>
                  <Image
                    source={{ uri: url }}
                    style={{ width: '100%', height: 110, borderRadius: 12, borderWidth: 1, borderColor: '#EFF4F2' }}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={!!lightboxOpen} transparent animationType="fade" onRequestClose={() => setLightboxIndex(null)}>
        <Pressable
          onPress={() => setLightboxIndex(null)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.82)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => setLightboxIndex(null)}
            style={{
              position: 'absolute',
              top: 40,
              right: 20,
              borderRadius: 999,
              backgroundColor: '#FFFFFF',
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: '#111827', fontWeight: '900' }}>Close</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setLightboxIndex((prev) => {
                if (prev == null) return prev
                return prev === 0 ? galleryUrls.length - 1 : prev - 1
              })
            }
            style={{ position: 'absolute', left: 10, padding: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '900' }}>{'‹'}</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setLightboxIndex((prev) => {
                if (prev == null) return prev
                return prev === galleryUrls.length - 1 ? 0 : prev + 1
              })
            }
            style={{ position: 'absolute', right: 10, padding: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '900' }}>{'›'}</Text>
          </Pressable>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}
          >
            <Image
              source={{ uri: galleryUrls[lightboxIndex as number] }}
              style={{ width: '100%', height: 360, borderRadius: 14 }}
              resizeMode="contain"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  )
}
