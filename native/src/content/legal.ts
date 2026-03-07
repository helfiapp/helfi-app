export type LegalSubsection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
  subsections?: LegalSubsection[]
}

export type LegalDoc = {
  title: string
  lastUpdated: string
  companyLine: string
  intro: string[]
  sections: LegalSection[]
  closingNote?: string
  contactEmail?: string
  extraContactLines?: string[]
}

export const termsOfUse: LegalDoc = {
  title: 'Helfi Terms of Use',
  lastUpdated: 'January 15, 2026',
  companyLine: 'Operated by Global 22 Pty Ltd trading as Helfi (ACN 620 610 120 · ABN 46 620 610 120 · DUNS 744832520)',
  intro: [
    'By accessing or using the Helfi app, website, or related services ("Helfi", "we", "us", or "our"), you ("user", "you") agree to be bound by these Terms of Use and our Privacy Policy. Please read them carefully before using the platform.',
  ],
  sections: [
    {
      title: '1. Medical Disclaimer',
      paragraphs: [
        'Helfi is not a licensed medical provider and does not provide medical advice, diagnosis, or treatment. All content, including AI-generated responses, health reports, symptom analyses, supplement suggestions, and any other information provided by Helfi is for informational purposes only. It should not be relied upon for medical decisions. You must consult a qualified healthcare professional for any medical concerns. Use of Helfi does not create a doctor-patient relationship.',
      ],
    },
    {
      title: '2. User Responsibilities',
      bullets: [
        'You must be at least 18 years of age to use Helfi.',
        'You agree to provide accurate, complete, and up-to-date information about yourself and your health.',
        'You are solely responsible for any decisions or actions you take based on information provided by Helfi.',
        'You understand that supplement-medication contradictions, AI-based symptom guesses, and lifestyle advice are not substitutes for clinical evaluation.',
        "Helfi is available internationally. It is your responsibility to ensure that your use of Helfi complies with the laws, regulations, and rules of the country or jurisdiction in which you reside.",
      ],
    },
    {
      title: '2a. Practitioner Directory (Users and Practitioners)',
      paragraphs: [
        'Helfi operates as a technology platform and directory that helps users discover and contact independent practitioners. We are not a healthcare provider, broker, referral service, medical advisor, employer, agent, or representative of any practitioner.',
      ],
      bullets: [
        'We do not provide medical advice, diagnosis, or treatment.',
        'We do not verify clinical competence, outcomes, or quality of care.',
        'We do not control or participate in appointments, payments, or disputes between users and practitioners.',
      ],
    },
    {
      title: '3. Subscription and Payment',
      bullets: [
        'Helfi offers both free and paid subscription plans.',
        'Paid features (e.g., AI health reports, symptom analyzer, wearable sync, unlimited goals, AI chatbot) require an active subscription.',
        'All payments are billed in the currency shown at checkout and are non-refundable, except as required by law.',
        'Practitioner listing subscriptions and boosts are billed in USD.',
        'Boosts provide additional visibility only and do not guarantee leads, bookings, or outcomes.',
        'Subscriptions renew automatically unless canceled.',
      ],
    },
    {
      title: '4. Content & Data Usage',
      bullets: [
        'By uploading information, images, or descriptions (e.g., supplement bottles, symptoms), you grant us a non-exclusive, royalty-free, worldwide license to use that data for the purpose of providing and improving our services.',
        'Helfi uses machine learning and artificial intelligence. Uploaded data may be used anonymously to enhance algorithm performance.',
        'We do not sell personal data to third parties. For full data handling terms, refer to our Privacy Policy.',
      ],
    },
    {
      title: '4a. Laboratory Report PDFs',
      paragraphs: [
        'By uploading a laboratory report in PDF format, you represent that you are permitted to provide the report to Helfi for the sole purpose of extracting and analyzing laboratory test results for your personal use.',
      ],
      bullets: [
        'If your PDF is password-protected and you choose to supply the password, you expressly authorize Helfi to use that password once to decrypt and process the file. We do not store your password.',
        'You may choose whether Helfi retains an encrypted copy of your original PDF; by default, we delete the original file after extraction.',
        'We may refuse processing of unreadable or corrupted files.',
        'Structured lab data (analyte names, values, units, reference ranges, collection dates, accession numbers, and laboratory names) is extracted and encrypted at rest using industry-standard encryption.',
      ],
    },
    {
      title: '5. Security & Encryption',
      paragraphs: [
        'Helfi uses industry-standard encryption to protect sensitive information in transit and at rest. Structured data is encrypted using per-record keys, and retained originals are encrypted with managed key services. If a breach occurs that may cause harm, Helfi will notify affected users and authorities per applicable law.',
      ],
    },
    {
      title: '6. AI Limitations and Liability',
      bullets: [
        'AI suggestions are based on pattern recognition and probability, not clinical assessment.',
        'Helfi may occasionally provide incorrect or incomplete information.',
        'You agree that Helfi is not liable for any harm, injury, delay, loss, or damage arising from reliance on any content, feature, or AI output.',
        'All features are used at your own risk.',
      ],
    },
    {
      title: '7. Intellectual Property',
      bullets: [
        'All content, design, software, and functionality of the app are owned by Helfi or its licensors.',
        'You may not reproduce, distribute, reverse-engineer, or exploit any part of the app without our prior written consent.',
      ],
    },
    {
      title: '8. Account Termination',
      bullets: [
        'We reserve the right to suspend or terminate accounts that violate these terms, misuse the platform, or engage in unlawful activity.',
        'You may cancel your account at any time via your profile settings.',
        'Practitioners can delete their account from the practitioner dashboard. This permanently removes all listing data and cannot be undone.',
      ],
    },
    {
      title: '9. Indemnification',
      paragraphs: [
        'You agree to defend, indemnify, and hold harmless Helfi, its owners, officers, employees, agents, partners, and affiliates from and against any claims, liabilities, damages, losses, or expenses (including legal fees) arising out of or related to:',
      ],
      bullets: ['Your use of the app', 'Any data or content submitted by you', 'Violation of these Terms or applicable laws'],
    },
    {
      title: '10. Dispute Resolution and Governing Law',
      bullets: [
        'These Terms are governed by the laws of Victoria, Australia, regardless of conflict-of-law principles.',
        'Any disputes, claims, or legal proceedings arising from your use of the app shall be resolved exclusively through arbitration or courts located in Melbourne, Victoria, Australia.',
        'You expressly waive any right to bring claims in another jurisdiction or to participate in class action proceedings.',
      ],
    },
    {
      title: '11. Modifications',
      paragraphs: ['We may update these Terms of Use at any time. Continued use of the app after changes are posted constitutes your acceptance.'],
    },
    {
      title: '12. No Emergency Services Clause',
      paragraphs: [
        'Helfi is not intended for use in emergency situations. Do not use the app to seek or provide help in emergencies. If you are experiencing a medical emergency, call your local emergency number immediately.',
      ],
    },
    {
      title: '13. Limitation of Liability (Expanded)',
      paragraphs: [
        'To the fullest extent permitted by applicable law, Helfi and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, use, goodwill, or other intangible losses resulting from:',
      ],
      bullets: [
        'Your access to or use of or inability to access or use the app;',
        'Any conduct or content of any third party on the app;',
        'Any content obtained from the app;',
        'Unauthorized access, use, or alteration of your transmissions or content.',
      ],
    },
    {
      title: '14. Force Majeure',
      paragraphs: [
        'Helfi shall not be held liable for any failure or delay in performance caused by circumstances beyond its reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, labor conditions, power failures, internet disturbances, cyberattacks, or government actions.',
      ],
    },
    {
      title: '15. Severability',
      paragraphs: [
        'If any provision of these Terms is found to be unlawful, void, or unenforceable for any reason, that provision shall be deemed severable and shall not affect the validity or enforceability of the remaining provisions.',
      ],
    },
    {
      title: '16. Export Control',
      paragraphs: [
        'You agree not to use, export, or re-export the app except as authorized by the laws of Australia and the laws of the jurisdiction in which the app was obtained. You represent and warrant that you are not located in any country subject to Australian government embargo or listed on any government list of prohibited or restricted parties.',
      ],
    },
    {
      title: '17. Assignment',
      paragraphs: [
        'You may not assign or transfer your rights or obligations under these Terms without our prior written consent. We may freely assign or transfer these Terms without restriction.',
      ],
    },
  ],
  closingNote:
    'By checking the box "I agree to the Terms of Use" during registration, you confirm you have read, understood, and agreed to all provisions above. If you do not agree, do not use the app.',
  contactEmail: 'support@helfi.ai',
}

