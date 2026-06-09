import React, { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { WebView } from 'react-native-webview'

import { API_BASE_URL } from '../config'
import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { buildNativeWebSource } from '../lib/openNativeWebPath'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

const PRACTITIONER_LOCATION_KEY = 'helfi:practitionerLocation'

type NativeRecommendationSource = 'onboarding' | 'chat' | 'image' | 'symptom-analysis'

type NativePractitionerRecommendation = {
  id: string
  displayName: string
  slug: string
  categoryName: string | null
  subcategoryName: string | null
  phone: string | null
  websiteUrl: string | null
  suburbCity: string | null
  stateRegion: string | null
  country: string | null
  distanceKm: number | null
  reason: string
}

type NativeUserLocation = {
  lat: number
  lng: number
  country?: string | null
}

function isAllowedInAppUrl(rawUrl: string): boolean {
  const value = String(rawUrl || '').trim()
  if (!value) return false
  if (/^about:blank$/i.test(value)) return true

  try {
    const parsed = new URL(value)
    const host = String(parsed.hostname || '').toLowerCase()
    if (!host) return false
    return host === 'helfi.ai' || host.endsWith('.helfi.ai')
  } catch {
    return false
  }
}

function pathForNativePage(path: string) {
  try {
    const parsed = new URL(path, 'https://helfi.ai')
    return parsed.pathname
  } catch {
    return String(path || '').split('?')[0] || '/'
  }
}

function titleForNativeWebUrl(rawUrl: string, fallback: string) {
  let pathname = ''
  try {
    pathname = new URL(String(rawUrl || ''), 'https://helfi.ai').pathname
  } catch {
    pathname = String(rawUrl || '').split('?')[0] || ''
  }

  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname === '/more') return 'More'

  const pages = Object.values(NATIVE_WEB_PAGES)
    .map((page) => ({ ...page, pathname: pathForNativePage(page.path) }))
    .filter((page) => page.pathname && page.pathname !== '/chat')
    .sort((a, b) => b.pathname.length - a.pathname.length)

  const match = pages.find((page) => pathname === page.pathname || pathname.startsWith(`${page.pathname}/`))
  return match?.title || fallback || 'Page'
}

function normalizeToken(token: string | null | undefined): string {
  return String(token || '')
    .trim()
    .replace(/^"+|"+$/g, '')
}

function buildNativeCookieHeader(token: string): string {
  return [
    `next-auth.session-token=${token}`,
    `authjs.session-token=${token}`,
    `__Secure-next-auth.session-token=${token}`,
    `__Secure-authjs.session-token=${token}`,
  ].join('; ')
}

async function readSavedPractitionerLocation(): Promise<NativeUserLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(PRACTITIONER_LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const lat = Number(parsed?.lat)
    const lng = Number(parsed?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return {
      lat,
      lng,
      country: typeof parsed?.country === 'string' ? parsed.country : null,
    }
  } catch {
    return null
  }
}

function readCurrentNativeLocation(): Promise<NativeUserLocation | null> {
  const geo = (globalThis as any)?.navigator?.geolocation
  if (!geo || typeof geo.getCurrentPosition !== 'function') return Promise.resolve(null)

  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position: any) => {
        const lat = Number(position?.coords?.latitude)
        const lng = Number(position?.coords?.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          resolve(null)
          return
        }
        resolve({ lat, lng })
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 1000 * 60 * 60 },
    )
  })
}

function formatPlace(item: NativePractitionerRecommendation) {
  return [item.suburbCity, item.stateRegion, item.country].filter(Boolean).join(', ')
}

