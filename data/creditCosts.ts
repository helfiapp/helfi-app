export const CREDIT_DISPLAY = {
  foodAnalysis: 15,
  symptomAnalysis: 6,
  medicalImageAnalysis: 8,
  insightsGeneration: 8,
  chatLight: 2,
};

export const creditDisplayList = [
  { label: 'Food photo analysis', key: 'foodAnalysis', credits: CREDIT_DISPLAY.foodAnalysis },
  { label: 'Symptom analysis', key: 'symptomAnalysis', credits: CREDIT_DISPLAY.symptomAnalysis },
  { label: 'Medical image analysis', key: 'medicalImageAnalysis', credits: CREDIT_DISPLAY.medicalImageAnalysis },
  { label: 'Insights generation', key: 'insightsGeneration', credits: CREDIT_DISPLAY.insightsGeneration },
  { label: 'Light chat (e.g., symptoms chat)', key: 'chatLight', credits: CREDIT_DISPLAY.chatLight },
];
