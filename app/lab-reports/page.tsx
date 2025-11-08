'use client';

import React from 'react';
import LabReportUpload from '@/components/reports/LabReportUpload';

export default function LabReportsPage() {
  const handleUploadComplete = (reportId: string) => {
    console.log('Report uploaded:', reportId);
    // Could redirect to report details page or show success message
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <LabReportUpload onUploadComplete={handleUploadComplete} />
      </div>
    </div>
  );
}

