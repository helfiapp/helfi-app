export const CREDIT_DISPLAY = {
  foodAnalysis: 10,
  symptomAnalysis: 6,
  medicalImageAnalysis: 8,
  insightsGeneration: 8,
  chatLight: 10,
};

export const creditDisplayList = [
  { label: 'Food photo analysis', key: 'foodAnalysis', credits: CREDIT_DISPLAY.foodAnalysis },
  { label: 'Symptom analysis', key: 'symptomAnalysis', credits: CREDIT_DISPLAY.symptomAnalysis },
  { label: 'Medical image analysis', key: 'medicalImageAnalysis', credits: CREDIT_DISPLAY.medicalImageAnalysis },
  { label: 'Insights generation', key: 'insightsGeneration', credits: CREDIT_DISPLAY.insightsGeneration },
  { label: 'Talk to Helfi chat', key: 'chatLight', credits: CREDIT_DISPLAY.chatLight },
];
