'use client';

import React, { useState } from 'react';

interface Interaction {
  substance1: string;
  substance2: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
  timingAdjustment: string;
}

interface TimingOptimization {
  morning: string[];
  afternoon: string[];
  evening: string[];
  beforeBed: string[];
}

interface AnalysisResult {
  overallRisk: 'low' | 'medium' | 'high';
  interactions: Interaction[];
  timingOptimization: TimingOptimization;
  generalRecommendations: string[];
  disclaimer: string;
  analysisDate: string;
  supplementCount: number;
  medicationCount: number;
}

interface InteractionAnalysisProps {
  analysis: AnalysisResult;
  onContinue?: () => void;
  onBack?: () => void;
}

const InteractionAnalysis: React.FC<InteractionAnalysisProps> = ({ 
  analysis, 
  onContinue, 
  onBack 
}) => {
  const [expandedInteraction, setExpandedInteraction] = useState<number | null>(null);

  const getRiskColor = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskIcon = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low': return '🟢';
      case 'medium': return '🟠';
      case 'high': return '🔴';
      default: return '⚪';
    }
  };

  const getRiskText = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low': return 'Low Risk';
      case 'medium': return 'Medium Risk';
      case 'high': return 'High Risk';
      default: return 'Unknown Risk';
    }
  };

  const getTimingIcon = (timing: string) => {
    switch (timing.toLowerCase()) {
      case 'morning': return '🌅';
      case 'afternoon': return '☀️';
      case 'evening': return '🌆';
      case 'beforebed': return '🌙';
      default: return '⏰';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Interaction Analysis Results
        </h2>
        <p className="text-gray-600">
          Analysis of {analysis.supplementCount} supplements and {analysis.medicationCount} medications
        </p>
      </div>

      {/* Overall Risk Assessment */}
      <div className={`mb-8 p-4 rounded-lg border-2 ${getRiskColor(analysis.overallRisk)}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getRiskIcon(analysis.overallRisk)}</span>
          <div>
            <h3 className="text-lg font-semibold">
              Overall Risk: {getRiskText(analysis.overallRisk)}
            </h3>
            <p className="text-sm opacity-80">
              Based on analysis of all supplement and medication combinations
            </p>
          </div>
        </div>
      </div>

      {/* Interactions Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Potential Interactions</h3>
        {analysis.interactions.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-green-600">✅</span>
              <span className="text-green-800 font-medium">No significant interactions detected</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {analysis.interactions.map((interaction, index) => (
              <div 
                key={index}
                className={`border-2 rounded-lg ${getRiskColor(interaction.severity)}`}
              >
                <div 
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedInteraction(expandedInteraction === index ? null : index)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{getRiskIcon(interaction.severity)}</span>
                      <div>
                        <h4 className="font-semibold">
                          {interaction.substance1} + {interaction.substance2}
                        </h4>
                        <p className="text-sm opacity-80">
                          {getRiskText(interaction.severity)} - Click to expand
                        </p>
                      </div>
                    </div>
                    <svg 
                      className={`w-5 h-5 transform transition-transform ${
                        expandedInteraction === index ? 'rotate-180' : ''
                      }`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                
                {expandedInteraction === index && (
                  <div className="px-4 pb-4 border-t border-current border-opacity-20">
                    <div className="mt-4 space-y-3">
                      <div>
                        <h5 className="font-medium text-sm uppercase tracking-wide opacity-80">Description</h5>
                        <p className="text-sm mt-1">{interaction.description}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm uppercase tracking-wide opacity-80">Recommendation</h5>
                        <p className="text-sm mt-1">{interaction.recommendation}</p>
                      </div>
                      {interaction.timingAdjustment && interaction.timingAdjustment !== 'No adjustment needed' && (
                        <div>
                          <h5 className="font-medium text-sm uppercase tracking-wide opacity-80">Timing Adjustment</h5>
                          <p className="text-sm mt-1">{interaction.timingAdjustment}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timing Optimization */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Optimal Timing Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(analysis.timingOptimization).map(([timing, substances]) => (
            <div key={timing} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{getTimingIcon(timing)}</span>
                <h4 className="font-semibold capitalize">
                  {timing === 'beforeBed' ? 'Before Bed' : timing}
                </h4>
              </div>
              {substances.length === 0 ? (
                <p className="text-sm text-gray-500">None recommended</p>
              ) : (
                <ul className="space-y-1">
                  {substances.map((substance: string, index: number) => (
                    <li key={index} className="text-sm text-gray-700">
                      • {substance}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* General Recommendations */}
      {analysis.generalRecommendations.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4">General Recommendations</h3>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <ul className="space-y-2">
              {analysis.generalRecommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start gap-2 text-blue-800">
                  <span className="text-blue-600 mt-1">💡</span>
                  <span className="text-sm">{recommendation}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Medical Disclaimer */}
      <div className="mb-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 text-xl">⚠️</span>
            <div>
              <h4 className="font-semibold text-yellow-800 mb-1">Important Medical Disclaimer</h4>
              <p className="text-sm text-yellow-700">{analysis.disclaimer}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        {onBack && (
          <button 
            onClick={onBack}
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors"
          >
            Back
          </button>
        )}
        {onContinue && (
          <button 
            onClick={onContinue}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors ml-auto"
          >
            Continue
          </button>
        )}
      </div>

      {/* Analysis Metadata */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Analysis completed on {new Date(analysis.analysisDate).toLocaleDateString()} at{' '}
          {new Date(analysis.analysisDate).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default InteractionAnalysis; 