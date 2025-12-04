'use client'

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo on the left */}
          <div className="flex items-center">
            <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="/mobile-assets/LOGOS/helfi-01-01.png"
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
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Terms of Use</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Legal terms and conditions for using Helfi</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-8 bg-white mt-8 rounded-lg shadow-sm">
        <div className="prose prose-lg max-w-none">
          <h1 className="text-4xl font-bold text-center mb-2 text-gray-900">Helfi Terms of Use</h1>
          <p className="text-center text-gray-600 mb-8 text-lg">Effective Date: [Insert Launch Date]</p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <p className="text-gray-700 leading-relaxed">
              By accessing or using the Helfi app and related services ("Helfi", "we", "us", or "our"), you ("user", "you") agree to be bound by these Terms of Use and our Privacy Policy. Please read them carefully before using the app.
            </p>
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">1. Medical Disclaimer</h2>
              <p className="text-gray-700 leading-relaxed">
                Helfi is not a licensed medical provider and does not provide medical advice, diagnosis, or treatment. All content, including AI-generated responses, health reports, symptom analyses, supplement suggestions, and any other information provided by Helfi is for informational purposes only. It should not be relied upon for medical decisions. You must consult a qualified healthcare professional for any medical concerns. Use of Helfi does not create a doctor-patient relationship.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">2. User Responsibilities</h2>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>You must be at least 18 years of age to use Helfi.</li>
                <li>You agree to provide accurate, complete, and up-to-date information about yourself and your health.</li>
                <li>You are solely responsible for any decisions or actions you take based on information provided by Helfi.</li>
                <li>You understand that supplement-medication contradictions, AI-based symptom guesses, and lifestyle advice are not substitutes for clinical evaluation.</li>
                <li>Helfi is available internationally. It is your responsibility to ensure that your use of Helfi complies with the laws, regulations, and rules of the country or jurisdiction in which you reside.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">3. Subscription and Payment</h2>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>Helfi offers both free and paid subscription plans.</li>
                <li>Paid features (e.g., AI health reports, symptom analyzer, wearable sync, unlimited goals, AI chatbot) require an active subscription.</li>
                <li>All payments are billed in AUD and are non-refundable, except as required by law.</li>
                <li>Subscriptions renew automatically unless canceled.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">4. Content & Data Usage</h2>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>By uploading information, images, or descriptions (e.g., supplement bottles, symptoms), you grant us a non-exclusive, royalty-free, worldwide license to use that data for the purpose of providing and improving our services.</li>
                <li>Helfi uses machine learning and artificial intelligence. Uploaded data may be used anonymously to enhance algorithm performance.</li>
                <li>We do not sell personal data to third parties. For full data handling terms, refer to our Privacy Policy.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">4a. Laboratory Report PDFs</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                By uploading a laboratory report in PDF format, you represent that you are permitted to provide the report to Helfi for the sole purpose of extracting and analyzing laboratory test results for your personal use.
              </p>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>If your PDF is password-protected and you choose to supply the password, you expressly authorize Helfi to use that password once to decrypt and process the file. We do not store your password.</li>
                <li>You may choose whether Helfi retains an encrypted copy of your original PDF; by default, we delete the original file after extraction.</li>
                <li>We may refuse processing of unreadable or corrupted files.</li>
                <li>Structured lab data (analyte names, values, units, reference ranges, collection dates, accession numbers, and laboratory names) is extracted and encrypted at rest using industry-standard encryption.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">5. Security & Encryption</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                Helfi uses industry-standard encryption to protect sensitive information in transit and at rest. Structured data is encrypted using per-record keys, and retained originals are encrypted with managed key services. If a breach occurs that may cause harm, Helfi will notify affected users and authorities per applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">6. AI Limitations and Liability</h2>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>AI suggestions are based on pattern recognition and probability, not clinical assessment.</li>
                <li>Helfi may occasionally provide incorrect or incomplete information.</li>
                <li>You agree that Helfi is not liable for any harm, injury, delay, loss, or damage arising from reliance on any content, feature, or AI output.</li>
                <li>All features are used at your own risk.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">7. Intellectual Property</h2>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>All content, design, software, and functionality of the app are owned by Helfi or its licensors.</li>
                <li>You may not reproduce, distribute, reverse-engineer, or exploit any part of the app without our prior written consent.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">8. Account Termination</h2>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>We reserve the right to suspend or terminate accounts that violate these terms, misuse the platform, or engage in unlawful activity.</li>
                <li>You may cancel your account at any time via your profile settings.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">9. Indemnification</h2>
              <p className="text-gray-700 leading-relaxed">
                You agree to defend, indemnify, and hold harmless Helfi, its owners, officers, employees, agents, partners, and affiliates from and against any claims, liabilities, damages, losses, or expenses (including legal fees) arising out of or related to:
              </p>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6 mt-3">
                <li>Your use of the app</li>
                <li>Any data or content submitted by you</li>
                <li>Violation of these Terms or applicable laws</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">10. Dispute Resolution and Governing Law</h2>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>These Terms are governed by the laws of Victoria, Australia, regardless of conflict-of-law principles.</li>
                <li>Any disputes, claims, or legal proceedings arising from your use of the app shall be resolved exclusively through arbitration or courts located in Melbourne, Victoria, Australia.</li>
                <li>You expressly waive any right to bring claims in another jurisdiction or to participate in class action proceedings.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">11. Modifications</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update these Terms of Use at any time. Continued use of the app after changes are posted constitutes your acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">12. No Emergency Services Clause</h2>
              <p className="text-gray-700 leading-relaxed">
                Helfi is not intended for use in emergency situations. Do not use the app to seek or provide help in emergencies. If you are experiencing a medical emergency, call your local emergency number immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">13. Limitation of Liability (Expanded)</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                To the fullest extent permitted by applicable law, Helfi and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, use, goodwill, or other intangible losses resulting from:
              </p>
              <ul className="text-gray-700 leading-relaxed space-y-2 list-disc pl-6">
                <li>Your access to or use of or inability to access or use the app;</li>
                <li>Any conduct or content of any third party on the app;</li>
                <li>Any content obtained from the app;</li>
                <li>Unauthorized access, use, or alteration of your transmissions or content.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">14. Force Majeure</h2>
              <p className="text-gray-700 leading-relaxed">
                Helfi shall not be held liable for any failure or delay in performance caused by circumstances beyond its reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, labor conditions, power failures, internet disturbances, cyberattacks, or government actions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">15. Severability</h2>
              <p className="text-gray-700 leading-relaxed">
                If any provision of these Terms is found to be unlawful, void, or unenforceable for any reason, that provision shall be deemed severable and shall not affect the validity or enforceability of the remaining provisions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">16. Export Control</h2>
              <p className="text-gray-700 leading-relaxed">
                You agree not to use, export, or re-export the app except as authorized by the laws of Australia and the laws of the jurisdiction in which the app was obtained. You represent and warrant that you are not located in any country subject to Australian government embargo or listed on any government list of prohibited or restricted parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b-2 border-green-500 pb-2">17. Assignment</h2>
              <p className="text-gray-700 leading-relaxed">
                You may not assign or transfer your rights or obligations under these Terms without our prior written consent. We may freely assign or transfer these Terms without restriction.
              </p>
            </section>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-12">
            <p className="text-gray-700 leading-relaxed font-medium">
              By checking the box "I agree to the Terms of Use" during registration, you confirm you have read, understood, and agreed to all provisions above. If you do not agree, do not use the app.
            </p>
          </div>

          <div className="text-center mt-8 pt-8 border-t border-gray-200">
            <p className="text-gray-600">
              For questions or legal inquiries, please contact us at: <a href="mailto:support@helfi.ai" className="text-green-600 hover:text-green-800 font-medium">support@helfi.ai</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 