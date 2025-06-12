'use client'

import React from 'react'

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-4xl font-bold text-helfi-black mb-8">Terms and Conditions</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-6">
              <strong>Last updated:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-700 mb-4">
                By accessing and using Helfi ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">2. Medical Disclaimer</h2>
              <p className="text-gray-700 mb-4">
                <strong>IMPORTANT:</strong> Helfi is not a medical device and does not provide medical advice, diagnosis, or treatment. 
                The information provided by our platform is for informational purposes only and should not replace professional medical advice.
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Always consult with a qualified healthcare provider before making any health-related decisions</li>
                <li>Do not disregard professional medical advice or delay seeking treatment because of information provided by Helfi</li>
                <li>If you have a medical emergency, contact emergency services immediately</li>
                <li>Supplement and medication interactions should be reviewed with your healthcare provider</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">3. Use License</h2>
              <p className="text-gray-700 mb-4">
                Permission is granted to temporarily use Helfi for personal, non-commercial transitory viewing only. This includes:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Tracking your personal health metrics</li>
                <li>Receiving AI-generated insights based on your data</li>
                <li>Accessing educational content and recommendations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">4. User Data and Privacy</h2>
              <p className="text-gray-700 mb-4">
                Your health data is sensitive and important to us. By using Helfi, you acknowledge that:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>You own your health data and can delete it at any time</li>
                <li>We use your data to provide personalized insights and recommendations</li>
                <li>We implement industry-standard security measures to protect your data</li>
                <li>We will never sell your personal health information to third parties</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">5. AI-Generated Content</h2>
              <p className="text-gray-700 mb-4">
                Our platform uses artificial intelligence to generate insights and recommendations. You understand that:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>AI recommendations are based on patterns in your data and general health knowledge</li>
                <li>AI insights are not medical advice and should not replace professional healthcare</li>
                <li>The accuracy of AI recommendations may vary and should be validated with healthcare providers</li>
                <li>You use AI-generated insights at your own discretion and risk</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">6. Prohibited Uses</h2>
              <p className="text-gray-700 mb-4">You may not use Helfi:</p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>For any unlawful purpose or to solicit others to unlawful acts</li>
                <li>To violate any international, federal, provincial, or state regulations or laws</li>
                <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
                <li>To submit false or misleading health information</li>
                <li>To attempt to gain unauthorized access to our systems</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">7. Service Availability</h2>
              <p className="text-gray-700 mb-4">
                We strive to maintain high service availability, but we do not guarantee uninterrupted access to Helfi. 
                Service may be temporarily unavailable due to maintenance, updates, or technical issues.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">8. Limitation of Liability</h2>
              <p className="text-gray-700 mb-4">
                Helfi and its affiliates shall not be liable for any indirect, incidental, special, consequential, 
                or punitive damages resulting from your use of the service, including but not limited to health decisions 
                made based on platform recommendations.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">9. Changes to Terms</h2>
              <p className="text-gray-700 mb-4">
                We reserve the right to modify these terms at any time. Updated terms will be posted on this page 
                with a new "Last updated" date. Continued use of the service constitutes acceptance of modified terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-helfi-black mb-4">10. Contact Information</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about these Terms and Conditions, please contact us at legal@helfi.ai
              </p>
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
                By using Helfi, you agree to these terms and conditions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 