'use client';

import InteractionAnalysis from '../../components/InteractionAnalysis';

const sampleAnalysis = {
  overallRisk: 'low' as const,
  interactions: [
    {
      substance1: 'Lisinopril',
      substance2: 'Omega-3 Fish Oil',
      severity: 'low' as const,
      description: 'Omega-3 fatty acids can potentially lower blood pressure, which might enhance the blood pressure lowering effect of Lisinopril. However, this interaction is generally considered minor and may even be beneficial.',
      recommendation: 'Monitor your blood pressure regularly. If you experience symptoms like dizziness, lightheadedness, fainting, and/or changes in pulse or heart rate, contact your healthcare provider.',
      timingAdjustment: 'No adjustment needed'
    },
    {
      substance1: 'Metformin',
      substance2: 'Vitamin D3',
      severity: 'low' as const,
      description: 'Vitamin D3 does not directly interact with Metformin. However, Vitamin D deficiency has been associated with insulin resistance, which Metformin is used to treat.',
      recommendation: 'Maintain a consistent intake of Vitamin D3. If you have concerns about your Vitamin D levels, discuss with your healthcare provider.',
      timingAdjustment: 'No adjustment needed'
    }
  ],
  timingOptimization: {
    morning: ['Vitamin D3', 'Omega-3 Fish Oil', 'Lisinopril', 'Metformin'],
    afternoon: [],
    evening: ['Metformin'],
    beforeBed: []
  },
  generalRecommendations: [
    'Continue taking your medications and supplements as prescribed. Regular monitoring of your health and blood pressure is recommended. Always inform your healthcare provider about all the medications and supplements you are taking.'
  ],
  disclaimer: 'This analysis is based on current scientific research and should not replace professional medical advice. Always consult with your healthcare provider before making any changes to your medication or supplement regimen.',
  analysisDate: new Date().toISOString(),
  supplementCount: 2,
  medicationCount: 2
};

export default function TestInteractionsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Interaction Analysis Test Page
          </h1>
          <p className="text-gray-600">
            Testing the interaction analysis component with sample data
          </p>
        </div>
        
        <InteractionAnalysis 
          analysis={sampleAnalysis}
          onContinue={() => alert('Continue clicked!')}
          onBack={() => alert('Back clicked!')}
        />
      </div>
    </div>
  );
} 