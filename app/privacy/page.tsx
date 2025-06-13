'use client'

import React from 'react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-4xl font-bold text-helfi-black mb-8">Privacy Policy</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-6">
              <strong>Last updated:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">1. Introduction</h2>
              <p className="text-gray-700 mb-4">
                At Helfi, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our health intelligence platform.
              </p>
              <p className="text-gray-700 mb-4">
                Your health data is extremely sensitive and personal. We are committed to protecting your privacy and giving you control over your health information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">2. Information We Collect</h2>
              
              <h3 className="text-lg font-semibold text-helfi-black mb-2">Health Information</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Physical metrics (weight, height, body type)</li>
                <li>Health goals and concerns</li>
                <li>Supplement and medication information</li>
                <li>Exercise frequency and types</li>
                <li>Daily health tracking data</li>
                <li>Sleep patterns and quality metrics</li>
                <li>Mood and energy level tracking</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">Account Information</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Email address (for account creation and communication)</li>
                <li>Profile information from OAuth providers (Google)</li>
                <li>Account preferences and settings</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">Technical Information</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Device information and browser type</li>
                <li>IP address and general location (for security)</li>
                <li>Usage patterns and interaction data</li>
                <li>Error logs and performance metrics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">3. How We Use Your Information</h2>
              
              <h3 className="text-lg font-semibold text-helfi-black mb-2">Core Service Delivery</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Generate personalized health insights and recommendations</li>
                <li>Track your health progress over time</li>
                <li>Identify patterns and trends in your health data</li>
                <li>Provide AI-powered analysis of your health metrics</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">Platform Improvement</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Improve our AI algorithms and recommendations (using anonymized data)</li>
                <li>Enhance user experience and platform functionality</li>
                <li>Develop new features and health insights</li>
                <li>Ensure platform security and prevent fraud</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">Communication</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Send you your weekly AI-generated health reports</li>
                <li>Notify you of important health insights or patterns</li>
                <li>Provide customer support and respond to inquiries</li>
                <li>Send important platform updates and security notifications</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">4. Data Security</h2>
              <p className="text-gray-700 mb-4">
                We implement industry-standard security measures to protect your health data:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Encryption:</strong> All data is encrypted in transit (HTTPS) and at rest</li>
                <li><strong>Access Controls:</strong> Strict employee access controls and regular security audits</li>
                <li><strong>Infrastructure:</strong> Secure cloud infrastructure with regular security updates</li>
                <li><strong>Monitoring:</strong> 24/7 security monitoring and threat detection</li>
                <li><strong>Compliance:</strong> GDPR and healthcare data protection compliance</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">5. Data Sharing and Disclosure</h2>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-green-800 font-semibold">
                  🔒 We will NEVER sell your personal health information to third parties.
                </p>
              </div>

              <p className="text-gray-700 mb-4">We may share your information only in these limited circumstances:</p>
              
              <h3 className="text-lg font-semibold text-helfi-black mb-2">Service Providers</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Cloud infrastructure providers (with strict data processing agreements)</li>
                <li>AI/ML service providers for generating insights (anonymized data only)</li>
                <li>Customer support tools (with minimal data access)</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">Legal Requirements</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>When required by law or court order</li>
                <li>To protect our rights, property, or safety</li>
                <li>To investigate fraud or security issues</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">With Your Consent</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Integration with healthcare providers (if you choose)</li>
                <li>Sharing with family members or caregivers (if you enable)</li>
                <li>Research participation (always opt-in and anonymized)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">6. Your Rights and Choices</h2>
              
              <p className="text-gray-700 mb-4">You have complete control over your health data:</p>
              
              <h3 className="text-lg font-semibold text-helfi-black mb-2">Data Access and Portability</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Download all your health data at any time</li>
                <li>Export data in standard formats (JSON, CSV)</li>
                <li>Request a copy of all information we have about you</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">Data Control</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Edit or correct your health information</li>
                <li>Delete specific data points or entire datasets</li>
                <li>Pause or stop data collection at any time</li>
              </ul>

              <h3 className="text-lg font-semibold text-helfi-black mb-2">Account Management</h3>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Delete your account and all associated data</li>
                <li>Opt out of AI insights or data analysis</li>
                <li>Control communication preferences</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">7. Data Retention</h2>
              <p className="text-gray-700 mb-4">
                We retain your health data only as long as necessary to provide our services:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Active accounts:</strong> Data retained while account is active</li>
                <li><strong>Inactive accounts:</strong> Data deleted after 2 years of inactivity</li>
                <li><strong>Account deletion:</strong> All data permanently deleted within 30 days</li>
                <li><strong>Legal requirements:</strong> Some data may be retained longer if required by law</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">8. International Data Transfers</h2>
              <p className="text-gray-700 mb-4">
                Your data may be transferred to and processed in countries other than your own. We ensure that:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>All international transfers comply with applicable data protection laws</li>
                <li>Adequate safeguards are in place to protect your data</li>
                <li>Data processing agreements meet international standards</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">9. Children's Privacy</h2>
              <p className="text-gray-700 mb-4">
                Helfi is not intended for children under 18. We do not knowingly collect personal information from children under 18. 
                If you believe we have collected information from a child under 18, please contact us immediately.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">10. Changes to This Policy</h2>
              <p className="text-gray-700 mb-4">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Posting the updated policy on this page</li>
                <li>Sending you an email notification</li>
                <li>Displaying a notice in the app</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">11. Contact Us</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <ul className="list-none text-gray-700 mb-4 space-y-2">
                <li><strong>Email:</strong> privacy@helfi.ai</li>
                <li><strong>Data Protection Officer:</strong> dpo@helfi.ai</li>
                <li><strong>Mailing Address:</strong> Helfi Privacy Team, [Your Address]</li>
              </ul>
            </section>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <button 
                onClick={() => window.history.back()} 
                className="btn-secondary"
              >
                ← Back
              </button>
              <p className="text-sm text-gray-500">
                Your privacy is our priority. Your data, your control.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 