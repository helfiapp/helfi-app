'use client'

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
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
          
          {/* Back to Home button on the right */}
          <div>
            <Link 
              href="/" 
              className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </nav>

      {/* Page Title */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500 hidden sm:block">How we collect, use, and protect your information</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-8 bg-white mt-8 rounded-lg shadow-sm">
        <div className="prose prose-lg max-w-none">
          <h1 className="text-4xl font-bold text-center mb-2 text-gray-900">Helfi Privacy Policy</h1>
          <p className="text-center text-gray-600 mb-8 text-lg">Effective Date: [Insert Launch Date]</p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <p className="text-gray-700 leading-relaxed">
              This Privacy Policy explains how Helfi ("we," "us," or "our") collects, uses, discloses, and protects your information when you use our mobile application and associated services (collectively, the "App").
            </p>
            <p className="text-gray-700 leading-relaxed mt-3">
              By using the App, you consent to the practices described in this policy. If you do not agree with this Privacy Policy, do not use the App.
            </p>
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">1. Information We Collect</h2>
              
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-800 mb-3">a. Information You Provide Directly:</h3>
                <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                  <li>Name, email address, gender, age, height, weight, and other demographic data</li>
                  <li>Health goals, symptom ratings, supplement and medication data</li>
                  <li>Uploaded content (e.g., supplement labels, symptom images, notes)</li>
                  <li>Laboratory report PDFs and extracted lab test results (analyte names, values, units, reference ranges, collection dates, accession numbers, and laboratory names)</li>
                  <li>Payment and subscription information</li>
                  <li>Customer support communications</li>
                </ul>
              </div>

              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-800 mb-3">b. Automatically Collected Data:</h3>
                <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                  <li>Device information (type, OS version, IP address)</li>
                  <li>App usage logs and activity patterns</li>
                  <li>Error and crash reports</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">c. Data from Wearables & Third-Party Integrations (with your permission):</h3>
                <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                  <li>Apple Health, Google Fit, Garmin, Withings, etc.</li>
                  <li>Steps, heart rate, distance, sleep, calories, etc.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">2. How We Use Your Data</h2>
              <div className="text-gray-700 leading-relaxed mb-3">We use your data to:</div>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>Provide and personalize the App's features</li>
                <li>Deliver AI-generated reports and symptom analysis</li>
                <li>Parse, normalize, display, and analyze laboratory test results for your personal use</li>
                <li>Improve app functionality and AI accuracy through anonymized training data</li>
                <li>Process payments and manage subscriptions</li>
                <li>Send reminders, updates, and relevant notifications</li>
                <li>Respond to support requests and inquiries</li>
                <li>Comply with legal obligations and enforce our Terms of Use</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">3. How We Share Your Data</h2>
              <div className="text-gray-700 leading-relaxed mb-3">
                We do not sell your personal data. We only share it as follows:
              </div>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li><strong>Service Providers:</strong> For hosting, analytics, payment processing, and technical support</li>
                <li><strong>Legal Requirements:</strong> If required by law, court order, or regulatory request</li>
                <li><strong>Business Transfers:</strong> If Helfi is involved in a merger, acquisition, or sale of assets, your data may be transferred</li>
                <li><strong>With Consent:</strong> We may share data if you provide explicit permission</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">4. Data Security</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                We use encryption, secure cloud storage, and access control measures to protect your data. Despite best efforts, no system is completely secure. You use the App at your own risk.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h3 className="text-blue-900 font-semibold mb-2">Laboratory Report Security</h3>
                <ul className="text-blue-800 text-sm space-y-1 list-disc list-inside">
                  <li><strong>TLS in transit:</strong> All data is encrypted during transmission</li>
                  <li><strong>Encryption at rest:</strong> Structured lab data is encrypted using AES-256-GCM with per-record keys</li>
                  <li><strong>KMS envelope encryption:</strong> Data encryption keys are wrapped using AWS KMS</li>
                  <li><strong>SSE-KMS on S3:</strong> Original PDFs (if retained) are encrypted with server-side encryption using KMS</li>
                  <li><strong>Restricted access:</strong> Only authorized workers can decrypt and process PDFs</li>
                  <li><strong>Audit logs:</strong> Full audit trail maintained for all processing activities</li>
                  <li><strong>Password handling:</strong> PDF passwords are used only once for decryption and are never stored</li>
                </ul>
              </div>
              <p className="text-gray-700 leading-relaxed mt-4">
                <strong>Breach notification:</strong> If a breach occurs that may cause harm, Helfi will notify affected users and authorities per the Australian Notifiable Data Breaches scheme.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">5. Your Rights and Choices</h2>
              <div className="text-gray-700 leading-relaxed mb-3">
                Depending on your location, you may have the right to:
              </div>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>Access the data we hold about you</li>
                <li>Request correction or deletion of your data</li>
                <li>Object to or restrict our data processing</li>
                <li>Withdraw consent at any time (affects future processing only)</li>
                <li>Lodge a complaint with a data protection authority</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-3">
                To exercise your rights, contact us at: <a href="mailto:support@helfi.ai" className="text-green-600 hover:text-green-800 font-medium">support@helfi.ai</a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">6. International Users</h2>
              <p className="text-gray-700 leading-relaxed">
                We are based in Australia but serve users worldwide. Your information may be processed in countries with different data protection laws. By using the App, you consent to this transfer and processing.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">7. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                We retain your personal data as long as your account is active or as needed to provide services. We may also retain data to comply with legal obligations, enforce agreements, or resolve disputes. You can request deletion at any time.
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                <h3 className="text-gray-900 font-semibold mb-2">Laboratory Report Retention</h3>
                <ul className="text-gray-700 text-sm space-y-1 list-disc list-inside">
                  <li><strong>Structured data:</strong> Lab values are retained until account deletion</li>
                  <li><strong>Original PDFs:</strong> Deleted by default after extraction unless you choose to retain them</li>
                  <li><strong>Consent records:</strong> Retained for compliance and audit purposes</li>
                  <li><strong>Audit events:</strong> Retained per legal requirements</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">8. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                The App is not intended for users under the age of 18. We do not knowingly collect data from anyone under 18. If we become aware of such data, we will delete it immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">9. Cookies & Tracking Technologies</h2>
              <p className="text-gray-700 leading-relaxed">
                We may use cookies or similar technologies for app functionality, usage analytics, and performance tracking. You can disable tracking through your device settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">10. Changes to This Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. Material changes will be notified within the App or via email. Continued use of the App after changes are posted constitutes your acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">11. Contact Us</h2>
              <div className="text-gray-700 leading-relaxed">
                <p className="mb-2">For questions about this Privacy Policy or your personal data, contact:</p>
                <p><strong>Email:</strong> <a href="mailto:support@helfi.ai" className="text-green-600 hover:text-green-800 font-medium">support@helfi.ai</a></p>
                <p><strong>Mailing Address:</strong> [Insert Business Address Here]</p>
              </div>
            </section>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-12">
            <p className="text-gray-700 leading-relaxed font-medium">
              By using Helfi, you confirm that you have read, understood, and agreed to the terms of this Privacy Policy.
            </p>
          </div>

          <div className="text-center mt-8 pt-8 border-t border-gray-200">
            <p className="text-gray-600">
              For questions or concerns about your privacy, please contact us at: <a href="mailto:support@helfi.ai" className="text-green-600 hover:text-green-800 font-medium">support@helfi.ai</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 