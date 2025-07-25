'use client';
// Fixed: Added use client directive for useState compatibility

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import CreditPurchaseModal from '@/components/CreditPurchaseModal';

// Auth-enabled onboarding flow

// Interaction Analysis Update Popup Component
function InteractionAnalysisUpdatePopup({ isOpen, onClose, onUpdate, onNavigateToAnalysis }: { isOpen: boolean, onClose: () => void, onUpdate: () => void, onNavigateToAnalysis?: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="ml-3 text-lg font-medium text-gray-900">
            Update Interaction Analysis?
          </h3>
        </div>
        
        <div className="mb-6">
          <p className="text-sm text-gray-600">
            You've made changes to your supplements or medications. Would you like to run a fresh analysis that includes all your current entries?
          </p>
          <p className="text-sm text-gray-500 mt-2">
            This will take you to the analysis page and generate a new comprehensive report.
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Not Now
          </button>
          <button
            onClick={() => {
              onUpdate();
              onClose();
              if (onNavigateToAnalysis) {
                onNavigateToAnalysis();
              }
            }}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Run Fresh Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

const steps = [
  'gender',
  'physical',
  'exercise',
  'healthGoals',
  'healthSituations',
  'supplements',
  'medications',
  'bloodResults',
  'aiInsights',
  'review',
];

// Navigation Button Components
function RefreshButton() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <button
      onClick={handleRefresh}
      className="bg-white border border-gray-300 rounded-full p-2 shadow-lg hover:shadow-xl transition-all"
      title="Refresh page"
    >
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
}

function LogoutButton() {
  const { data: session } = useSession();
  
  const handleLogout = () => {
    signOut({ callbackUrl: '/' });
  };

  if (!session) return null;

  return (
    <button
      onClick={handleLogout}
      className="bg-white border border-gray-300 rounded-full p-2 shadow-lg hover:shadow-xl transition-all"
      title={`Logout (${session.user?.email})`}
    >
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  );
}

function OnboardingNav() {
  return (
    <div className="fixed top-4 right-4 z-50 flex space-x-2">
      <LogoutButton />
      <RefreshButton />
    </div>
  );
}

function GenderStep({ onNext, initial }: { onNext: (data: any) => void, initial?: string }) {
  const [gender, setGender] = useState('');
  const [agreed, setAgreed] = useState(false);
  
  // Properly initialize gender when initial prop changes
  useEffect(() => {
    if (initial) {
      setGender(initial);
    }
  }, [initial]);
  
  // Load Terms & Conditions agreement from localStorage
  useEffect(() => {
    const savedAgreement = localStorage.getItem('helfi-terms-agreed');
    if (savedAgreement === 'true') {
      setAgreed(true);
    }
  }, []);
  
  // Save Terms & Conditions agreement to localStorage when changed
  const handleAgreedChange = (checked: boolean) => {
    setAgreed(checked);
    localStorage.setItem('helfi-terms-agreed', checked.toString());
  };
  
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">Let's get started. What's your gender?</h2>
        <p className="mb-6 text-gray-600">This helps tailor your health guidance.</p>
        
        <div className="flex gap-4 mb-6">
          <button
            className={`flex-1 p-4 rounded border ${gender === 'male' ? 'bg-green-600 text-white' : 'border-green-600 text-green-600 hover:bg-green-50'}`}
            onClick={() => setGender('male')}
          >
            Male
          </button>
          <button
            className={`flex-1 p-4 rounded border ${gender === 'female' ? 'bg-green-600 text-white' : 'border-green-600 text-green-600 hover:bg-green-50'}`}
            onClick={() => setGender('female')}
          >
            Female
          </button>
        </div>
        <div className="flex items-center mb-6">
          <input
            type="checkbox"
            id="agree-terms"
            checked={agreed}
            onChange={e => handleAgreedChange(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="agree-terms" className="text-sm text-gray-700">
            I agree to the <a href="/terms" target="_blank" className="text-helfi-green underline">Terms and Conditions</a> and <a href="/privacy" target="_blank" className="text-helfi-green underline">Privacy Policy</a>
          </label>
        </div>
        <div className="flex justify-between pt-4">
          <button 
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={() => onNext({ gender: gender || 'not specified', agreed })}
          >
            Skip
          </button>
          <button
            className={`px-6 py-3 rounded-lg transition-colors ${
              agreed 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!agreed}
            onClick={() => agreed && onNext({ gender: gender || 'not specified', agreed })}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

const PhysicalStep = memo(function PhysicalStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [weight, setWeight] = useState(initial?.weight || '');
  const [height, setHeight] = useState(initial?.height || '');
  const [feet, setFeet] = useState(initial?.feet || '');
  const [inches, setInches] = useState(initial?.inches || '');
  const [bodyType, setBodyType] = useState(initial?.bodyType || '');
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');

  const handleNext = useCallback(() => {
    const data = { 
      weight, 
      height: unit === 'metric' ? height : `${feet}'${inches}"`, 
      feet, 
      inches, 
      bodyType, 
      unit 
    };
    onNext(data);
  }, [weight, height, feet, inches, bodyType, unit, onNext]);

  const handleUnitChange = useCallback((newUnit: 'metric' | 'imperial') => {
    setUnit(newUnit);
  }, []);

  const handleBodyTypeChange = useCallback((type: string) => {
    setBodyType(type);
  }, []);

  const bodyTypeDescriptions = {
    ectomorph: "Naturally lean and thin, with difficulty gaining weight and muscle. Fast metabolism.",
    mesomorph: "Naturally muscular and athletic build. Gains muscle easily and maintains weight well.",
    endomorph: "Naturally broader and rounder physique. Gains weight easily, slower metabolism."
  };

  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Enter your current weight</h2>
      <p className="mb-4 text-gray-600">Used to personalize health and supplement recommendations.</p>
      <div className="flex justify-end mb-2">
        <button 
          className={`px-3 py-1 rounded-l ${unit === 'metric' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`} 
          onClick={() => handleUnitChange('metric')}
        >
          kg/cm
        </button>
        <button 
          className={`px-3 py-1 rounded-r ${unit === 'imperial' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`} 
          onClick={() => handleUnitChange('imperial')}
        >
          lbs/in
        </button>
      </div>
      <input
        className="w-full rounded-lg border border-gray-300 px-3 py-2 mb-4 focus:border-green-500 focus:ring-1 focus:ring-green-500"
        type="number"
        inputMode="numeric"
        placeholder={`Weight (${unit === 'metric' ? 'kg' : 'lbs'})`}
        value={weight}
        onChange={e => setWeight(e.target.value)}
      />
      <h2 className="text-2xl font-bold mb-4">How tall are you?</h2>
      <p className="mb-4 text-gray-600">Height helps us calculate key health metrics.</p>
      <div className="mb-4">
        {unit === 'metric' ? (
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
            type="number"
            inputMode="numeric"
            placeholder="Height (cm)"
            value={height}
            onChange={e => setHeight(e.target.value)}
          />
        ) : (
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                type="number"
                inputMode="numeric"
                placeholder="Feet"
                value={feet}
                onChange={e => setFeet(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                type="number"
                inputMode="numeric"
                placeholder="Inches"
                value={inches}
                onChange={e => setInches(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
      <h2 className="text-2xl font-bold mb-4">Choose your body type (optional)</h2>
      <p className="mb-4 text-gray-600">Helps tailor insights to your body composition.</p>
      <div className="space-y-3 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {['ectomorph', 'mesomorph', 'endomorph'].map(type => (
            <button
              key={type}
              className={`w-full p-3 rounded border ${bodyType === type ? 'bg-green-600 text-white' : 'border-green-600 text-green-600 hover:bg-green-50'} relative group transition-colors`}
              onClick={() => handleBodyTypeChange(type)}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-medium">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                <span className="text-xs bg-gray-200 text-gray-600 rounded-full w-5 h-5 flex items-center justify-center cursor-help hover:bg-gray-300 transition-colors border border-gray-300">?</span>
              </div>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 z-10">
                {bodyTypeDescriptions[type as keyof typeof bodyTypeDescriptions]}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-start">
          <button 
            className="px-8 py-2 rounded border border-gray-400 text-gray-600 hover:bg-gray-50 transition-colors" 
            onClick={() => handleBodyTypeChange('')}
          >
            Skip
          </button>
        </div>
      </div>
      <div className="flex justify-between">
        <button className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" onClick={onBack}>Back</button>
        <div className="flex space-x-3">
          <button 
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={() => onNext({ weight: weight || '0', height: height || '0', feet: feet || '0', inches: inches || '0', bodyType: bodyType || 'not specified', unit })}
          >
            Skip
          </button>
          <button 
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
            onClick={handleNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
});

function ExerciseStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [exerciseFrequency, setExerciseFrequency] = useState(initial?.exerciseFrequency || '');
  const [exerciseTypes, setExerciseTypes] = useState<string[]>(initial?.exerciseTypes || []);
  const [customExercise, setCustomExercise] = useState('');

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">How often do you exercise?</h2>
        <p className="mb-6 text-gray-600">This helps us understand your activity level for better recommendations.</p>
        
        <div className="mb-6">
          <select 
            className="w-full rounded-lg border border-gray-300 px-3 py-3 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-700"
            value={exerciseFrequency}
            onChange={(e) => setExerciseFrequency(e.target.value)}
          >
            <option value="">Select frequency...</option>
            <option value="Every Day">Every Day</option>
            <option value="1 day a week">1 day a week</option>
            <option value="2 days a week">2 days a week</option>
            <option value="3 days a week">3 days a week</option>
            <option value="4 days a week">4 days a week</option>
            <option value="5 days a week">5 days a week</option>
            <option value="6 days a week">6 days a week</option>
          </select>
        </div>

        <h3 className="text-xl font-bold mb-4">What type of exercise do you do?</h3>
        <p className="mb-4 text-gray-600">Select all that apply to your routine.</p>
        
        <div className="mb-4 space-y-2">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="walking"
              checked={exerciseTypes.includes('Walking')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Walking']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Walking'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="walking" className="text-gray-700 cursor-pointer">Walking</label>
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="running"
              checked={exerciseTypes.includes('Running')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Running']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Running'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="running" className="text-gray-700 cursor-pointer">Running</label>
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="swimming"
              checked={exerciseTypes.includes('Swimming')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Swimming']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Swimming'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="swimming" className="text-gray-700 cursor-pointer">Swimming</label>
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="biking"
              checked={exerciseTypes.includes('Bike riding')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Bike riding']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Bike riding'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="biking" className="text-gray-700 cursor-pointer">Bike riding</label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="mma"
              checked={exerciseTypes.includes('MMA')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'MMA']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'MMA'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="mma" className="text-gray-700 cursor-pointer">MMA</label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="boxing"
              checked={exerciseTypes.includes('Boxing')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Boxing']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Boxing'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="boxing" className="text-gray-700 cursor-pointer">Boxing</label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="jujitsu"
              checked={exerciseTypes.includes('Jujitsu')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Jujitsu']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Jujitsu'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="jujitsu" className="text-gray-700 cursor-pointer">Jujitsu</label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="karate"
              checked={exerciseTypes.includes('Karate')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Karate']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Karate'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="karate" className="text-gray-700 cursor-pointer">Karate</label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="bodybuilding"
              checked={exerciseTypes.includes('Body Building')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Body Building']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Body Building'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="bodybuilding" className="text-gray-700 cursor-pointer">Body Building</label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="yoga"
              checked={exerciseTypes.includes('Yoga')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Yoga']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Yoga'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="yoga" className="text-gray-700 cursor-pointer">Yoga</label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="pilates"
              checked={exerciseTypes.includes('Pilates')}
              onChange={(e) => {
                if (e.target.checked) {
                  setExerciseTypes([...exerciseTypes, 'Pilates']);
                } else {
                  setExerciseTypes(exerciseTypes.filter(t => t !== 'Pilates'));
                }
              }}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="pilates" className="text-gray-700 cursor-pointer">Pilates</label>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Other (specify):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customExercise}
              onChange={(e) => setCustomExercise(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && customExercise.trim()) {
                  e.preventDefault();
                  if (!exerciseTypes.includes(customExercise.trim())) {
                    setExerciseTypes([...exerciseTypes, customExercise.trim()]);
                    setCustomExercise('');
                  }
                }
              }}
              placeholder="Enter custom exercise type"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
            <button
              onClick={() => {
                if (customExercise.trim() && !exerciseTypes.includes(customExercise.trim())) {
                  setExerciseTypes([...exerciseTypes, customExercise.trim()]);
                  setCustomExercise('');
                }
              }}
              disabled={!customExercise.trim()}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300"
            >
              Add
            </button>
          </div>
        </div>

        {exerciseTypes.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Selected exercises:</h4>
            <div className="flex flex-wrap gap-2">
              {exerciseTypes.map((type, index) => (
                <span 
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                >
                  {type}
                  <button
                    onClick={() => setExerciseTypes(exerciseTypes.filter(t => t !== type))}
                    className="text-green-600 hover:text-green-800 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <button 
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={onBack}
          >
            Back
          </button>
          <div className="flex space-x-3">
            <button 
              className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => onNext({ exerciseFrequency: exerciseFrequency || 'not specified', exerciseTypes: exerciseTypes || [] })}
            >
              Skip
            </button>
            <button 
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
              onClick={() => onNext({ exerciseFrequency, exerciseTypes })}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthGoalsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const defaultGoals = [
    'Acne', 'Allergies', 'Anxiety', 'Asthma', 'Bloating', 'Bowel Movements', 'Brain Fog', 'Cold Sores', 'Constipation', 'Depression', 'Diarrhea', 'Digestion', 'Dry Skin', 'Eczema', 'Energy', 'Erection Quality', 'Eye Irritation', 'Fatigue', 'Gas', 'Hair Loss', 'Headaches', 'Heartburn', 'IBS Flare', 'Insomnia', 'Irritability', 'Itchy Skin', 'Joint Pain', 'Libido', 'Mood', 'Muscle Cramps', 'Nausea', 'PMS Symptoms', 'Rashes', 'Sleep Quality', 'Stress', 'Urinary Frequency', 'Weight Fluctuation'
  ];

  // Group goals by category for better organization
  const goalCategories = {
    'Mental Health': ['Anxiety', 'Depression', 'Stress', 'Mood', 'Irritability', 'Brain Fog', 'Insomnia', 'Sleep Quality'],
    'Digestive': ['Bloating', 'Constipation', 'Diarrhea', 'Digestion', 'Gas', 'Heartburn', 'IBS Flare', 'Nausea', 'Bowel Movements'],
    'Skin & Hair': ['Acne', 'Dry Skin', 'Eczema', 'Itchy Skin', 'Rashes', 'Hair Loss', 'Cold Sores'],
    'Energy & Physical': ['Energy', 'Fatigue', 'Joint Pain', 'Muscle Cramps', 'Headaches', 'Weight Fluctuation'],
    'Other': ['Allergies', 'Asthma', 'Eye Irritation', 'Erection Quality', 'Libido', 'PMS Symptoms', 'Urinary Frequency']
  };
  
  // Initialize state with incoming data
  const [goals, setGoals] = useState(initial?.goals || []);
  const [customGoals, setCustomGoals] = useState(initial?.customGoals || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Get all available goals (custom + default)
  const allAvailableGoals = [...customGoals, ...defaultGoals];

  // Filter suggestions based on search term
  const getSuggestions = () => {
    if (!searchTerm.trim()) return [];
    
    const filtered = allAvailableGoals.filter(goal => 
      goal.toLowerCase().includes(searchTerm.toLowerCase()) && 
      !goals.includes(goal)
    );
    
    // Sort by relevance: starts with search term first, then contains
    return filtered.sort((a, b) => {
      const aStartsWith = a.toLowerCase().startsWith(searchTerm.toLowerCase());
      const bStartsWith = b.toLowerCase().startsWith(searchTerm.toLowerCase());
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return a.localeCompare(b);
    }).slice(0, 5); // Limit to 5 suggestions
  };

  const suggestions = getSuggestions();

  // Popular goals to show when no search
  const popularGoals = ['Anxiety', 'Energy', 'Sleep Quality', 'Digestion', 'Stress', 'Mood'].filter(goal => !goals.includes(goal));

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setShowSuggestions(true);
    setSelectedSuggestionIndex(-1);
  };

  const handleSearchFocus = () => {
    setShowSuggestions(true);
  };

  const handleSearchBlur = () => {
    // Delay hiding to allow clicks on suggestions
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const selectGoal = (goal: string) => {
    if (!goals.includes(goal)) {
      setGoals((prev: string[]) => [...prev, goal]);
    }
    setSearchTerm('');
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const removeGoal = (goalToRemove: string) => {
    setGoals((prev: string[]) => prev.filter((goal: string) => goal !== goalToRemove));
    // Also remove from custom goals if it's a custom one
    if (customGoals.includes(goalToRemove)) {
      setCustomGoals((prev: string[]) => prev.filter((goal: string) => goal !== goalToRemove));
    }
  };

  const addCustomGoal = () => {
    const trimmed = searchTerm.trim();
    if (trimmed && !allAvailableGoals.includes(trimmed)) {
      setCustomGoals((prev: string[]) => [...prev, trimmed]);
      setGoals((prev: string[]) => [...prev, trimmed]);
      setSearchTerm('');
      setShowSuggestions(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        selectGoal(suggestions[selectedSuggestionIndex]);
      } else if (searchTerm.trim()) {
        addCustomGoal();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleNext = () => {
    onNext({ goals, customGoals });
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Sticky Top Next Button */}
        {goals.length > 0 && (
          <div className="sticky top-0 bg-white border-b border-gray-200 -mx-6 px-6 py-3 mb-4 z-10">
            <button 
              className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              onClick={handleNext}
            >
              Continue with {goals.length} goal{goals.length > 1 ? 's' : ''} →
            </button>
          </div>
        )}

        <h2 className="text-2xl font-bold mb-4">Which health concerns are you most interested in improving?</h2>
        <p className="mb-6 text-gray-600">
          Search and select the areas you'd like to focus on. You can add custom concerns too! 🎯
        </p>
        
        {/* Selected Goals as Chips */}
        {goals.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Selected ({goals.length}):</div>
            <div className="flex flex-wrap gap-2">
              {goals.map((goal: string) => (
                <div
                  key={goal}
                  className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm"
                >
                  <span>{goal}</span>
                  <button
                    onClick={() => removeGoal(goal)}
                    className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
                    aria-label={`Remove ${goal}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Input with Suggestions */}
        <div className="relative mb-6">
          <div className="relative">
            <input
              className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-10 focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
              type="text"
              placeholder="Search health concerns or add your own..."
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              onKeyDown={handleKeyPress}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Floating Suggestions */}
          {showSuggestions && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-60 overflow-y-auto">
              {suggestions.length > 0 ? (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                    Suggestions
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${
                        index === selectedSuggestionIndex ? 'bg-green-50 text-green-700' : ''
                      }`}
                      onClick={() => selectGoal(suggestion)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{suggestion}</span>
                        {index === selectedSuggestionIndex && (
                          <span className="text-green-500 text-sm">↵</span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              ) : searchTerm.trim() ? (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                    Add Custom
                  </div>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-green-600"
                    onClick={addCustomGoal}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span>Add "{searchTerm.trim()}"</span>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                    Popular
                  </div>
                  {popularGoals.slice(0, 6).map((goal) => (
                    <button
                      key={goal}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                      onClick={() => selectGoal(goal)}
                    >
                      {goal}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Category Browser (always visible when not searching) */}
        {!showSuggestions && !searchTerm && (
          <div className="mb-6">
            <div className="text-sm font-medium text-gray-700 mb-3">Browse by category:</div>
            <div className="space-y-3">
              {Object.entries(goalCategories).map(([category, categoryGoals]) => (
                <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                    {category}
                  </div>
                  <div className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {(expandedCategories.has(category) ? categoryGoals : categoryGoals.slice(0, 6))
                        .filter(goal => !goals.includes(goal)) // Hide already selected goals
                        .map((goal) => (
                        <button
                          key={goal}
                          onClick={() => selectGoal(goal)}
                          className="px-3 py-1 text-sm border border-green-200 text-green-700 rounded-full hover:bg-green-50 transition-colors"
                        >
                          {goal}
                        </button>
                      ))}
                      {categoryGoals.filter(goal => !goals.includes(goal)).length > 6 && !expandedCategories.has(category) && (
                        <button
                          onClick={() => {
                            setExpandedCategories(prev => new Set(Array.from(prev).concat(category)));
                          }}
                          className="px-3 py-1 text-sm text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50"
                        >
                          +{categoryGoals.filter(goal => !goals.includes(goal)).length - 6} more
                        </button>
                      )}
                      {expandedCategories.has(category) && categoryGoals.filter(goal => !goals.includes(goal)).length > 6 && (
                        <button
                          onClick={() => {
                            setExpandedCategories(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(category);
                              return newSet;
                            });
                          }}
                          className="px-3 py-1 text-sm text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50"
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <button 
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={onBack}
          >
            Back
          </button>
          <div className="flex space-x-3">
            <button 
              className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => onNext({ goals: [], customGoals: [] })}
            >
              Skip
            </button>
            <button 
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
              onClick={handleNext}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthSituationsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [healthIssues, setHealthIssues] = useState(initial?.healthSituations?.healthIssues || initial?.healthIssues || '');
  const [healthProblems, setHealthProblems] = useState(initial?.healthSituations?.healthProblems || initial?.healthProblems || '');
  const [additionalInfo, setAdditionalInfo] = useState(initial?.healthSituations?.additionalInfo || initial?.additionalInfo || '');
  const [skipped, setSkipped] = useState(initial?.healthSituations?.skipped || initial?.skipped || false);

  const handleNext = () => {
    const healthSituationsData = { 
      healthIssues: healthIssues.trim(), 
      healthProblems: healthProblems.trim(),
      additionalInfo: additionalInfo.trim(),
      skipped 
    };
    // Pass data in the correct format expected by the API
    onNext({ healthSituations: healthSituationsData });
  };

  const handleSkip = () => {
    setSkipped(true);
    onNext({ healthSituations: { skipped: true, healthIssues: '', healthProblems: '', additionalInfo: '' } });
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Tell us about your current health situation</h2>
          <button 
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Why we ask:</strong> The more detailed information you provide about your current health situation, 
                the better our AI can analyze your data and provide personalized recommendations. This section is optional, 
                but we highly recommend completing it for the most accurate insights.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What health issues are you currently monitoring or concerned about?
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
              rows={4}
              placeholder="e.g., High blood pressure, elevated cholesterol, digestive issues, sleep problems, joint pain, fatigue, etc."
              value={healthIssues}
              onChange={(e) => setHealthIssues(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Do you have any ongoing health problems or chronic conditions?
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
              rows={4}
              placeholder="e.g., Diabetes, hypertension, arthritis, thyroid issues, heart conditions, autoimmune disorders, etc."
              value={healthProblems}
              onChange={(e) => setHealthProblems(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Any additional health information you'd like to share?
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
              rows={4}
              placeholder="e.g., Family history, recent symptoms, lifestyle factors, stress levels, dietary restrictions, allergies, etc."
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-between mt-8">
          <button
            onClick={handleSkip}
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleNext}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function SupplementsStep({ onNext, onBack, initial, onNavigateToAnalysis }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onNavigateToAnalysis?: () => void }) {
  const [supplements, setSupplements] = useState(initial?.supplements || []);
  
  // Update supplements when initial data changes (fixes page refresh issue)
  useEffect(() => {
    if (initial?.supplements && initial.supplements.length > 0) {
      setSupplements(initial.supplements);
    }
  }, [initial?.supplements]);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [dosageUnit, setDosageUnit] = useState('mg');
  const [timing, setTiming] = useState<string[]>([]);
  const [timingDosages, setTimingDosages] = useState<{[key: string]: string}>({});
  const [timingDosageUnits, setTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'photo'>('photo');
  
  // New dosing schedule states
  const [dosageSchedule, setDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  
  // Edit functionality states
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  
  // Interaction analysis update popup state
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [hasExistingAnalysis, setHasExistingAnalysis] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Only close if click is outside dropdown container
      if (!target.closest('.dropdown-container')) {
        setShowDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Check for existing interaction analysis
  useEffect(() => {
    const checkExistingAnalysis = async () => {
      try {
        const response = await fetch('/api/interaction-history');
        if (response.ok) {
          const data = await response.json();
          const analyses = data.analyses || [];
          setHasExistingAnalysis(analyses.length > 0);
        }
      } catch (error) {
        console.error('Error checking existing analysis:', error);
      }
    };
    checkExistingAnalysis();
  }, []);

  const handleUploadMethodChange = (method: 'manual' | 'photo') => {
    setUploadMethod(method);
    // Clear any existing data when switching methods
    if (method === 'manual') {
      setFrontImage(null);
      setBackImage(null);
      setPhotoDosage('');
      setPhotoDosageUnit('mg');
      setPhotoTiming([]);
      setPhotoTimingDosages({});
      setPhotoTimingDosageUnits({});
      setPhotoDosageSchedule('daily');
      setPhotoSelectedDays([]);
    } else {
      setName('');
      setDosage('');
      setDosageUnit('mg');
      setTiming([]);
      setTimingDosages({});
      setTimingDosageUnits({});
      setDosageSchedule('daily');
      setSelectedDays([]);
    }
  };
  
  // For photo upload method
  const [photoDosage, setPhotoDosage] = useState('');
  const [photoDosageUnit, setPhotoDosageUnit] = useState('mg');
  const [photoTiming, setPhotoTiming] = useState<string[]>([]);
  const [photoTimingDosages, setPhotoTimingDosages] = useState<{[key: string]: string}>({});
  const [photoTimingDosageUnits, setPhotoTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [photoDosageSchedule, setPhotoDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [photoSelectedDays, setPhotoSelectedDays] = useState<string[]>([]);

  const timingOptions = ['Morning', 'Afternoon', 'Evening', 'Before Bed'];
  const dosageUnits = ['mg', 'mcg', 'g', 'IU', 'capsules', 'tablets', 'drops', 'ml', 'tsp', 'tbsp'];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const toggleTiming = (time: string, isPhoto: boolean = false) => {
    const currentTiming = isPhoto ? photoTiming : timing;
    const setCurrentTiming = isPhoto ? setPhotoTiming : setTiming;
    
    setCurrentTiming(prev => 
      prev.includes(time) 
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const toggleDay = (day: string, isPhoto: boolean = false) => {
    const currentDays = isPhoto ? photoSelectedDays : selectedDays;
    const setCurrentDays = isPhoto ? setPhotoSelectedDays : setSelectedDays;
    
    setCurrentDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleScheduleChange = (schedule: 'daily' | 'specific', isPhoto: boolean = false) => {
    if (isPhoto) {
      setPhotoDosageSchedule(schedule);
      if (schedule === 'daily') {
        setPhotoSelectedDays([]);
      }
    } else {
      setDosageSchedule(schedule);
      if (schedule === 'daily') {
        setSelectedDays([]);
      }
    }
  };

  const addSupplement = () => {
    const currentDate = new Date().toISOString();
    
    if (uploadMethod === 'manual' && name && dosage && timing.length > 0) {
      // Combine timing and individual dosages with units
      const timingWithDosages = timing.map(time => {
        const timeSpecificDosage = timingDosages[time];
        const timeSpecificUnit = timingDosageUnits[time] || dosageUnit;
        return timeSpecificDosage 
          ? `${time}: ${timeSpecificDosage} ${timeSpecificUnit}` 
          : `${time}: ${dosage} ${dosageUnit}`;
      });
      
      const scheduleInfo = dosageSchedule === 'daily' ? 'Daily' : selectedDays.join(', ');
      
      const supplementData = { 
        id: Date.now().toString(), // Unique ID for editing
        name, 
        dosage: `${dosage} ${dosageUnit}`, 
        timing: timingWithDosages, 
        scheduleInfo: scheduleInfo,
        method: 'manual',
        dateAdded: currentDate
      };
      
      if (editingIndex !== null) {
        // Update existing supplement
        setSupplements((prev: any[]) => prev.map((item: any, index: number) => 
          index === editingIndex ? supplementData : item
        ));
        setEditingIndex(null);
      } else {
        // Add new supplement
        setSupplements((prev: any[]) => [...prev, supplementData]);
      }
      
      clearForm();
      
      // Show popup if there's an existing analysis
      if (hasExistingAnalysis) {
        // Save supplements data to form state before showing popup
        const updatedSupplements = editingIndex !== null 
          ? supplements.map((item: any, index: number) => 
              index === editingIndex ? supplementData : item
            )
          : [...supplements, supplementData];
        onNext({ supplements: updatedSupplements });
        setShowUpdatePopup(true);
      }
    } else if (uploadMethod === 'photo' && frontImage && photoDosage && photoTiming.length > 0) {
      // Combine timing and individual dosages with units for photos
      const timingWithDosages = photoTiming.map(time => {
        const timeSpecificDosage = photoTimingDosages[time];
        const timeSpecificUnit = photoTimingDosageUnits[time] || photoDosageUnit;
        return timeSpecificDosage 
          ? `${time}: ${timeSpecificDosage} ${timeSpecificUnit}` 
          : `${time}: ${photoDosage} ${photoDosageUnit}`;
      });
      
      const scheduleInfo = photoDosageSchedule === 'daily' ? 'Daily' : photoSelectedDays.join(', ');
      
      const supplementData = { 
        id: Date.now().toString(), // Unique ID for editing
        frontImage: frontImage.name, 
        backImage: backImage?.name, 
        method: 'photo',
        name: frontImage.name.split('.')[0], // Use filename as temporary name
        dosage: `${photoDosage} ${photoDosageUnit}`,
        timing: timingWithDosages,
        scheduleInfo: scheduleInfo,
        dateAdded: currentDate
      };
      
      if (editingIndex !== null) {
        // Update existing supplement
        setSupplements((prev: any[]) => prev.map((item: any, index: number) => 
          index === editingIndex ? supplementData : item
        ));
        setEditingIndex(null);
      } else {
        // Add new supplement
        setSupplements((prev: any[]) => [...prev, supplementData]);
      }
      
      clearPhotoForm();
      
      // Show popup if there's an existing analysis
      if (hasExistingAnalysis) {
        // Save supplements data to form state before showing popup
        const updatedSupplements = editingIndex !== null 
          ? supplements.map((item: any, index: number) => 
              index === editingIndex ? supplementData : item
            )
          : [...supplements, supplementData];
        onNext({ supplements: updatedSupplements });
        setShowUpdatePopup(true);
      }
    }
  };

  const clearForm = () => {
    setName(''); 
    setDosage(''); 
    setDosageUnit('mg');
    setTiming([]); 
    setTimingDosages({});
    setTimingDosageUnits({});
    setDosageSchedule('daily');
    setSelectedDays([]);
  };

  const clearPhotoForm = () => {
    setFrontImage(null); 
    setBackImage(null); 
    setPhotoDosage(''); 
    setPhotoDosageUnit('mg');
    setPhotoTiming([]); 
    setPhotoTimingDosages({});
    setPhotoTimingDosageUnits({});
    setPhotoDosageSchedule('daily');
    setPhotoSelectedDays([]);
  };

  const editSupplement = (index: number) => {
    const supplement = supplements[index];
    setEditingIndex(index);
    setShowDropdown(null);
    
    // Show popup if there's an existing analysis (editing will trigger update)
    if (hasExistingAnalysis) {
      setShowUpdatePopup(true);
    }
    
    if (supplement.method === 'manual') {
      setUploadMethod('manual');
      setName(supplement.name);
      
      // Parse dosage and unit
      const dosageParts = supplement.dosage.split(' ');
      setDosage(dosageParts[0]);
      setDosageUnit(dosageParts[1] || 'mg');
      
      // Parse timing data
      const timingArray = supplement.timing.map((t: string) => t.split(':')[0]);
      setTiming(timingArray);
      
      // Set schedule
      setDosageSchedule(supplement.scheduleInfo === 'Daily' ? 'daily' : 'specific');
      if (supplement.scheduleInfo !== 'Daily') {
        setSelectedDays(supplement.scheduleInfo.split(', '));
      }
    } else {
      setUploadMethod('photo');
      // For photo method, we'll need to handle this differently
      // For now, we'll just set the basic info
      setPhotoDosage(supplement.dosage.split(' ')[0]);
      setPhotoDosageUnit(supplement.dosage.split(' ')[1] || 'mg');
      setPhotoDosageSchedule(supplement.scheduleInfo === 'Daily' ? 'daily' : 'specific');
      if (supplement.scheduleInfo !== 'Daily') {
        setPhotoSelectedDays(supplement.scheduleInfo.split(', '));
      }
    }
  };

  const removeSupplement = (index: number) => {
    setSupplements((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">Upload your supplements</h2>
        <p className="mb-6 text-gray-600">Add photos or enter manually to get AI guidance on interactions and optimizations.</p>
        
        {/* Upload Method Toggle */}
        <div className="mb-6">
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setUploadMethod('photo')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                uploadMethod === 'photo'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📷 Upload Photos
            </button>
            <button
              onClick={() => setUploadMethod('manual')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                uploadMethod === 'manual'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              ⌨️ Enter Manually
            </button>
          </div>
        </div>

        {/* Photo Upload Method */}
        {uploadMethod === 'photo' && (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Front of supplement bottle/packet *
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setFrontImage(e.target.files?.[0] || null)}
                  className="hidden"
                  id="front-image"
                />
                <label
                  htmlFor="front-image"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  {frontImage ? (
                    <div className="text-center">
                      <div className="text-green-600 text-2xl mb-1">✓</div>
                      <div className="text-sm text-gray-600">{frontImage.name}</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Back of supplement bottle/packet (optional)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setBackImage(e.target.files?.[0] || null)}
                  className="hidden"
                  id="back-image"
                />
                <label
                  htmlFor="back-image"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  {backImage ? (
                    <div className="text-center">
                      <div className="text-green-600 text-2xl mb-1">✓</div>
                      <div className="text-sm text-gray-600">{backImage.name}</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dosage *
              </label>
              <div className="flex space-x-2">
                <input 
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                  type="text" 
                  inputMode="numeric"
                  placeholder="e.g., 1000, 2" 
                  value={photoDosage} 
                  onChange={e => setPhotoDosage(e.target.value)} 
                />
                <select
                  value={photoDosageUnit}
                  onChange={e => setPhotoDosageUnit(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm"
                >
                  {dosageUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often do you take this supplement? *
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'daily'}
                    onChange={() => handleScheduleChange('daily', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-daily"
                  />
                  <label htmlFor="photo-daily" className="cursor-pointer">
                    <span className="text-gray-700">Every day</span>
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'specific'}
                    onChange={() => handleScheduleChange('specific', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-specific"
                  />
                  <label htmlFor="photo-specific" className="cursor-pointer">
                    <span className="text-gray-700">Specific days only</span>
                  </label>
                </div>
                
                {photoDosageSchedule === 'specific' && (
                  <div className="ml-7 space-y-2">
                    <div className="text-sm text-gray-600 mb-2">Select the days you take this supplement:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {daysOfWeek.map(day => (
                        <div key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={photoSelectedDays.includes(day)}
                            onChange={() => toggleDay(day, true)}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                            id={`photo-day-${day}`}
                          />
                          <label htmlFor={`photo-day-${day}`} className="text-sm cursor-pointer">
                            {day.substring(0, 3)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this supplement? *
              </label>
              <div className="space-y-3">
                {timingOptions.map(time => (
                  <div key={time} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={photoTiming.includes(time)}
                      onChange={() => toggleTiming(time, true)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                      id={`photo-timing-${time}`}
                    />
                    <label htmlFor={`photo-timing-${time}`} className="flex-1 cursor-pointer">
                      <span className="text-gray-700">{time}</span>
                    </label>
                    {photoTiming.includes(time) && (
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          inputMode="numeric" placeholder="Amount"
                          value={photoTimingDosages[time] || ''}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                          onChange={(e) => {
                            setPhotoTimingDosages(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                        />
                        <select
                          value={photoTimingDosageUnits[time] || photoDosageUnit}
                          onChange={(e) => {
                            setPhotoTimingDosageUnits(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                          className="w-16 px-1 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        >
                          {dosageUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tip for per-timing dosages */}
            <div className="flex items-start space-x-2 p-3 bg-amber-50 rounded-lg">
              <div className="text-amber-600 text-lg flex-shrink-0">💡</div>
              <div className="text-sm text-amber-800">
                <strong>Tip:</strong> If you split your supplement throughout the day, check multiple times and enter the specific dosage for each time.
              </div>
            </div>

            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addSupplement}
              disabled={!frontImage || !photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0)}
            >
              {editingIndex !== null ? 'Update Supplement' : 'Add Supplement Photos'}
            </button>
          </div>
        )}

        {/* Manual Entry Method */}
        {uploadMethod === 'manual' && (
          <div className="mb-6 space-y-4">
            <input 
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
              type="text" 
              placeholder="Supplement name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dosage *
              </label>
              <div className="flex space-x-2">
                <input 
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                  type="text" 
                  inputMode="numeric"
                  placeholder="e.g., 1000, 2" 
                  value={dosage} 
                  onChange={e => setDosage(e.target.value)} 
                />
                <select
                  value={dosageUnit}
                  onChange={e => setDosageUnit(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm"
                >
                  {dosageUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often do you take this supplement? *
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={dosageSchedule === 'daily'}
                    onChange={() => handleScheduleChange('daily', false)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="manual-daily"
                  />
                  <label htmlFor="manual-daily" className="cursor-pointer">
                    <span className="text-gray-700">Every day</span>
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={dosageSchedule === 'specific'}
                    onChange={() => handleScheduleChange('specific', false)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="manual-specific"
                  />
                  <label htmlFor="manual-specific" className="cursor-pointer">
                    <span className="text-gray-700">Specific days only</span>
                  </label>
                </div>
                
                {dosageSchedule === 'specific' && (
                  <div className="ml-7 space-y-2">
                    <div className="text-sm text-gray-600 mb-2">Select the days you take this supplement:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {daysOfWeek.map(day => (
                        <div key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedDays.includes(day)}
                            onChange={() => toggleDay(day, false)}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                            id={`manual-day-${day}`}
                          />
                          <label htmlFor={`manual-day-${day}`} className="text-sm cursor-pointer">
                            {day.substring(0, 3)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this supplement? *
              </label>
              <div className="space-y-3">
                {timingOptions.map(time => (
                  <div key={time} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={timing.includes(time)}
                      onChange={() => toggleTiming(time, false)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                      id={`manual-timing-${time}`}
                    />
                    <label htmlFor={`manual-timing-${time}`} className="flex-1 cursor-pointer">
                      <span className="text-gray-700">{time}</span>
                    </label>
                    {timing.includes(time) && (
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          inputMode="numeric" placeholder="Amount"
                          value={timingDosages[time] || ''}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                          onChange={(e) => {
                            setTimingDosages(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                        />
                        <select
                          value={timingDosageUnits[time] || dosageUnit}
                          onChange={(e) => {
                            setTimingDosageUnits(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                          className="w-16 px-1 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        >
                          {dosageUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tip for per-timing dosages */}
            <div className="flex items-start space-x-2 p-3 bg-amber-50 rounded-lg">
              <div className="text-amber-600 text-lg flex-shrink-0">💡</div>
              <div className="text-sm text-amber-800">
                <strong>Tip:</strong> If you split your supplement throughout the day, check multiple times and enter the specific dosage for each time.
              </div>
            </div>

            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addSupplement}
              disabled={!name || !dosage || timing.length === 0 || (dosageSchedule === 'specific' && selectedDays.length === 0)}
            >
              {editingIndex !== null ? 'Update Supplement' : 'Add Supplement'}
            </button>
          </div>
        )}

        {/* Added Supplements List */}
        {supplements.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Added Supplements ({supplements.length})</h3>
            <div className="space-y-2">
              {supplements.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    {s.method === 'photo' ? (
                      <div>
                        <div className="font-medium">📷 {s.name}</div>
                        <div className="text-sm text-gray-600">
                          Photos: Front {s.backImage ? '+ Back' : 'only'}
                        </div>
                        <div className="text-sm text-gray-600">{s.dosage} - {Array.isArray(s.timing) ? s.timing.join(', ') : s.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {s.scheduleInfo}</div>
                        {s.dateAdded && (
                          <div className="text-xs text-gray-400">
                            Added: {new Date(s.dateAdded).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-sm text-gray-600">{s.dosage} - {Array.isArray(s.timing) ? s.timing.join(', ') : s.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {s.scheduleInfo}</div>
                        {s.dateAdded && (
                          <div className="text-xs text-gray-400">
                            Added: {new Date(s.dateAdded).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative dropdown-container">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDropdown(showDropdown === i ? null : i);
                      }}
                      className="text-gray-500 hover:text-gray-700 p-1 transition-colors"
                      title="Options"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    {showDropdown === i && (
                      <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            editSupplement(i);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSupplement(i);
                            setShowDropdown(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Guidance Preview */}
        {supplements.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="text-blue-600 text-xl">🤖</div>
              <div>
                <div className="font-medium text-blue-900">AI Analysis Ready</div>
                <div className="text-sm text-blue-700">
                  We'll analyze your supplements for interactions, optimal timing, and missing nutrients.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <button 
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={onBack}
          >
            Back
          </button>
          <button 
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
            onClick={() => onNext({ supplements })}
          >
            Next
          </button>
        </div>
      </div>
      
      {/* Interaction Analysis Update Popup */}
      <InteractionAnalysisUpdatePopup
        isOpen={showUpdatePopup}
        onClose={() => setShowUpdatePopup(false)}
        onUpdate={async () => {
          try {
            // Clear existing analysis to trigger re-analysis
            const response = await fetch('/api/interaction-history', {
              method: 'DELETE'
            });
            if (response.ok) {
              console.log('✅ Cleared existing analysis - will navigate to page 8 for fresh analysis');
            }
          } catch (error) {
            console.error('Error clearing analysis:', error);
          }
        }}
        onNavigateToAnalysis={onNavigateToAnalysis}
      />
    </div>
  );
}

function MedicationsStep({ onNext, onBack, initial, onNavigateToAnalysis }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onNavigateToAnalysis?: () => void }) {
  const [medications, setMedications] = useState(initial?.medications || []);
  
  // Update medications when initial data changes (fixes page refresh issue)
  useEffect(() => {
    if (initial?.medications && initial.medications.length > 0) {
      setMedications(initial.medications);
    }
  }, [initial?.medications]);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [dosageUnit, setDosageUnit] = useState('mg');
  const [timing, setTiming] = useState<string[]>([]);
  const [timingDosages, setTimingDosages] = useState<{[key: string]: string}>({});
  const [timingDosageUnits, setTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'photo'>('photo');
  
  // New dosing schedule states
  const [dosageSchedule, setDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  
  // For photo upload method
  const [photoDosage, setPhotoDosage] = useState('');
  const [photoDosageUnit, setPhotoDosageUnit] = useState('mg');
  const [photoTiming, setPhotoTiming] = useState<string[]>([]);
  const [photoTimingDosages, setPhotoTimingDosages] = useState<{[key: string]: string}>({});
  const [photoTimingDosageUnits, setPhotoTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [photoDosageSchedule, setPhotoDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [photoSelectedDays, setPhotoSelectedDays] = useState<string[]>([]);
  
  // Edit functionality states
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  
  // Interaction analysis update popup state
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [hasExistingAnalysis, setHasExistingAnalysis] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Only close if click is outside dropdown container
      if (!target.closest('.dropdown-container')) {
        setShowDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Check for existing interaction analysis
  useEffect(() => {
    const checkExistingAnalysis = async () => {
      try {
        const response = await fetch('/api/interaction-history');
        if (response.ok) {
          const data = await response.json();
          const analyses = data.analyses || [];
          setHasExistingAnalysis(analyses.length > 0);
        }
      } catch (error) {
        console.error('Error checking existing analysis:', error);
      }
    };
    checkExistingAnalysis();
  }, []);

  const timingOptions = ['Morning', 'Afternoon', 'Evening', 'Before Bed'];
  const dosageUnits = ['mg', 'mcg', 'g', 'IU', 'capsules', 'tablets', 'drops', 'ml', 'tsp', 'tbsp'];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const toggleTiming = (time: string, isPhoto: boolean = false) => {
    const currentTiming = isPhoto ? photoTiming : timing;
    const setCurrentTiming = isPhoto ? setPhotoTiming : setTiming;
    
    setCurrentTiming(prev => 
      prev.includes(time) 
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const toggleDay = (day: string, isPhoto: boolean = false) => {
    const currentDays = isPhoto ? photoSelectedDays : selectedDays;
    const setCurrentDays = isPhoto ? setPhotoSelectedDays : setSelectedDays;
    
    setCurrentDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleScheduleChange = (schedule: 'daily' | 'specific', isPhoto: boolean = false) => {
    if (isPhoto) {
      setPhotoDosageSchedule(schedule);
      if (schedule === 'daily') {
        setPhotoSelectedDays([]);
      }
    } else {
      setDosageSchedule(schedule);
      if (schedule === 'daily') {
        setSelectedDays([]);
      }
    }
  };

  const addMedication = () => {
    const currentDate = new Date().toISOString();
    
    if (uploadMethod === 'manual' && name && dosage && timing.length > 0) {
      // Combine timing and individual dosages with units
      const timingWithDosages = timing.map(time => {
        const timeSpecificDosage = timingDosages[time];
        const timeSpecificUnit = timingDosageUnits[time] || dosageUnit;
        return timeSpecificDosage 
          ? `${time}: ${timeSpecificDosage} ${timeSpecificUnit}` 
          : `${time}: ${dosage} ${dosageUnit}`;
      });
      
      const scheduleInfo = dosageSchedule === 'daily' ? 'Daily' : selectedDays.join(', ');
      
      const medicationData = { 
        id: Date.now().toString(), // Unique ID for editing
        name, 
        dosage: `${dosage} ${dosageUnit}`, 
        timing: timingWithDosages, 
        scheduleInfo: scheduleInfo,
        method: 'manual',
        dateAdded: currentDate
      };
      
      if (editingIndex !== null) {
        // Update existing medication
        setMedications((prev: any[]) => prev.map((item: any, index: number) => 
          index === editingIndex ? medicationData : item
        ));
        setEditingIndex(null);
      } else {
        // Add new medication
        setMedications((prev: any[]) => [...prev, medicationData]);
      }
      
      clearMedForm();
      
      // Show popup if there's an existing analysis
      if (hasExistingAnalysis) {
        // Save medications data to form state before showing popup
        const updatedMedications = editingIndex !== null 
          ? medications.map((item: any, index: number) => 
              index === editingIndex ? medicationData : item
            )
          : [...medications, medicationData];
        onNext({ medications: updatedMedications });
        setShowUpdatePopup(true);
      }
    } else if (uploadMethod === 'photo' && frontImage && photoDosage && photoTiming.length > 0) {
      // Combine timing and individual dosages with units for photos
      const timingWithDosages = photoTiming.map(time => {
        const timeSpecificDosage = photoTimingDosages[time];
        const timeSpecificUnit = photoTimingDosageUnits[time] || photoDosageUnit;
        return timeSpecificDosage 
          ? `${time}: ${timeSpecificDosage} ${timeSpecificUnit}` 
          : `${time}: ${photoDosage} ${photoDosageUnit}`;
      });
      
      const scheduleInfo = photoDosageSchedule === 'daily' ? 'Daily' : photoSelectedDays.join(', ');
      
      const medicationData = { 
        id: Date.now().toString(), // Unique ID for editing
        frontImage: frontImage.name, 
        backImage: backImage?.name, 
        method: 'photo',
        name: frontImage.name.split('.')[0], // Use filename as temporary name
        dosage: `${photoDosage} ${photoDosageUnit}`,
        timing: timingWithDosages,
        scheduleInfo: scheduleInfo,
        dateAdded: currentDate
      };
      
      if (editingIndex !== null) {
        // Update existing medication
        setMedications((prev: any[]) => prev.map((item: any, index: number) => 
          index === editingIndex ? medicationData : item
        ));
        setEditingIndex(null);
      } else {
        // Add new medication
        setMedications((prev: any[]) => [...prev, medicationData]);
      }
      
      clearMedPhotoForm();
      
      // Show popup if there's an existing analysis
      if (hasExistingAnalysis) {
        // Save medications data to form state before showing popup
        const updatedMedications = editingIndex !== null 
          ? medications.map((item: any, index: number) => 
              index === editingIndex ? medicationData : item
            )
          : [...medications, medicationData];
        onNext({ medications: updatedMedications });
        setShowUpdatePopup(true);
      }
    }
  };

  const clearMedForm = () => {
    setName(''); 
    setDosage(''); 
    setDosageUnit('mg');
    setTiming([]); 
    setTimingDosages({});
    setTimingDosageUnits({});
    setDosageSchedule('daily');
    setSelectedDays([]);
  };

  const clearMedPhotoForm = () => {
    setFrontImage(null); 
    setBackImage(null); 
    setPhotoDosage(''); 
    setPhotoDosageUnit('mg');
    setPhotoTiming([]); 
    setPhotoTimingDosages({});
    setPhotoTimingDosageUnits({});
    setPhotoDosageSchedule('daily');
    setPhotoSelectedDays([]);
  };

  const editMedication = (index: number) => {
    const medication = medications[index];
    setEditingIndex(index);
    setShowDropdown(null);
    
    // Show popup if there's an existing analysis (editing will trigger update)
    if (hasExistingAnalysis) {
      setShowUpdatePopup(true);
    }
    
    if (medication.method === 'manual') {
      setUploadMethod('manual');
      setName(medication.name);
      
      // Parse dosage and unit
      const dosageParts = medication.dosage.split(' ');
      setDosage(dosageParts[0]);
      setDosageUnit(dosageParts[1] || 'mg');
      
      // Parse timing data
      const timingArray = medication.timing.map((t: string) => t.split(':')[0]);
      setTiming(timingArray);
      
      // Set schedule
      setDosageSchedule(medication.scheduleInfo === 'Daily' ? 'daily' : 'specific');
      if (medication.scheduleInfo !== 'Daily') {
        setSelectedDays(medication.scheduleInfo.split(', '));
      }
    } else {
      setUploadMethod('photo');
      setPhotoDosage(medication.dosage.split(' ')[0]);
      setPhotoDosageUnit(medication.dosage.split(' ')[1] || 'mg');
      setPhotoDosageSchedule(medication.scheduleInfo === 'Daily' ? 'daily' : 'specific');
      if (medication.scheduleInfo !== 'Daily') {
        setPhotoSelectedDays(medication.scheduleInfo.split(', '));
      }
    }
  };

  const removeMedication = (index: number) => {
    setMedications((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">Add your medications</h2>
        <p className="mb-6 text-gray-600">Upload photos or enter manually to check for supplement-medication interactions.</p>
        
        {/* Upload Method Toggle */}
        <div className="mb-6">
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setUploadMethod('photo')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                uploadMethod === 'photo'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📷 Upload Photos
            </button>
            <button
              onClick={() => setUploadMethod('manual')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                uploadMethod === 'manual'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              ⌨️ Enter Manually
            </button>
          </div>
        </div>

        {/* Photo Upload Method */}
        {uploadMethod === 'photo' && (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Front of medication bottle/packet *
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setFrontImage(e.target.files?.[0] || null)}
                  className="hidden"
                  id="med-front-image"
                />
                <label
                  htmlFor="med-front-image"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  {frontImage ? (
                    <div className="text-center">
                      <div className="text-green-600 text-2xl mb-1">✓</div>
                      <div className="text-sm text-gray-600">{frontImage.name}</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Back of medication bottle/packet (optional)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setBackImage(e.target.files?.[0] || null)}
                  className="hidden"
                  id="med-back-image"
                />
                <label
                  htmlFor="med-back-image"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  {backImage ? (
                    <div className="text-center">
                      <div className="text-green-600 text-2xl mb-1">✓</div>
                      <div className="text-sm text-gray-600">{backImage.name}</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dosage *
              </label>
              <div className="flex space-x-2">
                <input 
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                  type="text" 
                  inputMode="numeric"
                  placeholder="e.g., 10, 1" 
                  value={photoDosage} 
                  onChange={e => setPhotoDosage(e.target.value)} 
                />
                <select
                  value={photoDosageUnit}
                  onChange={e => setPhotoDosageUnit(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm"
                >
                  {dosageUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often do you take this medication? *
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'daily'}
                    onChange={() => handleScheduleChange('daily', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-med-daily"
                  />
                  <label htmlFor="photo-med-daily" className="cursor-pointer">
                    <span className="text-gray-700">Every day</span>
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'specific'}
                    onChange={() => handleScheduleChange('specific', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-med-specific"
                  />
                  <label htmlFor="photo-med-specific" className="cursor-pointer">
                    <span className="text-gray-700">Specific days only</span>
                  </label>
                </div>
                
                {photoDosageSchedule === 'specific' && (
                  <div className="ml-7 space-y-2">
                    <div className="text-sm text-gray-600 mb-2">Select the days you take this medication:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {daysOfWeek.map(day => (
                        <div key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={photoSelectedDays.includes(day)}
                            onChange={() => toggleDay(day, true)}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                            id={`photo-med-day-${day}`}
                          />
                          <label htmlFor={`photo-med-day-${day}`} className="text-sm cursor-pointer">
                            {day.substring(0, 3)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this medication? *
              </label>
              <div className="space-y-3">
                {timingOptions.map(time => (
                  <div key={time} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={photoTiming.includes(time)}
                      onChange={() => toggleTiming(time, true)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                      id={`photo-timing-${time}`}
                    />
                    <label htmlFor={`photo-timing-${time}`} className="flex-1 cursor-pointer">
                      <span className="text-gray-700">{time}</span>
                    </label>
                    {photoTiming.includes(time) && (
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          inputMode="numeric" placeholder="Amount"
                          value={photoTimingDosages[time] || ''}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                          onChange={(e) => {
                            setPhotoTimingDosages(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                        />
                        <select
                          value={photoTimingDosageUnits[time] || photoDosageUnit}
                          onChange={(e) => {
                            setPhotoTimingDosageUnits(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                          className="w-16 px-1 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        >
                          {dosageUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                💡 Tip: If you split your medication throughout the day, 
                check multiple times and enter the specific dosage for each time.
              </div>
            </div>

            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addMedication}
              disabled={!frontImage || !photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0)}
            >
              {editingIndex !== null ? 'Update Medication' : 'Add Medication Photos'}
            </button>
          </div>
        )}

        {/* Manual Entry Method */}
        {uploadMethod === 'manual' && (
          <div className="mb-6 space-y-4">
            <input 
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
              type="text" 
              placeholder="Medication name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dosage *
              </label>
              <div className="flex space-x-2">
                <input 
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                  type="text" 
                  inputMode="numeric"
                  placeholder="e.g., 10, 1" 
                  value={dosage} 
                  onChange={e => setDosage(e.target.value)} 
                />
                <select
                  value={dosageUnit}
                  onChange={e => setDosageUnit(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm"
                >
                  {dosageUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often do you take this medication? *
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={dosageSchedule === 'daily'}
                    onChange={() => handleScheduleChange('daily', false)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="manual-med-daily"
                  />
                  <label htmlFor="manual-med-daily" className="cursor-pointer">
                    <span className="text-gray-700">Every day</span>
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={dosageSchedule === 'specific'}
                    onChange={() => handleScheduleChange('specific', false)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="manual-med-specific"
                  />
                  <label htmlFor="manual-med-specific" className="cursor-pointer">
                    <span className="text-gray-700">Specific days only</span>
                  </label>
                </div>
                
                {dosageSchedule === 'specific' && (
                  <div className="ml-7 space-y-2">
                    <div className="text-sm text-gray-600 mb-2">Select the days you take this medication:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {daysOfWeek.map(day => (
                        <div key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedDays.includes(day)}
                            onChange={() => toggleDay(day, false)}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                            id={`manual-med-day-${day}`}
                          />
                          <label htmlFor={`manual-med-day-${day}`} className="text-sm cursor-pointer">
                            {day.substring(0, 3)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this medication? *
              </label>
              <div className="space-y-3">
                {timingOptions.map(time => (
                  <div key={time} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={timing.includes(time)}
                      onChange={() => toggleTiming(time, false)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                      id={`timing-${time}`}
                    />
                    <label htmlFor={`timing-${time}`} className="flex-1 cursor-pointer">
                      <span className="text-gray-700">{time}</span>
                    </label>
                    {timing.includes(time) && (
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          inputMode="numeric" placeholder="Amount"
                          value={timingDosages[time] || ''}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                          onChange={(e) => {
                            setTimingDosages(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                        />
                        <select
                          value={timingDosageUnits[time] || dosageUnit}
                          onChange={(e) => {
                            setTimingDosageUnits(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                          className="w-16 px-1 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        >
                          {dosageUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                💡 Tip: If you split your medication (e.g., 5mg Tadalafil as 2.5mg twice daily), 
                check multiple times and enter the dosage for each time.
              </div>
            </div>
            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addMedication}
              disabled={!name || !dosage || timing.length === 0 || (dosageSchedule === 'specific' && selectedDays.length === 0)}
            >
              {editingIndex !== null ? 'Update Medication' : 'Add Medication'}
            </button>
          </div>
        )}

        {/* Added Medications List */}
        {medications.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Added Medications ({medications.length})</h3>
            <div className="space-y-2">
              {medications.map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    {m.method === 'photo' ? (
                      <div>
                        <div className="font-medium">💊 {m.name}</div>
                        <div className="text-sm text-gray-600">
                          Photos: Front {m.backImage ? '+ Back' : 'only'}
                        </div>
                        <div className="text-sm text-gray-600">{m.dosage} - {Array.isArray(m.timing) ? m.timing.join(', ') : m.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {m.scheduleInfo}</div>
                        {m.dateAdded && (
                          <div className="text-xs text-gray-400">
                            Added: {new Date(m.dateAdded).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-sm text-gray-600">{m.dosage} - {Array.isArray(m.timing) ? m.timing.join(', ') : m.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {m.scheduleInfo}</div>
                        {m.dateAdded && (
                          <div className="text-xs text-gray-400">
                            Added: {new Date(m.dateAdded).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative dropdown-container">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDropdown(showDropdown === i ? null : i);
                      }}
                      className="text-gray-500 hover:text-gray-700 p-1 transition-colors"
                      title="Options"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    {showDropdown === i && (
                      <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            editMedication(i);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMedication(i);
                            setShowDropdown(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Safety Notice */}
        {medications.length > 0 && (
          <div className="mb-6 p-4 bg-orange-50 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="text-orange-600 text-xl">⚠️</div>
              <div>
                <div className="font-medium text-orange-900">Important Safety Check</div>
                <div className="text-sm text-orange-700">
                  We'll analyze potential interactions between your medications and supplements.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="space-y-3">
          <button 
            className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
            onClick={() => onNext({ medications })}
            disabled={medications.length === 0}
          >
            Analyze for Interactions & Contradictions
          </button>
          <button 
            className="w-full border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={onBack}
          >
            Back
          </button>
        </div>
      </div>
      
      {/* Interaction Analysis Update Popup */}
      <InteractionAnalysisUpdatePopup
        isOpen={showUpdatePopup}
        onClose={() => setShowUpdatePopup(false)}
        onUpdate={async () => {
          try {
            // Clear existing analysis to trigger re-analysis
            const response = await fetch('/api/interaction-history', {
              method: 'DELETE'
            });
            if (response.ok) {
              console.log('✅ Cleared existing analysis - will navigate to page 8 for fresh analysis');
            }
          } catch (error) {
            console.error('Error clearing analysis:', error);
          }
        }}
        onNavigateToAnalysis={onNavigateToAnalysis}
      />
    </div>
  );
}

function BloodResultsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [uploadMethod, setUploadMethod] = useState<'documents' | 'images'>(initial?.bloodResults?.uploadMethod || initial?.uploadMethod || 'documents');
  const [documents, setDocuments] = useState<File[]>(initial?.bloodResults?.documents || initial?.documents || []);
  const [images, setImages] = useState<File[]>(initial?.bloodResults?.images || initial?.images || []);
  const [notes, setNotes] = useState(initial?.bloodResults?.notes || initial?.notes || '');
  const [skipped, setSkipped] = useState(initial?.bloodResults?.skipped || initial?.skipped || false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'documents' | 'images') => {
    const files = Array.from(e.target.files || []);
    if (type === 'documents') {
      setDocuments(prev => [...prev, ...files]);
    } else {
      setImages(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index: number, type: 'documents' | 'images') => {
    if (type === 'documents') {
      setDocuments(prev => prev.filter((_, i) => i !== index));
    } else {
      setImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleNext = () => {
    const bloodResultsData = {
      uploadMethod,
      documents: documents.filter(f => f != null).map(f => f.name),
      images: images.filter(f => f != null).map(f => f.name),
      notes: notes.trim(),
      skipped
    };
    // Pass data in the correct format expected by the API
    onNext({ bloodResults: bloodResultsData });
  };

  const handleSkip = () => {
    setSkipped(true);
    onNext({ bloodResults: { skipped: true, uploadMethod: 'documents', documents: [], images: [], notes: '' } });
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Upload your recent blood results</h2>
          <button 
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Optional but recommended:</strong> Blood results help our AI provide more accurate health insights and personalized recommendations. You can upload PDFs or take photos of your results.
              </p>
            </div>
          </div>
        </div>

        {/* Upload Method Toggle */}
        <div className="mb-6">
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setUploadMethod('documents')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                uploadMethod === 'documents'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📄 Upload PDFs
            </button>
            <button
              onClick={() => setUploadMethod('images')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                uploadMethod === 'images'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📷 Take Photos
            </button>
          </div>
        </div>

        {/* Document Upload */}
        {uploadMethod === 'documents' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Blood Test Reports (PDF format)
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => handleFileChange(e, 'documents')}
                className="hidden"
                id="document-upload"
              />
              <label
                htmlFor="document-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="text-center">
                  <div className="text-gray-400 text-2xl mb-1">📄</div>
                  <div className="text-sm text-gray-600">Click to upload PDF files</div>
                  <div className="text-xs text-gray-500 mt-1">Multiple files allowed</div>
                </div>
              </label>
            </div>

            {/* Uploaded Documents */}
            {documents.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Uploaded Documents:</h4>
                {documents.filter(file => file != null).map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm text-gray-600">{file.name}</span>
                    <button
                      onClick={() => removeFile(index, 'documents')}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Image Upload */}
        {uploadMethod === 'images' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Take Photos of Blood Test Results
            </label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => handleFileChange(e, 'images')}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="text-center">
                  <div className="text-gray-400 text-2xl mb-1">📷</div>
                  <div className="text-sm text-gray-600">Tap to take photos</div>
                  <div className="text-xs text-gray-500 mt-1">Multiple images allowed</div>
                </div>
              </label>
            </div>

            {/* Uploaded Images */}
            {images.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Uploaded Images:</h4>
                {images.filter(file => file != null).map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm text-gray-600">{file.name}</span>
                    <button
                      onClick={() => removeFile(index, 'images')}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Additional Notes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional notes about your blood results (optional)
          </label>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
            rows={3}
            placeholder="e.g., Date of test, any specific concerns, doctor's comments..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-between">
          <button
            onClick={handleSkip}
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleNext}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function AIInsightsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [wantInsights, setWantInsights] = useState(initial?.wantInsights || '');
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Want AI-generated insights in 7 days?</h2>
      <p className="mb-4 text-gray-600">Our AI will analyze trends and send a custom health report.</p>
      <div className="flex gap-4 mb-6">
        <button className={`flex-1 p-4 rounded border ${wantInsights === 'yes' ? 'bg-helfi-green text-white' : 'border-helfi-green'}`} onClick={() => setWantInsights('yes')}>Yes</button>
        <button className={`flex-1 p-4 rounded border ${wantInsights === 'no' ? 'bg-helfi-green text-white' : 'border-helfi-green'}`} onClick={() => setWantInsights('no')}>No Thanks</button>
      </div>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" disabled={!wantInsights} onClick={() => onNext({ wantInsights })}>Next</button>
      </div>
    </div>
  );
}

function ReviewStep({ onBack, data }: { onBack: () => void, data: any }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  const handleConfirmBegin = async () => {
    if (isProcessing) return; // Prevent double clicks
    
    setIsProcessing(true);
    setProgress(0);
    setStatusText('Initializing...');
    
    try {
      // 🔍 PERFORMANCE MEASUREMENT START
      console.log('🚀 ONBOARDING COMPLETION PERFORMANCE TRACKING');
      console.time('⏱️ Total Onboarding Completion Time');
      console.time('⏱️ API Request Duration');
      const startTime = Date.now();
      
      // Simulate progress stages with smooth animation
      const updateProgress = async (percent: number, status: string) => {
        setProgress(percent);
        setStatusText(status);
        await new Promise(resolve => setTimeout(resolve, 150)); // Small delay for smooth animation
      };

      await updateProgress(5, 'Preparing your data...');
      
      console.log('📤 Starting onboarding data save to database...');
      console.log('📊 Data being saved:', {
        hasGender: !!data.gender,
        hasWeight: !!data.weight,
        hasHeight: !!data.height,
        hasGoals: !!data.goals?.length,
        hasSupplements: !!data.supplements?.length,
        hasMedications: !!data.medications?.length,
        hasHealthSituations: !!data.healthSituations,
        hasBloodResults: !!data.bloodResults,
        totalDataSize: JSON.stringify(data).length + ' characters'
      });
      
      await updateProgress(15, 'Validating health profile...');
      
      // Start the API request
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      // Progress updates during API processing
      setTimeout(() => updateProgress(35, 'Saving your profile...'), 1000);
      setTimeout(() => updateProgress(55, 'Processing health goals...'), 3000);
      setTimeout(() => updateProgress(75, 'Storing supplements & medications...'), 5000);
      setTimeout(() => updateProgress(90, 'Finalizing your data...'), 8000);
      
      const apiDuration = Date.now() - startTime;
      console.timeEnd('⏱️ API Request Duration');
      console.log(`📈 API Response Details:`, {
        duration: apiDuration + 'ms',
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (response.ok) {
        await updateProgress(100, 'Welcome to Helfi! 🎉');
        console.log('✅ Onboarding data saved to database successfully');
        console.log('🔄 Starting redirect to dashboard...');
        
        // Brief moment to show completion
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const redirectStart = Date.now();
        window.location.href = '/dashboard';
        
        // Note: This won't log because page will unload, but the timing will be captured in dashboard
        console.log('🏁 Redirect initiated in', Date.now() - redirectStart + 'ms');
      } else {
        console.timeEnd('⏱️ Total Onboarding Completion Time');
        console.error('❌ Failed to save onboarding data to database:', response.status, response.statusText);
        setIsProcessing(false);
        setProgress(0);
        setStatusText('');
        alert('Failed to save your data. Please try again or contact support.');
      }
    } catch (error) {
      console.timeEnd('⏱️ Total Onboarding Completion Time');
      console.error('💥 Error saving onboarding data:', error);
      setIsProcessing(false);
      setProgress(0);
      setStatusText('');
      alert('Failed to save your data. Please check your connection and try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Here's what we have so far</h2>
      <p className="mb-4 text-gray-600">Double-check your inputs before we take you to your dashboard.</p>
      
      <div className="mb-4 text-left">
        <div><b>Gender:</b> {data.gender}</div>
        <div><b>Weight:</b> {data.weight}</div>
        <div><b>Height:</b> {data.height}</div>
        <div><b>Body Type:</b> {data.bodyType}</div>
        <div><b>Exercise Frequency:</b> {data.exerciseFrequency}</div>
        <div><b>Exercise Types:</b> {(data.exerciseTypes || []).join(', ')}</div>
        <div><b>Health Goals:</b> {(data.goals || []).join(', ')}</div>
        {data.healthSituations && !data.healthSituations.skipped && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div><b>Health Situations:</b></div>
            {data.healthSituations.healthIssues && (
              <div className="ml-2 text-sm"><b>Current Issues:</b> {data.healthSituations.healthIssues}</div>
            )}
            {data.healthSituations.healthProblems && (
              <div className="ml-2 text-sm"><b>Ongoing Problems:</b> {data.healthSituations.healthProblems}</div>
            )}
            {data.healthSituations.additionalInfo && (
              <div className="ml-2 text-sm"><b>Additional Info:</b> {data.healthSituations.additionalInfo}</div>
            )}
          </div>
        )}
        <div><b>Supplements:</b> {(data.supplements || []).map((s: any) => `${s.name} (${s.dosage}, ${Array.isArray(s.timing) ? s.timing.join(', ') : s.timing})`).join('; ')}</div>
        <div><b>Medications:</b> {(data.medications || []).map((m: any) => `${m.name} (${m.dosage}, ${Array.isArray(m.timing) ? m.timing.join(', ') : m.timing})`).join('; ')}</div>
        {data.bloodResults && !data.bloodResults.skipped && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <div><b>Blood Results:</b></div>
            {data.bloodResults.uploadMethod === 'documents' && data.bloodResults.documents?.length > 0 && (
              <div className="ml-2 text-sm"><b>Documents:</b> {data.bloodResults.documents.join(', ')}</div>
            )}
            {data.bloodResults.uploadMethod === 'images' && data.bloodResults.images?.length > 0 && (
              <div className="ml-2 text-sm"><b>Images:</b> {data.bloodResults.images.join(', ')}</div>
            )}
            {data.bloodResults.notes && (
              <div className="ml-2 text-sm"><b>Notes:</b> {data.bloodResults.notes}</div>
            )}
          </div>
        )}
        <div><b>AI Insights:</b> {data.wantInsights === 'yes' ? 'Yes' : 'No'}</div>
      </div>

      {/* Modern Loading Progress Bar */}
      {isProcessing && (
        <div className="mb-6 p-5 bg-gradient-to-br from-blue-50 to-green-50 rounded-xl border border-blue-200 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold text-gray-800">Processing your health data</span>
            <span className="text-lg font-bold text-blue-600">{progress}%</span>
          </div>
          
          {/* Modern Progress Bar with Gradient */}
          <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden shadow-inner">
            <div 
              className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
              style={{ 
                width: `${progress}%`,
                background: progress === 100 
                  ? 'linear-gradient(90deg, #10b981, #059669, #34d399)' 
                  : 'linear-gradient(90deg, #3b82f6, #1d4ed8, #2563eb)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              {/* Animated shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 transform -skew-x-12 animate-pulse"></div>
            </div>
          </div>
          
          {/* Status Text with Icon */}
          <div className="flex items-center text-base text-gray-700">
            <div className="flex items-center mr-3">
              {progress === 100 ? (
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              ) : (
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
              )}
            </div>
            <span className="font-medium">{statusText}</span>
          </div>

          {/* Time estimate */}
          <div className="mt-3 text-sm text-gray-500">
            {progress < 50 && "This may take up to 15 seconds..."}
            {progress >= 50 && progress < 90 && "Almost there! Just a few more seconds..."}
            {progress >= 90 && progress < 100 && "Finishing up..."}
            {progress === 100 && "Complete! Redirecting to your dashboard..."}
          </div>
        </div>
      )}
      
      <div className="flex justify-between">
        <button 
          className="btn-secondary" 
          onClick={onBack}
          disabled={isProcessing}
        >
          Back
        </button>
        <button 
          className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
            isProcessing 
              ? 'bg-blue-600 text-white cursor-not-allowed scale-95' 
              : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 active:scale-95'
          }`}
          onClick={handleConfirmBegin}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </div>
          ) : (
            'Confirm & Begin'
          )}
        </button>
      </div>
    </div>
  );
}

function InteractionAnalysisStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [previousAnalyses, setPreviousAnalyses] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditInfo, setCreditInfo] = useState<any>(null);
  const [userSubscriptionStatus, setUserSubscriptionStatus] = useState<'FREE' | 'PREMIUM' | null>(null);
  const [expandedInteractions, setExpandedInteractions] = useState<Set<number>>(new Set());
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<number>>(new Set());
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);

  useEffect(() => {
    // Load previous analyses and show the last one (no auto-analysis)
    loadPreviousAnalyses();
  }, []);

  const loadPreviousAnalyses = async () => {
    try {
      const response = await fetch('/api/interaction-history');
      if (response.ok) {
        const data = await response.json();
        const analyses = data.analyses || [];
        setPreviousAnalyses(analyses);
        
        // Check if we have supplements or medications to analyze
        const currentSupplements = initial?.supplements || [];
        const currentMedications = initial?.medications || [];
        const hasDataToAnalyze = currentSupplements.length > 0 || currentMedications.length > 0;
        
        // If no previous analyses AND we have data to analyze, trigger fresh analysis
        if (analyses.length === 0 && hasDataToAnalyze) {
          console.log('🔄 No previous analyses found but have data - triggering fresh analysis');
          setIsLoadingHistory(false);
          performAnalysis();
          return;
        }
        
        // Load the most recent analysis to display on page 8
        if (analyses.length > 0) {
          const mostRecentAnalysis = analyses[0]; // Assuming newest first
          setAnalysisResult(mostRecentAnalysis.analysisData);
          console.log('✅ Loaded most recent analysis for display');
        } else {
          console.log('ℹ️ No previous analyses found - showing empty state');
          // Set a default empty state so page doesn't get stuck
          setAnalysisResult({
            overallRisk: 'low',
            summary: 'No previous interaction analysis found. Add supplements and medications on the previous pages to get started.',
            interactions: [],
            timingOptimization: {},
            generalRecommendations: ['Go back to add your supplements and medications for a comprehensive interaction analysis.'],
            disclaimer: 'This analysis is for informational purposes only and should not replace professional medical advice.'
          });
        }
        
        setIsLoadingHistory(false);
      } else {
        setIsLoadingHistory(false);
      }
    } catch (error) {
      console.error('Error loading previous analyses:', error);
      setIsLoadingHistory(false);
    }
    
    // Load user subscription status
    try {
      const userResponse = await fetch('/api/user-data');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        // Check if user has premium subscription
        const isPremium = userData.subscription?.plan === 'PREMIUM';
        setUserSubscriptionStatus(isPremium ? 'PREMIUM' : 'FREE');
      }
    } catch (error) {
      console.error('Error loading user subscription status:', error);
      setUserSubscriptionStatus('FREE'); // Default to free if error
    }
  };

  const performAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setIsLoadingHistory(false); // Stop loading history when we start analysis

    try {
      // Get fresh data from the current form state instead of just initial
      const currentSupplements = initial?.supplements || [];
      const currentMedications = initial?.medications || [];
      
      console.log('🔍 INTERACTION ANALYSIS DEBUG:', {
        initialSupplements: initial?.supplements?.length || 0,
        initialMedications: initial?.medications?.length || 0,
        currentSupplements: currentSupplements.length,
        currentMedications: currentMedications.length
      });

      if (currentSupplements.length === 0 && currentMedications.length === 0) {
        setAnalysisResult({
          overallRisk: 'low',
          summary: 'No supplements or medications to analyze. Please add your supplements and medications in the previous steps.',
          interactions: [],
          timingOptimization: {},
          generalRecommendations: ['Go back to add your supplements and medications for a comprehensive interaction analysis.'],
          disclaimer: 'This analysis is for informational purposes only and should not replace professional medical advice.'
        });
        setIsAnalyzing(false);
        return;
      }

      const response = await fetch('/api/analyze-interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplements: currentSupplements,
          medications: currentMedications,
        }),
      });

      if (response.status === 402) {
        // Handle insufficient credits
        const errorData = await response.json();
        setCreditInfo(errorData);
        setShowCreditModal(true);
        setIsAnalyzing(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || `Analysis failed: ${response.status}`);
      }

      const result = await response.json();
      // Handle the API response structure - it returns { success: true, analysis: {...} }
      if (result.success && result.analysis) {
        setAnalysisResult(result.analysis);
      } else {
        throw new Error('Invalid API response structure');
      }
    } catch (err) {
      console.error('Error performing interaction analysis:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze interactions. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRetry = () => {
    performAnalysis();
  };

  const handleNext = () => {
    // Save analysis result and proceed
    onNext({ interactionAnalysis: analysisResult });
  };

  const toggleInteractionExpansion = (index: number) => {
    const newExpanded = new Set(expandedInteractions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedInteractions(newExpanded);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-orange-100 text-orange-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low': return '🟢';
      case 'medium': return '🟠';
      case 'high': return '🔴';
      default: return '⚪';
    }
  };

  const toggleHistoryExpansion = (index: number) => {
    const newExpanded = new Set(expandedHistoryItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedHistoryItems(newExpanded);
  };

  const deleteAnalysis = async (analysisId: string) => {
    try {
      const response = await fetch(`/api/interaction-history/${analysisId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Refresh the analyses list
        loadPreviousAnalyses();
        console.log('✅ Analysis deleted successfully');
      } else {
        console.error('Failed to delete analysis');
      }
    } catch (error) {
      console.error('Error deleting analysis:', error);
    }
  };

  const formatAnalysisDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isAnalyzing) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="mb-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          </div>
          <h2 className="text-2xl font-bold mb-4">Analyzing Interactions</h2>
          <p className="text-gray-600 mb-4">
            Our AI is analyzing potential interactions between your supplements and medications...
          </p>
          <div className="text-sm text-gray-500">
            This may take a few moments
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4">Analysis Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={onBack}
              className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // This check is moved below, after we handle the previous analyses case

  // Show loading state while fetching history
  if (isLoadingHistory) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="mb-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          </div>
          <h2 className="text-2xl font-bold mb-4">Loading Analysis History</h2>
          <p className="text-gray-600">Checking for previous analyses...</p>
        </div>
      </div>
    );
  }

  // Show loading state while analysis is running
  if (!analysisResult && isAnalyzing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analyzing Interactions...</h3>
            <p className="text-gray-600">
              We're checking your supplements and medications for potential interactions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if analysis failed
  if (!analysisResult && !isAnalyzing && error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="text-red-500 text-4xl mb-4">❌</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Failed</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={handleRetry}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If no analysis result and not analyzing, show minimal loading state
  if (!analysisResult && !isAnalyzing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-4">🔬</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Preparing Analysis...</h3>
            <p className="text-gray-600">
              Please wait while we prepare your interaction analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Final fallback - if we don't have analysis results and we're not loading/analyzing
  if (!analysisResult) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-gray-400 text-6xl mb-4">🤔</div>
          <h2 className="text-2xl font-bold mb-4">No Analysis Available</h2>
          <p className="text-gray-600 mb-6">Unable to load interaction analysis results.</p>
          <button
            onClick={onBack}
            className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 space-y-3 md:space-y-0">
          <h2 className="text-xl md:text-2xl font-bold">Latest Analysis Results</h2>
          <div className={`px-3 py-1 rounded-full text-sm font-medium self-start md:self-auto ${
            analysisResult.overallRisk === 'low' 
              ? 'bg-green-100 text-green-800'
              : analysisResult.overallRisk === 'medium'
              ? 'bg-orange-100 text-orange-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {analysisResult.overallRisk === 'low' && '🟢 Low Risk'}
            {analysisResult.overallRisk === 'medium' && '🟠 Medium Risk'}
            {analysisResult.overallRisk === 'high' && '🔴 High Risk'}
          </div>
        </div>



        {/* Summary */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
          <p className="text-blue-800">
            {analysisResult.summary || 
             `Analysis completed for ${analysisResult.supplementCount || 0} supplement${(analysisResult.supplementCount || 0) !== 1 ? 's' : ''} and ${analysisResult.medicationCount || 0} medication${(analysisResult.medicationCount || 0) !== 1 ? 's' : ''}. Overall risk level: ${analysisResult.overallRisk || 'unknown'}.`}
          </p>
        </div>

        {/* Interactions - Show green checkmark for no dangerous interactions or accordion for interactions */}
        {(() => {
          const dangerousInteractions = analysisResult.interactions?.filter((interaction: any) => 
            interaction.severity === 'medium' || interaction.severity === 'high'
          ) || [];
          
          if (dangerousInteractions.length > 0) {
            return (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Potential Interactions</h3>
                <div className="space-y-2">
                  {dangerousInteractions.map((interaction: any, index: number) => {
                    const isExpanded = expandedInteractions.has(index);
                    const severityIcon = interaction.severity === 'high' ? '🚨' : '⚠️';
                    
                    return (
                      <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Accordion Header */}
                        <button
                          onClick={() => toggleInteractionExpansion(index)}
                          className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left"
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <span className="text-lg">{severityIcon}</span>
                            <span className="font-medium text-gray-900">
                              {interaction.substance1} + {interaction.substance2}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              interaction.severity === 'high' 
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                              {interaction.severity.toUpperCase()}
                            </span>
                            <svg 
                              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        
                        {/* Accordion Content */}
                        {isExpanded && (
                          <div className="px-4 py-4 bg-white border-t border-gray-200">
                            <div className="space-y-3">
                              <div>
                                <h4 className="font-medium text-gray-900 mb-1">Effect:</h4>
                                <p className="text-gray-700 text-sm leading-relaxed">{interaction.description}</p>
                              </div>
                              
                              {interaction.recommendation && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <h4 className="font-medium text-blue-900 mb-1">💡 Recommendation:</h4>
                                  <p className="text-blue-800 text-sm leading-relaxed">{interaction.recommendation}</p>
                                </div>
                              )}
                              
                              {interaction.severity === 'high' && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <h4 className="font-medium text-red-900 mb-1">⚠️ Important:</h4>
                                  <p className="text-red-800 text-sm">This is a high-risk interaction. Please consult with your healthcare provider immediately.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          } else {
            return (
              <div className="mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-green-600 text-4xl mb-2">✅</div>
                  <h3 className="text-lg font-semibold text-green-900 mb-1">No Dangerous Interactions Found</h3>
                  <p className="text-green-800 text-sm">Your current supplements and medications appear to be safe to take together.</p>
                </div>
              </div>
            );
          }
        })()}

        {/* Timing Optimization */}
        {analysisResult.timingOptimization && Object.keys(analysisResult.timingOptimization).length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Optimal Timing Schedule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {Object.entries(analysisResult.timingOptimization).map(([timeSlot, substances]: [string, any]) => (
                <div key={timeSlot} className="border rounded-lg p-3">
                  <div className="font-medium text-gray-900 mb-2 text-sm md:text-base capitalize">
                    {timeSlot.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="space-y-1">
                    {substances.map((substance: string, index: number) => (
                      <div key={index} className="text-xs md:text-sm text-gray-600 bg-gray-50 rounded px-2 py-1 break-words">
                        {substance}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {analysisResult.generalRecommendations && analysisResult.generalRecommendations.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
            <div className="space-y-2">
              {analysisResult.generalRecommendations.map((rec: string, index: number) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className="text-green-600 mt-1">✓</div>
                  <div className="text-gray-700">{rec}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Important:</strong> {analysisResult.disclaimer}
              </p>
            </div>
          </div>
        </div>

        {/* Analysis History Section */}
        {previousAnalyses.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Previous Analysis History</h3>
              <button
                onClick={() => setShowAnalysisHistory(!showAnalysisHistory)}
                className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                <span>{showAnalysisHistory ? 'Hide' : 'Show'} History</span>
                <svg 
                  className={`w-4 h-4 transition-transform ${showAnalysisHistory ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            
            {showAnalysisHistory && (
              <div className="space-y-3">
                {previousAnalyses.map((analysis, index) => {
                  const isExpanded = expandedHistoryItems.has(index);
                  const analysisData = analysis.analysisData || {};
                  
                  return (
                    <div key={analysis.id || index} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* History Item Header */}
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                        <button
                          onClick={() => toggleHistoryExpansion(index)}
                          className="flex items-center space-x-3 flex-1 text-left hover:bg-gray-100 transition-colors rounded p-1 -m-1"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              {formatAnalysisDate(analysis.createdAt)}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              analysisData.overallRisk === 'low' 
                                ? 'bg-green-100 text-green-800'
                                : analysisData.overallRisk === 'medium'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {getRiskIcon(analysisData.overallRisk)} {analysisData.overallRisk?.toUpperCase() || 'UNKNOWN'}
                            </span>
                          </div>
                          <svg 
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        <button
                          onClick={() => deleteAnalysis(analysis.id)}
                          className="ml-3 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          title="Delete this analysis"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* History Item Content */}
                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-gray-200">
                          <div className="space-y-4">
                            {/* Summary */}
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
                              <p className="text-sm text-gray-700">{analysisData.summary || 'No summary available'}</p>
                            </div>
                            
                            {/* Interactions */}
                            {analysisData.interactions && analysisData.interactions.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">Key Interactions</h4>
                                <div className="space-y-2">
                                  {analysisData.interactions.slice(0, 3).map((interaction: any, idx: number) => (
                                    <div key={idx} className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                      <span className="font-medium">{interaction.substance1} + {interaction.substance2}:</span> {interaction.description}
                                    </div>
                                  ))}
                                  {analysisData.interactions.length > 3 && (
                                    <div className="text-sm text-gray-500">
                                      +{analysisData.interactions.length - 3} more interactions
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Timing Optimization */}
                            {analysisData.timingOptimization && Object.keys(analysisData.timingOptimization).length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">Timing Recommendations</h4>
                                <div className="grid grid-cols-2 gap-2">
                                  {Object.entries(analysisData.timingOptimization).slice(0, 4).map(([timeSlot, substances]: [string, any]) => (
                                    <div key={timeSlot} className="text-sm bg-blue-50 p-2 rounded">
                                      <div className="font-medium text-blue-900 capitalize">
                                        {timeSlot.replace(/([A-Z])/g, ' $1').trim()}
                                      </div>
                                      <div className="text-blue-700 text-xs">
                                        {substances.length} item{substances.length !== 1 ? 's' : ''}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={onBack}
            className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-base font-medium"
          >
            Back to Medications
          </button>
          <button
            onClick={handleNext}
            className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-base font-medium"
          >
            Continue
          </button>
        </div>
      </div>

      {/* Credit Purchase Modal */}
      {showCreditModal && creditInfo && (
        <CreditPurchaseModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
          creditInfo={creditInfo}
        />
      )}


    </div>
  );
}

export default function Onboarding() {
  const { data: session, status } = useSession();
  
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [profileImage, setProfileImage] = useState<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stepNames = [
    'Gender',
    'Physical',
    'Exercise',
    'Health Goals',
    'Health Situations', 
    'Supplements',
    'Medications',
    'Interaction Analysis',
    'Blood Results',
    'AI Insights',
    'Review'
  ];

  // Removed automatic redirect - users should always be able to access intake/onboarding to edit their information

  // Removed blocking render - users should always be able to access intake to edit information

  // Profile data - using consistent green avatar
  const defaultAvatar = 'data:image/svg+xml;base64,' + btoa(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#10B981"/>
      <circle cx="64" cy="48" r="20" fill="white"/>
      <path d="M64 76c-13.33 0-24 5.34-24 12v16c0 8.84 7.16 16 16 16h16c8.84 0 16-7.16 16-16V88c0-6.66-10.67-12-24-12z" fill="white"/>
    </svg>
  `);
  const userImage = profileImage || session?.user?.image || defaultAvatar;
  const userName = session?.user?.name || 'User';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Element;
      if (dropdownOpen && !target.closest('#profile-dropdown')) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [dropdownOpen]);

  // Basic session validation without aggressive checks
  useEffect(() => {
    if (status === 'loading') return;
    
    if (status === 'authenticated') {
      const currentStep = parseInt(new URLSearchParams(window.location.search).get('step') || '1') - 1;
      setStep(Math.max(0, Math.min(stepNames.length - 1, currentStep)));
    } else if (status === 'unauthenticated') {
      // Only redirect if truly unauthenticated
      console.log('🚫 User not authenticated - redirecting to homepage');
      window.location.href = '/';
    }
  }, [status, stepNames.length]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadUserData();
    }
  }, [status]);

  // Optimized: Consolidated data loading - no separate profile image API call
  const loadUserData = async () => {
    try {
      const response = await fetch('/api/user-data');
      if (response.ok) {
        const userData = await response.json();
        console.log('Loaded user data from database:', userData);
        if (userData && userData.data && Object.keys(userData.data).length > 0) {
          setForm(userData.data);
          // Load profile image from the same API response
          if (userData.data.profileImage) {
            setProfileImage(userData.data.profileImage);
          }
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // Optimized debounced save function
  const debouncedSave = useCallback(async (data: any) => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/user-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (response.ok) {
          console.log('Progress auto-saved to database');
        } else {
          console.warn('Failed to auto-save progress:', response.status, response.statusText);
        }
      } catch (error) {
        console.warn('Error auto-saving progress:', error);
      }
    }, 1000); // Save after 1 second of inactivity
  }, []);

  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const container = document.getElementById('onboarding-container');
      if (container) container.scrollTop = 0;
    };
    
    scrollToTop();
    
    // Backup scroll after a delay
    const timer = setTimeout(scrollToTop, 50);
    
    return () => clearTimeout(timer);
  }, [step]);

  const handleNext = async (data: any) => {
    // Prevent double-clicks
    if (isNavigating) return;
    
    setIsNavigating(true);
    setIsLoading(true);

    try {
      const updatedForm = { ...form, ...data };
      setForm(updatedForm);
      
      // Re-enabled debounced save with safer mechanism
      debouncedSave(updatedForm);
      
      // Add small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 150));
      
      setStep((prev) => {
        const newStep = Math.min(stepNames.length - 1, prev + 1);
        // Update URL to remember step position
        const url = new URL(window.location.href);
        url.searchParams.set('step', (newStep + 1).toString());
        window.history.replaceState({}, '', url.toString());
        
        // Force immediate scroll
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          const container = document.getElementById('onboarding-container');
          if (container) container.scrollTop = 0;
        });
        return newStep;
      });
    } finally {
      setIsLoading(false);
      setIsNavigating(false);
    }
  };

  const handleBack = () => {
    // Prevent navigation during loading
    if (isNavigating) return;
    
    setStep((prev) => {
      const newStep = Math.max(0, prev - 1);
      // Update URL to remember step position
      const url = new URL(window.location.href);
      url.searchParams.set('step', (newStep + 1).toString());
      window.history.replaceState({}, '', url.toString());
      
      // Force immediate scroll
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const container = document.getElementById('onboarding-container');
        if (container) container.scrollTop = 0;
      });
      return newStep;
    });
  };

  const goToStep = (stepIndex: number) => {
    // Prevent navigation during loading
    if (isNavigating) return;
    
    setStep(stepIndex);
    // Update URL to remember step position
    const url = new URL(window.location.href);
    url.searchParams.set('step', (stepIndex + 1).toString());
    window.history.replaceState({}, '', url.toString());
    
    // Force immediate scroll
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const container = document.getElementById('onboarding-container');
      if (container) container.scrollTop = 0;
    });
  };

  // Mobile sliding window navigation
  const getMobileProgressWindow = () => {
    const currentStep = step + 1; // 1-indexed for display
    const totalSteps = 11;
    
    // Show current + 2 before/after when possible
    let start = Math.max(1, currentStep - 2);
    let end = Math.min(totalSteps, currentStep + 2);
    
    // Adjust if we're near the beginning or end
    if (end - start < 4) {
      if (start === 1) {
        end = Math.min(totalSteps, start + 4);
      } else if (end === totalSteps) {
        start = Math.max(1, end - 4);
      }
    }
    
    const steps = [];
    for (let i = start; i <= end; i++) {
      steps.push(i);
    }
    
    return { steps, canGoLeft: start > 1, canGoRight: end < totalSteps };
  };

  const mobileProgress = getMobileProgressWindow();

  return (
    <div className="fixed inset-0 bg-gray-50 overflow-y-auto overflow-x-hidden" id="onboarding-container">
      <div className="min-h-full flex flex-col max-w-full">
        {/* Sophisticated Progress with Numbered Steps */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-3 safe-area-inset-top z-50">
          <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
            {/* Back Button */}
            <button 
              onClick={() => window.history.back()} 
              className="flex items-center text-gray-600 hover:text-gray-900"
              title="back button to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <h1 className="text-lg font-semibold text-gray-900">
              Edit Health Info
            </h1>
            
            {/* Reset Button & Profile Dropdown */}
            <div className="flex items-center space-x-2">
              {/* Reset Button */}
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                title="Reset page"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              
              {/* Profile Avatar & Dropdown */}
              <div className="relative dropdown-container" id="profile-dropdown">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="focus:outline-none"
                  aria-label="Open profile menu"
                >
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                  />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                    <div className="flex items-center px-4 py-3 border-b border-gray-100">
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">{userName}</div>
                        <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                      </div>
                    </div>
                    <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                    <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                    <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                    <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                    <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                    <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                    <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                    <div className="border-t border-gray-100 my-2"></div>
                    <Link href="/reports" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Reports</Link>
                    <button
                      onClick={() => signOut()}
                      className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Mobile: Sliding Window Navigation */}
          <div className="sm:hidden mb-2">
            <div className="flex items-center justify-center space-x-2">
              {/* Left Arrow */}
              <button
                onClick={() => goToStep(step - 1)}
                disabled={step === 0 || isNavigating}
                className={`p-1 rounded ${
                  step === 0 || isNavigating
                    ? 'text-gray-300 cursor-not-allowed' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Sliding Step Numbers */}
              <div className="flex items-center space-x-1">
                {mobileProgress.steps.map((stepNum) => (
                  <button
                    key={stepNum}
                    onClick={() => goToStep(stepNum - 1)}
                    disabled={isNavigating}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      stepNum === step + 1 
                        ? 'bg-green-600 text-white' 
                        : stepNum < step + 1
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${isNavigating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-105'}`}
                    title={`Go to step ${stepNum}: ${stepNames[stepNum - 1]}`}
                  >
                    {stepNum}
                  </button>
                ))}
              </div>

              {/* Right Arrow */}
              <button
                onClick={() => goToStep(step + 1)}
                disabled={step === stepNames.length - 1 || isNavigating}
                className={`p-1 rounded ${
                  step === stepNames.length - 1 || isNavigating
                    ? 'text-gray-300 cursor-not-allowed' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Mobile Step Name and Progress */}
            <div className="text-center mt-2">
              <div className="text-sm font-medium text-gray-900">{stepNames[step]}</div>
              <div className="text-xs text-gray-500">Step {step + 1} of {stepNames.length}</div>
            </div>
          </div>
          
          {/* Desktop: Full Numbered Steps (unchanged) */}
          <div className="hidden sm:block relative mb-3">
            <div className="flex items-center justify-center max-w-4xl mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((stepNum, index) => (
                <div key={stepNum} className="flex items-center">
                  <button 
                    onClick={() => goToStep(stepNum - 1)}
                    disabled={isNavigating}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all z-10 ${
                      isNavigating 
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer hover:scale-105'
                    } ${
                      stepNum === step + 1 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : stepNum < step + 1
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-300 text-gray-600 hover:bg-gray-400'
                    }`}
                    title={`Go to step ${stepNum}: ${stepNames[stepNum - 1]}`}
                  >
                    {stepNum}
                  </button>
                  {index < 10 && (
                    <div className={`h-0.5 w-4 transition-all ${
                      stepNum < step + 1 ? 'bg-green-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-3 max-w-4xl mx-auto">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${((step + 1) / stepNames.length) * 100}%` }}
            />
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-center justify-center py-2">
              <div className="flex items-center space-x-2 text-green-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm font-medium">Loading...</span>
              </div>
            </div>
          )}

          {/* Skip and Step Info - Desktop Only */}
          <div className="hidden sm:flex items-center justify-between max-w-4xl mx-auto">
            <button className="text-sm text-gray-500 hover:text-gray-700">Skip</button>
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900">{stepNames[step]}</div>
              <div className="text-xs text-gray-500">Step {step + 1} of 11</div>
            </div>
            <div className="text-sm text-gray-500">{step + 1}/11</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-2 pb-20">
          {step === 0 && <GenderStep onNext={handleNext} initial={form.gender} />}
          {step === 1 && <PhysicalStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 2 && <ExerciseStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 3 && <HealthGoalsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 4 && <HealthSituationsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 5 && <SupplementsStep onNext={handleNext} onBack={handleBack} initial={form} onNavigateToAnalysis={() => goToStep(7)} />}
          {step === 6 && <MedicationsStep onNext={handleNext} onBack={handleBack} initial={form} onNavigateToAnalysis={() => goToStep(7)} />}
          {step === 7 && <InteractionAnalysisStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 8 && <BloodResultsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 9 && <AIInsightsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 10 && <ReviewStep onBack={handleBack} data={form} />}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
          <div className="flex items-center justify-around">
            
            {/* Dashboard */}
            <Link href="/dashboard" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-gray-400">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
                </svg>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium truncate">Dashboard</span>
            </Link>

            {/* Insights */}
            <Link href="/insights" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-gray-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium truncate">Insights</span>
            </Link>

                      {/* Food */}
          <Link href="/food" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-1 font-medium truncate">Food</span>
          </Link>

            {/* Intake (Active) */}
            <Link href="/onboarding?step=1" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-helfi-green">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-xs text-helfi-green mt-1 font-bold truncate">Intake</span>
            </Link>

            {/* Settings */}
            <Link href="/settings" className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-gray-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium truncate">Settings</span>
            </Link>

          </div>
        </nav>

        {/* Reset Confirmation Popup */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reset Page Data</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to reset all data on this page? This will clear all your current progress and cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    window.location.reload();
                    setShowResetConfirm(false);
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Reset Page
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}