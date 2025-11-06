'use client'
/**
 * WARNING FOR FUTURE EDITS
 * This page expects AI responses to include ONE nutrition line exactly like:
 *   Calories: N, Protein: Ng, Carbs: Ng, Fat: Ng
 * The API enforces this and also has a fallback extractor.
 * If you change regexes or presentation, TEST that all four values still render.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import MobileMoreMenu from '@/components/MobileMoreMenu'

export default function FoodDiary() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const { userData, profileImage, updateUserData } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [todaysFoods, setTodaysFoods] = useState<any[]>([])
  const [newFoodText, setNewFoodText] = useState('')
  const [showAddFood, setShowAddFood] = useState(false)
  const [showPhotoOptions, setShowPhotoOptions] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [aiDescription, setAiDescription] = useState('')
  const [showAiResult, setShowAiResult] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editedDescription, setEditedDescription] = useState('')
  const [analyzedNutrition, setAnalyzedNutrition] = useState<any>(null)
  
  // Manual food entry states
  const [manualFoodName, setManualFoodName] = useState('')
  const [manualFoodType, setManualFoodType] = useState('single')
  const [manualIngredients, setManualIngredients] = useState([{ name: '', weight: '', unit: 'g' }])
  const [showEntryOptions, setShowEntryOptions] = useState<string | null>(null)
  const [showIngredientOptions, setShowIngredientOptions] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [hasReAnalyzed, setHasReAnalyzed] = useState<boolean>(false)

  const [foodImagesLoading, setFoodImagesLoading] = useState<{[key: string]: boolean}>({})
  const [expandedEntries, setExpandedEntries] = useState<{[key: string]: boolean}>({})
  const [fullSizeImage, setFullSizeImage] = useState<string | null>(null)
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })
  const [historyFoods, setHistoryFoods] = useState<any[] | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)

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

  // Today's date
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const isViewingToday = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return selectedDate === `${y}-${m}-${day}`;
  })();

  // Friendly label for selected date (local time)
  const selectedFriendly = (() => {
    const [y, m, d] = selectedDate.split('-').map((v) => parseInt(v, 10));
    const local = new Date(y, (m || 1) - 1, d || 1);
    return local.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  })();

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      
      // Check if the click is inside any dropdown
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false);
      }
      if (!target.closest('.food-options-dropdown') && !target.closest('.add-food-entry-container')) {
        setShowPhotoOptions(false);
      }
      if (!target.closest('.entry-options-dropdown')) {
        setShowEntryOptions(null);
      }
      if (!target.closest('.ingredient-options-dropdown')) {
        setShowIngredientOptions(null);
      }
    }
    if (dropdownOpen || showPhotoOptions || showEntryOptions || showIngredientOptions) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen, showPhotoOptions, showEntryOptions, showIngredientOptions]);



  // Load today's foods from context data (no API calls needed!)
  useEffect(() => {
    if (isViewingToday && userData?.todaysFoods) {
      console.log('🚀 PERFORMANCE: Using cached foods from context - instant load!');
      // Filter to only entries created on the selected (today) date using the entry timestamp id
      const onlySelectedDate = userData.todaysFoods.filter((item: any) => {
        try {
          const d = new Date(typeof item.id === 'number' ? item.id : Number(item.id));
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const itemDate = `${y}-${m}-${day}`;
          return itemDate === selectedDate;
        } catch {
          return false;
        }
      });
      setTodaysFoods(onlySelectedDate);
    }
  }, [userData, isViewingToday, selectedDate]);

  // Load history for non-today dates
  useEffect(() => {
    const loadHistory = async () => {
      if (isViewingToday) {
        setHistoryFoods(null);
        return;
      }
      try {
        setIsLoadingHistory(true);
        const tz = new Date().getTimezoneOffset();
        const res = await fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`);
        if (res.ok) {
          const json = await res.json();
          const logs = Array.isArray(json.logs) ? json.logs : [];
          const mapped = logs.map((l: any) => ({
            id: new Date(l.createdAt).getTime(),
            description: l.description || l.name,
            time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            method: l.imageUrl ? 'photo' : 'text',
            photo: l.imageUrl || null,
            nutrition: l.nutrients || null,
          }));
          setHistoryFoods(mapped);
        } else {
          setHistoryFoods([]);
        }
      } catch (e) {
        setHistoryFoods([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    loadHistory();
  }, [selectedDate, isViewingToday]);

  // Save food entries to database and update context (OPTIMIZED)
  const saveFoodEntries = async (updatedFoods: any[]) => {
    try {
      // Update context immediately for instant UI updates
      updateUserData({ todaysFoods: updatedFoods });
      console.log('🚀 PERFORMANCE: Food updated in cache instantly - UI responsive!');
      
      // Background save to database (don't wait for response)
      fetch('/api/user-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          todaysFoods: updatedFoods
        }),
      }).then(response => {
        if (!response.ok) {
          console.error('Background save failed - but UI already updated');
        } else {
          console.log('🚀 PERFORMANCE: Food saved to database in background');
        }
      }).catch(error => {
        console.error('Background save error:', error);
      });
      // Show a brief visual confirmation
      try {
        setShowSavedToast(true);
        setTimeout(() => setShowSavedToast(false), 1500);
      } catch {}
      // Fire-and-forget history append
      try {
        const last = updatedFoods[0];
        if (last) {
          fetch('/api/food-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: last.description, nutrition: last.nutrition, imageUrl: last.photo || null })
          }).catch(() => {});
        }
      } catch {}
    } catch (error) {
      console.error('Error in saveFoodEntries:', error);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Compress the uploaded file to reduce API costs
        const compressedFile = await compressImage(file, 800, 0.8);
        setPhotoFile(compressedFile);
        const reader = new FileReader();
        reader.onload = (e) => setPhotoPreview(e.target?.result as string);
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error('Error compressing image:', error);
        // Fallback to original file if compression fails
        setPhotoFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setPhotoPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      }
    }
  };



  // OPTIMIZED: Ultra-aggressive compression for speed
  const compressImage = (file: File, maxWidth: number = 300, quality: number = 0.5): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = document.createElement('img');
      
      if (!ctx) {
        reject(new Error('Cannot get canvas context'));
        return;
      }
      
      img.onload = () => {
        // Calculate new dimensions - smaller for faster loading
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        const newWidth = img.width * ratio;
        const newHeight = img.height * ratio;
        
        // Set canvas size
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            console.log(`Image compressed: ${file.size} → ${blob.size} bytes (${Math.round((1 - blob.size/file.size) * 100)}% reduction)`);
            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        }, 'image/jpeg', quality);
        
        // Clean up
        URL.revokeObjectURL(img.src);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Extract nutrition data from AI response
  const extractNutritionData = (description: string) => {
    // Try to parse common nutrition patterns from AI response
    const caloriesMatch = description.match(/calories?[:\s]*(\d+)/i);
    const proteinMatch = description.match(/protein[:\s]*(\d+(?:\.\d+)?)\s*g/i);
    const carbsMatch = description.match(/carb(?:ohydrate)?s?[:\s]*(\d+(?:\.\d+)?)\s*g/i);
    const fatMatch = description.match(/fat[:\s]*(\d+(?:\.\d+)?)\s*g/i);
    const fiberMatch = description.match(/fiber[:\s]*(\d+(?:\.\d+)?)\s*g/i);
    const sugarMatch = description.match(/sugar[:\s]*(\d+(?:\.\d+)?)\s*g/i);

    return {
      calories: caloriesMatch ? parseInt(caloriesMatch[1]) : null,
      protein: proteinMatch ? parseFloat(proteinMatch[1]) : null,
      carbs: carbsMatch ? parseFloat(carbsMatch[1]) : null,
      fat: fatMatch ? parseFloat(fatMatch[1]) : null,
      fiber: fiberMatch ? parseFloat(fiberMatch[1]) : null,
      sugar: sugarMatch ? parseFloat(sugarMatch[1]) : null,
    };
  };

  const analyzePhoto = async () => {
    if (!photoFile) return;
    
    setIsAnalyzing(true);
    
    try {
      console.log('🔍 AGENT #6 DEBUG: Starting photo analysis...');
      console.log('📊 Original file:', { 
        name: photoFile.name, 
        size: photoFile.size, 
        type: photoFile.type 
      });
      
      // Step 1: Compress image (with better error handling)
      let compressedFile;
      try {
        compressedFile = await compressImage(photoFile, 800, 0.8); // Less aggressive compression
        console.log('✅ Image compression successful:', {
          originalSize: photoFile.size,
          compressedSize: compressedFile.size,
          reduction: Math.round((1 - compressedFile.size/photoFile.size) * 100) + '%'
        });
      } catch (compressionError) {
        console.warn('⚠️ Image compression failed, using original:', compressionError);
        compressedFile = photoFile; // Fallback to original file
      }
      
      // Step 2: Create FormData
      console.log('📤 Creating FormData for upload...');
      const formData = new FormData();
      formData.append('image', compressedFile);
      console.log('✅ FormData created successfully');

      // Step 3: API call with detailed logging
      console.log('🌐 Calling API endpoint...');
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        body: formData,
      });

      console.log('📥 API Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          console.error('❌ API Error Details:', errorData);
        } catch (parseError) {
          console.error('❌ Could not parse error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      // Step 4: Parse response
      const result = await response.json();
      console.log('📋 API Response Data:', {
        success: result.success,
        hasAnalysis: !!result.analysis,
        analysisPreview: result.analysis?.substring(0, 100) + '...'
      });
      
      if (result.success && result.analysis) {
        console.log('🎉 SUCCESS: Real AI analysis received!');
        setAiDescription(result.analysis);
        setAnalyzedNutrition(extractNutritionData(result.analysis));
        setShowAiResult(true);
      } else {
        console.error('❌ Invalid API response format:', result);
        throw new Error('Invalid response format from AI service');
      }
    } catch (error) {
      console.error('💥 PHOTO ANALYSIS FAILED:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('🔍 Error details:', {
        message: errorMessage,
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack?.substring(0, 200) : 'No stack trace'
      });
      
      // More specific error messages based on error type
      let fallbackMessage = `🤖 Photo analysis failed: ${errorMessage}`;
      
      if (errorMessage.includes('fetch')) {
        fallbackMessage = `🌐 Network error occurred while analyzing photo. Please check your connection and try again.`;
      } else if (errorMessage.includes('HTTP 401')) {
        fallbackMessage = `🔑 Authentication error. The AI service is temporarily unavailable.`;
      } else if (errorMessage.includes('HTTP 429')) {
        fallbackMessage = `⏰ AI service is busy. Please wait a moment and try again.`;
      } else if (errorMessage.includes('HTTP 5')) {
        fallbackMessage = `🛠️ Server error occurred. Please try again in a moment.`;
      }
      
      setAiDescription(fallbackMessage + `
      
Meanwhile, you can describe your food manually:
- What foods do you see?
- How was it prepared?
- Approximate portion size`);
      setAnalyzedNutrition(null);
      setShowAiResult(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeManualFood = async () => {
    // Validation for single food
    if (manualFoodType === 'single' && (!manualFoodName.trim() || !manualIngredients[0]?.weight?.trim())) return;
    
    // Validation for multiple ingredients
    if (manualFoodType === 'multiple' && manualIngredients.every(ing => !ing.name.trim() || !ing.weight.trim())) return;
    
    setIsAnalyzing(true);
    
    try {
      console.log('🚀 PERFORMANCE: Starting fast text-based food analysis...');
      
      let foodDescription = '';
      
      if (manualFoodType === 'single') {
        const weight = manualIngredients[0]?.weight || '';
        const unit = manualIngredients[0]?.unit || 'g';
        foodDescription = `${manualFoodName}, ${weight} ${unit}`;
      } else {
        // Build description from multiple ingredients
        const validIngredients = manualIngredients.filter(ing => ing.name.trim() && ing.weight.trim());
        foodDescription = validIngredients.map(ing => `${ing.name}, ${ing.weight} ${ing.unit}`).join('; ');
      }
      
      console.log('🚀 PERFORMANCE: Analyzing text (faster than photo analysis)...');
      
      // Call OpenAI to analyze the manual food entry
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textDescription: foodDescription,
          foodType: manualFoodType
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze food');
      }

      const result = await response.json();
      
      if (result.analysis) {
        setAiDescription(result.analysis);
        setAnalyzedNutrition(extractNutritionData(result.analysis));
        setShowAiResult(true);
        
        // Clear manual form
        setManualFoodName('');
        setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
        setManualFoodType('single');
      } else {
        throw new Error('Invalid response from AI service');
      }
    } catch (error) {
      console.error('Error analyzing manual food:', error);
      
      // Fallback message
      setAiDescription(`🤖 AI analysis temporarily unavailable. 
      
${manualFoodType === 'single' ? manualFoodName : 'Multiple ingredients'}
Please add nutritional information manually if needed.`);
      setAnalyzedNutrition(null);
      setShowAiResult(true);
      
      // Clear manual form on fallback too
      setManualFoodName('');
      setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
      setManualFoodType('single');
    } finally {
      setIsAnalyzing(false);
    }
  };



  const addFoodEntry = async (description: string, method: 'text' | 'photo', nutrition?: any) => {
    // Prevent duplicate entries - check if this exact entry already exists
    const existingEntry = todaysFoods.find(food => 
      food.description === description && 
      food.method === method && 
      Math.abs(new Date().getTime() - food.id) < 5000 // Within 5 seconds
    );
    
    if (existingEntry) {
      console.log('Duplicate entry prevented');
      return;
    }

    const newEntry = {
      id: Date.now(),
      description,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      method,
      photo: method === 'photo' ? photoPreview : null,
      nutrition: nutrition || analyzedNutrition
    };
    
    const updatedFoods = [newEntry, ...todaysFoods];
    setTodaysFoods(updatedFoods);
    
    // Save to database
    await saveFoodEntries(updatedFoods);
    
    // Reset all form states
    setNewFoodText('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setAiDescription('');
    setShowAiResult(false);
    setIsEditingDescription(false);
    setEditedDescription('');
    setShowAddFood(false);
    setShowPhotoOptions(false);
    setAnalyzedNutrition(null);
    setEditingEntry(null);
  };

  // New function to update existing entries with AI re-analysis
  const updateFoodEntry = async (description: string, method: 'text' | 'photo') => {
    if (!editingEntry) return;

    // Re-analyze with AI for updated nutrition info
    setIsAnalyzing(true);
    let updatedNutrition = null;
    let fullAnalysis = null;

    try {
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textDescription: description,
          foodType: 'single',
          isReanalysis: true
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('API Response:', result); // Debug log
        if (result.success && result.analysis) {
          updatedNutrition = extractNutritionData(result.analysis);
          fullAnalysis = result.analysis;
          console.log('Extracted Nutrition:', updatedNutrition); // Debug log
          
          // Update the UI states with new nutrition but keep clean description
          setAiDescription(result.analysis); // Full AI response for processing
          setAnalyzedNutrition(updatedNutrition);
        }
      } else {
        console.error('API Error:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error re-analyzing food:', error);
      // Keep original nutrition if re-analysis fails
      updatedNutrition = editingEntry.nutrition;
    } finally {
      setIsAnalyzing(false);
    }

    // Update the existing entry with AI analysis for nutrition display
    const updatedEntry = {
      ...editingEntry,
      description: fullAnalysis || description, // Save full AI analysis with nutrition data
      photo: method === 'photo' ? photoPreview : editingEntry.photo,
      nutrition: updatedNutrition || editingEntry.nutrition
    };

    const updatedFoods = todaysFoods.map(food => 
      food.id === editingEntry.id ? updatedEntry : food
    );
    
    setTodaysFoods(updatedFoods);
    
    // Save to database
    await saveFoodEntries(updatedFoods);
    
    // Reset all form states
    setNewFoodText('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setAiDescription('');
    setShowAiResult(false);
    setIsEditingDescription(false);
    setEditedDescription('');
    setShowAddFood(false);
    setShowPhotoOptions(false);
    setAnalyzedNutrition(null);
    setEditingEntry(null);
  };

  const editFood = (food: any) => {
    setEditingEntry(food);
    setHasReAnalyzed(false); // Reset button state for new editing session
    // Populate the form with existing data and go directly to editing
    if (food.method === 'photo') {
      setPhotoPreview(food.photo);
      setAiDescription(food.description);
      setAnalyzedNutrition(food.nutrition);
      setShowAiResult(true);
      setShowAddFood(true);
      // Go directly to editing mode and extract clean food name only
      setIsEditingDescription(true);
      // Extract just the food name from the description (remove nutrition info)
      const cleanDescription = food.description.split('\n')[0].split('Calories:')[0].trim();
      setEditedDescription(cleanDescription);
    } else {
      // For manual entries, populate the manual form
      setManualFoodName(food.description);
      setManualFoodType('single');
      setShowAddFood(true);
    }
    setShowEntryOptions(null);
  };



  const deleteFood = async (foodId: number) => {
    const updatedFoods = todaysFoods.filter(food => food.id !== foodId);
    setTodaysFoods(updatedFoods);
    await saveFoodEntries(updatedFoods);
    setShowEntryOptions(null);
  };

  const addIngredient = () => {
    setManualIngredients([...manualIngredients, { name: '', weight: '', unit: 'g' }]);
  };

  const removeIngredient = (index: number) => {
    if (manualIngredients.length > 1) {
      setManualIngredients(manualIngredients.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, field: string, value: string) => {
    const updated = [...manualIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setManualIngredients(updated);
  };

  const cancelManualEntry = () => {
    setShowAddFood(false);
    setManualFoodName('');
    setManualFoodType('single');
    setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
    setEditingEntry(null);
  };

  // Toggle expanded state for food entries
  const toggleExpanded = (foodId: string) => {
    setExpandedEntries(prev => ({
      ...prev,
      [foodId]: !prev[foodId]
    }));
  };

  // Format time with AM/PM
  const formatTimeWithAMPM = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour24 = parseInt(hours);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Debug logging to track state changes
  React.useEffect(() => {
    console.log('🔍 State Debug:', {
      showAddFood,
      showAiResult,
      isEditingDescription,
      editingEntry: editingEntry ? 'exists' : 'null',
      todaysFoodsCount: todaysFoods.length
    });
  }, [showAddFood, showAiResult, isEditingDescription, editingEntry, todaysFoods.length]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Saved Toast (brief confirmation) */}
      {showSavedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000]">
          <div className="px-4 py-2 bg-emerald-600 text-white rounded-full shadow-lg text-sm">
            Saved
          </div>
        </div>
      )}
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={80}
                height={80}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
          </div>
          
          <div className="relative dropdown-container">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="focus:outline-none relative"
            >
              <Image
                src={userImage}
                alt="Profile"
                width={48}
                height={48}
                className="w-12 h-12 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                priority
              />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100">
                <div className="flex items-center px-4 py-3 border-b border-gray-100">
                  <div className="relative mr-3">
                    <Image 
                      src={userImage} 
                      alt="Profile" 
                      width={40} 
                      height={40} 
                      className="w-10 h-10 rounded-full object-cover" 
                      loading="eager"
                    />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{userName}</div>
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
                <button onClick={() => signOut({ callbackUrl: '/auth/signin' })} className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold">Logout</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Page Title */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-xl md:text-2xl font-light text-gray-800 tracking-wide">Food Diary</h1>
          {/* Date selector */}
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setSelectedDate(`${y}-${m}-${day}`);
              }}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
            >
              ◀︎ Previous
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1"
            />
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setSelectedDate(`${y}-${m}-${day}`);
              }}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
            >
              Next ▶︎
            </button>
            {/* Removed Today button to avoid mixed date cues */}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-8">
        
        {/* Instruction Text - Hidden during edit mode */}
        {!isEditingDescription && (
        <div className="mb-6 text-center">
          <p className="text-lg text-gray-600 font-normal">
            📸 Take a photo of your meal or snack and let AI analyze it!
          </p>
        </div>
        )}

        {/* Add Food Button - Hidden during edit mode */}
        {!isEditingDescription && (
        <div className="mb-6 relative add-food-entry-container">
          <button
            onClick={() => setShowPhotoOptions(!showPhotoOptions)}
            className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium flex items-center justify-center shadow-lg"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Food Entry
            <svg className={`w-4 h-4 ml-2 transition-transform ${showPhotoOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Simplified Dropdown Options */}
          {showPhotoOptions && (
            <div className="food-options-dropdown absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
              {/* Take Photo Option - Native Mobile Experience */}
              <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">📱 Select Photo</h3>
                  <p className="text-sm text-gray-500">Camera, Photo Library, or Choose File</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    handlePhotoUpload(e);
                    setShowPhotoOptions(false);
                    setShowAddFood(true); // 🔥 FIX: Show photo processing UI
                  }}
                  className="hidden"
                />
              </label>

              {/* Manual Entry Option */}
              <button
                onClick={() => {
                  setShowPhotoOptions(false);
                  setShowAddFood(true);
                }}
                className="flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors w-full text-left"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">✍️ Manual Entry</h3>
                  <p className="text-sm text-gray-500">Type your food description</p>
                </div>
              </button>
            </div>
          )}
        </div>
        )}

                {/* Food Processing Area */}
        {showAddFood && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            
            {/* Photo Analysis Flow */}
            {photoPreview && !showAiResult && !isEditingDescription && (
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">📸 Your Photo</h3>
                <Image
                  src={photoPreview}
                  alt="Food preview"
                  width={300}
                  height={300}
                  className="w-full max-w-sm aspect-square object-cover rounded-lg mx-auto shadow-lg mb-6"
                />
                <div className="space-y-3">
                  <button
                    onClick={analyzePhoto}
                    disabled={isAnalyzing}
                    className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-semibold"
                  >
                    {isAnalyzing ? (
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        AI is analyzing your food...
                      </div>
                    ) : (
                      '🤖 Analyze with AI'
                    )}
                  </button>
                  
                  {/* Photo Management Options */}
                  <div className="flex gap-3">
                    <label className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-center cursor-pointer text-sm font-medium">
                      📷 Change Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          handlePhotoUpload(e);
                          setShowAddFood(true); // 🔥 FIX: Ensure photo processing UI stays visible
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        setShowAddFood(false);
                      }}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      🗑️ Delete Photo
                    </button>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    💡 <strong>Tip:</strong> Our AI will identify the food and provide nutritional information!
                  </p>
                </div>
              </div>
            )}

            {/* AI Analysis Result - Premium Cronometer-style UI */}
            {showAiResult && !isEditingDescription && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                {/* Photo Section */}
                {photoPreview && (
                  <div className="p-4 border-b border-gray-100 flex justify-center">
                    <div className="relative w-full">
                      {foodImagesLoading[photoPreview] && (
                        <div className="absolute inset-0 bg-gray-100 rounded-xl flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                        </div>
                      )}
                      <Image
                        src={photoPreview}
                        alt="Analyzed food"
                        width={300}
                        height={200}
                        className={`w-full aspect-[4/3] object-cover rounded-xl transition-opacity duration-300 ${
                          foodImagesLoading[photoPreview] ? 'opacity-0' : 'opacity-100'
                        }`}
                        loading="eager"
                        priority
                        onLoad={() => setFoodImagesLoading((prev: Record<string, boolean>) => ({ ...prev, [photoPreview]: false }))}
                        onLoadStart={() => setFoodImagesLoading((prev: Record<string, boolean>) => ({ ...prev, [photoPreview]: true }))}
                      />
                    </div>
                  </div>
                )}
                
                {/* Premium Nutrition Display */}
                <div className="p-4 sm:p-6">
                  {/* Food Title */}
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Food Analysis</h3>
                  </div>

                  {/* Nutrition Cards - Cronometer Style */}
                  {analyzedNutrition && (analyzedNutrition.calories !== null || analyzedNutrition.protein !== null || analyzedNutrition.carbs !== null || analyzedNutrition.fat !== null) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                      {/* Calories */}
                      {analyzedNutrition.calories !== null && analyzedNutrition.calories !== undefined && (
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-3 sm:p-4 border border-orange-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-orange-600">{analyzedNutrition.calories}</div>
                            <div className="text-xs font-medium text-orange-500 uppercase tracking-wide">Calories</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Protein */}
                      {analyzedNutrition.protein !== null && analyzedNutrition.protein !== undefined && (
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 sm:p-4 border border-blue-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-blue-600">{analyzedNutrition.protein}g</div>
                            <div className="text-xs font-medium text-blue-500 uppercase tracking-wide">Protein</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Carbs */}
                      {analyzedNutrition.carbs !== null && analyzedNutrition.carbs !== undefined && (
                        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 sm:p-4 border border-green-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-green-600">{analyzedNutrition.carbs}g</div>
                            <div className="text-xs font-medium text-green-500 uppercase tracking-wide">Carbs</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Fat */}
                      {analyzedNutrition.fat !== null && analyzedNutrition.fat !== undefined && (
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3 sm:p-4 border border-purple-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-purple-600">{analyzedNutrition.fat}g</div>
                            <div className="text-xs font-medium text-purple-500 uppercase tracking-wide">Fat</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional Nutrition Info */}
                  {analyzedNutrition && (analyzedNutrition.fiber !== null || analyzedNutrition.sugar !== null) && (
                    <div className="flex gap-4 mb-6">
                      {analyzedNutrition.fiber !== null && analyzedNutrition.fiber !== undefined && (
                        <div className="flex-1 bg-amber-50 rounded-lg p-3 border border-amber-200">
                          <div className="text-center">
                            <div className="text-lg font-semibold text-amber-600">{analyzedNutrition.fiber}g</div>
                            <div className="text-xs text-amber-500 uppercase">Fiber</div>
                          </div>
                        </div>
                      )}
                      {analyzedNutrition.sugar !== null && analyzedNutrition.sugar !== undefined && (
                        <div className="flex-1 bg-pink-50 rounded-lg p-3 border border-pink-200">
                          <div className="text-center">
                            <div className="text-lg font-semibold text-pink-600">{analyzedNutrition.sugar}g</div>
                            <div className="text-xs text-pink-500 uppercase">Sugar</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Food Detection Only */}
                  <div className="mb-6">
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm font-medium text-gray-600 mb-2">Detected Foods:</div>
                      <div className="text-gray-900 text-sm leading-relaxed">
                        {(() => {
                          const cleanDescription = aiDescription.split('\n').filter(line => 
                            !line.toLowerCase().includes('calorie') && 
                            !line.toLowerCase().includes('protein') && 
                            !line.toLowerCase().includes('carb') && 
                            !line.toLowerCase().includes('fat') && 
                            !line.toLowerCase().includes('fiber') && 
                            !line.toLowerCase().includes('sugar') &&
                            !line.toLowerCase().includes('nutritional') &&
                            !line.toLowerCase().includes('nutrition') &&
                            !line.toLowerCase().includes('unable to see') &&
                            !line.toLowerCase().includes('cannot provide') &&
                            !line.toLowerCase().includes('general estimate') &&
                            !line.toLowerCase().includes('approximate') &&
                            !line.toLowerCase().includes('typical serving') &&
                            line.trim().length > 0
                          ).join(' ').replace(/^(This image shows|I can see|The food appears to be|This appears to be|I'm unable to see|Based on the image)/i, '').trim() || 
                          aiDescription.split('.')[0].replace(/^(I'm unable to see.*?but I can provide a general estimate for|Based on.*?,)/i, '').trim() || 
                          aiDescription.split(',')[0] || aiDescription;
                          
                          // Capitalize first letter
                          return cleanDescription.replace(/^./, (match: string) => match.toUpperCase());
                        })()}
                      </div>
                    </div>
                    {aiDescription && /(Insufficient credits|trial limit)/i.test(aiDescription) && (
                      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex flex-col gap-3">
                          <div>
                            <div className="font-semibold text-amber-800">You're out of free analyses</div>
                            <div className="text-sm text-amber-700">Upgrade to Premium to unlock 30 photo analyses/day, medical image analysis, supplements and prescription drugs interaction checks.</div>
                          </div>
                          <Link href="/billing" className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium w-full sm:w-auto">Upgrade to Premium</Link>
                        </div>
                      </div>
                    )}
                    {aiDescription && /(Failed to analyze|describe your food manually)/i.test(aiDescription) && (
                      <div className="mt-2 text-xs text-gray-600">Calorie modals are not available on the free plan when you manually input the information.</div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={() => editingEntry ? updateFoodEntry(aiDescription, 'photo') : addFoodEntry(aiDescription, 'photo')}
                      disabled={isAnalyzing}
                      className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center shadow-lg"
                    >
                      {isAnalyzing ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Re-analyzing...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {editingEntry ? 'Update & Save' : 'Save to Food Diary'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingDescription(true);
                        setEditedDescription(aiDescription);
                      }}
                      className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Description
                    </button>
                    <button
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        setAiDescription('');
                        setShowAiResult(false);
                        setIsEditingDescription(false);
                        setEditedDescription('');
                      }}
                      className="w-full py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Photo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Clean Edit Interface - Improved UX Design */}
            {isEditingDescription && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 sm:p-6 space-y-6">
                  {/* Simple Food Title Only */}
                  <div className="border-b border-gray-100 pb-4">
                    <h1 className="text-xl sm:text-2xl font-medium text-gray-900">
                      {(() => {
                        const title = editedDescription.split('\n')[0].split('Calories:')[0].trim().split(',')[0].split('.')[0] || 'Food Item';
                        return title.replace(/^./, (match: string) => match.toUpperCase());
                      })()}
                    </h1>
                  </div>

                  {/* Nutrition Cards - Match Main Page Style */}
                  {analyzedNutrition && (analyzedNutrition.calories !== null || analyzedNutrition.protein !== null || analyzedNutrition.carbs !== null || analyzedNutrition.fat !== null) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      {/* Calories */}
                      {analyzedNutrition.calories !== null && analyzedNutrition.calories !== undefined && (
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-3 sm:p-4 border border-orange-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-orange-600">{analyzedNutrition.calories}</div>
                            <div className="text-xs font-medium text-orange-500 uppercase tracking-wide">Calories</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Protein */}
                      {analyzedNutrition.protein !== null && analyzedNutrition.protein !== undefined && (
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 sm:p-4 border border-blue-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-blue-600">{analyzedNutrition.protein}g</div>
                            <div className="text-xs font-medium text-blue-500 uppercase tracking-wide">Protein</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Carbs */}
                      {analyzedNutrition.carbs !== null && analyzedNutrition.carbs !== undefined && (
                        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 sm:p-4 border border-green-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-green-600">{analyzedNutrition.carbs}g</div>
                            <div className="text-xs font-medium text-green-500 uppercase tracking-wide">Carbs</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Fat */}
                      {analyzedNutrition.fat !== null && analyzedNutrition.fat !== undefined && (
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3 sm:p-4 border border-purple-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-purple-600">{analyzedNutrition.fat}g</div>
                            <div className="text-xs font-medium text-purple-500 uppercase tracking-wide">Fat</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Enhanced Description Section */}
                  <div className="space-y-4">
                    <label className="block text-lg font-medium text-gray-900">
                      Food Description
                    </label>
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-base resize-none bg-white shadow-sm font-normal leading-relaxed"
                      placeholder="Enter a detailed description of the food item..."
                    />
                    <p className="text-sm text-gray-600 font-normal">
                      Change the food description and click on the 'Re-Analyze' button.
                    </p>
                  </div>
                  
                  {/* Full-Width Action Buttons */}
                  <div className="space-y-3">
                    {/* Initial State: Re-Analyze Button */}
                    {!hasReAnalyzed && (
                      <button
                        onClick={async () => {
                          // Re-analyze with AI for updated nutrition info
                          setIsAnalyzing(true);
                          let updatedNutrition = null;

                          try {
                            const response = await fetch('/api/analyze-food', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                textDescription: editedDescription,
                                foodType: 'single'
                              }),
                            });

                            if (response.ok) {
                              const result = await response.json();
                              if (result.success && result.analysis) {
                                updatedNutrition = extractNutritionData(result.analysis);
                                setAnalyzedNutrition(updatedNutrition);
                                setAiDescription(result.analysis);
                              }
                            } else {
                              console.error('API Error:', response.status, response.statusText);
                            }
                          } catch (error) {
                            console.error('Error re-analyzing food:', error);
                          } finally {
                            setIsAnalyzing(false);
                          }

                          // Set state to show Update Entry button
                          setHasReAnalyzed(true);
                        }}
                      disabled={!editedDescription.trim() || isAnalyzing}
                      className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md disabled:shadow-none"
                    >
                      {isAnalyzing ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="font-normal">Re-Analyzing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="font-normal">Re-Analyze</span>
                        </>
                      )}
                    </button>
                    )}

                    {/* After Re-Analyze: Update Entry Button */}
                    {hasReAnalyzed && (
                      <button
                        onClick={async () => {
                          if (editingEntry) {
                            // Update the existing entry
                            const updatedEntry = {
                              ...editingEntry,
                              description: editedDescription,
                              photo: photoPreview || editingEntry.photo,
                              nutrition: analyzedNutrition || editingEntry.nutrition
                            };

                            const updatedFoods = todaysFoods.map(food => 
                              food.id === editingEntry.id ? updatedEntry : food
                            );
                            
                            setTodaysFoods(updatedFoods);
                            await saveFoodEntries(updatedFoods);
                          } else {
                            addFoodEntry(editedDescription, 'photo');
                            setIsEditingDescription(false);
                          }
                        }}
                        className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md"
                      >
                        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-normal">Update Entry</span>
                      </button>
                    )}

                    {/* After Re-Analyze: Analyze Again Button */}
                    {hasReAnalyzed && (
                      <button
                      onClick={async () => {
                        // Analyze Again - Re-run analysis with current description
                        setIsAnalyzing(true);
                        let updatedNutrition = null;

                        try {
                          const response = await fetch('/api/analyze-food', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              textDescription: editedDescription,
                              foodType: 'single',
                              isReanalysis: true
                            }),
                          });

                          if (response.ok) {
                            const result = await response.json();
                            if (result.success && result.analysis) {
                              updatedNutrition = extractNutritionData(result.analysis);
                              setAnalyzedNutrition(updatedNutrition);
                              setAiDescription(result.analysis);
                            }
                          } else {
                            console.error('API Error:', response.status, response.statusText);
                          }
                        } catch (error) {
                          console.error('Error re-analyzing food:', error);
                        } finally {
                          setIsAnalyzing(false);
                        }
                      }}
                      disabled={!editedDescription.trim() || isAnalyzing}
                      className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300 flex items-center justify-center"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Analyze Again
                    </button>
                    )}

                    {/* Done Button - Full Width */}
                    <button
                      onClick={() => {
                        // Done - Close editing mode and reset state
                        setIsEditingDescription(false);
                        setEditedDescription('');
                        setEditingEntry(null);
                        setHasReAnalyzed(false); // Reset button state
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        setAiDescription('');
                        setShowAiResult(false);
                        setShowAddFood(false);
                        setAnalyzedNutrition(null);
                        setShowPhotoOptions(false);
                      }}
                      className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all duration-300 flex items-center justify-center"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Food Entry - Improved Structure */}
            {!photoPreview && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Manual Food Entry</h3>
                
                {/* Type Dropdown First */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <select
                    value={manualFoodType}
                    onChange={(e) => {
                      setManualFoodType(e.target.value);
                      setManualFoodName('');
                      setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
                    }}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white transition-colors"
                  >
                    <option value="single">Single Food</option>
                    <option value="multiple">Multiple Ingredients</option>
                  </select>
                </div>

                {/* Single Food Entry */}
                {manualFoodType === 'single' && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Food Name
                      </label>
                      <input
                        type="text"
                        value={manualFoodName}
                        onChange={(e) => setManualFoodName(e.target.value)}
                        placeholder="e.g., Grilled chicken breast, Medium banana"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Weight/Portion
                      </label>
                      <input
                        type="text"
                        value={manualIngredients[0]?.weight || ''}
                        onChange={(e) => updateIngredient(0, 'weight', e.target.value)}
                        placeholder="e.g., 100, 6, 1"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Unit
                      </label>
                      <select
                        value={manualIngredients[0]?.unit || 'g'}
                        onChange={(e) => updateIngredient(0, 'unit', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white transition-colors"
                      >
                        <option value="g">Grams</option>
                        <option value="oz">Ounces</option>
                        <option value="cup">Cups</option>
                        <option value="tbsp">Tablespoon</option>
                        <option value="tsp">Teaspoon</option>
                        <option value="ml">Milliliters</option>
                        <option value="piece">Piece</option>
                        <option value="slice">Slice</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="small">Small</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Multiple Ingredients Entry */}
                {manualFoodType === 'multiple' && (
                  <div className="mb-6">
                    <div className="space-y-4">
                      {manualIngredients.map((ing, index) => (
                        <div key={index} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-medium text-gray-700">Ingredient {index + 1}</h4>
                            {manualIngredients.length > 1 && (
                              <div className="relative ingredient-options-dropdown">
                                <button
                                  onClick={() => setShowIngredientOptions(showIngredientOptions === `${index}` ? null : `${index}`)}
                                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                  </svg>
                                </button>
                                
                                {showIngredientOptions === `${index}` && (
                                  <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                                    <button
                                      onClick={() => {
                                        removeIngredient(index);
                                        setShowIngredientOptions(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center text-sm"
                                    >
                                      <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="mb-3">
                            <input
                              type="text"
                              value={ing.name}
                              onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                              placeholder="Ingredient name"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                            />
                          </div>
                          
                          <div className="mb-3">
                            <input
                              type="text"
                              value={ing.weight}
                              onChange={(e) => updateIngredient(index, 'weight', e.target.value)}
                              placeholder="Weight/Portion"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                            />
                          </div>
                          
                          <div>
                            <select
                              value={ing.unit}
                              onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm"
                            >
                              <option value="g">Grams</option>
                              <option value="oz">Ounces</option>
                              <option value="cup">Cups</option>
                              <option value="tbsp">Tablespoon</option>
                              <option value="tsp">Teaspoon</option>
                              <option value="ml">Milliliters</option>
                              <option value="piece">Piece</option>
                              <option value="slice">Slice</option>
                            </select>
                          </div>
                        </div>
                      ))}
                      
                      <button
                        onClick={addIngredient}
                        className="w-full px-4 py-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors flex items-center justify-center border border-emerald-200"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Ingredient
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={analyzeManualFood}
                    disabled={
                      (manualFoodType === 'single' && (!manualFoodName.trim() || !manualIngredients[0]?.weight?.trim())) ||
                      (manualFoodType === 'multiple' && manualIngredients.every(ing => !ing.name.trim() || !ing.weight.trim())) ||
                      isAnalyzing
                    }
                    className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Analyzing Food...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Analyze Food
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={cancelManualEntry}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors duration-200 flex items-center justify-center"
                    title="Cancel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Today's Food Entries - Hide during editing */}
        {!editingEntry && !isEditingDescription && (
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 overflow-visible">
          {/* Daily Totals Row */}
          {(isViewingToday ? todaysFoods : (historyFoods || [])).length > 0 && (
            <div className="mb-4">
              {(() => {
                const source = isViewingToday ? todaysFoods : (historyFoods || [])
                const totals = source.reduce((acc: any, item: any) => {
                  const n = item?.nutrition || {};
                  acc.calories += Number.isFinite(n.calories) ? n.calories : 0;
                  acc.protein += Number.isFinite(n.protein) ? n.protein : 0;
                  acc.carbs += Number.isFinite(n.carbs) ? n.carbs : 0;
                  acc.fat += Number.isFinite(n.fat) ? n.fat : 0;
                  return acc;
                }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
                return (
                  <div>
                    <div className="text-lg font-semibold text-gray-800 mb-2">{isViewingToday ? "Today's Totals" : 'Totals'}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <div className="text-xs text-orange-500 mb-1">Calories</div>
                        <div className="text-lg font-semibold text-orange-600">{totals.calories}</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="text-xs text-blue-500 mb-1">Protein</div>
                        <div className="text-lg font-semibold text-blue-600">{totals.protein}g</div>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="text-xs text-green-500 mb-1">Carbs</div>
                        <div className="text-lg font-semibold text-green-600">{totals.carbs}g</div>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <div className="text-xs text-purple-500 mb-1">Fat</div>
                        <div className="text-lg font-semibold text-purple-600">{totals.fat}g</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <h3 className="text-lg font-semibold mb-4">{isViewingToday ? "Today's Meals" : 'Meals'}</h3>
          
          {(isViewingToday ? todaysFoods : (historyFoods || [])).length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-gray-500">No food entries yet {isViewingToday ? 'today' : 'for this date'}</p>
              <p className="text-gray-400 text-sm">{isViewingToday ? 'Add your first meal to start tracking!' : 'Pick another day or return to Today.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(isViewingToday ? todaysFoods : (historyFoods || []))
                .slice()
                .sort((a: any, b: any) => (b?.id || 0) - (a?.id || 0))
                .map((food) => (
                <div key={food.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-visible">
                  {/* Mobile-Optimized Layout */}
                  <div className="p-4 hover:bg-gray-50 transition-colors">
                    {/* Title (up to 2 lines) */}
                    <div className="mb-1">
                      <div className="flex items-start gap-3 flex-1">
                        <h3 className="font-medium text-gray-900 text-sm sm:text-base leading-snug line-clamp-2">
                          {food.description.split('\n')[0].split('Calories:')[0]
                            .replace(/^(I'm unable to see.*?but I can provide a general estimate for|Based on.*?,|This image shows|I can see|The food appears to be|This appears to be)/i, '')
                            .split('.')[0]
                            .trim()
                            .replace(/^./, (match: string) => match.toUpperCase())}
                        </h3>
                      </div>
                    </div>
                    
                    {/* Utility Row: time (left) + actions (right) */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs sm:text-sm text-gray-500">
                        {formatTimeWithAMPM(food.time)}
                      </p>
                      <div className="flex items-center gap-2">
                        {/* 3-Dot Options Menu */}
                        <div className="relative entry-options-dropdown">
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowEntryOptions(showEntryOptions === food.id.toString() ? null : food.id.toString());
                            }}
                            className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                            </svg>
                          </button>
                          {showEntryOptions === food.id.toString() && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999]" style={{boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'}}>
                              <button
                                onClick={() => editFood(food)}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors"
                              >
                                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <div>
                                  <div className="font-medium">Edit Entry</div>
                                  <div className="text-xs text-gray-500">Modify description & re-analyze</div>
                                </div>
                              </button>
                              <button
                                onClick={() => deleteFood(food.id)}
                                className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center border-t border-gray-100 transition-colors"
                              >
                                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <div>
                                  <div className="font-medium">Delete Entry</div>
                                  <div className="text-xs text-gray-500">Remove from food diary</div>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Expand/Collapse Toggle */}
                        <button
                          onClick={() => toggleExpanded(food.id.toString())}
                          className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <svg 
                            className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transition-transform duration-200 ${
                              expandedEntries[food.id.toString()] ? 'rotate-180' : ''
                            }`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Nutrition Row removed in collapsed view (still shown in expanded view) */}
                  </div>

                  {/* Expandable Content */}
                  {expandedEntries[food.id.toString()] && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Food Image - Perfectly Sized to Match Nutrition Cards */}
                        {food.photo && (
                          <div className="w-full sm:w-32 sm:flex-shrink-0 mb-4 sm:mb-0">
                            <div className="relative">
                              {foodImagesLoading[food.id] && (
                                <div className="absolute inset-0 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center">
                                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                </div>
                              )}
                              <Image
                                src={food.photo}
                                alt="Food"
                                width={128}
                                height={128}
                                className={`w-full sm:w-32 aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${foodImagesLoading[food.id] ? 'opacity-0' : 'opacity-100'}`}
                                onLoadStart={() => setFoodImagesLoading(prev => ({...prev, [food.id]: true}))}
                                onLoad={() => setFoodImagesLoading(prev => ({...prev, [food.id]: false}))}
                                onError={() => setFoodImagesLoading(prev => ({...prev, [food.id]: false}))}
                                onClick={() => setFullSizeImage(food.photo)}
                                loading="lazy"
                              />
                            </div>
                          </div>
                        )}

                        {/* Nutrition Cards - Adjusted Width for Perfect Height Match */}
                        <div className="flex-1 sm:max-w-xs">
                          {food.nutrition && (food.nutrition.calories !== null || food.nutrition.protein !== null || food.nutrition.carbs !== null || food.nutrition.fat !== null) && (
                            <div className="grid grid-cols-2 gap-2 h-32">
                              {/* Calories */}
                              {food.nutrition.calories !== null && food.nutrition.calories !== undefined && (
                                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2 border border-orange-200 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-orange-600">{food.nutrition.calories}</div>
                                    <div className="text-xs font-medium text-orange-500 uppercase tracking-wide">Calories</div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Protein */}
                              {food.nutrition.protein !== null && food.nutrition.protein !== undefined && (
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-2 border border-blue-200 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-blue-600">{food.nutrition.protein}g</div>
                                    <div className="text-xs font-medium text-blue-500 uppercase tracking-wide">Protein</div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Carbs */}
                              {food.nutrition.carbs !== null && food.nutrition.carbs !== undefined && (
                                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-2 border border-green-200 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-green-600">{food.nutrition.carbs}g</div>
                                    <div className="text-xs font-medium text-green-500 uppercase tracking-wide">Carbs</div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Fat */}
                              {food.nutrition.fat !== null && food.nutrition.fat !== undefined && (
                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-2 border border-purple-200 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-purple-600">{food.nutrition.fat}g</div>
                                    <div className="text-xs font-medium text-purple-500 uppercase tracking-wide">Fat</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Additional Nutrition Cards (Fiber/Sugar) */}
                          {food.nutrition && (food.nutrition.fiber !== null || food.nutrition.sugar !== null) && (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {food.nutrition.fiber !== null && food.nutrition.fiber !== undefined && (
                                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-2 border border-amber-200">
                                  <div className="text-center">
                                    <div className="text-sm font-bold text-amber-600">{food.nutrition.fiber}g</div>
                                    <div className="text-xs font-medium text-amber-500 uppercase tracking-wide">Fiber</div>
                                  </div>
                                </div>
                              )}
                              {food.nutrition.sugar !== null && food.nutrition.sugar !== undefined && (
                                <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-2 border border-pink-200">
                                  <div className="text-center">
                                    <div className="text-sm font-bold text-pink-600">{food.nutrition.sugar}g</div>
                                    <div className="text-xs font-medium text-pink-500 uppercase tracking-wide">Sugar</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Full Size Image Modal */}
        {fullSizeImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => setFullSizeImage(null)}
          >
            <div className="relative max-w-4xl max-h-full">
              <button
                onClick={() => setFullSizeImage(null)}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <Image
                src={fullSizeImage}
                alt="Full size food image"
                width={800}
                height={600}
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation - with pressed, ripple and active states */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          <Link href="/dashboard" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/dashboard' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/dashboard' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Dashboard</span>
          </Link>

          <Link href="/insights" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/insights' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/insights' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Insights</span>
          </Link>

          <Link href="/food" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/food' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/food' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Food</span>
          </Link>

          <MobileMoreMenu />

          <Link href="/settings" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/settings' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/settings' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Settings</span>
          </Link>
        </div>
      </nav>
      </div>
    </div>
  )
} 