function formatDistance(distanceKm: number | null) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) return ''
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`
}

function NativePractitionerRecommendationPanel({
  items,
  onOpenProfile,
  onOpenContact,
}: {
  items: NativePractitionerRecommendation[]
  onOpenProfile: (item: NativePractitionerRecommendation) => void
  onOpenContact: (item: NativePractitionerRecommendation) => void
}) {
  if (!items.length) return null

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: '#D8EBDD',
        backgroundColor: '#F2FBF4',
        paddingVertical: 12,
      }}
    >
      <View style={{ paddingHorizontal: 14, marginBottom: 8 }}>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Practitioners near you</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 3, fontSize: 12 }}>
          Based on what you shared, these nearby practitioners may be relevant.
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
        {items.map((item) => {
          const place = formatPlace(item)
          const distance = formatDistance(item.distanceKm)
          const category = [item.subcategoryName, item.categoryName].filter(Boolean).join(' - ')
          const hasContact = Boolean(item.websiteUrl || item.phone)
          return (
            <View
              key={item.id}
              style={{
                width: 270,
                borderWidth: 1,
                borderColor: '#CFE8D4',
                borderRadius: theme.radius.md,
                backgroundColor: '#FFFFFF',
                padding: 12,
                gap: 7,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>{item.displayName}</Text>
                  {category ? <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>{category}</Text> : null}
                </View>
                {distance ? (
                  <View style={{ borderRadius: 999, backgroundColor: '#E4F6E8', paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: '#24743A', fontWeight: '900', fontSize: 11 }}>{distance}</Text>
                  </View>
                ) : null}
              </View>
              {place ? <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{place}</Text> : null}
              {item.reason ? <Text style={{ color: theme.colors.text, fontSize: 12, lineHeight: 17 }}>{item.reason}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
                <Pressable onPress={() => onOpenProfile(item)}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>View profile</Text>
                </Pressable>
                {hasContact ? (
                  <Pressable onPress={() => onOpenContact(item)}>
                    <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>
                      {item.websiteUrl ? 'Website or booking' : 'Call'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )
        })}
      </ScrollView>
      <Text style={{ color: '#3C7550', fontSize: 11, lineHeight: 15, paddingHorizontal: 14, marginTop: 8 }}>
        These are not diagnoses or referrals. You may want to consider speaking with a qualified practitioner if it feels relevant.
      </Text>
    </View>
  )
}

export function NativeWebToolScreen({ route }: { route: any }) {
  const navigation = useNavigation<any>()
  const { session } = useAppMode()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [recommendations, setRecommendations] = useState<NativePractitionerRecommendation[]>([])
  const recommendationRequestRef = useRef(0)
  const lastRecommendationKeyRef = useRef('')

  const requestedPath = String(route?.params?.path || '/dashboard')
  const requestedTitle = String(route?.params?.title || 'Page')
  const webViewKey = `${session?.user?.id || 'signed-out'}:${requestedPath}`
  const requestedPathWithFreshLoad = useMemo(() => {
    const joiner = requestedPath.includes('?') ? '&' : '?'
    return `${requestedPath}${joiner}nativeLoad=${Date.now()}`
  }, [requestedPath, session?.token])
  const source = useMemo(
    () =>
      buildNativeWebSource({
        token: session?.token,
        path: requestedPathWithFreshLoad,
      }),
    [requestedPathWithFreshLoad, session?.token],
  )

  const hasNativeToken = String(session?.token || '').trim().length > 0

  const loadNativeRecommendations = useCallback(
    async (issueText: string, sourceArea: NativeRecommendationSource) => {
      const trimmedIssue = String(issueText || '').trim()
      if (!trimmedIssue) {
        lastRecommendationKeyRef.current = ''
        setRecommendations([])
        return
      }

      const requestKey = `${sourceArea}:${trimmedIssue}`
      if (lastRecommendationKeyRef.current === requestKey) return
      lastRecommendationKeyRef.current = requestKey
      const requestId = recommendationRequestRef.current + 1
      recommendationRequestRef.current = requestId
      setRecommendations([])

      const location = (await readSavedPractitionerLocation()) || (await readCurrentNativeLocation())
      if (!location || recommendationRequestRef.current !== requestId) return

      const token = normalizeToken(session?.token)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) {
        headers.Authorization = `Bearer ${token}`
        headers['x-native-token'] = token
        headers.Cookie = buildNativeCookieHeader(token)
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/practitioners/recommendations`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            issueText: trimmedIssue,
            sourceArea,
            lat: location.lat,
            lng: location.lng,
            country: location.country || undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (recommendationRequestRef.current !== requestId) return
        setRecommendations(res.ok && Array.isArray(data?.results) ? data.results : [])
      } catch {
        if (recommendationRequestRef.current === requestId) setRecommendations([])
      }
    },
    [session?.token],
  )

  const handleNativeMessage = useCallback(
    (event: any) => {
      const raw = String(event?.nativeEvent?.data || '')
      if (!raw) return
      try {
        const data = JSON.parse(raw)
        if (data?.type !== 'helfi:practitionerRecommendationRequest') return
        void loadNativeRecommendations(
          String(data?.issueText || ''),
          (data?.sourceArea || 'chat') as NativeRecommendationSource,
        )
      } catch {
        // Ignore messages that are not for native practitioner recommendations.
      }
    },
    [loadNativeRecommendations],
  )

  const openRecommendationContact = useCallback((item: NativePractitionerRecommendation) => {
    const url = item.websiteUrl || (item.phone ? `tel:${item.phone}` : '')
    if (!url) return
    void Linking.openURL(url).catch(() => {})
  }, [])

  const injectedSetupScript = useMemo(() => {
    const userId = String(session?.user?.id || 'signed-out')
      .trim()
      .replace(/^"+|"+$/g, '')
    const token = String(session?.token || '')
      .trim()
      .replace(/^"+|"+$/g, '')

    const escapedUserId = userId
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
    const escaped = token
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")

    return `
      (function() {
        function applyNativeWebviewPolish() {
          try {
            document.documentElement.setAttribute('data-helfi-native-webview', '1');
            var style = document.getElementById('helfi-native-webview-polish');
            if (!style) {
              style = document.createElement('style');
              style.id = 'helfi-native-webview-polish';
              (document.head || document.documentElement).appendChild(style);
            }
            style.textContent = [
              'html[data-helfi-native-webview] nav.fixed.bottom-0',
              'html[data-helfi-native-webview] nav.md\\\\:hidden.fixed.bottom-0',
              'html[data-helfi-native-webview] div.md\\\\:hidden.fixed.bottom-0',
              'html[data-helfi-native-webview] div.fixed.bottom-0.left-0.right-0.z-40',
              'html[data-helfi-native-webview] [data-mobile-bottom-nav]',
              'html[data-helfi-native-webview] [data-bottom-nav]'
            ].join(',') + '{display:none!important;}html[data-helfi-native-webview] body{padding-bottom:0!important;}';
          } catch (e) {}
        }
        try {
          applyNativeWebviewPolish();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applyNativeWebviewPolish);
          }
          setTimeout(applyNativeWebviewPolish, 250);
          setTimeout(applyNativeWebviewPolish, 1000);
          try {
            var userMarker = 'helfi:native-webview-user-id';
            var currentUserId = '${escapedUserId}';
            if (window.localStorage.getItem(userMarker) !== currentUserId) {
              window.sessionStorage.clear();
              window.localStorage.clear();
              window.localStorage.setItem(userMarker, currentUserId);
            }
          } catch (e) {}
          var t = '${escaped}';
          if (!t) return true;
          var names = ['next-auth.session-token', '__Secure-next-auth.session-token', 'authjs.session-token', '__Secure-authjs.session-token'];
          names.forEach(function(name) {
            document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
            document.cookie = name + '=; path=/; domain=.helfi.ai; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
          });
          var maxAge = 60 * 60 * 24 * 30;
          var base = '; path=/; secure; samesite=lax; max-age=' + maxAge;
          document.cookie = 'next-auth.session-token=' + t + base;
          document.cookie = '__Secure-next-auth.session-token=' + t + base;
          document.cookie = 'authjs.session-token=' + t + base;
          document.cookie = '__Secure-authjs.session-token=' + t + base;
        } catch (e) {}
        return true;
      })();
    `
  }, [session?.token])

  return (
    <Screen>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        {loading ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              zIndex: 2,
            }}
          >
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Opening page...</Text>
          </View>
        ) : null}

        {failed ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              gap: 12,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>Could not open this page</Text>
            <Text style={{ color: theme.colors.muted, textAlign: 'center' }}>Please try again.</Text>
            <Pressable
              onPress={() => {
                setFailed(false)
                setLoading(true)
              }}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: theme.colors.primary,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            key={webViewKey}
            source={source}
            geolocationEnabled
            injectedJavaScriptBeforeContentLoaded={injectedSetupScript}
            onLoadStart={() => {
              setLoading(true)
              setFailed(false)
            }}
            onNavigationStateChange={(state) => {
              const nextTitle = titleForNativeWebUrl(String(state?.url || ''), requestedTitle)
              navigation.setOptions({ title: nextTitle })
            }}
            onLoadEnd={() => setLoading(false)}
            onMessage={handleNativeMessage}
            onError={() => {
              setLoading(false)
              setFailed(true)
            }}
            onShouldStartLoadWithRequest={(request) => {
              const nextUrl = String(request?.url || '')
              if (hasNativeToken) {
                try {
                  const parsed = new URL(nextUrl)
                  const host = String(parsed.hostname || '').toLowerCase()
                  const path = String(parsed.pathname || '')
                  const isHelfiHost = host === 'helfi.ai' || host.endsWith('.helfi.ai')
                  const isAuthPath = path.startsWith('/auth/')
                  if (isHelfiHost && isAuthPath) {
                    return false
                  }
                } catch {
                  // Ignore URL parse failures.
                }
              }

              if (isAllowedInAppUrl(nextUrl)) {
                return true
              }

              void Linking.openURL(nextUrl).catch(() => {})
              return false
            }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            incognito
            cacheEnabled={false}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
          />
        )}
        <NativePractitionerRecommendationPanel
          items={recommendations}
          onOpenProfile={(item) => navigation.navigate('PractitionerProfile', { slug: item.slug, name: item.displayName })}
          onOpenContact={openRecommendationContact}
        />
      </View>
    </Screen>
  )
}
