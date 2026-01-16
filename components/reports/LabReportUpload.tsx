'use client';

import React, { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import ConsentGate, { ConsentData } from './ConsentGate';

interface LabReportUploadProps {
  onUploadComplete?: (reportId: string) => void;
  compact?: boolean;
}

export default function LabReportUpload({ onUploadComplete, compact }: LabReportUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [consentData, setConsentData] = useState<ConsentData | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    if (isPasswordProtected && selectedFiles.length > 1) {
      setError('For password-protected PDFs, upload one file at a time.');
      return;
    }

    const isAllowedType = (name: string) => {
      const lower = name.toLowerCase();
      return lower.endsWith('.pdf') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
    };
    const invalidFile = selectedFiles.find((item) => !isAllowedType(item.name));
    if (invalidFile) {
      setError('Only PDF, JPG, or PNG files are allowed');
      return;
    }

    const totalSize = selectedFiles.reduce((sum, item) => sum + item.size, 0);
    if (totalSize > 25 * 1024 * 1024) {
      setError('Combined file size must be less than 25MB');
      return;
    }

    if (isPasswordProtected) {
      const onlyPdf = selectedFiles.every((item) => item.name.toLowerCase().endsWith('.pdf'));
      if (!onlyPdf) {
        setError('Password-protected upload only works with a single PDF file.');
        return;
      }
    }

    setFiles(selectedFiles);
    setError(null);
    setConsentData(null); // Reset consent when file changes
  };

  const handleConsent = (consent: ConsentData) => {
    setConsentData(consent);
  };

  const handleUpload = async () => {
    if (!files.length || !consentData) {
      setError('Please select a file and provide consent');
      return;
    }

    if (isPasswordProtected && !password) {
      setError('Password is required for password-protected PDFs');
      return;
    }

    if (isPasswordProtected && files.length > 1) {
      setError('For password-protected PDFs, upload one file at a time.');
      return;
    }

    if (isPasswordProtected) {
      const onlyPdf = files.every((item) => item.name.toLowerCase().endsWith('.pdf'));
      if (!onlyPdf) {
        setError('Password-protected upload only works with a single PDF file.');
        return;
      }
    }

    setUploadStatus('uploading');
    setError(null);

    try {
      let uploadFile = files[0];
      if (files.length > 1) {
        const merged = await PDFDocument.create();
        for (const item of files) {
          const bytes = await item.arrayBuffer();
          const lower = item.name.toLowerCase();
          if (lower.endsWith('.pdf')) {
            const pdf = await PDFDocument.load(bytes);
            const pages = await merged.copyPages(pdf, pdf.getPageIndices());
            pages.forEach((page) => merged.addPage(page));
          } else if (lower.endsWith('.png')) {
            const image = await merged.embedPng(bytes);
            const page = merged.addPage([image.width, image.height]);
            page.drawImage(image, {
              x: 0,
              y: 0,
              width: image.width,
              height: image.height,
            });
          } else {
            const image = await merged.embedJpg(bytes);
            const page = merged.addPage([image.width, image.height]);
            page.drawImage(image, {
              x: 0,
              y: 0,
              width: image.width,
              height: image.height,
            });
          }
        }
        const mergedBytes = await merged.save();
        if (mergedBytes.byteLength > 25 * 1024 * 1024) {
          setError('Combined file size must be less than 25MB');
          setUploadStatus('error');
          return;
        }
        uploadFile = new File([mergedBytes], `lab-report-${Date.now()}.pdf`, {
          type: 'application/pdf',
        });
      } else if (files.length === 1) {
        const single = files[0];
        const lower = single.name.toLowerCase();
        if (!lower.endsWith('.pdf')) {
          const merged = await PDFDocument.create();
          const bytes = await single.arrayBuffer();
          if (lower.endsWith('.png')) {
            const image = await merged.embedPng(bytes);
            const page = merged.addPage([image.width, image.height]);
            page.drawImage(image, {
              x: 0,
              y: 0,
              width: image.width,
              height: image.height,
            });
          } else {
            const image = await merged.embedJpg(bytes);
            const page = merged.addPage([image.width, image.height]);
            page.drawImage(image, {
              x: 0,
              y: 0,
              width: image.width,
              height: image.height,
            });
          }
          const mergedBytes = await merged.save();
          if (mergedBytes.byteLength > 25 * 1024 * 1024) {
            setError('File size must be less than 25MB');
            setUploadStatus('error');
            return;
          }
          uploadFile = new File([mergedBytes], `lab-report-${Date.now()}.pdf`, {
            type: 'application/pdf',
          });
        }
      }

      // Step 1: Create report record and get report ID
      const presignResponse = await fetch('/api/reports/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
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
      uploadFormData.append('file', uploadFile);

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
    <div className={compact ? 'max-w-3xl mx-auto' : 'max-w-3xl mx-auto p-6'}>
      {!compact && (
        <>
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Upload Laboratory Report
          </h1>
          <p className="text-sm text-gray-600 mb-4">
            Processing uses AI credits (2× OpenAI cost). Typical: 6–10 credits depending on file length and extraction.
          </p>
        </>
      )}

      {uploadStatus === 'idle' && (
        <div className="space-y-6">
          {/* File Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select PDF or image file(s)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            />
            {files.length > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                <div>
                  Selected: {files.length} file{files.length > 1 ? 's' : ''} (
                  {(files.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024).toFixed(2)} MB)
                </div>
                {files.length <= 3 && (
                  <ul className="mt-1 list-disc list-inside">
                    {files.map((item) => (
                      <li key={item.name}>{item.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Password Protection Detection */}
          {files.length > 0 && (
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={isPasswordProtected}
                  onChange={(e) => setIsPasswordProtected(e.target.checked)}
                  disabled={files.length > 1 || files.some((item) => !item.name.toLowerCase().endsWith('.pdf'))}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">
                  My PDF is password-protected
                </span>
              </label>
              {(files.length > 1 || files.some((item) => !item.name.toLowerCase().endsWith('.pdf'))) && (
                <p className="mt-2 text-xs text-gray-500">
                  For multiple files or image uploads, please use unlocked files or upload one PDF at a time.
                </p>
              )}

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
          {files.length > 0 && (
            <div>
              <ConsentGate
                onConsent={handleConsent}
                isPasswordProtected={isPasswordProtected}
              />
            </div>
          )}

          {/* Upload Button */}
          {files.length > 0 && consentData && (
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
              setFiles([]);
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
