'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { signOut, useSession } from 'next-auth/react'

const DirectoryMap = dynamic(() => import('@/components/practitioner/DirectoryMap'), { ssr: false })

type CategoryNode = {
  id: string
  name: string
  slug: string
  parentId: string | null
  synonyms: string[]
  sortOrder: number
  children?: CategoryNode[]
}

type ListingForm = {
  displayName: string
  categoryId: string
  subcategoryId: string
  tags: string
  description: string
  phone: string
  websiteUrl: string
  emailPublic: string
  addressLine1: string
  addressLine2: string
  suburbCity: string
  stateRegion: string
  postcode: string
  country: string
  lat: string
  lng: string
  serviceType: string
  languages: string
  hoursNotes: string
  logoUrl: string
  galleryUrls: string
}

type PractitionerStats = {
  rangeStart: string
  rangeEnd: string
  counts: {
    profile_view: number
    call: number
    website: number
    email: number
  }
  total: number
}

type AddressPrediction = {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

const emptyForm: ListingForm = {
  displayName: '',
  categoryId: '',
  subcategoryId: '',
  tags: '',
  description: '',
  phone: '',
  websiteUrl: '',
  emailPublic: '',
  addressLine1: '',
  addressLine2: '',
  suburbCity: '',
  stateRegion: '',
  postcode: '',
  country: '',
  lat: '',
  lng: '',
  serviceType: 'IN_PERSON',
  languages: '',
  hoursNotes: '',
  logoUrl: '',
  galleryUrls: '',
}

export default function PractitionerPage() {
  const { data: session, status } = useSession()
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [dashboard, setDashboard] = useState<any>(null)
  const [form, setForm] = useState<ListingForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [stats, setStats] = useState<PractitionerStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [weeklySummaryEnabled, setWeeklySummaryEnabled] = useState(true)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsSaving, setNotificationsSaving] = useState(false)
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const [testSummaryLoading, setTestSummaryLoading] = useState(false)
  const [testSummaryMessage, setTestSummaryMessage] = useState<string | null>(null)
  const [boostRadiusTier, setBoostRadiusTier] = useState('R10')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<AddressPrediction[]>([])
  const [addressLoading, setAddressLoading] = useState(false)
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false)
  const addressRequestRef = useRef(0)

  const subcategories = useMemo(() => {
    const parent = categories.find((cat) => cat.id === form.categoryId)
    return parent?.children || []
  }, [categories, form.categoryId])

  const boostPriceMap: Record<string, number> = {
    R5: 5,
    R10: 10,
    R25: 15,
    R50: 20,
  }

  const boostLabelMap: Record<string, string> = {
    R5: '5 km',
    R10: '10 km',
    R25: '25 km',
    R50: '50 km',
  }

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/practitioners/categories', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load categories')
      setCategories(data?.categories || [])
    } catch (err: any) {
      console.error(err)
    }
  }

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/practitioner/dashboard', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load your listing')
      setDashboard(data)
      if (data?.listing?.id) {
        const listingRes = await fetch(`/api/practitioner/listings/${data.listing.id}`, { cache: 'no-store' })
        const listingJson = await listingRes.json().catch(() => ({}))
        if (listingRes.ok && listingJson?.listing) {
          const listing = listingJson.listing
          setAddressQuery(listing.addressLine1 || '')
          setForm({
            displayName: listing.displayName || '',
            categoryId: listing.categoryId || '',
            subcategoryId: listing.subcategoryId || '',
            tags: (listing.tags || []).join(', '),
            description: listing.description || '',
            phone: listing.phone || '',
            websiteUrl: listing.websiteUrl || '',
            emailPublic: listing.emailPublic || '',
            addressLine1: listing.addressLine1 || '',
            addressLine2: listing.addressLine2 || '',
            suburbCity: listing.suburbCity || '',
            stateRegion: listing.stateRegion || '',
            postcode: listing.postcode || '',
            country: listing.country || '',
            lat: listing.lat ? String(listing.lat) : '',
            lng: listing.lng ? String(listing.lng) : '',
            serviceType: listing.serviceType || 'IN_PERSON',
            languages: (listing.languages || []).join(', '),
            hoursNotes: listing.hoursJson?.notes || '',
            logoUrl: listing.images?.logoUrl || '',
            galleryUrls: Array.isArray(listing.images?.gallery) ? listing.images.gallery.join(', ') : '',
          })
        }
      } else {
        setForm(emptyForm)
        setAddressQuery('')
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load your listing')
    } finally {
      setLoading(false)
    }
  }

  const findAddressComponent = (components: any[], types: string[]) => {
    return components.find((component) => types.some((type) => component?.types?.includes(type)))
  }

  const handleAddressSelect = async (prediction: AddressPrediction) => {
    setAddressQuery(prediction.description)
    setShowAddressSuggestions(false)
    setAddressLoading(true)
    try {
      const res = await fetch(`/api/practitioner/places/details?placeId=${encodeURIComponent(prediction.placeId)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load address details')

      const components = Array.isArray(data?.place?.addressComponents) ? data.place.addressComponents : []
      const streetNumber = findAddressComponent(components, ['street_number'])?.long_name || ''
      const route = findAddressComponent(components, ['route'])?.long_name || ''
      const line1 = [streetNumber, route].filter(Boolean).join(' ')
      const subpremise = findAddressComponent(components, ['subpremise'])?.long_name || ''
      const city =
        findAddressComponent(components, ['locality'])?.long_name ||
        findAddressComponent(components, ['postal_town'])?.long_name ||
        findAddressComponent(components, ['sublocality_level_1'])?.long_name ||
        findAddressComponent(components, ['administrative_area_level_2'])?.long_name ||
        ''
      const state = findAddressComponent(components, ['administrative_area_level_1'])?.short_name || ''
      const postcode = findAddressComponent(components, ['postal_code'])?.long_name || ''
      const country = findAddressComponent(components, ['country'])?.long_name || ''
      const location = data?.place?.geometry?.location

      setForm((prev) => ({
        ...prev,
        addressLine1: line1 || prediction.description,
        addressLine2: subpremise,
        suburbCity: city,
        stateRegion: state,
        postcode,
        country,
        lat: location?.lat != null ? String(location.lat) : prev.lat,
        lng: location?.lng != null ? String(location.lng) : prev.lng,
      }))
    } catch (err) {
      console.error('Address lookup failed', err)
    } finally {
      setAddressLoading(false)
    }
  }

  useEffect(() => {
    if (!addressQuery || addressQuery.trim().length < 3) {
      setAddressSuggestions([])
      setAddressLoading(false)
      return
    }

    const requestId = ++addressRequestRef.current
    const timeout = window.setTimeout(async () => {
      setAddressLoading(true)
      try {
        const res = await fetch(`/api/practitioner/places/autocomplete?q=${encodeURIComponent(addressQuery.trim())}`)
        const data = await res.json().catch(() => ({}))
        if (requestId !== addressRequestRef.current) return
        if (!res.ok) throw new Error(data?.error || 'Failed to load suggestions')
        setAddressSuggestions(Array.isArray(data?.predictions) ? data.predictions : [])
      } catch (err) {
        console.error('Address autocomplete failed', err)
        if (requestId === addressRequestRef.current) {
          setAddressSuggestions([])
        }
      } finally {
        if (requestId === addressRequestRef.current) {
          setAddressLoading(false)
        }
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [addressQuery])

  const loadStats = async () => {
    setStatsLoading(true)
    setStatsError(null)
    try {
      const res = await fetch('/api/practitioner/stats', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load stats')
      setStats(data?.stats || null)
    } catch (err: any) {
      setStatsError(err?.message || 'Failed to load stats')
    } finally {
      setStatsLoading(false)
    }
  }

  const loadNotifications = async () => {
    setNotificationsLoading(true)
    setNotificationsError(null)
    try {
      const res = await fetch('/api/practitioner/notifications', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load email preferences')
      setWeeklySummaryEnabled(data?.preferences?.weeklySummaryEnabled !== false)
    } catch (err: any) {
      setNotificationsError(err?.message || 'Failed to load email preferences')
    } finally {
      setNotificationsLoading(false)
    }
  }

  useEffect(() => {
    if (!session?.user) return
    loadCategories()
    loadDashboard()
    loadStats()
    loadNotifications()
  }, [session])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setSuccess('Subscription started successfully.')
    }
    if (params.get('boost') === 'success') {
      setSuccess('Boost purchase confirmed.')
    }
  }, [])

  const formatDate = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString()
  }

  const updateWeeklySummaryEnabled = async (nextValue: boolean) => {
    const previous = weeklySummaryEnabled
    setWeeklySummaryEnabled(nextValue)
    setNotificationsSaving(true)
    setNotificationsError(null)
    setTestSummaryMessage(null)
    try {
      const res = await fetch('/api/practitioner/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklySummaryEnabled: nextValue }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save email preferences')
      setWeeklySummaryEnabled(Boolean(data?.preferences?.weeklySummaryEnabled))
    } catch (err: any) {
      setNotificationsError(err?.message || 'Failed to save email preferences')
      setWeeklySummaryEnabled(previous)
    } finally {
      setNotificationsSaving(false)
    }
  }

  const sendTestSummary = async () => {
    setTestSummaryLoading(true)
    setNotificationsError(null)
    setTestSummaryMessage(null)
    try {
      const res = await fetch('/api/practitioner/contact-summary-test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to send test email')
      if (data?.sent) {
        setTestSummaryMessage('Test summary sent. Please check your inbox.')
      } else {
        setTestSummaryMessage(data?.message || 'No recent activity to include yet.')
      }
    } catch (err: any) {
      setNotificationsError(err?.message || 'Failed to send test email')
    } finally {
      setTestSummaryLoading(false)
    }
  }

  const updateField = (key: keyof ListingForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleCreateOrSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        ...form,
        tags: form.tags,
        languages: form.languages,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
        images: {
          logoUrl: form.logoUrl ? form.logoUrl.trim() : null,
          gallery: form.galleryUrls
            ? form.galleryUrls.split(',').map((item) => item.trim()).filter(Boolean)
            : [],
        },
      }

      const method = dashboard?.listing?.id ? 'PUT' : 'POST'
      const url = dashboard?.listing?.id
        ? `/api/practitioner/listings/${dashboard.listing.id}`
        : '/api/practitioner/listings'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Save failed')
      setSuccess('Saved successfully.')
      await loadDashboard()
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (!dashboard?.listing?.id) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/practitioner/listings/${dashboard.listing.id}/submit`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Submission failed')
      setSuccess('Submitted. We are reviewing it now. This usually takes a few seconds.')
      await loadDashboard()
    } catch (err: any) {
      setError(err?.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartSubscription = async () => {
    setError(null)
    try {
      const res = await fetch('/api/practitioner/subscription/checkout', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not start subscription')
      if (data?.url) window.location.href = data.url
    } catch (err: any) {
      setError(err?.message || 'Could not start subscription')
    }
  }

  const handleManageSubscription = async () => {
    setError(null)
    try {
      const res = await fetch('/api/practitioner/subscription/portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not open subscription management')
      if (data?.url) window.location.href = data.url
    } catch (err: any) {
      setError(err?.message || 'Could not open subscription management')
    }
  }

  const handleBoostPurchase = async () => {
    setError(null)
    try {
      const res = await fetch('/api/practitioner/boost/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radiusTier: boostRadiusTier }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not start boost purchase')
      if (data?.url) window.location.href = data.url
    } catch (err: any) {
      setError(err?.message || 'Could not start boost purchase')
    }
  }

  const uploadListingImage = async (file: File, kind: 'logo' | 'gallery') => {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('kind', kind)
    const res = await fetch('/api/practitioner/uploads', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Upload failed')
    return String(data?.url || '')
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setSuccess(null)
    setLogoUploading(true)
    try {
      const url = await uploadListingImage(file, 'logo')
      if (url) updateField('logoUrl', url)
    } catch (err: any) {
      setError(err?.message || 'Logo upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setError(null)
    setSuccess(null)
    setGalleryUploading(true)
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const url = await uploadListingImage(file, 'gallery')
        if (url) uploaded.push(url)
      }
      if (uploaded.length) {
        const existing = form.galleryUrls
          ? form.galleryUrls.split(',').map((item) => item.trim()).filter(Boolean)
          : []
        updateField('galleryUrls', [...existing, ...uploaded].join(', '))
      }
    } catch (err: any) {
      setError(err?.message || 'Gallery upload failed')
    } finally {
      setGalleryUploading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      setError('Please type DELETE to confirm account deletion.')
      return
    }
    setDeleteLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/practitioner/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: deleteConfirm }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Delete failed')
      await signOut({ callbackUrl: '/practitioners' })
    } catch (err: any) {
      setError(err?.message || 'Delete failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      alert('Location is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateField('lat', String(pos.coords.latitude))
        updateField('lng', String(pos.coords.longitude))
      },
      () => {
        alert('We could not access your location. Please enter it manually.')
      }
    )
  }

  const hasStripeSubscription = Boolean(dashboard?.listing?.stripeSubscriptionId)

  if (status === 'loading') {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Practitioner Listing</h1>
          <p className="text-gray-600 mt-2">Loading your account…</p>
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Practitioner Listing</h1>
          <p className="text-gray-600 mt-2">Create an account or sign in to list your practice.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              replace
              className="px-5 py-2.5 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
              href="/auth/signin?context=practitioner&mode=signup&next=/practitioner"
            >
              Create account
            </Link>
            <Link
              replace
              className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 font-semibold hover:border-helfi-green/60 hover:text-helfi-green transition-colors"
              href="/auth/signin?context=practitioner&next=/practitioner"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (session?.user?.isPractitioner === false) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Practitioner Portal</h1>
          <p className="text-gray-600 mt-2">
            This portal is for practitioner accounts only. Please sign out and create a practitioner account to list your practice.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => signOut({ callbackUrl: '/practitioners' })}
              className="px-5 py-2.5 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
            >
              Sign out and create practitioner account
            </button>
            <Link
              replace
              className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 font-semibold hover:border-helfi-green/60 hover:text-helfi-green transition-colors"
              href="/list-your-practice"
            >
              Learn more
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Practitioner Listing</h1>
            <div className="flex items-center gap-3 text-sm">
              <button
                onClick={() => signOut({ callbackUrl: '/practitioners' })}
                className="text-emerald-700 font-semibold hover:underline"
              >
                Sign out
              </button>
              <a
                href="/public-home"
                className="text-emerald-700 hover:underline"
              >
                Go to the public homepage
              </a>
            </div>
          </div>
          <p className="text-gray-600 mt-2">
            Create your listing, then submit it for a quick review. Listings only go live after review.
          </p>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-sm text-gray-600">
            Loading your listing…
          </div>
        )}

        {!loading && dashboard?.listing && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-2">
            <div className="text-sm text-gray-600">Status</div>
            <div className="text-lg font-semibold text-gray-900">
              {dashboard.listing.status} · {dashboard.listing.reviewStatus}
            </div>
            {dashboard.listing.trialDaysLeft !== null && (
              <div className="text-sm text-gray-600">
                Trial days left: {dashboard.listing.trialDaysLeft}
              </div>
            )}
            {dashboard.listing.reviewStatus === 'FLAGGED' && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Your listing needs a manual review for safety. It will stay hidden until our team approves it. We will email you once a decision is made.
              </div>
            )}
            {dashboard.listing.reviewStatus === 'REJECTED' && dashboard.listing.reviewNotes && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
                {dashboard.listing.reviewNotes}
              </div>
            )}
            {dashboard.listing.slug && dashboard.listing.reviewStatus === 'APPROVED' && (
              <div>
                <a
                  href={`/practitioners/${dashboard.listing.slug}`}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-emerald-200 text-emerald-700 text-sm font-semibold hover:border-emerald-300 hover:text-emerald-800 transition-colors"
                >
                  View your listing
                </a>
              </div>
            )}
          </div>
        )}

        {!loading && dashboard?.listing && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Performance</h2>
                <p className="text-sm text-gray-600">Last 7 days of activity from your listing.</p>
              </div>
              <button
                onClick={loadStats}
                className="px-4 py-2 rounded-full border border-gray-200 text-gray-700 text-sm font-semibold hover:border-emerald-200 hover:text-emerald-700 transition-colors"
                disabled={statsLoading}
              >
                {statsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {statsError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {statsError}
              </div>
            )}

            {!statsLoading && !statsError && !stats && (
              <div className="text-sm text-gray-600">No activity yet. Your stats will appear after people interact with your listing.</div>
            )}

            {!statsLoading && !statsError && stats && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Profile views</div>
                    <div className="text-2xl font-semibold text-gray-900">{stats.counts.profile_view}</div>
                  </div>
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Calls</div>
                    <div className="text-2xl font-semibold text-gray-900">{stats.counts.call}</div>
                  </div>
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Website clicks</div>
                    <div className="text-2xl font-semibold text-gray-900">{stats.counts.website}</div>
                  </div>
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Emails</div>
                    <div className="text-2xl font-semibold text-gray-900">{stats.counts.email}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span>Range: {formatDate(stats.rangeStart)} – {formatDate(stats.rangeEnd)}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                    Total actions: {stats.total}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && dashboard?.listing && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Email preferences</h2>
              <p className="text-sm text-gray-600">Control whether you receive the weekly activity summary email.</p>
            </div>

            {notificationsError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {notificationsError}
              </div>
            )}

            {testSummaryMessage && (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {testSummaryMessage}
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={weeklySummaryEnabled}
                  onChange={(event) => updateWeeklySummaryEnabled(event.target.checked)}
                  disabled={notificationsLoading || notificationsSaving}
                  className="h-4 w-4 text-emerald-600 border-gray-300 rounded"
                />
                Weekly summary emails
              </label>
              <button
                onClick={sendTestSummary}
                className="px-4 py-2 rounded-full border border-emerald-200 text-emerald-700 text-sm font-semibold hover:border-emerald-300 hover:text-emerald-800 transition-colors"
                disabled={testSummaryLoading || notificationsLoading || notificationsSaving}
              >
                {testSummaryLoading ? 'Sending…' : 'Send a test summary'}
              </button>
            </div>
          </div>
        )}

        {!loading && dashboard?.listing?.reviewStatus === 'APPROVED' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
              <p className="text-sm text-gray-600">Keep your listing active after the free trial.</p>
            </div>
            <div className="text-sm text-gray-700">
              Status: {dashboard.listing.subscriptionStatus || 'Not started'}
            </div>
            <div className="flex flex-wrap gap-3">
              {hasStripeSubscription ? (
                <button
                  onClick={handleManageSubscription}
                  className="px-5 py-2.5 rounded-full border border-emerald-200 text-emerald-700 font-semibold hover:border-emerald-400 transition-colors"
                >
                  Manage subscription
                </button>
              ) : (
                <button
                  onClick={handleStartSubscription}
                  className="px-5 py-2.5 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
                >
                  Start subscription ($4.95/month)
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && dashboard?.listing?.reviewStatus === 'APPROVED' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Boost your listing</h2>
              <p className="text-sm text-gray-600">Choose a radius to move your listing to the top for 7 days.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Boost radius</label>
                <select
                  value={boostRadiusTier}
                  onChange={(e) => setBoostRadiusTier(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="R5">5 km ($5)</option>
                  <option value="R10">10 km ($10)</option>
                  <option value="R25">25 km ($15)</option>
                  <option value="R50">50 km ($20)</option>
                </select>
                <div className="text-sm text-gray-700">
                  Price: ${boostPriceMap[boostRadiusTier]}.00 USD for 7 days
                </div>
                <div className="text-sm text-gray-600">
                  Boosts are available once your listing is approved.
                </div>
                {(!form.lat || !form.lng) && (
                  <div className="text-sm text-amber-700">
                    Add your location to enable boosts.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleBoostPurchase}
                    disabled={!form.lat || !form.lng}
                    className="px-5 py-2.5 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    Purchase boost
                  </button>
                  <button
                    onClick={handleUseLocation}
                    className="px-5 py-2.5 rounded-full border border-gray-300 text-gray-700 font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                  >
                    Use my location
                  </button>
                </div>
              </div>
              {form.lat && form.lng && (
                <div className="h-56">
                  <DirectoryMap
                    center={{ lat: Number(form.lat), lng: Number(form.lng) }}
                    radiusKm={boostRadiusTier === 'R5' ? 5 : boostRadiusTier === 'R10' ? 10 : boostRadiusTier === 'R25' ? 25 : 50}
                    markers={[{ id: 'listing', name: 'Your location', lat: Number(form.lat), lng: Number(form.lng) }]}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {!loading && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Listing name</label>
                <input
                  value={form.displayName}
                  onChange={(e) => updateField('displayName', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Practice or practitioner name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Service type</label>
                <select
                  value={form.serviceType}
                  onChange={(e) => updateField('serviceType', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="IN_PERSON">In-person</option>
                  <option value="TELEHEALTH">Telehealth</option>
                  <option value="BOTH">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => updateField('categoryId', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subcategory (optional)</label>
                <select
                  value={form.subcategoryId}
                  onChange={(e) => updateField('subcategoryId', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Choose a subcategory</option>
                  {subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags (comma separated)</label>
                <input
                  value={form.tags}
                  onChange={(e) => updateField('tags', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Sports injury, Telehealth, Anxiety"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Languages (comma separated)</label>
                <input
                  value={form.languages}
                  onChange={(e) => updateField('languages', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="English, Spanish"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">About your practice</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Tell people what you help with and what makes you different."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="+1 555 123 4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                <input
                  value={form.websiteUrl}
                  onChange={(e) => updateField('websiteUrl', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Public email (shown on listing)</label>
                <input
                  value={form.emailPublic}
                  onChange={(e) => updateField('emailPublic', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="hello@yourclinic.com"
                />
                <p className="text-xs text-gray-500 mt-1">This can be different from your login email.</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Location</div>
                  <p className="text-xs text-gray-500">Enter your practice address or use your current location.</p>
                </div>
                <button
                  onClick={handleUseLocation}
                  className="px-3 py-2 bg-gray-100 text-gray-800 rounded-md text-sm hover:bg-gray-200"
                >
                  Use my location
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search address</label>
                  <div className="relative">
                    <input
                      value={addressQuery}
                      onChange={(e) => {
                        setAddressQuery(e.target.value)
                        setShowAddressSuggestions(true)
                      }}
                      onFocus={() => setShowAddressSuggestions(true)}
                      onBlur={() => {
                        window.setTimeout(() => setShowAddressSuggestions(false), 150)
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Start typing your address..."
                    />
                    {showAddressSuggestions && (addressSuggestions.length > 0 || addressLoading) && (
                      <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
                        {addressLoading && (
                          <div className="px-4 py-3 text-sm text-gray-500">Searching addresses...</div>
                        )}
                        {addressSuggestions.map((item) => (
                          <button
                            type="button"
                            key={item.placeId}
                            onClick={() => handleAddressSelect(item)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm"
                          >
                            <div className="font-medium text-gray-900">{item.mainText || item.description}</div>
                            {item.secondaryText && (
                              <div className="text-xs text-gray-500">{item.secondaryText}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Select a suggestion to auto-fill the address fields.</p>
                </div>
                <input
                  value={form.addressLine1}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Address line 1"
                />
                <input
                  value={form.addressLine2}
                  onChange={(e) => updateField('addressLine2', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Address line 2"
                />
                <input
                  value={form.suburbCity}
                  onChange={(e) => updateField('suburbCity', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="City / Suburb"
                />
                <input
                  value={form.stateRegion}
                  onChange={(e) => updateField('stateRegion', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="State / Region"
                />
                <input
                  value={form.postcode}
                  onChange={(e) => updateField('postcode', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Postcode"
                />
                <input
                  value={form.country}
                  onChange={(e) => updateField('country', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Country"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  value={form.lat}
                  onChange={(e) => updateField('lat', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Latitude"
                />
                <input
                  value={form.lng}
                  onChange={(e) => updateField('lng', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Longitude"
                />
              </div>
              <p className="text-xs text-gray-500">We will add the map picker next. For now, you can paste the coordinates.</p>
              {form.lat && form.lng && (
                <div className="h-56">
                  <DirectoryMap
                    center={{ lat: Number(form.lat), lng: Number(form.lng) }}
                    markers={[{ id: 'listing', name: 'Your location', lat: Number(form.lat), lng: Number(form.lng) }]}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Opening hours (notes)</label>
                <textarea
                  value={form.hoursNotes}
                  onChange={(e) => updateField('hoursNotes', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Mon-Fri 9am-5pm, Sat 10am-2pm"
                />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Logo URL (optional)</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      value={form.logoUrl}
                      onChange={(e) => updateField('logoUrl', e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="https://"
                    />
                    <label className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 cursor-pointer hover:border-emerald-300 hover:text-emerald-700 text-center">
                      {logoUploading ? 'Uploading…' : 'Upload logo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                        disabled={logoUploading}
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gallery image URLs (comma separated)</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      value={form.galleryUrls}
                      onChange={(e) => updateField('galleryUrls', e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="https://, https://"
                    />
                    <label className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 cursor-pointer hover:border-emerald-300 hover:text-emerald-700 text-center">
                      {galleryUploading ? 'Uploading…' : 'Upload images'}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleGalleryUpload}
                        disabled={galleryUploading}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">After uploading, click Save listing to publish the images.</p>
                </div>
              </div>
            </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleCreateOrSave}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save listing'}
                </button>
                {dashboard?.listing?.id && (
                  <button
                    onClick={handleSubmitForReview}
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-full border border-emerald-200 text-emerald-700 font-semibold hover:border-emerald-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting…' : 'Submit for review'}
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Delete your account</h2>
                <p className="text-sm text-gray-600">
                  This permanently deletes your practitioner account and all related data. This cannot be undone.
                </p>
              </div>
              <div className="max-w-sm space-y-2">
                <label className="block text-sm font-medium text-gray-700">Type DELETE to confirm</label>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="DELETE"
                />
              </div>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="px-5 py-2.5 rounded-full bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
