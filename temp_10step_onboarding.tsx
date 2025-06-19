'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import BottomNav from '../../components/BottomNav';
import { useSession, signOut } from 'next-auth/react';

// Auth-enabled onboarding flow

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
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  };

  if (!user) return null;

  return (
    <button
      onClick={handleSignOut}
      className="bg-white border border-gray-300 rounded-full p-2 shadow-lg hover:shadow-xl transition-all"
      title={`Logout (${user?.email})`}
    >
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  );
}

function HeaderProfileSection() {
  const [user, setUser] = useState<any>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userImage, setUserImage] = useState<string | null>(null);
  
  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }
  
  // Load profile image from localStorage or user metadata
  useEffect(() => {
    const savedImage = localStorage.getItem('userProfileImage')
    if (savedImage) {
      setUserImage(savedImage)
    } else if (user?.user_metadata?.avatar_url) {
      setUserImage(user.user_metadata.avatar_url)
    }
  }, [user])
  
  const userName = user?.user_metadata?.name || user?.email || 'User';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('#header-profile-dropdown')) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
    } else {
      document.removeEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  return (
    <div className="flex items-center space-x-3 flex-shrink-0">
      {/* Profile Avatar & Dropdown */}
      <div className="relative" id="header-profile-dropdown">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="focus:outline-none bg-white border border-gray-300 rounded-full p-1 shadow-lg hover:shadow-xl transition-all"
          aria-label="Open profile menu"
        >
          {userImage ? (
            <Image
              src={userImage}
              alt="Profile"
              width={36}
              height={36}
              className="rounded-full object-cover w-9 h-9"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-helfi-green flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          )}
        </button>
        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl py-2 z-50 border border-gray-100 animate-fade-in">
            <div className="flex items-center px-4 py-3 border-b border-gray-100">
              {userImage ? (
                <Image
                  src={userImage}
                  alt="Profile"
                  width={32}
                  height={32}
                  className="rounded-full object-cover mr-3"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate text-sm">{userName}</div>
                <div className="text-xs text-gray-500 truncate">{user?.email || 'user@email.com'}</div>
              </div>
            </div>
            <div className="py-1">
              <Link href="/dashboard" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 text-sm">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
                  </svg>
                  Dashboard
                </div>
              </Link>
              <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 text-sm">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profile
                </div>
              </Link>
              <button 
                onClick={() => {
                  localStorage.setItem('isEditing', 'true');
                  window.location.href = '/onboarding';
                }}
                className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 text-sm"
              >
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Health Info
                </div>
              </button>
              <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 text-sm">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Account Settings
                </div>
              </Link>
              <Link href="/help" className="block px-4 py-2 text-gray-700 hover:bg-gray-50 text-sm">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Help & Support
                </div>
              </Link>
            </div>
            <div className="border-t border-gray-100 pt-1">
              <button
                onClick={handleSignOut}
                className="block w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 font-semibold text-sm"
              >
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
      <RefreshButton />
    </div>
  );
}

function FloatingSkipSection({ step, stepNames, form, onNext }: { step: number, stepNames: string[], form: any, onNext: (data: any) => void }) {
  return (
    <div className="fixed top-20 left-0 right-0 z-50 flex items-center justify-between px-4 py-3">
      <button
        onClick={() => {
          // Skip current step by calling onNext with empty data
          onNext({});
        }}
        className="text-sm bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors whitespace-nowrap font-medium shadow-lg"
        title="Skip this step"
      >
        Skip
      </button>
      <span className="text-sm sm:text-base text-gray-700 font-medium whitespace-nowrap bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">{step + 1}/{stepNames.length}</span>
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
      <div className="flex gap-3">
        <button className="flex-1 border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" onClick={onBack}>Back</button>
        <button 
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
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

        <div className="flex gap-3 pt-4">
          <button 
            className="flex-1 border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={onBack}
          >
            Back
          </button>
          <button 
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
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
        <div className="flex gap-3 pt-4">
          <button 
            className="flex-1 border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={onBack}
          >
            Back
          </button>
          <button 
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
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

function HealthSituationsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [healthIssues, setHealthIssues] = useState(initial?.healthIssues || '');
  const [healthProblems, setHealthProblems] = useState(initial?.healthProblems || '');
  const [additionalInfo, setAdditionalInfo] = useState(initial?.additionalInfo || '');
  const [skipped, setSkipped] = useState(initial?.skipped || false);

  const handleNext = () => {
    const data = { 
      healthIssues: healthIssues.trim(), 
      healthProblems: healthProblems.trim(),
      additionalInfo: additionalInfo.trim(),
      skipped 
    };
    onNext(data);
  };

  const handleSkip = () => {
    setSkipped(true);
    onNext({ skipped: true });
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

        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSkip}
            className="flex-1 text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-300"
          >
            Skip for now
          </button>
          <button
            onClick={handleNext}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Continue
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
        <div className="flex gap-3 pt-4">
          <button 
            className="flex-1 border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={onBack}
          >
            Back
          </button>
          <button 
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
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
  const [timingDosages, setTimingDosages] = useState<{[key: string]: string}>({});
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'photo'>('photo');
  
  // For photo upload method
  const [photoDosage, setPhotoDosage] = useState('');
  const [photoTiming, setPhotoTiming] = useState<string[]>([]);
  const [photoTimingDosages, setPhotoTimingDosages] = useState<{[key: string]: string}>({});

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
      // Combine timing and individual dosages
      const timingWithDosages = timing.map(time => 
        timingDosages[time] ? `${time}: ${timingDosages[time]}` : `${time}: ${dosage}`
      );
      setMedications((prev: any[]) => [...prev, { 
        name, 
        dosage, 
        timing: timingWithDosages, 
        method: 'manual' 
      }]);
      setName(''); setDosage(''); setTiming([]); setTimingDosages({});
    } else if (uploadMethod === 'photo' && frontImage && photoDosage && photoTiming.length > 0) {
      // Combine timing and individual dosages for photos
      const timingWithDosages = photoTiming.map(time => 
        photoTimingDosages[time] ? `${time}: ${photoTimingDosages[time]}` : `${time}: ${photoDosage}`
      );
      setMedications((prev: any[]) => [...prev, { 
        frontImage: frontImage.name, 
        backImage: backImage?.name, 
        method: 'photo',
        name: frontImage.name.split('.')[0], // Use filename as temporary name
        dosage: photoDosage,
        timing: timingWithDosages
      }]);
      setFrontImage(null); setBackImage(null); setPhotoDosage(''); setPhotoTiming([]); setPhotoTimingDosages({});
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
                      <input
                        type="text"
                        placeholder="Dosage (e.g., 2.5mg)"
                        value={photoTimingDosages[time] || ''}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        onChange={(e) => {
                          setPhotoTimingDosages(prev => ({
                            ...prev,
                            [time]: e.target.value
                          }));
                        }}
                      />
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
                      <input
                        type="text"
                        placeholder="Dosage (e.g., 2.5mg)"
                        value={timingDosages[time] || ''}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        onChange={(e) => {
                          setTimingDosages(prev => ({
                            ...prev,
                            [time]: e.target.value
                          }));
                        }}
                      />
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
            onClick={() => {
              try {
                console.log('Medications step - analyzing medications:', medications);
                const safeData = { medications: medications || [] };
                console.log('Sending safe data:', safeData);
                onNext(safeData);
              } catch (error) {
                console.error('Error in medications step:', error);
                alert('There was an issue processing your medications. Please try again.');
              }
            }}
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

function BloodResultsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [uploadMethod, setUploadMethod] = useState<'documents' | 'images'>('documents');
  const [documents, setDocuments] = useState<File[]>(initial?.documents || []);
  const [images, setImages] = useState<File[]>(initial?.images || []);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [skipped, setSkipped] = useState(initial?.skipped || false);

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
    const data = {
      uploadMethod,
      documents: documents.map(f => f.name),
      images: images.map(f => f.name),
      notes: notes.trim(),
      skipped
    };
    onNext(data);
  };

  const handleSkip = () => {
    setSkipped(true);
    onNext({ skipped: true });
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
                {documents.map((file, index) => (
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
                {images.map((file, index) => (
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

        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-300"
          >
            Skip for now
          </button>
          <button
            onClick={handleNext}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
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
      <div className="flex gap-3">
        <button className="flex-1 border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" onClick={onBack}>Back</button>
        <button className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" disabled={!wantInsights} onClick={() => onNext({ wantInsights })}>Next</button>
      </div>
    </div>
  );
}

function ReviewStep({ onBack, data }: { onBack: () => void, data: any }) {
  // Safe data access with fallbacks
  const safeData = data || {};
  
  const formatSupplements = () => {
    try {
      const supplements = safeData.supplements || [];
      return supplements.map((s: any) => {
        if (!s) return 'Invalid supplement data';
        const name = s.name || 'Unknown supplement';
        const dosage = s.dosage || 'Unknown dosage';
        const timing = Array.isArray(s.timing) ? s.timing.join(', ') : (s.timing || 'Unknown timing');
        return `${name} (${dosage}, ${timing})`;
      }).join('; ') || 'None';
    } catch (error) {
      console.error('Error formatting supplements:', error);
      return 'Error displaying supplements';
    }
  };

  const formatMedications = () => {
    try {
      const medications = safeData.medications || [];
      return medications.map((m: any) => {
        if (!m) return 'Invalid medication data';
        const name = m.name || 'Unknown medication';
        const dosage = m.dosage || 'Unknown dosage';
        const timing = Array.isArray(m.timing) ? m.timing.join(', ') : (m.timing || 'Unknown timing');
        return `${name} (${dosage}, ${timing})`;
      }).join('; ') || 'None';
    } catch (error) {
      console.error('Error formatting medications:', error);
      return 'Error displaying medications';
    }
  };

  const handleConfirm = async () => {
    console.log('🔵🔵🔵 CONFIRM BUTTON CLICKED!!! 🔵🔵🔵');
    console.log('🔵 CONFIRM BUTTON CLICKED - Starting save process');
    try {
      console.log('🔵 Data to save:', safeData);
      
      // SAVE TO SERVER DATABASE (NO localStorage!)
      console.log('🔵 Saving data to server database...');
      
      try {
        const response = await fetch('/api/user-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(safeData)
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ Data saved to server database successfully:', result);
      } catch (saveError) {
        console.error('❌ Failed to save data to server:', saveError);
        alert('Failed to save your data. Please try again.');
        return; // Don't redirect if save failed
      }
      
      // 3. Show completion message and redirect to dashboard
      console.log('🔵 === ONBOARDING COMPLETE ===');
      console.log('🔵 Redirecting to dashboard...');
      
      // Navigate to dashboard immediately
      window.location.href = '/dashboard';
      
    } catch (error) {
      console.error('Error saving data:', error);
      alert('There was an issue saving your data. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-sm">
      <h2 className="text-2xl font-bold mb-4 text-center">Here's what we have so far</h2>
      <p className="mb-6 text-gray-600 text-center">Double-check your inputs before we take you to your dashboard.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Gender:</span>
            <span className="text-gray-900">{safeData.gender || 'Not specified'}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Weight:</span>
            <span className="text-gray-900">{safeData.weight || 'Not specified'}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Height:</span>
            <span className="text-gray-900">{safeData.height || 'Not specified'}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Body Type:</span>
            <span className="text-gray-900">{safeData.bodyType || 'Not specified'}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Exercise Frequency:</span>
            <span className="text-gray-900">{safeData.exerciseFrequency || 'Not specified'}</span>
          </div>
        </div>
        
        <div className="space-y-3">
          <div>
            <span className="font-medium text-gray-700">Exercise Types:</span>
            <div className="text-gray-900 text-sm mt-1">{(safeData.exerciseTypes || []).join(', ') || 'None'}</div>
          </div>
          <div>
            <span className="font-medium text-gray-700">Health Goals:</span>
            <div className="text-gray-900 text-sm mt-1">{(safeData.goals || []).join(', ') || 'None'}</div>
          </div>
          <div>
            <span className="font-medium text-gray-700">Supplements:</span>
            <div className="text-gray-900 text-sm mt-1">{formatSupplements()}</div>
          </div>
          <div>
            <span className="font-medium text-gray-700">Medications:</span>
            <div className="text-gray-900 text-sm mt-1">{formatMedications()}</div>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">AI Insights:</span>
            <span className="text-gray-900">{safeData.wantInsights === 'yes' ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-3">
        <button 
          className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium" 
          onClick={handleConfirm}
        >
          Confirm &amp; Begin
        </button>
        <button 
          className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium" 
          onClick={() => window.location.href = '/dashboard'}
          style={{ display: 'none' }}
          id="continue-to-dashboard-btn"
        >
          Continue to Dashboard
        </button>
        <button className="w-full border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors font-medium" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const stepNames = ['Gender', 'Physical', 'Exercise', 'Health Goals', 'Health Situations', 'Supplements', 'Medications', 'Blood Results', 'AI Insights', 'Review'];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});

  // Reset current step data
  const resetCurrentStep = () => {
    const stepKeys = {
      0: ['gender'],
      1: ['weight', 'height', 'feet', 'inches', 'bodyType', 'unit'],
      2: ['exerciseFrequency', 'exerciseTypes'],
      3: ['goals', 'healthGoals'],
      4: ['healthIssues', 'healthProblems'],
      5: ['supplements'],
      6: ['medications'],
      7: ['bloodResults'],
      8: ['aiInsights'],
      9: []
    };

    const keysToReset = stepKeys[step as keyof typeof stepKeys] || [];
    
    setForm((prev: any) => {
      const newForm = { ...prev };
      keysToReset.forEach(key => {
        delete newForm[key];
      });
      return newForm;
    });
  };

  // Load existing data from server
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('🔵 Loading user data from server...');
        const response = await fetch('/api/user-data');
        
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            console.log('✅ Loading existing data from server:', result.data);
            setForm(result.data);
            console.log('Form state after loading:', result.data);
          } else {
            console.log('No existing data found on server');
          }
        } else {
          console.warn('Failed to load data from server:', response.status);
        }
      } catch (error) {
        console.error('Error loading data from server:', error);
      }
    };

    loadData();
  }, []);

  // Debug form state changes
  useEffect(() => {
    console.log('Form state updated:', form);
    console.log('Current step:', step);
    console.log('Gender value for step 0:', form.gender);
  }, [form, step]);

  // Scroll to top when step changes
  useEffect(() => {
    // Multiple scroll methods to ensure it works
    const scrollToTop = () => {
      // Method 1: Scroll the window
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      
      // Method 2: Scroll the container
      const container = document.getElementById('onboarding-container');
      if (container) {
        container.scrollTop = 0;
      }
      
      // Method 3: Scroll to the progress bar
      const progressBar = document.querySelector('.sticky');
      if (progressBar) {
        progressBar.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    };
    
    // Immediate scroll
    scrollToTop();
    
    // Backup scroll after a delay
    const timer = setTimeout(scrollToTop, 50);
    
    return () => clearTimeout(timer);
  }, [step]);

  const handleNext = (data: any) => {
    try {
      console.log('handleNext called with data:', data);
      console.log('Current step:', step);
      console.log('Current form:', form);
      
      // Ensure data is valid
      const safeData = data || {};
      
      setForm((prev: any) => {
        const newForm = { ...prev, ...safeData };
        console.log('Updated form:', newForm);
        return newForm;
      });
      
      setStep((prev) => {
        const newStep = Math.min(stepNames.length - 1, prev + 1);
        console.log('Moving to step:', newStep);
        
        // Step saved to server automatically
        
        // Force immediate scroll
        requestAnimationFrame(() => {
          try {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            const container = document.getElementById('onboarding-container');
            if (container) container.scrollTop = 0;
          } catch (scrollError) {
            console.error('Scroll error:', scrollError);
          }
        });
        return newStep;
      });
    } catch (error) {
      console.error('Error in handleNext:', error);
      // Show user-friendly error message
      alert('There was an issue processing your data. Please try again or contact support if the problem persists.');
    }
  };

  const handleBack = () => {
    setStep((prev) => {
      const newStep = Math.max(0, prev - 1);
      
      // Step saved to server automatically
      
      // Force immediate scroll
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const container = document.getElementById('onboarding-container');
        if (container) container.scrollTop = 0;
      });
      return newStep;
    });
  };

  const jumpToStep = (targetStep: number) => {
    if (targetStep >= 0 && targetStep < stepNames.length) {
      setStep(targetStep);
      // Step saved to server automatically
      
      // Force immediate scroll
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const container = document.getElementById('onboarding-container');
        if (container) container.scrollTop = 0;
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 overflow-y-auto" id="onboarding-container">
      <FloatingSkipSection step={step} stepNames={stepNames} form={form} onNext={handleNext} />
      <div className="min-h-full flex flex-col pb-20 sm:pb-0">
        {/* Progress bar back at top */}
        <div className="fixed-header safe-area-top px-3 sm:px-4 py-4">
          {/* Header */}
          <div className="flex items-center justify-center mb-4 relative">
            {/* Back to Dashboard Button */}
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="absolute left-0 bg-white border border-gray-300 rounded-full p-2 shadow-lg hover:shadow-xl transition-all hover:bg-gray-50"
              title="Back to Dashboard"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
              {Object.keys(form).length > 0 ? 'Edit Health Info' : 'Setup Profile'}
            </h1>
            {/* Reset Circle Icon */}
            <button
              onClick={resetCurrentStep}
              className="absolute right-0 bg-white border border-gray-300 rounded-full p-2 shadow-lg hover:shadow-xl transition-all hover:bg-red-50 hover:border-red-300"
              title="Reset current step"
            >
              <svg className="w-5 h-5 text-gray-600 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          
          {/* Mobile: Compact step dots with navigation arrows */}
          <div className="block sm:hidden mb-4">
            <div className="flex items-center justify-center space-x-3">
              {/* Left Arrow */}
              <button
                onClick={() => handleBack()}
                disabled={step === 0}
                className={`p-2 rounded-full transition-colors ${
                  step === 0 
                    ? 'text-gray-300 cursor-not-allowed' 
                    : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
                }`}
                title="Previous step"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              {/* Step Dots */}
              <div className="flex items-center space-x-2">
                {stepNames.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => jumpToStep(index)}
                    className={`w-3 h-3 rounded-full transition-all ${
                      index === step 
                        ? 'bg-green-600 scale-125' 
                        : index < step 
                          ? 'bg-green-300' 
                          : 'bg-gray-300'
                    }`}
                    title={`Step ${index + 1}: ${stepNames[index]}`}
                  />
                ))}
              </div>
              
              {/* Right Arrow */}
              <button
                onClick={() => {
                  if (step < stepNames.length - 1) {
                    jumpToStep(step + 1);
                  }
                }}
                disabled={step === stepNames.length - 1}
                className={`p-2 rounded-full transition-colors ${
                  step === stepNames.length - 1 
                    ? 'text-gray-300 cursor-not-allowed' 
                    : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
                }`}
                title="Next step"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="text-center mt-4">
              <span className="text-base text-gray-700 font-semibold">{stepNames[step]}</span>
              <div className="text-sm text-gray-500 mt-1">Step {step + 1} of {stepNames.length}</div>
            </div>
          </div>
          
          {/* Desktop: Modern step indicators */}
          <div className="hidden sm:block mb-4">
            <div className="flex items-center justify-between">
              {stepNames.map((stepName, index) => (
                <div key={index} className="flex items-center flex-1">
                  <button
                    onClick={() => jumpToStep(index)}
                    className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-200 ${
                      index === step 
                        ? 'bg-green-600 border-green-600 text-white shadow-lg scale-110' 
                        : index < step 
                          ? 'bg-green-600 border-green-600 text-white hover:scale-105' 
                          : 'bg-white border-gray-300 text-gray-400 hover:border-gray-400'
                    }`}
                    title={`${index < step ? 'Completed: ' : index === step ? 'Current: ' : 'Upcoming: '}${stepName}`}
                  >
                    {index < step ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-sm font-semibold">{index + 1}</span>
                    )}
                  </button>
                  {index < stepNames.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 transition-colors duration-200 ${
                      index < step ? 'bg-green-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="text-center mt-3">
              <span className="text-sm font-medium text-gray-700">{stepNames[step]}</span>
              <div className="text-xs text-gray-500 mt-1">Step {step + 1} of {stepNames.length}</div>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 cursor-pointer shadow-inner" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = clickX / rect.width;
            const targetStep = Math.floor(percentage * stepNames.length);
            jumpToStep(targetStep);
          }}>
            <div 
              className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-500 ease-out shadow-sm"
              style={{ width: `${((step + 1) / stepNames.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-6 pt-12 sm:pt-8">
          {step === 0 && <GenderStep onNext={handleNext} initial={form.gender} />}
          {step === 1 && <PhysicalStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 2 && <ExerciseStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 3 && <HealthGoalsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 4 && <HealthSituationsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 5 && <SupplementsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 6 && <MedicationsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 7 && <BloodResultsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 8 && <AIInsightsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 9 && <ReviewStep onBack={handleBack} data={form} />}
        </div>

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  );
}