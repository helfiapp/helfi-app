'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

export default function AdminDashboard() {
  const { data: session } = useSession()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-2xl font-bold text-helfi-green">
                Helfi Admin
              </Link>
              <span className="text-sm text-gray-500">Backend Control Panel</span>
            </div>
            <div className="flex items-center space-x-4">
              {session?.user && (
                <>
                  <span className="text-sm text-gray-600">{session.user.email}</span>
                  <button
                    onClick={() => signOut()}
                    className="btn-secondary text-sm"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-helfi-black mb-2">
            Admin Dashboard
          </h1>
          <p className="text-gray-600">
            Manage your Helfi platform backend and user data
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Management */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-helfi-black">User Management</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              View and manage user accounts, subscriptions, and data
            </p>
            <div className="space-y-2">
              <Link href="/admin/users" className="block w-full btn-secondary text-center">
                View Users
              </Link>
              <Link href="/admin/subscriptions" className="block w-full btn-secondary text-center">
                Manage Subscriptions
              </Link>
            </div>
          </div>

          {/* Support Tickets */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-helfi-black">Support Center</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Handle support tickets and user inquiries
            </p>
            <div className="space-y-2">
              <Link href="/admin/tickets" className="block w-full btn-secondary text-center">
                Support Tickets
              </Link>
              <Link href="/admin/help" className="block w-full btn-secondary text-center">
                Help Documentation
              </Link>
            </div>
          </div>

          {/* Analytics */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-helfi-black">Analytics</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              View platform analytics and user metrics
            </p>
            <div className="space-y-2">
              <Link href="/admin/analytics" className="block w-full btn-secondary text-center">
                Platform Stats
              </Link>
              <Link href="/admin/reports" className="block w-full btn-secondary text-center">
                Generate Reports
              </Link>
            </div>
          </div>

          {/* Database Management */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-helfi-black">Database</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Manage database and data operations
            </p>
            <div className="space-y-2">
              <Link href="/admin/database" className="block w-full btn-secondary text-center">
                Database Console
              </Link>
              <Link href="/admin/backup" className="block w-full btn-secondary text-center">
                Backup & Restore
              </Link>
            </div>
          </div>

          {/* System Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-helfi-black">System Settings</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Configure platform settings and integrations
            </p>
            <div className="space-y-2">
              <Link href="/admin/settings" className="block w-full btn-secondary text-center">
                App Settings
              </Link>
              <Link href="/admin/integrations" className="block w-full btn-secondary text-center">
                API Integrations
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-helfi-green/10 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-helfi-black">Quick Actions</h3>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Common administrative tasks
            </p>
            <div className="space-y-2">
              <Link href="/dashboard" className="block w-full btn-primary text-center">
                View as User
              </Link>
              <Link href="/healthapp" className="block w-full btn-secondary text-center">
                Test Health App
              </Link>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-6 border">
          <h3 className="text-lg font-semibold text-helfi-black mb-4">System Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✓</div>
              <div className="text-sm text-gray-600">Database</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✓</div>
              <div className="text-sm text-gray-600">Authentication</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">⚠</div>
              <div className="text-sm text-gray-600">AI Services</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">⚠</div>
              <div className="text-sm text-gray-600">Email Service</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 