export const privacyPolicy: LegalDoc = {
  title: 'Helfi Privacy Policy',
  lastUpdated: 'January 15, 2026',
  companyLine: 'Global 22 Pty Ltd trading as Helfi (ACN 620 610 120 · ABN 46 620 610 120 · DUNS 744832520)',
  intro: [
    'This Privacy Policy explains how Helfi ("we," "us," or "our") collects, uses, discloses, and protects your information when you use our mobile application and associated services (collectively, the "App").',
    'By using the App, you consent to the practices described in this policy. If you do not agree with this Privacy Policy, do not use the App.',
  ],
  sections: [
    {
      title: '1. Information We Collect',
      subsections: [
        {
          title: 'a. Information You Provide Directly:',
          bullets: [
            'Name, email address, gender, age, height, weight, and other demographic data',
            'Health goals, symptom ratings, supplement and medication data',
            'Uploaded content (e.g., supplement labels, symptom images, notes)',
            'Laboratory report PDFs and extracted lab test results (analyte names, values, units, reference ranges, collection dates, accession numbers, and laboratory names)',
            'Payment and subscription information',
            'Customer support communications',
          ],
        },
        {
          title: 'b. Automatically Collected Data:',
          bullets: ['Device information (type, OS version, IP address)', 'App usage logs and activity patterns', 'Error and crash reports'],
        },
        {
          title: 'c. Data from Wearables & Third-Party Integrations (with your permission):',
          bullets: ['Apple Health, Google Fit, Garmin Connect, Withings, etc.', 'Steps, heart rate, distance, sleep, calories, etc.'],
        },
        {
          title: 'd. Practitioner directory information (for practitioners):',
          bullets: [
            'Business name, category, description, and services offered',
            'Practice address, service area, and location details',
            'Public contact details you choose to display (phone, email, website)',
            'Business hours, languages, and listing images',
          ],
        },
        {
          title: 'User Consent for Report Uploads',
          paragraphs: [
            'When you upload a laboratory or medical report (for example, a PDF of blood results) and supply any associated password, you explicitly authorise Helfi to temporarily use that password to decrypt the file and extract relevant medical markers.',
          ],
          bullets: [
            'The password is never stored, logged, or reused.',
            'Once extraction is complete, the structured data is securely stored in encrypted form and the original file is deleted unless you choose to retain an encrypted copy for your records.',
          ],
        },
      ],
    },
    {
      title: '2. How We Use Your Data',
      paragraphs: ['We use your data to:'],
      bullets: [
        "Provide and personalize the App's features",
        'Deliver AI-generated reports and symptom analysis',
        'Parse, normalize, display, and analyze laboratory test results for your personal use',
        'Improve app functionality and AI accuracy through anonymized training data',
        'Process payments and manage subscriptions',
        'Send reminders, updates, and relevant notifications',
        'Respond to support requests and inquiries',
        'Comply with legal obligations and enforce our Terms of Use',
      ],
    },
    {
      title: '3. How We Share Your Data',
      paragraphs: ['We do not sell your personal data. We only share it as follows:'],
      bullets: [
        'Service Providers: For hosting, analytics, payment processing, and technical support',
        'Legal Requirements: If required by law, court order, or regulatory request',
        'Business Transfers: If Helfi is involved in a merger, acquisition, or sale of assets, your data may be transferred',
        'With Consent: We may share data if you provide explicit permission',
      ],
    },
    {
      title: '3a. Practitioner listings and public display',
      paragraphs: [
        'If you are a practitioner, your listing details are displayed to users so they can find and contact you. This may include your business name, services, location, and any public contact information you provide.',
        'Users and practitioners connect directly. Helfi does not manage appointments, payments, or disputes between them.',
      ],
    },
    {
      title: '4. Data Security',
      paragraphs: [
        'We use encryption, secure cloud storage, and access control measures to protect your data. Despite best efforts, no system is completely secure. You use the App at your own risk.',
        'We use industry-standard encryption to protect your data both in transit and at rest. All data transmitted between the App and our servers uses TLS 1.2 or higher.',
      ],
      bullets: [
        'Uploaded documents (such as laboratory reports or blood test PDFs) are stored securely in encrypted cloud storage.',
        'Sensitive health data and structured lab results are encrypted at rest using AES-256-GCM encryption, which is an industry-standard encryption algorithm.',
        'Structured health data is encrypted at the field level with unique per-record encryption keys, ensuring that each piece of data has its own encryption key.',
        'Data encryption keys are protected using envelope encryption, where keys are encrypted with a master key stored securely in environment variables.',
        'We maintain strict access controls — only authorised personnel can access sensitive data, and all access is logged and audited.',
        'Breach notification: If a breach occurs that may cause harm, Helfi will notify affected users and authorities per the Australian Notifiable Data Breaches scheme.',
      ],
    },
    {
      title: '5. Your Rights and Choices',
      paragraphs: ['Depending on your location, you may have the right to:'],
      bullets: [
        'Access the data we hold about you',
        'Request correction or deletion of your data',
        'Object to or restrict our data processing',
        'Withdraw consent at any time (affects future processing only)',
        'Lodge a complaint with a data protection authority',
      ],
    },
    {
      title: '6. International Users',
      paragraphs: [
        'We are based in Australia but serve users worldwide. Your information may be processed in countries with different data protection laws. By using the App, you consent to this transfer and processing.',
      ],
    },
    {
      title: '7. Data Retention and Deletion',
      paragraphs: [
        'By default, Helfi deletes original uploaded documents (such as PDFs) immediately after extraction. If you opt to retain a copy, it remains encrypted and accessible only through your authenticated account.',
      ],
      bullets: [
        'Structured health data is retained until you delete your account or request deletion.',
        'System audit logs are maintained for security and compliance purposes. We retain audit logs as necessary to comply with legal obligations and for security monitoring.',
        'You can request data deletion or export at any time via in-app settings or by contacting us at support@helfi.ai',
      ],
    },
    {
      title: "8. Children's Privacy",
      paragraphs: [
        'The App is not intended for users under the age of 18. We do not knowingly collect data from anyone under 18. If we become aware of such data, we will delete it immediately.',
      ],
    },
    {
      title: '9. Cookies & Tracking Technologies',
      paragraphs: [
        'We may use cookies or similar technologies for app functionality, usage analytics, and performance tracking. You can disable tracking through your device settings.',
      ],
    },
    {
      title: '10. Changes to This Policy',
      paragraphs: [
        'We may update this Privacy Policy from time to time. Material changes will be notified within the App or via email. Continued use of the App after changes are posted constitutes your acceptance.',
      ],
    },
    {
      title: '11. Contact Us',
      bullets: [
        'Email: support@helfi.ai',
        'Company: Global 22 Pty Ltd trading as Helfi (ACN 620 610 120 · ABN 46 620 610 120 · DUNS 744832520)',
        'Mailing Address: [Insert Business Address Here]',
      ],
    },
  ],
  closingNote: 'By using Helfi, you confirm that you have read, understood, and agreed to the terms of this Privacy Policy.',
  contactEmail: 'support@helfi.ai',
  extraContactLines: ['For questions or concerns about your privacy, please contact us at: support@helfi.ai'],
}

