'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'

export default function SupportPage() {
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userImage, setUserImage] = useState<string>('');

  useEffect(() => {
    // Get user image from localStorage or session
    const storedImage = localStorage.getItem('profileImage');
    if (storedImage) {
      setUserImage(storedImage);
    } else if (session?.user?.image) {
      setUserImage(session.user.image);
    }
  }, [session]);

  const displayImage = userImage || session?.user?.image || 'https://ui-avatars.com/api/?name=User&background=E5E7EB&color=374151&rounded=true&size=128';
  const userName = session?.user?.name || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('#profile-dropdown')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
    } else {
      document.removeEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
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
            <div className="ml-4">
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Help & Support</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Get help and contact our team</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/profile" className="text-gray-700 hover:text-helfi-green transition-colors font-medium">
              Profile
            </Link>
            <Link href="/support" className="text-helfi-green font-medium">
              Support
            </Link>
            
            {/* Desktop Profile Avatar & Dropdown */}
            <div className="relative ml-6" id="profile-dropdown">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="focus:outline-none"
                aria-label="Open profile menu"
              >
                <Image
                  src={displayImage}
                  alt="Profile"
                  width={48}
                  height={48}
                  className="rounded-full border-2 border-helfi-green shadow-sm object-cover w-12 h-12"
                />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    <Image
                      src={displayImage}
                      alt="Profile"
                      width={36}
                      height={36}
                      className="rounded-full object-cover mr-3"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{userName}</div>
                      <div className="text-xs text-gray-500 truncate">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link href="/profile" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">Profile</Link>
                    <Link href="/account" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">Account Settings</Link>
                    <Link href="/privacy" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 text-sm">Privacy Settings</Link>
                    <Link href="/support" className="block px-4 py-3 text-helfi-green hover:bg-gray-50 text-sm font-medium">Help & Support</Link>
                  </div>
                  <div className="border-t border-gray-100 pt-1">
                    <button
                      onClick={() => signOut()}
                      className="block w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 font-semibold text-sm"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Contact Support Section */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-helfi-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-helfi-black mb-4">Need Help?</h2>
            <p className="text-xl text-gray-600">Our support team is here to help you get the most out of Helfi</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Email Support */}
            <div className="text-center p-6 bg-helfi-green/5 rounded-xl border border-helfi-green/20">
              <div className="w-12 h-12 bg-helfi-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-helfi-black mb-2">Email Support</h3>
              <p className="text-gray-600 mb-4">Get help with your account, billing, or technical issues</p>
              <a 
                href="mailto:support@helfi.ai" 
                className="inline-flex items-center justify-center bg-helfi-green text-white px-6 py-3 rounded-lg font-semibold hover:bg-helfi-green/90 transition-colors"
              >
                support@helfi.ai
              </a>
              <p className="text-sm text-gray-500 mt-2">We typically respond within 24 hours</p>
            </div>

            {/* FAQ */}
            <div className="text-center p-6 bg-blue-50 rounded-xl border border-blue-200">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-helfi-black mb-2">FAQ</h3>
              <p className="text-gray-600 mb-4">Find quick answers to common questions</p>
              <button 
                onClick={() => document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center justify-center bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                View FAQ
              </button>
            </div>
          </div>
        </div>

        {/* Common Questions */}
        <div id="faq-section" className="bg-white rounded-xl shadow-md p-8">
          <h3 className="text-2xl font-bold text-helfi-black mb-6">Frequently Asked Questions</h3>
          
          <div className="space-y-6">
            <div className="border-b border-gray-200 pb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">How do I get started with Helfi?</h4>
              <p className="text-gray-600">After joining the waitlist, you'll receive an invitation email with setup instructions. You can then create your profile and start tracking your health metrics immediately.</p>
            </div>

            <div className="border-b border-gray-200 pb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Is my health data secure?</h4>
              <p className="text-gray-600">Absolutely. We use enterprise-grade encryption and follow strict privacy protocols. Your data is never shared with third parties without your explicit consent.</p>
            </div>

            <div className="border-b border-gray-200 pb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Can I cancel my subscription anytime?</h4>
              <p className="text-gray-600">Yes, you can cancel your subscription at any time from your account settings. Your data will remain accessible until your current billing period ends.</p>
            </div>

            <div className="border-b border-gray-200 pb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">How does the AI health analysis work?</h4>
              <p className="text-gray-600">Our AI analyzes your health patterns, supplement intake, and lifestyle factors to provide personalized recommendations. The more data you provide, the more accurate the insights become.</p>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Do you offer refunds?</h4>
              <p className="text-gray-600">We offer a 30-day money-back guarantee for new subscribers. If you're not satisfied within the first 30 days, contact support for a full refund.</p>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="bg-white rounded-xl shadow-md p-8 mt-8">
          <h3 className="text-2xl font-bold text-helfi-black mb-6">Send us a message</h3>
          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input 
                  type="text" 
                  id="name" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                  placeholder="your@email.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
              <input 
                type="text" 
                id="subject" 
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                placeholder="What can we help you with?"
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">Message</label>
              <textarea 
                id="message" 
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-helfi-green focus:border-helfi-green"
                placeholder="Tell us more about your question or concern..."
              ></textarea>
            </div>
            <button 
              type="submit" 
              className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg font-semibold hover:bg-helfi-green/90 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                alert('Thank you for your message! We\'ll get back to you at support@helfi.ai within 24 hours.');
              }}
            >
              Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  )
} 