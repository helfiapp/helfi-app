'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

// Protected health app with authentication

const steps = [
  'gender',
  'physical',
  'exercise',
  'healthGoals',
  'supplements',
  'medications',
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
  const [gender, setGender] = useState(initial || '');
  const [agreed, setAgreed] = useState(false);
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
            onChange={e => setAgreed(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="agree-terms" className="text-sm text-gray-700">
            I agree to the <a href="/terms" target="_blank" className="text-helfi-green underline">Terms and Conditions</a> and <a href="/privacy" target="_blank" className="text-helfi-green underline">Privacy Policy</a>
          </label>
        </div>
        <button
          className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors w-full disabled:bg-gray-300"
          disabled={!gender || !agreed}
          onClick={() => gender && agreed && onNext({ gender })}
        >
          Continue
        </button>
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
        <button 
          className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
          disabled={!weight || (unit === 'metric' ? !height : (!feet || !inches))} 
          onClick={handleNext}
        >
          Next
        </button>
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
          <button 
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
            disabled={!exerciseFrequency}
            onClick={() => onNext({ exerciseFrequency, exerciseTypes })}
          >
            Continue
          </button>
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
          <button 
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
            disabled={goals.length === 0} 
            onClick={handleNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function SupplementsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [supplements, setSupplements] = useState(initial?.supplements || []);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [timing, setTiming] = useState<string[]>([]);
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'photo'>('photo');

  const handleUploadMethodChange = (method: 'manual' | 'photo') => {
    setUploadMethod(method);
    // Clear any existing data when switching methods
    if (method === 'manual') {
      setFrontImage(null);
      setBackImage(null);
      setPhotoDosage('');
      setPhotoTiming([]);
    } else {
      setName('');
      setDosage('');
      setTiming([]);
    }
  };
  
  // For photo upload method
  const [photoDosage, setPhotoDosage] = useState('');
  const [photoTiming, setPhotoTiming] = useState<string[]>([]);

  const timingOptions = ['Morning', 'Afternoon', 'Evening', 'Before Bed'];

  const toggleTiming = (time: string, isPhoto: boolean = false) => {
    const currentTiming = isPhoto ? photoTiming : timing;
    const setCurrentTiming = isPhoto ? setPhotoTiming : setTiming;
    
    setCurrentTiming(prev => 
      prev.includes(time) 
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const addSupplement = () => {
    if (uploadMethod === 'manual' && name && dosage && timing.length > 0) {
      setSupplements((prev: any[]) => [...prev, { name, dosage, timing, method: 'manual' }]);
      setName(''); setDosage(''); setTiming([]);
    } else if (uploadMethod === 'photo' && frontImage && photoDosage && photoTiming.length > 0) {
      setSupplements((prev: any[]) => [...prev, { 
        frontImage: frontImage.name, 
        backImage: backImage?.name, 
        method: 'photo',
        name: frontImage.name.split('.')[0], // Use filename as temporary name
        dosage: photoDosage,
        timing: photoTiming
      }]);
      setFrontImage(null); setBackImage(null); setPhotoDosage(''); setPhotoTiming([]);
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
              <input 
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                type="text" 
                placeholder="e.g., 1000mg, 2 capsules" 
                value={photoDosage} 
                onChange={e => setPhotoDosage(e.target.value)} 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this supplement? *
              </label>
              <div className="space-y-2">
                {timingOptions.map(time => (
                  <label key={time} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={photoTiming.includes(time)}
                      onChange={() => toggleTiming(time, true)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                    />
                    <span className="text-gray-700">{time}</span>
                  </label>
                ))}
              </div>
            </div>

            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addSupplement}
              disabled={!frontImage || !photoDosage || photoTiming.length === 0}
            >
              Add Supplement Photos
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
            <input 
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
              type="text" 
              placeholder="Dosage (e.g., 1000mg)" 
              value={dosage} 
              onChange={e => setDosage(e.target.value)} 
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this supplement? *
              </label>
              <div className="space-y-2">
                {timingOptions.map(time => (
                  <label key={time} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timing.includes(time)}
                      onChange={() => toggleTiming(time, false)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                    />
                    <span className="text-gray-700">{time}</span>
                  </label>
                ))}
              </div>
            </div>
            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addSupplement}
              disabled={!name || !dosage || timing.length === 0}
            >
              Add Supplement
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
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-sm text-gray-600">{s.dosage} - {Array.isArray(s.timing) ? s.timing.join(', ') : s.timing}</div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeSupplement(i)}
                    className="text-red-500 hover:text-red-700 p-1 transition-colors"
                    title="Remove supplement"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
    </div>
  );
}

function MedicationsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [medications, setMedications] = useState(initial?.medications || []);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [timing, setTiming] = useState<string[]>([]);
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'photo'>('photo');
  
  // For photo upload method
  const [photoDosage, setPhotoDosage] = useState('');
  const [photoTiming, setPhotoTiming] = useState<string[]>([]);

  const timingOptions = ['Morning', 'Afternoon', 'Evening', 'Before Bed'];

  const toggleTiming = (time: string, isPhoto: boolean = false) => {
    const currentTiming = isPhoto ? photoTiming : timing;
    const setCurrentTiming = isPhoto ? setPhotoTiming : setTiming;
    
    setCurrentTiming(prev => 
      prev.includes(time) 
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const addMedication = () => {
    if (uploadMethod === 'manual' && name && dosage && timing.length > 0) {
      setMedications((prev: any[]) => [...prev, { name, dosage, timing, method: 'manual' }]);
      setName(''); setDosage(''); setTiming([]);
    } else if (uploadMethod === 'photo' && frontImage && photoDosage && photoTiming.length > 0) {
      setMedications((prev: any[]) => [...prev, { 
        frontImage: frontImage.name, 
        backImage: backImage?.name, 
        method: 'photo',
        name: frontImage.name.split('.')[0], // Use filename as temporary name
        dosage: photoDosage,
        timing: photoTiming
      }]);
      setFrontImage(null); setBackImage(null); setPhotoDosage(''); setPhotoTiming([]);
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
              <input 
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                type="text" 
                placeholder="e.g., 10mg, 1 tablet" 
                value={photoDosage} 
                onChange={e => setPhotoDosage(e.target.value)} 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this medication? *
              </label>
              <div className="space-y-2">
                {timingOptions.map(time => (
                  <label key={time} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={photoTiming.includes(time)}
                      onChange={() => toggleTiming(time, true)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                    />
                    <span className="text-gray-700">{time}</span>
                  </label>
                ))}
              </div>
            </div>

            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addMedication}
              disabled={!frontImage || !photoDosage || photoTiming.length === 0}
            >
              Add Medication Photos
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
            <input 
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
              type="text" 
              placeholder="Dosage (e.g., 10mg)" 
              value={dosage} 
              onChange={e => setDosage(e.target.value)} 
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this medication? *
              </label>
              <div className="space-y-2">
                {timingOptions.map(time => (
                  <label key={time} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timing.includes(time)}
                      onChange={() => toggleTiming(time, false)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                    />
                    <span className="text-gray-700">{time}</span>
                  </label>
                ))}
              </div>
            </div>
            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addMedication}
              disabled={!name || !dosage || timing.length === 0}
            >
              Add Medication
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
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-sm text-gray-600">{m.dosage} - {Array.isArray(m.timing) ? m.timing.join(', ') : m.timing}</div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeMedication(i)}
                    className="text-red-500 hover:text-red-700 p-1 transition-colors"
                    title="Remove medication"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
    </div>
  );
}

function ReviewStep({ onBack, data }: { onBack: () => void, data: any }) {
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
        <div><b>Supplements:</b> {(data.supplements || []).map((s: any) => `${s.name} (${s.dosage}, ${Array.isArray(s.timing) ? s.timing.join(', ') : s.timing})`).join('; ')}</div>
        <div><b>Medications:</b> {(data.medications || []).map((m: any) => `${m.name} (${m.dosage}, ${Array.isArray(m.timing) ? m.timing.join(', ') : m.timing})`).join('; ')}</div>
      </div>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" onClick={() => {
          // Save complete data to localStorage for now
          localStorage.setItem('onboardingData', JSON.stringify(data));
          window.location.href = '/dashboard';
        }}>Confirm &amp; Begin</button>
      </div>
    </div>
  );
}

export default function HealthApp() {
  const { data: session, status } = useSession();
  const stepNames = ['Gender', 'Physical', 'Exercise', 'Health Goals', 'Supplements', 'Medications', 'Review'];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});

  // Show sign-in page if not authenticated
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-helfi-green"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <Link href="/" className="text-2xl font-bold text-helfi-green">
                Helfi
              </Link>
              <div className="text-sm text-gray-600">
                Health Intelligence Platform
              </div>
            </div>
          </div>
        </nav>
        
        <div className="max-w-md mx-auto px-4 py-20">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-helfi-black mb-2">
                Access Health Platform
              </h1>
              <p className="text-gray-600">
                Sign in to continue to your health dashboard
              </p>
            </div>
            
            <div className="space-y-4">
              <Link
                href="/auth/signin"
                className="w-full bg-helfi-green text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors text-center block"
              >
                Sign In / Sign Up
              </Link>
              
              <div className="text-center">
                <Link href="/" className="text-sm text-gray-600 hover:text-helfi-green">
                  ← Back to main site
                </Link>
              </div>
            </div>
            
            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Development Access:</strong> This is the beta version of the Helfi health platform. 
                Sign in with Google or email to test the onboarding flow.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-helfi-black mb-4">
            Health App Coming Soon
          </h1>
          <p className="text-gray-600 mb-6">
            Our comprehensive health tracking platform is under development.
          </p>
          <div className="space-y-4">
            <Link
              href="/onboarding"
              className="w-full bg-helfi-green text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors text-center block"
            >
              Try Onboarding Demo
            </Link>
            <Link
              href="/dashboard"
              className="w-full border border-helfi-green text-helfi-green py-3 px-4 rounded-lg hover:bg-helfi-green hover:text-white transition-colors text-center block"
            >
              View Dashboard
            </Link>
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-helfi-green block"
            >
              ← Back to main site
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}