'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
/**
 * WARNING FOR FUTURE EDITS
 * This page expects AI responses to include ONE nutrition line exactly like:
 *   Calories: N, Protein: Ng, Carbs: Ng, Fat: Ng
 * The API enforces this and also has a fallback extractor.
 * If you change regexes or presentation, TEST that all four values still render.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import FeatureUsageDisplay from '@/components/FeatureUsageDisplay'
import CreditPurchaseModal from '@/components/CreditPurchaseModal'

const NUTRIENT_DISPLAY_ORDER: Array<'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar'> = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar']

const NUTRIENT_CARD_META: Record<typeof NUTRIENT_DISPLAY_ORDER[number], { label: string; unit?: string; gradient: string; accent: string }> = {
  calories: { label: 'Calories', unit: '', gradient: 'from-orange-50 to-orange-100', accent: 'text-orange-500' },
  protein: { label: 'Protein', unit: 'g', gradient: 'from-blue-50 to-blue-100', accent: 'text-blue-500' },
  carbs: { label: 'Carbs', unit: 'g', gradient: 'from-green-50 to-green-100', accent: 'text-green-500' },
  fat: { label: 'Fat', unit: 'g', gradient: 'from-purple-50 to-purple-100', accent: 'text-purple-500' },
  fiber: { label: 'Fiber', unit: 'g', gradient: 'from-amber-50 to-amber-100', accent: 'text-amber-500' },
  sugar: { label: 'Sugar', unit: 'g', gradient: 'from-pink-50 to-pink-100', accent: 'text-pink-500' },
}

const stripItemsJsonBlock = (text: string | null | undefined) => {
  if (!text) return ''
  return text.replace(/<ITEMS_JSON>[\s\S]*?<\/ITEMS_JSON>/gi, '').trim()
}

const formatServingsDisplay = (value: number | null | undefined) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '1'
  const rounded = Math.round(numeric * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

const buildMealSummaryFromItems = (items: any[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return ''

  const summaryParts = items.map((item) => {
    const pieces: string[] = []
    const servings = Number(item?.servings)
    if (Number.isFinite(servings) && Math.abs(servings - 1) > 0.001) {
      pieces.push(`${formatServingsDisplay(servings)}×`)
    }
    if (item?.brand) {
      pieces.push(String(item.brand))
    }
    pieces.push(item?.name ? String(item.name) : 'Food item')
    if (item?.serving_size) {
      pieces.push(`(${item.serving_size})`)
    }
    return pieces.join(' ').replace(/\s+/g, ' ').trim()
  })

  return summaryParts.join(', ')
}

const toNumberOrNull = (value: any) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const sanitizeItemsForStorage = (items: any[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return []

  return items.map((item) => {
    const servingsValue = Number(item?.servings)
    const normalizedServings = Number.isFinite(servingsValue) && servingsValue > 0
      ? Math.round(servingsValue * 100) / 100
      : 1

    const sanitized: Record<string, any> = {
      ...item,
      name: typeof item?.name === 'string' ? item.name.trim() : (item?.name ? String(item.name) : ''),
      brand: item?.brand ? String(item.brand).trim() : null,
      serving_size: item?.serving_size ? String(item.serving_size).trim() : '',
      servings: normalizedServings,
    }

    sanitized.calories = toNumberOrNull(item?.calories)
    sanitized.protein_g = toNumberOrNull(item?.protein_g)
    sanitized.carbs_g = toNumberOrNull(item?.carbs_g)
    sanitized.fat_g = toNumberOrNull(item?.fat_g)
    sanitized.fiber_g = toNumberOrNull(item?.fiber_g)
    sanitized.sugar_g = toNumberOrNull(item?.sugar_g)

    return sanitized
  })
}

const buildNutritionFromTotals = (totals: any, fallback?: any) => {
  if (!totals) {
    return fallback || {
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      fiber: null,
      sugar: null,
    }
  }

  return {
    calories: toNumberOrNull(totals.calories),
    protein: toNumberOrNull(totals.protein),
    carbs: toNumberOrNull(totals.carbs),
    fat: toNumberOrNull(totals.fat),
    fiber: totals.fiber !== null && totals.fiber !== undefined ? toNumberOrNull(totals.fiber) : null,
    sugar: totals.sugar !== null && totals.sugar !== undefined ? toNumberOrNull(totals.sugar) : null,
  }
}

const buildTotalFromTotals = (totals: any) => {
  if (!totals) return null

  return {
    calories: toNumberOrNull(totals.calories),
    protein_g: toNumberOrNull(totals.protein),
    carbs_g: toNumberOrNull(totals.carbs),
    fat_g: toNumberOrNull(totals.fat),
    fiber_g: totals.fiber !== null && totals.fiber !== undefined ? toNumberOrNull(totals.fiber) : null,
    sugar_g: totals.sugar !== null && totals.sugar !== undefined ? toNumberOrNull(totals.sugar) : null,
  }
}

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
  const [analyzedItems, setAnalyzedItems] = useState<any[]>([]) // Structured items array from API
  const [analyzedTotal, setAnalyzedTotal] = useState<any>(null) // Total nutrition from API
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null) // Which item is being edited
  const [showItemEditModal, setShowItemEditModal] = useState<boolean>(false) // Show edit modal for item
  const [healthWarning, setHealthWarning] = useState<string | null>(null)
  const [healthAlternatives, setHealthAlternatives] = useState<string | null>(null)
  
  // Manual food entry states
  const [manualFoodName, setManualFoodName] = useState('')
  const [manualFoodType, setManualFoodType] = useState('single')
  const [manualIngredients, setManualIngredients] = useState([{ name: '', weight: '', unit: 'g' }])
  const [showEntryOptions, setShowEntryOptions] = useState<string | null>(null)
  const [showIngredientOptions, setShowIngredientOptions] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [hasReAnalyzed, setHasReAnalyzed] = useState<boolean>(false)

  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [foodImagesLoading, setFoodImagesLoading] = useState<{[key: string]: boolean}>({})
  const [expandedEntries, setExpandedEntries] = useState<{[key: string]: boolean}>({})
  const [insightsNotification, setInsightsNotification] = useState<{show: boolean, message: string, type: 'updating' | 'updated'} | null>(null)
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
  const [showCreditsModal, setShowCreditsModal] = useState<boolean>(false)
  const [creditInfo, setCreditInfo] = useState<any>({
    dailyUsed: 0,
    dailyLimit: 0,
    additionalCredits: 0,
    plan: 'FREE',
    creditCost: 1,
    featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
  })
  const [usageMeterRefresh, setUsageMeterRefresh] = useState<number>(0) // Trigger for UsageMeter refresh

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
  const saveFoodEntries = async (updatedFoods: any[], options?: { appendHistory?: boolean }) => {
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
      // Fire-and-forget history append (skip for edits/deletes)
      if (options?.appendHistory !== false) {
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
      }
    } catch (error) {
      console.error('Error in saveFoodEntries:', error);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Compress the uploaded file to balance quality and cost (higher quality for better detection)
        const compressedFile = await compressImage(file, 1024, 0.85);
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

  const extractNutritionData = (description: string) => {
    const caloriesMatch = description.match(/calories?[:\s]*(\d+(?:\.\d+)?)/i)
    const proteinMatch = description.match(/protein[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const carbsMatch = description.match(/carb(?:ohydrate)?s?[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const fatMatch = description.match(/fat[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const fiberMatch = description.match(/fiber[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const sugarMatch = description.match(/sugar[:\s]*(\d+(?:\.\d+)?)\s*g/i)

    const toNumber = (match: RegExpMatchArray | null, fallback: number | null = null) => {
      if (!match) return fallback
      const value = parseFloat(match[1])
      return Number.isFinite(value) ? value : fallback
    }

    return {
      calories: toNumber(caloriesMatch),
      protein: toNumber(proteinMatch),
      carbs: toNumber(carbsMatch),
      fat: toNumber(fatMatch),
      fiber: toNumber(fiberMatch),
      sugar: toNumber(sugarMatch),
    }
  }

  // Recalculate nutrition totals from items array (multiplying by servings)
  const recalculateNutritionFromItems = (items: any[]) => {
    if (!items || items.length === 0) return null

    const totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    }

    items.forEach((item: any) => {
      const servings = item?.servings && Number.isFinite(item.servings) ? item.servings : 1
      totals.calories += (item.calories || 0) * servings
      totals.protein += (item.protein_g || 0) * servings
      totals.carbs += (item.carbs_g || 0) * servings
      totals.fat += (item.fat_g || 0) * servings
      totals.fiber += (item.fiber_g || 0) * servings
      totals.sugar += (item.sugar_g || 0) * servings
    })

    const round = (value: number, decimals = 1) => {
      const factor = Math.pow(10, decimals)
      return Math.round(value * factor) / factor
    }

    return {
      calories: Math.round(totals.calories),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
      fiber: totals.fiber > 0 ? round(totals.fiber) : null,
      sugar: totals.sugar > 0 ? round(totals.sugar) : null,
    }
  }

  const formatNutrientValue = (key: typeof NUTRIENT_DISPLAY_ORDER[number], value: number) => {
    if (!Number.isFinite(value)) return ''
    if (key === 'calories') {
      return `${Math.round(value)}`
    }
    const rounded = Math.round(value * 10) / 10
    const unit = NUTRIENT_CARD_META[key]?.unit || ''
    return `${rounded}${unit}`
  }

  const updateItemServings = (index: number, nextServings: number) => {
    setAnalyzedItems((prevItems) => {
      if (!Array.isArray(prevItems) || index < 0 || index >= prevItems.length) {
        return prevItems
      }

      const clamped = Math.max(0.25, Math.round(nextServings * 100) / 100)
      const updated = prevItems.map((item, idx) =>
        idx === index ? { ...item, servings: clamped } : item
      )

      const recalculated = recalculateNutritionFromItems(updated)
      setAnalyzedNutrition(recalculated)
      setAnalyzedTotal(buildTotalFromTotals(recalculated))
      return updated
    })
  }

  const renderDetectedFoods = (options?: { containerClassName?: string }) => {
    const containerClassName = options?.containerClassName ?? 'mb-6'

    if (analyzedItems && analyzedItems.length > 0) {
      return (
        <div className={containerClassName}>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Detected Foods</div>
                  <div className="text-xs text-gray-500">Adjust servings to match what you ate</div>
                </div>
              </div>
              <div className="space-y-3">
                {analyzedItems.map((item: any, index: number) => {
                  const rawServings = Number(item?.servings)
                  const servingsCount = Number.isFinite(rawServings) && rawServings > 0 ? rawServings : 1
                  const servingsLabel = `${formatServingsDisplay(servingsCount)} serving${Math.abs(servingsCount - 1) < 0.001 ? '' : 's'}`

                  const perCalories = Number(item?.calories) || 0
                  const perProtein = Number(item?.protein_g) || 0
                  const perCarbs = Number(item?.carbs_g) || 0
                  const perFat = Number(item?.fat_g) || 0
                  const perFiber = Number(item?.fiber_g) || 0
                  const perSugar = Number(item?.sugar_g) || 0

                  const totalCalories = Math.round(perCalories * servingsCount)
                  const totalProtein = Math.round(perProtein * servingsCount * 10) / 10
                  const totalCarbs = Math.round(perCarbs * servingsCount * 10) / 10
                  const totalFat = Math.round(perFat * servingsCount * 10) / 10
                  const totalFiber = Math.round(perFiber * servingsCount * 10) / 10
                  const totalSugar = Math.round(perSugar * servingsCount * 10) / 10

                  const perServingDetails = [
                    perCalories > 0 ? `${Math.round(perCalories)} cal` : null,
                    perProtein > 0 ? `${Math.round(perProtein * 10) / 10}g protein` : null,
                    perCarbs > 0 ? `${Math.round(perCarbs * 10) / 10}g carbs` : null,
                    perFat > 0 ? `${Math.round(perFat * 10) / 10}g fat` : null,
                    perFiber > 0 ? `${Math.round(perFiber * 10) / 10}g fiber` : null,
                    perSugar > 0 ? `${Math.round(perSugar * 10) / 10}g sugar` : null,
                  ].filter(Boolean)

                  const totalDetails = [
                    `${totalCalories} cal`,
                    totalProtein > 0 ? `${totalProtein}g protein` : null,
                    totalCarbs > 0 ? `${totalCarbs}g carbs` : null,
                    totalFat > 0 ? `${totalFat}g fat` : null,
                    totalFiber > 0 ? `${totalFiber}g fiber` : null,
                    totalSugar > 0 ? `${totalSugar}g sugar` : null,
                  ].filter(Boolean)

                  const currentServings = servingsCount
                  const minServings = 0.25
                  const canDecrement = currentServings - minServings > 0.001

                  return (
                    <div key={`${item?.name || 'item'}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 sm:p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate">{item?.name || 'Food item'}</div>
                              {item?.brand && (
                                <div className="text-xs text-gray-500 mt-0.5 truncate">{item.brand}</div>
                              )}
                              <div className="text-xs text-gray-500 mt-1">
                                {item?.serving_size ? `Serving size: ${item.serving_size}` : 'Serving size not provided'}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setEditingItemIndex(index)
                                setShowItemEditModal(true)
                              }}
                              className="flex-shrink-0 p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Adjust details"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                          {perServingDetails.length > 0 && (
                            <div className="mt-2 text-xs text-gray-600">
                              <span className="font-medium text-gray-700">Per serving:</span>{' '}
                              {perServingDetails.join(' • ')}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Servings</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (canDecrement) {
                                  updateItemServings(index, currentServings - 0.25)
                                }
                              }}
                              disabled={!canDecrement}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-700 font-semibold transition-colors ${
                                canDecrement ? 'bg-white border border-gray-200 hover:bg-gray-100' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              -
                            </button>
                            <span className="text-sm font-semibold text-gray-900 w-14 text-center">
                              {formatServingsDisplay(currentServings)}
                            </span>
                            <button
                              onClick={() => updateItemServings(index, currentServings + 0.25)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-700 font-semibold transition-colors bg-white border border-gray-200 hover:bg-gray-100"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                      {totalDetails.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/80 text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                          <span className="font-medium text-gray-700">Totals for {servingsLabel}:</span>
                          {totalDetails.map((detail, detailIdx) => (
                            <span key={detailIdx}>{detail}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={containerClassName}>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="text-sm font-medium text-gray-600 mb-2">Detected Foods:</div>
          <div className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {(displayDescription && displayDescription.replace(/^./, (match: string) => match.toUpperCase())) || 'Description not available yet.'}
          </div>
        </div>
      </div>
    )
  }

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
        // Handle payment required (402) with modal
        if (response.status === 402) {
          try {
            const errorData = await response.json();
            setCreditInfo({
              dailyUsed: 0,
              dailyLimit: 0,
              additionalCredits: errorData.additionalCredits ?? 0,
              plan: errorData.plan ?? 'FREE',
              creditCost: 1, // Food analysis costs 1 credit
              featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
            });
            setShowCreditsModal(true);
            setIsAnalyzing(false);
            return;
          } catch (parseError) {
            console.error('❌ Could not parse error response:', parseError);
          }
        }
        
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
        const cleanedAnalysis = stripItemsJsonBlock(result.analysis);
        setAiDescription(cleanedAnalysis);
        setAnalyzedNutrition(extractNutritionData(result.analysis));
        // Store structured items and total if available
        if (result.items && Array.isArray(result.items)) {
          const sanitizedItems = sanitizeItemsForStorage(result.items);
          if (sanitizedItems.length > 0) {
            setAnalyzedItems(sanitizedItems);
            const recalculated = recalculateNutritionFromItems(sanitizedItems);
            setAnalyzedNutrition(recalculated);
            setAnalyzedTotal(buildTotalFromTotals(recalculated));
          } else {
            setAnalyzedItems([]);
            setAnalyzedTotal(buildTotalFromTotals(result.total || null));
          }
        } else {
          setAnalyzedItems([]);
          setAnalyzedTotal(null);
        }
        // Set health warning and alternatives if present
        setHealthWarning(result.healthWarning || null);
        setHealthAlternatives(result.alternatives || null);
        setShowAiResult(true);
        // Trigger usage meter refresh after successful analysis
        setUsageMeterRefresh(prev => prev + 1);
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
        const cleanedAnalysis = stripItemsJsonBlock(result.analysis);
        setAiDescription(cleanedAnalysis);
        setAnalyzedNutrition(extractNutritionData(result.analysis));
        // Store structured items and total if available
        if (result.items && Array.isArray(result.items)) {
          const sanitizedItems = sanitizeItemsForStorage(result.items);
          if (sanitizedItems.length > 0) {
            setAnalyzedItems(sanitizedItems);
            const recalculated = recalculateNutritionFromItems(sanitizedItems);
            setAnalyzedNutrition(recalculated);
            setAnalyzedTotal(buildTotalFromTotals(recalculated));
          } else {
            setAnalyzedItems([]);
            setAnalyzedTotal(buildTotalFromTotals(result.total || null));
          }
        } else {
          setAnalyzedItems([]);
          setAnalyzedTotal(null);
        }
        // Set health warning and alternatives if present
        setHealthWarning(result.healthWarning || null);
        setHealthAlternatives(result.alternatives || null);
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

    const sanitizedItems = sanitizeItemsForStorage(analyzedItems);
    const itemsToStore = sanitizedItems.length > 0 ? sanitizedItems : null;
    const recalculatedTotals = sanitizedItems.length > 0 ? recalculateNutritionFromItems(sanitizedItems) : null;
    const fallbackNutrition = nutrition || analyzedNutrition || null;
    const nutritionForEntryRaw = recalculatedTotals
      ? buildNutritionFromTotals(recalculatedTotals, fallbackNutrition)
      : (fallbackNutrition || {
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
          fiber: null,
          sugar: null,
        });

    const safeNutrition = {
      calories: toNumberOrNull(nutritionForEntryRaw?.calories),
      protein: toNumberOrNull(nutritionForEntryRaw?.protein),
      carbs: toNumberOrNull(nutritionForEntryRaw?.carbs),
      fat: toNumberOrNull(nutritionForEntryRaw?.fat),
      fiber: nutritionForEntryRaw?.fiber !== null && nutritionForEntryRaw?.fiber !== undefined ? toNumberOrNull(nutritionForEntryRaw?.fiber) : null,
      sugar: nutritionForEntryRaw?.sugar !== null && nutritionForEntryRaw?.sugar !== undefined ? toNumberOrNull(nutritionForEntryRaw?.sugar) : null,
    };

    const totalForEntry = recalculatedTotals
      ? buildTotalFromTotals(recalculatedTotals)
      : (analyzedTotal ? buildTotalFromTotals(analyzedTotal) : null);

    const summaryDescription = itemsToStore ? buildMealSummaryFromItems(itemsToStore) : '';
    const finalDescription = summaryDescription || description;
    
    const newEntry = {
      id: Date.now(),
      description: finalDescription,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      method,
      photo: method === 'photo' ? photoPreview : null,
      nutrition: safeNutrition,
      items: itemsToStore,
      total: totalForEntry
    };
    
    const updatedFoods = [newEntry, ...todaysFoods];
    setTodaysFoods(updatedFoods);
    
    // Save to database (this triggers background insight regeneration)
    await saveFoodEntries(updatedFoods);
    
    // Show subtle notification that insights are updating
    setInsightsNotification({
      show: true,
      message: 'Updating insights...',
      type: 'updating'
    });
    
    // After a delay, show that insights have been updated
    setTimeout(() => {
      setInsightsNotification({
        show: true,
        message: 'Insights updated',
        type: 'updated'
      });
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        setInsightsNotification(null);
      }, 3000);
    }, 2000);
    
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
    setAnalyzedItems([]);
    setAnalyzedTotal(null);
    setHealthWarning(null);
    setHealthAlternatives(null);
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
          foodType: 'meal',
          isReanalysis: true,
          multi: true,
          returnItems: true
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('API Response:', result); // Debug log
        if (result.success && result.analysis) {
          updatedNutrition = extractNutritionData(result.analysis);
          const cleanedAnalysis = stripItemsJsonBlock(result.analysis);
          fullAnalysis = cleanedAnalysis;
          console.log('Extracted Nutrition:', updatedNutrition); // Debug log
          
          // Update the UI states with new nutrition but keep clean description
          setAiDescription(cleanedAnalysis); // Cleaned AI response for processing
          setAnalyzedNutrition(updatedNutrition);
          // Store structured items and total if available
          if (result.items && Array.isArray(result.items)) {
            const sanitizedItems = sanitizeItemsForStorage(result.items);
            if (sanitizedItems.length > 0) {
              setAnalyzedItems(sanitizedItems);
              const recalculated = recalculateNutritionFromItems(sanitizedItems);
              setAnalyzedNutrition(recalculated);
              setAnalyzedTotal(buildTotalFromTotals(recalculated));
              updatedNutrition = recalculated;
            } else {
              setAnalyzedItems([]);
              setAnalyzedTotal(buildTotalFromTotals(result.total || null));
            }
          } else {
            setAnalyzedItems([]);
            setAnalyzedTotal(null);
          }
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

    const sanitizedAnalyzedItems = sanitizeItemsForStorage(analyzedItems);
    const existingItems = Array.isArray(editingEntry.items) ? sanitizeItemsForStorage(editingEntry.items) : [];
    const itemsToPersist = sanitizedAnalyzedItems.length > 0 ? sanitizedAnalyzedItems : (existingItems.length > 0 ? existingItems : null);
    const recalculatedTotals = itemsToPersist ? recalculateNutritionFromItems(itemsToPersist) : null;
    const nutritionSource = updatedNutrition || editingEntry.nutrition || null;
    const nutritionForEntryRaw = recalculatedTotals ? buildNutritionFromTotals(recalculatedTotals, nutritionSource) : (nutritionSource || {
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      fiber: null,
      sugar: null,
    });

    const safeUpdatedNutrition = {
      calories: toNumberOrNull(nutritionForEntryRaw?.calories),
      protein: toNumberOrNull(nutritionForEntryRaw?.protein),
      carbs: toNumberOrNull(nutritionForEntryRaw?.carbs),
      fat: toNumberOrNull(nutritionForEntryRaw?.fat),
      fiber: nutritionForEntryRaw?.fiber !== null && nutritionForEntryRaw?.fiber !== undefined ? toNumberOrNull(nutritionForEntryRaw?.fiber) : null,
      sugar: nutritionForEntryRaw?.sugar !== null && nutritionForEntryRaw?.sugar !== undefined ? toNumberOrNull(nutritionForEntryRaw?.sugar) : null,
    };

    const totalForEntry = recalculatedTotals
      ? buildTotalFromTotals(recalculatedTotals)
      : (analyzedTotal
        ? buildTotalFromTotals(analyzedTotal)
        : (editingEntry.total ? buildTotalFromTotals(editingEntry.total) : null));

    // Build description from items if available, otherwise use provided description
    const summarizedDescription = itemsToPersist ? buildMealSummaryFromItems(itemsToPersist) : '';
    const finalDescription = summarizedDescription || stripItemsJsonBlock(fullAnalysis || description);
    
    // Update the existing entry with AI analysis for nutrition display
    const updatedEntry = {
      ...editingEntry,
      description: finalDescription,
      photo: method === 'photo' ? photoPreview : editingEntry.photo,
      nutrition: safeUpdatedNutrition,
      items: itemsToPersist,
      total: totalForEntry
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
    setAnalyzedItems([]);
    setAnalyzedTotal(null);
    setHealthWarning(null);
    setHealthAlternatives(null);
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
      // Restore items if available
      if (food.items && Array.isArray(food.items)) {
        const sanitizedItems = sanitizeItemsForStorage(food.items);
        if (sanitizedItems.length > 0) {
          setAnalyzedItems(sanitizedItems);
          const recalculated = recalculateNutritionFromItems(sanitizedItems);
          setAnalyzedNutrition(recalculated);
          setAnalyzedTotal(buildTotalFromTotals(recalculated));
        } else {
          setAnalyzedItems([]);
          setAnalyzedTotal(buildTotalFromTotals(food.total || null));
        }
      } else {
        setAnalyzedItems([]);
        setAnalyzedTotal(null);
      }
      setShowAiResult(true);
      setShowAddFood(true);
      // Go directly to editing mode and extract clean food name only
      setIsEditingDescription(true);
      setEditedDescription(food.description || '');
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
  useEffect(() => {
    console.log('🔍 State Debug:', {
      showAddFood,
      showAiResult,
      isEditingDescription,
      editingEntry: editingEntry ? 'exists' : 'null',
      todaysFoodsCount: todaysFoods.length
    });
  }, [showAddFood, showAiResult, isEditingDescription, editingEntry, todaysFoods.length]);

  useEffect(() => {
    if (!isEditingDescription) return;
    const textarea = descriptionTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [isEditingDescription, editedDescription]);

  const cleanedAiDescription = useMemo(() => stripItemsJsonBlock(aiDescription), [aiDescription])
  const mealSummary = useMemo(() => buildMealSummaryFromItems(analyzedItems), [analyzedItems])
  const displayDescription = mealSummary || cleanedAiDescription

  const handleEntryItemServingsChange = (foodId: number, itemIndex: number, nextServings: number) => {
    if (!isViewingToday) return

    const normalizedServings = Math.max(0.25, Math.round(nextServings * 100) / 100)
    let updatedAnalyzedItemsForEditing: any[] | null = null
    let updatedRecalculatedForEditing: any | null = null
    let updatedDescriptionForEditing: string | null = null

    const updatedFoods = todaysFoods.map((food) => {
      if (food.id !== foodId || !Array.isArray(food.items) || food.items.length === 0) {
        return food
      }

      const sanitizedExistingItems = sanitizeItemsForStorage(food.items)
      if (itemIndex < 0 || itemIndex >= sanitizedExistingItems.length) {
        return food
      }

      const updatedItems = sanitizedExistingItems.map((item, idx) =>
        idx === itemIndex ? { ...item, servings: normalizedServings } : item
      )

      const recalculated = recalculateNutritionFromItems(updatedItems)
      const nutritionRaw = buildNutritionFromTotals(recalculated, food.nutrition)
      const safeNutrition = {
        calories: toNumberOrNull(nutritionRaw?.calories),
        protein: toNumberOrNull(nutritionRaw?.protein),
        carbs: toNumberOrNull(nutritionRaw?.carbs),
        fat: toNumberOrNull(nutritionRaw?.fat),
        fiber: nutritionRaw?.fiber !== null && nutritionRaw?.fiber !== undefined ? toNumberOrNull(nutritionRaw?.fiber) : null,
        sugar: nutritionRaw?.sugar !== null && nutritionRaw?.sugar !== undefined ? toNumberOrNull(nutritionRaw?.sugar) : null,
      }

      const updatedDescription = buildMealSummaryFromItems(updatedItems) || food.description
      const updatedTotal = buildTotalFromTotals(recalculated)

      if (editingEntry && editingEntry.id === foodId) {
        updatedAnalyzedItemsForEditing = updatedItems
        updatedRecalculatedForEditing = recalculated
        updatedDescriptionForEditing = updatedDescription
      }

      return {
        ...food,
        items: updatedItems,
        description: updatedDescription,
        nutrition: safeNutrition,
        total: updatedTotal,
      }
    })

    setTodaysFoods(updatedFoods)
    if (updatedAnalyzedItemsForEditing) {
      setAnalyzedItems(updatedAnalyzedItemsForEditing)
      if (updatedRecalculatedForEditing) {
        setAnalyzedNutrition(updatedRecalculatedForEditing)
        setAnalyzedTotal(buildTotalFromTotals(updatedRecalculatedForEditing))
      }
      if (editingEntry) {
        setEditingEntry({
          ...editingEntry,
          items: updatedAnalyzedItemsForEditing,
          nutrition: updatedRecalculatedForEditing
            ? {
                calories: toNumberOrNull(updatedRecalculatedForEditing.calories),
                protein: toNumberOrNull(updatedRecalculatedForEditing.protein),
                carbs: toNumberOrNull(updatedRecalculatedForEditing.carbs),
                fat: toNumberOrNull(updatedRecalculatedForEditing.fat),
                fiber: updatedRecalculatedForEditing.fiber !== null && updatedRecalculatedForEditing.fiber !== undefined
                  ? toNumberOrNull(updatedRecalculatedForEditing.fiber)
                  : null,
                sugar: updatedRecalculatedForEditing.sugar !== null && updatedRecalculatedForEditing.sugar !== undefined
                  ? toNumberOrNull(updatedRecalculatedForEditing.sugar)
                  : null,
              }
            : editingEntry.nutrition,
          description: updatedDescriptionForEditing || editingEntry.description,
        })
      }
    }

    void saveFoodEntries(updatedFoods, { appendHistory: false })
  }

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
      
      {/* Insights Update Notification - Subtle and non-intrusive */}
      {insightsNotification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[10000] transition-opacity duration-300">
          <div className={`px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2 ${
            insightsNotification.type === 'updating' 
              ? 'bg-blue-500 text-white' 
              : 'bg-green-500 text-white'
          }`}>
            {insightsNotification.type === 'updating' && (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {insightsNotification.type === 'updated' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span>{insightsNotification.message}</span>
          </div>
        </div>
      )}
      {/* Header - No back button (main nav item) */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Page Title - Mobile only */}
          <h1 className="md:hidden flex-1 text-center text-lg font-semibold text-gray-900">Food Diary</h1>
          <div className="hidden md:block"></div>

          <div className="flex items-center gap-4">
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
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm object-cover"
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
                  <Link href="/support" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                  <div className="border-t border-gray-100 my-2"></div>
                  <Link href="/reports" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Reports</Link>
                  <button 
                    onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                    className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      {/* Date selector */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center gap-3">
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

          {/* Credits usage meter for Food Analysis (visible on initial load) */}
          <div className="mt-2">
            <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} />
            <FeatureUsageDisplay featureName="foodAnalysis" featureLabel="Food Analysis" refreshTrigger={usageMeterRefresh} />
          </div>

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
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 text-center mb-2">Typical cost: 1–2 credits</p>
                    <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} />
                    <FeatureUsageDisplay featureName="foodAnalysis" featureLabel="Food Analysis" refreshTrigger={usageMeterRefresh} />
                  </div>
                  
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

                  {renderDetectedFoods({ containerClassName: 'mt-4 mb-6' })}

                  {/* Enhanced Description Section */}
                  <div className="space-y-4">
                    <label className="block text-lg font-medium text-gray-900">
                      Food Description
                    </label>
                    <textarea
                      ref={descriptionTextareaRef}
                      value={editedDescription}
                      onChange={(e) => {
                        setEditedDescription(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onFocus={(e) => {
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      className="w-full min-h-[8rem] px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-base resize-none bg-white shadow-sm font-normal leading-relaxed whitespace-pre-wrap"
                      style={{ overflow: 'hidden' }}
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
                                foodType: 'meal',
                                multi: true,
                                returnItems: true
                              }),
                            });

                            if (response.ok) {
                              const result = await response.json();
                              if (result.success && result.analysis) {
                                updatedNutrition = extractNutritionData(result.analysis);
                                setAnalyzedNutrition(updatedNutrition);
                                const cleanedAnalysis = stripItemsJsonBlock(result.analysis);
                                setAiDescription(cleanedAnalysis);
                                // Store structured items and total if available
                                if (result.items && Array.isArray(result.items)) {
                                  const sanitizedItems = sanitizeItemsForStorage(result.items);
                                  if (sanitizedItems.length > 0) {
                                    setAnalyzedItems(sanitizedItems);
                                    const recalculated = recalculateNutritionFromItems(sanitizedItems);
                                    setAnalyzedNutrition(recalculated);
                                    setAnalyzedTotal(buildTotalFromTotals(recalculated));
                                  } else {
                                    setAnalyzedItems([]);
                                    setAnalyzedTotal(buildTotalFromTotals(result.total || null));
                                  }
                                } else {
                                  setAnalyzedItems([]);
                                  setAnalyzedTotal(null);
                                }
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
                            await saveFoodEntries(updatedFoods, { appendHistory: false });
                            // Subtle insights notification
                            setInsightsNotification({ show: true, message: 'Updating insights...', type: 'updating' });
                            setTimeout(() => {
                              setInsightsNotification({ show: true, message: 'Insights updated', type: 'updated' });
                              setTimeout(() => setInsightsNotification(null), 3000);
                            }, 2000);
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
                              const cleanedAnalysis = stripItemsJsonBlock(result.analysis);
                              setAiDescription(cleanedAnalysis);
                              // Store structured items and total if available
                              if (result.items && Array.isArray(result.items)) {
                                const sanitizedItems = sanitizeItemsForStorage(result.items);
                                if (sanitizedItems.length > 0) {
                                  setAnalyzedItems(sanitizedItems);
                                  const recalculated = recalculateNutritionFromItems(sanitizedItems);
                                  setAnalyzedNutrition(recalculated);
                                  setAnalyzedTotal(buildTotalFromTotals(recalculated));
                                } else {
                                  setAnalyzedItems([]);
                                  setAnalyzedTotal(buildTotalFromTotals(result.total || null));
                                }
                              } else {
                                setAnalyzedItems([]);
                                setAnalyzedTotal(null);
                              }
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
                        const entry = editingEntry;
                        // Close editing view but keep current analysis visible
                        setIsEditingDescription(false);
                        setEditedDescription('');
                        setHasReAnalyzed(false); // Reset button state

                        if (entry) {
                          setAiDescription(entry.description || cleanedAiDescription);
                          if (entry.nutrition) {
                            setAnalyzedNutrition(entry.nutrition);
                          }
                          if (entry.photo) {
                            setPhotoPreview(entry.photo);
                          }
                          setEditingEntry(null);
                        } else {
                          // For newly analyzed items, keep current data visible
                          setAiDescription((current) => current || cleanedAiDescription);
                        }

                        setShowAiResult(true);
                        setShowAddFood(true);
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

            {/* Item Edit Modal */}
            {showItemEditModal && editingItemIndex !== null && analyzedItems[editingItemIndex] && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold text-gray-900">Adjust Food Details</h3>
                      <button
                        onClick={() => {
                          setShowItemEditModal(false);
                          setEditingItemIndex(null);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Food Name
                        </label>
                        <input
                          type="text"
                          value={analyzedItems[editingItemIndex]?.name || ''}
                          onChange={(e) => {
                            const updatedItems = [...analyzedItems];
                            updatedItems[editingItemIndex].name = e.target.value;
                            setAnalyzedItems(updatedItems);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., Bread, Sausage, etc."
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Brand (optional)
                        </label>
                        <input
                          type="text"
                          value={analyzedItems[editingItemIndex]?.brand || ''}
                          onChange={(e) => {
                            const updatedItems = [...analyzedItems];
                            updatedItems[editingItemIndex].brand = e.target.value || null;
                            setAnalyzedItems(updatedItems);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., Burgen, Heinz, etc."
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Serving Size
                        </label>
                        <input
                          type="text"
                          value={analyzedItems[editingItemIndex]?.serving_size || ''}
                          onChange={(e) => {
                            const updatedItems = [...analyzedItems];
                            updatedItems[editingItemIndex].serving_size = e.target.value;
                            setAnalyzedItems(updatedItems);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., 1 slice, 40g, 1 cup"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This is the serving size shown on the package or your estimate
                        </p>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-200">
                        <button
                          onClick={() => {
                            // Recalculate nutrition after edits
                            const recalculated = recalculateNutritionFromItems(analyzedItems);
                            setAnalyzedNutrition(recalculated);
                            setShowItemEditModal(false);
                            setEditingItemIndex(null);
                          }}
                          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors duration-200"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
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
                      ref={descriptionTextareaRef}
                      value={editedDescription}
                      onChange={(e) => {
                        setEditedDescription(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onFocus={(e) => {
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      className="w-full min-h-[8rem] px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-base resize-none bg-white shadow-sm font-normal leading-relaxed whitespace-pre-wrap"
                      style={{ overflow: 'hidden' }}
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
                                foodType: 'meal',
                                multi: true,
                                returnItems: true
                              }),
                            });

                            if (response.ok) {
                              const result = await response.json();
                              if (result.success && result.analysis) {
                                updatedNutrition = extractNutritionData(result.analysis);
                                setAnalyzedNutrition(updatedNutrition);
                                const cleanedAnalysis = stripItemsJsonBlock(result.analysis);
                                setAiDescription(cleanedAnalysis);
                                // Store structured items and total if available
                                if (result.items && Array.isArray(result.items)) {
                                  const sanitizedItems = sanitizeItemsForStorage(result.items);
                                  if (sanitizedItems.length > 0) {
                                    setAnalyzedItems(sanitizedItems);
                                    const recalculated = recalculateNutritionFromItems(sanitizedItems);
                                    setAnalyzedNutrition(recalculated);
                                    setAnalyzedTotal(buildTotalFromTotals(recalculated));
                                  } else {
                                    setAnalyzedItems([]);
                                    setAnalyzedTotal(buildTotalFromTotals(result.total || null));
                                  }
                                } else {
                                  setAnalyzedItems([]);
                                  setAnalyzedTotal(null);
                                }
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
                            await saveFoodEntries(updatedFoods, { appendHistory: false });
                            // Subtle insights notification
                            setInsightsNotification({ show: true, message: 'Updating insights...', type: 'updating' });
                            setTimeout(() => {
                              setInsightsNotification({ show: true, message: 'Insights updated', type: 'updated' });
                              setTimeout(() => setInsightsNotification(null), 3000);
                            }, 2000);
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
                              const cleanedAnalysis = stripItemsJsonBlock(result.analysis);
                              setAiDescription(cleanedAnalysis);
                              // Store structured items and total if available
                              if (result.items && Array.isArray(result.items)) {
                                const sanitizedItems = sanitizeItemsForStorage(result.items);
                                if (sanitizedItems.length > 0) {
                                  setAnalyzedItems(sanitizedItems);
                                  const recalculated = recalculateNutritionFromItems(sanitizedItems);
                                  setAnalyzedNutrition(recalculated);
                                  setAnalyzedTotal(buildTotalFromTotals(recalculated));
                                } else {
                                  setAnalyzedItems([]);
                                  setAnalyzedTotal(buildTotalFromTotals(result.total || null));
                                }
                              } else {
                                setAnalyzedItems([]);
                                setAnalyzedTotal(null);
                              }
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
                        const entry = editingEntry;
                        // Close editing view but keep current analysis visible
                        setIsEditingDescription(false);
                        setEditedDescription('');
                        setHasReAnalyzed(false); // Reset button state

                        if (entry) {
                          setAiDescription(entry.description || cleanedAiDescription);
                          if (entry.nutrition) {
                            setAnalyzedNutrition(entry.nutrition);
                          }
                          if (entry.photo) {
                            setPhotoPreview(entry.photo);
                          }
                          setEditingEntry(null);
                        } else {
                          // For newly analyzed items, keep current data visible
                          setAiDescription((current) => current || cleanedAiDescription);
                        }

                        setShowAiResult(true);
                        setShowAddFood(true);
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
                const totals = source.reduce((acc: Record<typeof NUTRIENT_DISPLAY_ORDER[number], number>, item: any) => {
                  const n = item?.nutrition || {}
                  const safeNumber = (value: any) => {
                    const num = Number(value)
                    return Number.isFinite(num) ? num : 0
                  }

                  acc.calories += safeNumber(n.calories ?? n.kcal)
                  acc.protein += safeNumber(n.protein ?? n.protein_g)
                  acc.carbs += safeNumber(n.carbs ?? n.carbohydrates ?? n.carbs_g ?? n.carbohydrates_g)
                  acc.fat += safeNumber(n.fat ?? n.total_fat ?? n.fat_g)
                  acc.fiber += safeNumber(n.fiber ?? n.fiber_g ?? n.dietary_fiber_g)
                  acc.sugar += safeNumber(n.sugar ?? n.sugar_g ?? n.sugars_g)
                  return acc
                }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 })

                const visibleCards = NUTRIENT_DISPLAY_ORDER.filter((key) => {
                  if (key === 'calories') return totals[key] > 0
                  return totals[key] > 0.009
                })

                if (visibleCards.length === 0) return null

                return (
                  <div>
                    <div className="text-lg font-semibold text-gray-800 mb-2">{isViewingToday ? "Today's Totals" : 'Totals'}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {visibleCards.map((key) => {
                        const meta = NUTRIENT_CARD_META[key]
                        const displayValue = formatNutrientValue(key, totals[key])
                        return (
                          <div key={key} className={`bg-gradient-to-br ${meta.gradient} border border-white/60 rounded-lg p-3 shadow-sm`}>
                            <div className={`text-xs ${meta.accent} mb-1 font-medium uppercase tracking-wide`}>{meta.label}</div>
                            <div className="text-lg font-semibold text-gray-900">{displayValue}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
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

                      {food.description && (
                        <div className="mt-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {food.description}
                        </div>
                      )}

                      {Array.isArray(food.items) && food.items.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-semibold text-gray-700 mb-2">Serving Details</div>
                          <div className="space-y-3">
                            {food.items.map((item: any, itemIndex: number) => {
                              const rawServings = Number(item?.servings)
                              const servingsCount = Number.isFinite(rawServings) && rawServings > 0 ? rawServings : 1
                              const servingsLabel = `${formatServingsDisplay(servingsCount)} serving${Math.abs(servingsCount - 1) < 0.001 ? '' : 's'}`

                              const perCalories = Number(item?.calories) || 0
                              const perProtein = Number(item?.protein_g) || 0
                              const perCarbs = Number(item?.carbs_g) || 0
                              const perFat = Number(item?.fat_g) || 0
                              const perFiber = Number(item?.fiber_g) || 0
                              const perSugar = Number(item?.sugar_g) || 0

                              const totalCalories = Math.round(perCalories * servingsCount)
                              const totalProtein = Math.round(perProtein * servingsCount * 10) / 10
                              const totalCarbs = Math.round(perCarbs * servingsCount * 10) / 10
                              const totalFat = Math.round(perFat * servingsCount * 10) / 10
                              const totalFiber = Math.round(perFiber * servingsCount * 10) / 10
                              const totalSugar = Math.round(perSugar * servingsCount * 10) / 10

                              const perServingDetails = [
                                perCalories > 0 ? `${Math.round(perCalories)} cal` : null,
                                perProtein > 0 ? `${Math.round(perProtein * 10) / 10}g protein` : null,
                                perCarbs > 0 ? `${Math.round(perCarbs * 10) / 10}g carbs` : null,
                                perFat > 0 ? `${Math.round(perFat * 10) / 10}g fat` : null,
                                perFiber > 0 ? `${Math.round(perFiber * 10) / 10}g fiber` : null,
                                perSugar > 0 ? `${Math.round(perSugar * 10) / 10}g sugar` : null,
                              ].filter(Boolean)

                              const totalDetails = [
                                `${totalCalories} cal`,
                                totalProtein > 0 ? `${totalProtein}g protein` : null,
                                totalCarbs > 0 ? `${totalCarbs}g carbs` : null,
                                totalFat > 0 ? `${totalFat}g fat` : null,
                                totalFiber > 0 ? `${totalFiber}g fiber` : null,
                                totalSugar > 0 ? `${totalSugar}g sugar` : null,
                              ].filter(Boolean)

                              const entryIdRaw = typeof food.id === 'number' ? food.id : Number(food.id)
                              const numericEntryId = Number.isFinite(entryIdRaw) ? entryIdRaw : null
                              const canAdjustServings = isViewingToday && numericEntryId !== null
                              const canDecrement = servingsCount - 0.25 >= 0.25

                              return (
                                <div key={`${food.id}-item-${itemIndex}`} className="rounded-xl border border-gray-100 bg-white p-3 sm:p-4 shadow-sm">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900 truncate">
                                        {item?.name || 'Food item'}
                                        {item?.brand && <span className="text-gray-500 text-xs ml-1">({item.brand})</span>}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-1">
                                        {item?.serving_size ? `Serving size: ${item.serving_size}` : 'Serving size not provided'}
                                      </div>
                                      {perServingDetails.length > 0 && (
                                        <div className="mt-2 text-xs text-gray-600">
                                          <span className="font-medium text-gray-700">Per serving:</span>{' '}
                                          {perServingDetails.join(' • ')}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Servings</span>
                                      {canAdjustServings ? (
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => {
                                              if (canDecrement && numericEntryId !== null) {
                                                handleEntryItemServingsChange(numericEntryId, itemIndex, servingsCount - 0.25)
                                              }
                                            }}
                                            disabled={!canDecrement}
                                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-700 font-semibold transition-colors ${
                                              canDecrement ? 'bg-white border border-gray-200 hover:bg-gray-100' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                            }`}
                                          >
                                            -
                                          </button>
                                          <span className="text-sm font-semibold text-gray-900 w-14 text-center">
                                            {formatServingsDisplay(servingsCount)}
                                          </span>
                                          <button
                                            onClick={() => {
                                              if (numericEntryId !== null) {
                                                handleEntryItemServingsChange(numericEntryId, itemIndex, servingsCount + 0.25)
                                              }
                                            }}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-700 font-semibold transition-colors bg-white border border-gray-200 hover:bg-gray-100"
                                          >
                                            +
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-sm font-semibold text-gray-900">{formatServingsDisplay(servingsCount)}</span>
                                      )}
                                    </div>
                                  </div>

                                  {totalDetails.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                                      <span className="font-medium text-gray-700">Totals for {servingsLabel}:</span>
                                      {totalDetails.map((detail, detailIdx) => (
                                        <span key={detailIdx}>{detail}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
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

      {/* Credit Purchase Modal */}
      <CreditPurchaseModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        creditInfo={creditInfo}
      />

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
              <Cog6ToothIcon className="w-6 h-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/settings' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Settings</span>
          </Link>
        </div>
      </nav>
      </div>
    </div>
  )
} 