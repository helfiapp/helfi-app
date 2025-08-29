'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

export default function Insights() {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [profileImage, setProfileImage] = useState<string>('')

  // Profile data - using consistent green avatar
  const defaultAvatar = 'data:image/svg+xml;base64,' + btoa(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#10B981"/>
      <circle cx="64" cy="48" r="20" fill="white"/>
      <path d="M64 76c-13.33 0-24 5.34-24 12v16c0 8.84 7.16 16 16 16h16c8.84 0 16-7.16 16-16V88c0-6.66-10.67-12-24-12z" fill="white"/>
    </svg>
  `);
  const userImage = profileImage || session?.user?.image || defaultAvatar;
  const userName = session?.user?.name || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Check if click is outside both the button and the dropdown content
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen]);

  // Load profile image from database
  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        console.log('Insights page - Loading profile image from database...');
        const response = await fetch('/api/user-data', {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Insights page - API response:', { hasData: !!result.data, hasProfileImage: !!(result.data?.profileImage) });
          if (result.data && result.data.profileImage) {
            console.log('Insights page - Setting profile image from database');
            setProfileImage(result.data.profileImage);
          } else {
            console.log('Insights page - No profile image found in database response');
          }
          // Minimal context for explanations
          const goals = Array.isArray(result.data?.goals) ? result.data.goals : []
          const supplements = Array.isArray(result.data?.supplements) ? result.data.supplements.map((s: any) => s.name).filter(Boolean) : []
          const medications = Array.isArray(result.data?.medications) ? result.data.medications.map((m: any) => m.name).filter(Boolean) : []
          const todaysFoods = Array.isArray(result.data?.todaysFoods) ? result.data.todaysFoods : []
          ;(window as any).__insightsUserCtx = { goals, supplements, medications, todaysFoods }
        } else {
          console.error('Insights page - API call failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Insights page - Error loading profile image:', error);
      }
    };

    if (session) {
      loadProfileImage();
    }
  }, [session]);

  const [insights, setInsights] = useState<any[]>([])
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const userCtx = useMemo(() => (typeof window !== 'undefined' ? (window as any).__insightsUserCtx || { goals: [], supplements: [], medications: [], todaysFoods: [] } : { goals: [], supplements: [], medications: [], todaysFoods: [] }), [])
  const [selected, setSelected] = useState<any | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Show visual preview without enabling the real feature
    async function loadPreview() {
      try {
        setLoadingPreview(true)
        const res = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
        const data = await res.json().catch(() => ({}))
        if (data?.items && Array.isArray(data.items)) {
          setInsights(data.items)
        }
      } catch (e) {
        // ignore preview errors
      } finally {
        setLoadingPreview(false)
      }
    }
    loadPreview()
  }, [])

  async function handleRefresh() {
    try {
      setRefreshing(true)
      // Non-blocking regenerate in the background; fetch list immediately
      fetch('/api/insights/generate?preview=1', { method: 'POST' }).catch(() => {})
      const res = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
      const data = await res.json().catch(() => ({}))
      if (data?.items && Array.isArray(data.items)) {
        setInsights(data.items)
        setLastUpdated(new Date().toLocaleTimeString())
      }
    } catch (e) {
      // ignore
    } finally {
      setRefreshing(false)
    }
  }

  // Helpers for UX badges and explanations
  const tagStyles: Record<string, string> = useMemo(() => ({
    goals: 'bg-green-100 text-green-800 border-green-200',
    supplement: 'bg-purple-100 text-purple-800 border-purple-200',
    medication: 'bg-rose-100 text-rose-800 border-rose-200',
    nutrition: 'bg-amber-100 text-amber-800 border-amber-200',
    timing: 'bg-blue-100 text-blue-800 border-blue-200',
    safety: 'bg-red-100 text-red-700 border-red-200',
    energy: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    sleep: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  }), [])

  function renderBadges(tags: string[] = []) {
    return (
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.slice(0, 4).map((t) => (
          <span key={t} className={`px-2 py-0.5 rounded-md text-xs border ${tagStyles[t] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>{t}</span>
        ))}
      </div>
    )
  }

  function explain(it: any): string | null {
    const title = String(it?.title || '').toLowerCase()
    const tags: string[] = Array.isArray(it?.tags) ? it.tags : []

    if (tags.includes('supplement')) {
      const mag = userCtx.supplements?.find((s: string) => /magnesium/i.test(s))
      if (mag && /magnesium/.test(title)) return 'Because you already take magnesium'
      if (userCtx.supplements?.length) return `Based on your supplements: ${userCtx.supplements.slice(0,2).join(', ')}`
    }
    if (tags.includes('medication') && userCtx.medications?.length) {
      return `Based on your medications: ${userCtx.medications.slice(0,1).join(', ')}`
    }
    if (tags.includes('goals') && userCtx.goals?.length) {
      return `You set a goal: ${userCtx.goals[0]}`
    }
    if (tags.includes('nutrition') && userCtx.todaysFoods?.length) {
      return 'Based on your recent foods logged'
    }
    return null
  }

  // Mobile hierarchical grouping
  const categoryPriority = ['goals','timing','nutrition','safety','supplement','medication','sleep','energy']
  const categoryIcon: Record<string, string> = {
    goals: '🎯',
    timing: '⏱️',
    nutrition: '🥗',
    safety: '⚠️',
    supplement: '💊',
    medication: '💉',
    sleep: '🌙',
    energy: '🔋',
  }
  function pickCategory(tags: string[] = []) {
    const lower = tags.map(t => String(t).toLowerCase())
    for (const c of categoryPriority) if (lower.includes(c)) return c
    if (lower.includes('bp')) return 'safety'
    return lower[0] || 'goals'
  }
  const grouped = useMemo(() => {
    const by: Record<string, any[]> = {}
    for (const it of insights) {
      const cat = pickCategory(it.tags)
      by[cat] = by[cat] || []
      by[cat].push(it)
    }
    // sort items stable
    for (const k of Object.keys(by)) by[k] = by[k].slice(0)
    return by
  }, [insights])

  function toggleSection(cat: string) {
    setExpandedSections(s => ({ ...s, [cat]: !s[cat] }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header - First Row */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo on the left */}
          <div className="flex items-center">
            <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={80}
                height={80}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
          </div>
          
          {/* Profile Avatar & Dropdown on the right */}
          <div className="relative dropdown-container" id="profile-dropdown">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="focus:outline-none"
              aria-label="Open profile menu"
            >
              <Image
                src={userImage}
                alt="Profile"
                width={48}
                height={48}
                className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm object-cover"
              />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                <div className="flex items-center px-4 py-3 border-b border-gray-100">
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover mr-3"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{userName}</div>
                    <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                  </div>
                </div>
                <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Second Row - Page Title Centered */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Insights</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Personalized health recommendations</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Your AI Health Insights</h2>
            <button onClick={handleRefresh} disabled={refreshing} className="px-3 py-2 bg-helfi-green text-white rounded-md text-sm disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {lastUpdated && (
            <div className="text-xs text-gray-500 mb-2">Last updated: {lastUpdated}</div>
          )}
          
          {/* Mobile sectioned list */}
          <div className="md:hidden space-y-6">
            {Object.keys(grouped).length > 0 ? (
              categoryPriority
                .filter(cat => grouped[cat]?.length)
                .map((cat) => {
                  const list = grouped[cat]
                  const showAll = expandedSections[cat]
                  const visible = showAll ? list : list.slice(0, 2)
                  return (
                    <div key={cat} className="bg-white border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{categoryIcon[cat] || '🤖'}</span>
                          <h3 className="font-semibold capitalize">{cat}</h3>
                        </div>
                        <button className="text-sm text-helfi-green" onClick={() => toggleSection(cat)}>
                          {showAll ? 'Show less' : 'See all'}
                        </button>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {visible.map((it) => (
                          <button key={it.id} onClick={() => setSelected(it)} className="w-full text-left px-4 py-3 active:bg-gray-50">
                            {renderBadges(it.tags)}
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mt-0.5">
                                <span className="text-white text-sm">🤖</span>
                              </div>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900">{it.title}</div>
                                <div className="text-sm text-gray-700 line-clamp-2">{it.summary}</div>
                                {explain(it) && (
                                  <div className="text-xs text-gray-500 mt-1">Why: {explain(it)}</div>
                                )}
                              </div>
                              <div className="text-gray-400">›</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })
            ) : (
              <div className="text-sm text-gray-600">{loadingPreview ? 'Loading preview…' : 'No insights yet.'}</div>
            )}
          </div>

          {/* Desktop grid remains */}
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {insights.length > 0 ? (
              insights.map((it) => (
                <div key={it.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  {renderBadges(it.tags)}
                  <div className="flex items-center mb-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                      <span className="text-white text-sm">🤖</span>
                    </div>
                    <h3 className="font-semibold text-blue-900">{it.title}</h3>
                  </div>
                  <p className="text-blue-800 text-sm mb-2">{it.summary}</p>
                  {explain(it) && (
                    <div className="text-xs text-blue-900/80">
                      <span className="font-medium">Why you’re seeing this:</span> {explain(it)}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">{loadingPreview ? 'Loading preview…' : 'No insights yet.'}</div>
            )}
          </div>
        </div>

        {/* Coming Soon */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-helfi-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">More Insights Coming Soon</h3>
            <p className="text-gray-600 mb-4">
              We're working on advanced AI insights based on your health data, supplements, and lifestyle factors.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-blue-800 text-sm">
                Preview mode is active. Real insights will appear here automatically once enabled.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation - Inspired by Google, Facebook, Amazon mobile apps */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          
          {/* Dashboard */}
          <Link href="/dashboard" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Dashboard</span>
          </Link>

          {/* Insights (Active) */}
          <Link href="/insights" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-helfi-green">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xs text-helfi-green mt-1 font-bold truncate">Insights</span>
          </Link>

          {/* Food */}
          <Link href="/food" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Food</span>
          </Link>

          {/* Intake (Onboarding) */}
          <Link href="/onboarding?step=1" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Intake</span>
          </Link>

          {/* Settings */}
          <Link href="/settings" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Settings</span>
          </Link>

        </div>
      </nav>

      {/* Mobile detail sheet */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-lg p-4 max-h-[80vh] overflow-auto">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3" />
            {renderBadges(selected.tags)}
            <div className="flex items-center mb-2">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                <span className="text-white text-sm">🤖</span>
              </div>
              <h3 className="font-semibold text-gray-900 text-lg flex-1">{selected.title}</h3>
              <button className="text-sm text-gray-500" onClick={() => setSelected(null)}>Close</button>
            </div>
            <p className="text-gray-800 text-sm mb-2">{selected.summary}</p>
            {explain(selected) && (
              <div className="text-xs text-gray-600 mb-3">Why you’re seeing this: {explain(selected)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 