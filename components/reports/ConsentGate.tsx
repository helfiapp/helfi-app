'use client';

import React, { useState } from 'react';

interface ConsentGateProps {
  onConsent: (consent: ConsentData) => void;
  isPasswordProtected: boolean;
}

export interface ConsentData {
  decryptionConsent: boolean;
  passwordConsent: boolean;
  retentionConsent: boolean;
}

export default function ConsentGate({ onConsent, isPasswordProtected }: ConsentGateProps) {
  const [decryptionConsent, setDecryptionConsent] = useState(false);
  const [passwordConsent, setPasswordConsent] = useState(false);
  const [retentionConsent, setRetentionConsent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isPasswordProtected && (!decryptionConsent || !passwordConsent)) {
      return;
    }
    
    onConsent({
      decryptionConsent,
      passwordConsent,
      retentionConsent,
    });
  };

  const canProceed = isPasswordProtected 
    ? (decryptionConsent && passwordConsent)
    : true;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Consent Required for PDF Processing
      </h2>
      
      <div className="space-y-4 mb-6">
        <p className="text-gray-700 leading-relaxed">
          Before we can process your laboratory report PDF, we need your explicit consent for how we handle your data.
        </p>

        {isPasswordProtected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 font-medium mb-2">
              ⚠️ Password-Protected PDF Detected
            </p>
            <p className="text-yellow-700 text-sm">
              Your PDF is password-protected. You will need to provide the password to proceed.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Required Consent 1 */}
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={decryptionConsent}
              onChange={(e) => setDecryptionConsent(e.target.checked)}
              className="mt-1 h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              required
            />
            <div className="flex-1">
              <span className="text-gray-900 font-medium">
                I authorize Helfi to decrypt my uploaded PDF using the password I provide, only once, to extract my laboratory test results for analysis within my account.
              </span>
              <span className="text-red-600 ml-1">*</span>
            </div>
          </label>

          {/* Required Consent 2 */}
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={passwordConsent}
              onChange={(e) => setPasswordConsent(e.target.checked)}
              className="mt-1 h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              required
            />
            <div className="flex-1">
              <span className="text-gray-900 font-medium">
                I understand Helfi will not store my password and will permanently delete the original PDF after extraction unless I choose to retain it.
              </span>
              <span className="text-red-600 ml-1">*</span>
            </div>
          </label>

          {/* Optional Consent */}
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={retentionConsent}
              onChange={(e) => setRetentionConsent(e.target.checked)}
              className="mt-1 h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
            />
            <div className="flex-1">
              <span className="text-gray-900">
                Retain an encrypted copy of my original PDF for later download.
              </span>
              <span className="text-gray-500 text-sm block mt-1">
                (Optional - by default, we delete the original after extraction)
              </span>
            </div>
          </label>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-blue-900 font-semibold mb-2">Security & Privacy</h3>
        <ul className="text-blue-800 text-sm space-y-1 list-disc list-inside">
          <li>Your password is used only once for decryption and is never stored</li>
          <li>All lab values are encrypted at rest using industry-standard encryption</li>
          <li>Original PDFs are deleted by default unless you choose to retain them</li>
          <li>Full audit trail is maintained for compliance</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={!canProceed}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
            canProceed
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {canProceed ? 'I Consent - Continue' : 'Please accept required consents'}
        </button>
      </form>

      <p className="text-xs text-gray-500 mt-4 text-center">
        By proceeding, you agree to our{' '}
        <a href="/terms" className="text-green-600 hover:underline">
          Terms of Use
        </a>{' '}
        and{' '}
        <a href="/privacy" className="text-green-600 hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

