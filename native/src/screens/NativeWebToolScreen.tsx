import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'

import { WebView } from 'react-native-webview'

import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { buildNativeWebSource } from '../lib/openNativeWebPath'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

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

export function NativeWebToolScreen({ route }: { route: any }) {
  const navigation = useNavigation<any>()
  const { session } = useAppMode()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const requestedPath = String(route?.params?.path || '/dashboard')
  const requestedTitle = String(route?.params?.title || 'Page')
  const source = useMemo(
    () =>
      buildNativeWebSource({
        token: session?.token,
        path: requestedPath,
      }),
    [requestedPath, session?.token],
  )

  const hasNativeToken = String(session?.token || '').trim().length > 0

  const injectedSetupScript = useMemo(() => {
    const token = String(session?.token || '')
      .trim()
      .replace(/^"+|"+$/g, '')

    const escaped = token
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")

    return `
      (function() {
        try {
          var style = document.createElement('style');
          style.id = 'helfi-native-webview-polish';
          document.documentElement.setAttribute('data-helfi-native-webview', '1');
          style.textContent = 'html[data-helfi-native-webview] nav.fixed.bottom-0,html[data-helfi-native-webview] nav.md\\\\:hidden.fixed.bottom-0,html[data-helfi-native-webview] div.md\\\\:hidden.fixed.bottom-0,html[data-helfi-native-webview] div.fixed.bottom-0.left-0.right-0.z-40{display:none!important;}html[data-helfi-native-webview] body{padding-bottom:0!important;}';
          document.head.appendChild(style);
          var t = '${escaped}';
          if (!t) return true;
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
            source={source}
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
            setSupportMultipleWindows={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
          />
        )}
      </View>
    </Screen>
  )
}
