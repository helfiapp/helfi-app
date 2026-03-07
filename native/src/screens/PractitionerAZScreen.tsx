import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { API_BASE_URL } from '../config'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

type ListingItem = {
  id: string
  name: string
  slug: string
  children: { id: string; name: string; slug: string }[]
}

export function PractitionerAZScreen({ navigation }: { navigation: any }) {
  const [listings, setListings] = useState<ListingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedLetter, setSelectedLetter] = useState<string>('')
  const scrollRef = useRef<ScrollView | null>(null)
  const letterOffsetsRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const loadListings = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE_URL}/api/practitioners/a-z`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setListings(Array.isArray(data?.results) ? data.results : [])
        }
      } finally {
        setLoading(false)
      }
    }
    void loadListings()
  }, [])

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return listings
    return listings
      .map((item) => {
        const parentMatch = item.name.toLowerCase().includes(trimmed)
        const matchingChildren = item.children.filter((child) => child.name.toLowerCase().includes(trimmed))
        if (parentMatch) return item
        if (matchingChildren.length > 0) {
          return { ...item, children: matchingChildren }
        }
        return null
      })
      .filter(Boolean) as ListingItem[]
  }, [listings, query])

  const grouped = useMemo(() => {
    const map = new Map<string, ListingItem[]>()
    filtered.forEach((item) => {
      const first = item.name.trim().charAt(0).toUpperCase()
      const key = /^[A-Z]$/.test(first) ? first : '#'
      const bucket = map.get(key) || []
      bucket.push(item)
      map.set(key, bucket)
    })
    return map
  }, [filtered])

  const jumpToLetter = (letter: string) => {
    setSelectedLetter(letter)
    const nextY = letterOffsetsRef.current[letter]
    if (typeof nextY !== 'number' || !Number.isFinite(nextY)) return
    scrollRef.current?.scrollTo({ y: Math.max(0, nextY - 8), animated: true })
  }

  return (
    <Screen>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 1, color: theme.colors.muted }}>BROWSE A-Z</Text>
        <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text, marginTop: 6 }}>Categories A to Z</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
          Scroll or tap a letter to jump to categories. You can also search quickly.
        </Text>

        <View style={{ marginTop: 12, gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories"
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: theme.colors.card,
              color: theme.colors.text,
              fontSize: 14,
            }}
          />
          <Pressable
            onPress={() => navigation.navigate('Practitioners')}
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.card,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Back to search</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 12 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {[...LETTERS, '#'].map((letter) => (
            <Pressable
              key={letter}
              onPress={() => jumpToLetter(letter)}
              style={{
                borderWidth: 1,
                borderColor: selectedLetter === letter ? '#9FD6A1' : theme.colors.border,
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 10,
                backgroundColor: selectedLetter === letter ? '#EAF8EA' : theme.colors.card,
              }}
            >
              <Text style={{ color: selectedLetter === letter ? '#2E7D32' : theme.colors.text, fontWeight: '800', fontSize: 12 }}>{letter}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.card,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={{ color: theme.colors.muted }}>Loading categories…</Text>
          </View>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <View
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.card,
              padding: 14,
            }}
          >
            <Text style={{ color: theme.colors.muted }}>No categories match your search.</Text>
          </View>
        ) : null}

        {!loading &&
          [...LETTERS, '#'].map((letter) => {
            const items = grouped.get(letter)
            if (!items || items.length === 0) return null
            return (
              <View
                key={letter}
                style={{ marginTop: 18 }}
                onLayout={(event) => {
                  letterOffsetsRef.current[letter] = event.nativeEvent.layout.y
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      backgroundColor: '#EAF8EA',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#2E7D32', fontWeight: '900' }}>{letter}</Text>
                  </View>
                  <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>{letter}</Text>
                </View>

                <View style={{ gap: 8 }}>
                  {items.map((item) => (
                    <View
                      key={item.id}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.colors.card,
                        padding: 12,
                        gap: 8,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{item.name}</Text>
                      {item.children.length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {item.children.map((child) => (
                            <Pressable
                              key={child.id}
                              onPress={() =>
                                navigation.navigate('Practitioners', {
                                  categoryId: item.id,
                                  subcategoryId: child.id,
                                })
                              }
                              style={{
                                borderWidth: 1,
                                borderColor: '#DDEBE8',
                                borderRadius: 999,
                                backgroundColor: '#F8FCFB',
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                              }}
                            >
                              <Text style={{ color: theme.colors.muted, fontWeight: '700', fontSize: 12 }}>{child.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            )
          })}
      </ScrollView>
    </Screen>
  )
}
