import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'

import { WebView } from 'react-native-webview'

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

export function NativeWebToolScreen({ route }: { route: any }) {
  const { session } = useAppMode()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const requestedPath = String(route?.params?.path || '/dashboard')
  const source = useMemo(
    () =>
      buildNativeWebSource({
        token: session?.token,
        path: requestedPath,
      }),
    [requestedPath, session?.token],
  )

  const hasNativeToken = String(session?.token || '').trim().length > 0

  const injectedAuthScript = useMemo(() => {
    const token = String(session?.token || '')
      .trim()
      .replace(/^"+|"+$/g, '')
    if (!token) return undefined

    const escaped = token
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")

    return `
      (function() {
        try {
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
            injectedJavaScriptBeforeContentLoaded={injectedAuthScript}
            onLoadStart={() => {
              setLoading(true)
              setFailed(false)
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
