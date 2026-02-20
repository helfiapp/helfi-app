import { AI_MEAL_RECOMMENDATION_CREDITS } from '@/lib/ai-meal-recommendation'
import { RECIPE_IMPORT_PHOTO_CREDITS, RECIPE_IMPORT_URL_CREDITS } from '@/lib/recipe-import-pricing'

export const CREDIT_DISPLAY = {
  foodAnalysis: 10,
  symptomAnalysis: 6,
  medicalImageAnalysis: 8,
  insightsGeneration: 8,
  chatLight: 10,
  aiMealRecommendation: AI_MEAL_RECOMMENDATION_CREDITS,
  recipeImportUrl: RECIPE_IMPORT_URL_CREDITS,
  recipeImportPhoto: RECIPE_IMPORT_PHOTO_CREDITS,
}

export const usageDisplayList = [
  { label: 'Food photo analysis', key: 'foodAnalysis', credits: CREDIT_DISPLAY.foodAnalysis },
  { label: 'Symptom analysis', key: 'symptomAnalysis', credits: CREDIT_DISPLAY.symptomAnalysis },
  { label: 'Medical image analysis', key: 'medicalImageAnalysis', credits: CREDIT_DISPLAY.medicalImageAnalysis },
  { label: 'Insights generation', key: 'insightsGeneration', credits: CREDIT_DISPLAY.insightsGeneration },
  { label: 'Talk to Helfi chat', key: 'chatLight', credits: CREDIT_DISPLAY.chatLight },
]

export const creditCostDisplayList = [
  ...usageDisplayList,
  { label: 'AI recommended meal', key: 'aiMealRecommendation', credits: CREDIT_DISPLAY.aiMealRecommendation },
  { label: 'Recipe import (URL)', key: 'recipeImportUrl', credits: CREDIT_DISPLAY.recipeImportUrl },
  { label: 'Recipe import (photo)', key: 'recipeImportPhoto', credits: CREDIT_DISPLAY.recipeImportPhoto },
]
