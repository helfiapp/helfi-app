'use client';

import React, { useState, useRef } from 'react';
import ConsentGate, { ConsentData } from './ConsentGate';

interface LabReportUploadProps {
  onUploadComplete?: (reportId: string) => void;
}

export default function LabReportUpload({ onUploadComplete }: LabReportUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [consentData, setConsentData] = useState<ConsentData | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are allowed');
      return;
    }

    // Validate file size (25MB max)
    if (selectedFile.size > 25 * 1024 * 1024) {
      setError('File size must be less than 25MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setConsentData(null); // Reset consent when file changes
  };

  const handleConsent = (consent: ConsentData) => {
    setConsentData(consent);
  };

  const handleUpload = async () => {
    if (!file || !consentData) {
      setError('Please select a file and provide consent');
      return;
    }

    if (isPasswordProtected && !password) {
      setError('Password is required for password-protected PDFs');
      return;
    }

    setUploadStatus('uploading');
    setError(null);

    try {
      // Step 1: Create report record and get report ID
      const presignResponse = await fetch('/api/reports/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          isPasswordProtected,
          password: isPasswordProtected ? password : undefined,
          decryptionConsent: consentData.decryptionConsent,
          passwordConsent: consentData.passwordConsent,
          retentionConsent: consentData.retentionConsent,
        }),
      });

      if (!presignResponse.ok) {
        const errorData = await presignResponse.json();
        throw new Error(errorData.error || 'Failed to create report record');
      }

      const { reportId: newReportId } = await presignResponse.json();
      setReportId(newReportId);

      // Step 2: Upload to Vercel Blob
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const uploadResponse = await fetch(`/api/reports/${newReportId}/upload`, {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      // Step 3: Process PDF
      setUploadStatus('processing');
      
      const processResponse = await fetch(`/api/reports/${newReportId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: isPasswordProtected ? password : undefined,
        }),
      });

      if (!processResponse.ok) {
        const errorData = await processResponse.json();
        throw new Error(errorData.error || 'Failed to process PDF');
      }

      const processData = await processResponse.json();
      
      setUploadStatus('completed');
      setPassword(''); // Clear password from memory
      
      if (onUploadComplete) {
        onUploadComplete(newReportId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadStatus('error');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Upload Laboratory Report
      </h1>

      {uploadStatus === 'idle' && (
        <div className="space-y-6">
          {/* File Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select PDF File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Password Protection Detection */}
          {file && (
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={isPasswordProtected}
                  onChange={(e) => setIsPasswordProtected(e.target.checked)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">
                  My PDF is password-protected
                </span>
              </label>

              {isPasswordProtected && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PDF Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter PDF password"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Your password will be used only once for decryption and will not be stored.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Consent Gate */}
          {file && (
            <div>
              <ConsentGate
                onConsent={handleConsent}
                isPasswordProtected={isPasswordProtected}
              />
            </div>
          )}

          {/* Upload Button */}
          {file && consentData && (
            <button
              onClick={handleUpload}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Upload and Process PDF
            </button>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Upload Status */}
      {uploadStatus === 'uploading' && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Uploading PDF...</p>
        </div>
      )}

      {uploadStatus === 'processing' && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Processing PDF...</p>
          <p className="text-sm text-gray-500 mt-2">
            Decrypting, extracting lab values, and encrypting data...
          </p>
        </div>
      )}

      {uploadStatus === 'completed' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-green-600 text-4xl mb-4">✓</div>
          <h2 className="text-xl font-bold text-green-900 mb-2">
            PDF Processed Successfully!
          </h2>
          <p className="text-green-800 mb-4">
            Your laboratory report has been processed and encrypted.
          </p>
          <button
            onClick={() => {
              setFile(null);
              setPassword('');
              setConsentData(null);
              setUploadStatus('idle');
              setReportId(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
          >
            Upload Another Report
          </button>
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-900 mb-2">
            Processing Failed
          </h2>
          <p className="text-red-800 mb-4">{error}</p>
          <button
            onClick={() => {
              setUploadStatus('idle');
              setError(null);
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

