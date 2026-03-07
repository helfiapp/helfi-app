import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'

import { API_BASE_URL } from '../config'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type CategoryNode = {
  id: string
  name: string
  slug: string
  synonyms?: string[]
  children?: CategoryNode[]
}

type SearchResult = {
  id: string
  displayName: string
  slug: string
  categoryName: string | null
  subcategoryName: string | null
  description: string | null
  phone: string | null
  websiteUrl: string | null
  emailPublic: string | null
  addressLine1: string | null
  suburbCity: string | null
  stateRegion: string | null
  country: string | null
  lat: number | null
  lng: number | null
  serviceType: string
  distanceKm: number | null
  isBoosted: boolean
  isTopBoost: boolean
  trackingToken?: string | null
}

type LocationResult = {
  lat: number
  lng: number
  displayName: string
  city?: string
  state?: string
  country?: string
  postcode?: string
}

type CategoryMatch = {
  id: string
  label: string
  categoryId: string
  subcategoryId?: string
  parentLabel?: string
}

type QuickAccess = {
  label: string
  category: string
  subcategory?: string
  icon: React.ComponentProps<typeof Feather>['name']
}

type SymptomHint = {
  terms: string[]
  category: string
  subcategory?: string
}

type PickerChoice = {
  label: string
  value: string
}

const PRACTITIONER_LOCATION_KEY = 'helfi:practitionerLocation'
const PRACTITIONER_SEARCH_STATE_KEY = 'helfi:practitionerSearchState'

const QUICK_ACCESS: QuickAccess[] = [
  { label: 'Chiropractic', category: 'Allied Health', subcategory: 'Chiropractor', icon: 'activity' },
  { label: 'Mental Health', category: 'Mental Health', icon: 'heart' },
  { label: 'Dental Care', category: 'Dental & Oral Health', subcategory: 'Dentist', icon: 'smile' },
  { label: 'Cardiology', category: 'GPs & Doctors', subcategory: 'Cardiologist', icon: 'heart' },
  { label: 'Pediatrics', category: 'GPs & Doctors', subcategory: 'Paediatrician', icon: 'user' },
  { label: 'Physiotherapy', category: 'Allied Health', subcategory: 'Physiotherapist', icon: 'zap' },
  { label: 'Dermatology', category: 'GPs & Doctors', subcategory: 'Dermatologist', icon: 'shield' },
  { label: 'Optometry', category: 'Eye & Hearing', subcategory: 'Optometrist', icon: 'eye' },
  { label: 'Podiatry', category: 'Allied Health', subcategory: 'Podiatrist', icon: 'navigation' },
  { label: 'Nutritionist', category: 'Nutrition & Metabolic Health', subcategory: 'Clinical Nutritionist', icon: 'coffee' },
  { label: 'Acupuncture', category: 'Holistic & Integrative', subcategory: 'Acupuncturist', icon: 'plus-circle' },
  { label: 'Occupational Therapy', category: 'Allied Health', subcategory: 'Occupational Therapist (OT)', icon: 'briefcase' },
  { label: 'Speech Pathology', category: 'Allied Health', subcategory: 'Speech Pathologist', icon: 'mic' },
  { label: 'ENT Specialist', category: 'GPs & Doctors', subcategory: 'ENT Specialist', icon: 'headphones' },
  { label: 'Orthopedics', category: 'Musculoskeletal & Pain', icon: 'activity' },
  { label: 'Psychology', category: 'Mental Health', subcategory: 'Psychologist', icon: 'book-open' },
  { label: 'General Practitioner', category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)', icon: 'plus-square' },
  { label: 'Urology', category: 'GPs & Doctors', subcategory: 'Urologist', icon: 'droplet' },
]

const SYMPTOM_HINTS: SymptomHint[] = [
  { terms: ['checkup', 'check up', 'general health', 'medical certificate'], category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)' },
  { terms: ['fever', 'flu', 'cold', 'sore throat', 'infection', 'uti'], category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)' },
  { terms: ['family doctor', 'family gp'], category: 'GPs & Doctors', subcategory: 'Family Doctor' },
  { terms: ['telehealth', 'online doctor', 'video consult'], category: 'GPs & Doctors', subcategory: 'Telehealth GP' },
  { terms: ['sports doctor', 'sports injury'], category: 'GPs & Doctors', subcategory: 'Sports Doctor' },
  { terms: ['work injury', 'work cover', 'occupational health'], category: 'GPs & Doctors', subcategory: 'Occupational Physician' },
  { terms: ['skin', 'rash', 'eczema', 'psoriasis', 'acne', 'mole', 'skin cancer'], category: 'GPs & Doctors', subcategory: 'Dermatologist' },
  { terms: ['heart', 'chest pain', 'palpitations', 'high blood pressure', 'cholesterol'], category: 'GPs & Doctors', subcategory: 'Cardiologist' },
  { terms: ['thyroid', 'hormone', 'endocrine', 'pcos'], category: 'GPs & Doctors', subcategory: 'Endocrinologist' },
  { terms: ['gut', 'ibs', 'reflux', 'heartburn', 'bloating', 'constipation', 'diarrhea', 'stomach pain'], category: 'GPs & Doctors', subcategory: 'Gastroenterologist' },
  { terms: ['migraine', 'headache', 'seizure', 'numbness', 'tingling', 'dizziness', 'vertigo'], category: 'GPs & Doctors', subcategory: 'Neurologist' },
  { terms: ['arthritis', 'joint pain', 'autoimmune', 'lupus'], category: 'GPs & Doctors', subcategory: 'Rheumatologist' },
  { terms: ['allergy', 'hay fever', 'hives', 'food allergy'], category: 'GPs & Doctors', subcategory: 'Immunologist / Allergist' },
  { terms: ['asthma', 'shortness of breath', 'lung', 'cough'], category: 'GPs & Doctors', subcategory: 'Respiratory Physician / Pulmonologist' },
  { terms: ['urinary', 'prostate', 'kidney stones'], category: 'GPs & Doctors', subcategory: 'Urologist' },
  { terms: ['ear infection', 'sinus', 'tonsillitis', 'hearing loss'], category: 'GPs & Doctors', subcategory: 'ENT Specialist' },
  { terms: ['eye pain', 'vision loss', 'glaucoma', 'cataract'], category: 'GPs & Doctors', subcategory: 'Ophthalmologist' },
  { terms: ['child health', 'baby', 'kids doctor'], category: 'GPs & Doctors', subcategory: 'Paediatrician' },
  { terms: ['elderly', 'aging', 'memory'], category: 'GPs & Doctors', subcategory: 'Geriatrician' },
  { terms: ['chronic pain', 'nerve pain'], category: 'GPs & Doctors', subcategory: 'Pain Specialist' },
  { terms: ['sleep apnea', 'snoring', 'insomnia'], category: 'GPs & Doctors', subcategory: 'Sleep Physician' },
  { terms: ['infectious disease', 'travel disease', 'hiv'], category: 'GPs & Doctors', subcategory: 'Infectious Disease Physician' },

  { terms: ['physio', 'rehab', 'sprain', 'strain', 'mobility', 'leg injury', 'knee injury', 'ankle sprain', 'hamstring strain', 'calf strain', 'shin splints', 'sore leg', 'leg pain', 'calf pain', 'hamstring pain', 'quad pain', 'shin pain', 'sore back', 'lower back pain', 'upper back pain'], category: 'Allied Health', subcategory: 'Physiotherapist' },
  { terms: ['back pain', 'sore back', 'backache', 'lower back pain', 'upper back pain', 'neck pain', 'stiff neck', 'spine', 'alignment', 'chiro'], category: 'Allied Health', subcategory: 'Chiropractor' },
  { terms: ['osteopath', 'joint pain', 'posture', 'sore back', 'back pain', 'backache', 'hip pain', 'sore leg', 'leg pain'], category: 'Allied Health', subcategory: 'Osteopath' },
  { terms: ['exercise', 'fitness rehab', 'chronic disease exercise'], category: 'Allied Health', subcategory: 'Exercise Physiologist' },
  { terms: ['foot pain', 'heel pain', 'plantar fasciitis', 'ingrown toenail'], category: 'Allied Health', subcategory: 'Podiatrist' },
  { terms: ['occupational therapy', 'daily living'], category: 'Allied Health', subcategory: 'Occupational Therapist (OT)' },
  { terms: ['speech', 'stutter', 'swallowing', 'voice'], category: 'Allied Health', subcategory: 'Speech Pathologist' },
  { terms: ['hearing test', 'tinnitus', 'hearing loss'], category: 'Allied Health', subcategory: 'Audiologist' },
  { terms: ['diet', 'nutrition plan', 'weight loss diet'], category: 'Allied Health', subcategory: 'Dietitian' },
  { terms: ['nutritionist', 'supplements', 'food plan'], category: 'Allied Health', subcategory: 'Clinical Nutritionist' },
  { terms: ['diabetes education', 'blood sugar'], category: 'Allied Health', subcategory: 'Diabetes Educator' },
  { terms: ['myotherapy', 'trigger points', 'muscle pain'], category: 'Allied Health', subcategory: 'Myotherapist' },
  { terms: ['remedial massage', 'tight muscles'], category: 'Allied Health', subcategory: 'Remedial Massage Therapist' },
  { terms: ['bowen therapy', 'bowen'], category: 'Allied Health', subcategory: 'Bowen Therapist' },
  { terms: ['lymphatic', 'swelling'], category: 'Allied Health', subcategory: 'Lymphatic Drainage Therapist' },
  { terms: ['hand pain', 'wrist pain', 'carpal tunnel'], category: 'Allied Health', subcategory: 'Hand Therapist' },

  { terms: ['anxiety', 'depression', 'stress', 'panic'], category: 'Mental Health', subcategory: 'Psychologist' },
  { terms: ['trauma', 'ptsd'], category: 'Mental Health', subcategory: 'Clinical Psychologist' },
  { terms: ['bipolar', 'adhd', 'medication'], category: 'Mental Health', subcategory: 'Psychiatrist' },
  { terms: ['grief', 'counselling'], category: 'Mental Health', subcategory: 'Counsellor' },
  { terms: ['therapy', 'talk therapy'], category: 'Mental Health', subcategory: 'Psychotherapist' },
  { terms: ['family conflict', 'parenting'], category: 'Mental Health', subcategory: 'Family Therapist' },
  { terms: ['relationship', 'couples'], category: 'Mental Health', subcategory: 'Couples Therapist' },
  { terms: ['addiction', 'substance'], category: 'Mental Health', subcategory: 'Addiction Counsellor' },

  { terms: ['low testosterone', 'testosterone', 'low libido', 'erectile dysfunction'], category: "Men's Health", subcategory: 'Hormone / Testosterone Clinic' },
  { terms: ['mens health', 'male health'], category: "Men's Health", subcategory: "Men's Health GP" },
  { terms: ['urology', 'prostate'], category: "Men's Health", subcategory: 'Urologist' },

  { terms: ['muscle pain', 'back pain', 'sore back', 'backache', 'neck pain', 'stiff neck', 'sciatica'], category: 'Musculoskeletal & Pain', subcategory: 'Spinal / Back Pain Clinic' },
  { terms: ['sports physio', 'sports injury rehab', 'sports injury', 'running injury', 'gym injury', 'sore leg', 'leg pain', 'back pain', 'sore back'], category: 'Musculoskeletal & Pain', subcategory: 'Sports Physiotherapy' },
  { terms: ['pain specialist', 'chronic pain clinic'], category: 'Musculoskeletal & Pain', subcategory: 'Pain Specialist' },
  { terms: ['myotherapy', 'muscle release'], category: 'Musculoskeletal & Pain', subcategory: 'Myotherapy' },
  { terms: ['remedial massage', 'massage therapy'], category: 'Musculoskeletal & Pain', subcategory: 'Remedial Massage' },
  { terms: ['acupuncture', 'dry needling'], category: 'Musculoskeletal & Pain', subcategory: 'Dry Needling Practitioner' },
  { terms: ['sports podiatry', 'running injury'], category: 'Musculoskeletal & Pain', subcategory: 'Podiatry (sports)' },

  { terms: ['ndis', 'disability', 'support'], category: 'Rehab & Disability Support', subcategory: 'Disability Support Provider' },
  { terms: ['rehab', 'rehabilitation'], category: 'Rehab & Disability Support', subcategory: 'Rehabilitation Physician' },
  { terms: ['home care', 'daily support'], category: 'Rehab & Disability Support', subcategory: 'Home Care Provider' },

  { terms: ['toothache', 'tooth pain', 'dental'], category: 'Dental & Oral Health', subcategory: 'Dentist' },
  { terms: ['braces', 'alignment'], category: 'Dental & Oral Health', subcategory: 'Orthodontist' },
  { terms: ['gum disease', 'bleeding gums'], category: 'Dental & Oral Health', subcategory: 'Periodontist' },
  { terms: ['oral surgery', 'wisdom tooth'], category: 'Dental & Oral Health', subcategory: 'Oral Surgeon' },

  { terms: ['vision test', 'blurred vision', 'eye exam'], category: 'Eye & Hearing', subcategory: 'Optometrist' },
  { terms: ['eye specialist', 'cataract'], category: 'Eye & Hearing', subcategory: 'Ophthalmologist' },
  { terms: ['hearing test', 'hearing aid'], category: 'Eye & Hearing', subcategory: 'Hearing Clinic' },

  { terms: ['weight loss', 'weight management', 'obesity'], category: 'Nutrition & Metabolic Health', subcategory: 'Weight Management Clinic' },
  { terms: ['eating disorder', 'disordered eating'], category: 'Nutrition & Metabolic Health', subcategory: 'Eating Disorder Dietitian' },
  { terms: ['nutrition', 'dietitian'], category: 'Nutrition & Metabolic Health', subcategory: 'Dietitian' },
  { terms: ['diabetes', 'metabolic'], category: 'Nutrition & Metabolic Health', subcategory: 'Diabetes Educator' },

  { terms: ['naturopath', 'natural medicine'], category: 'Holistic & Integrative', subcategory: 'Naturopath' },
  { terms: ['herbal', 'herbalist'], category: 'Holistic & Integrative', subcategory: 'Herbalist' },
  { terms: ['tcm', 'traditional chinese medicine'], category: 'Holistic & Integrative', subcategory: 'Traditional Chinese Medicine (TCM) Practitioner' },
  { terms: ['acupuncture'], category: 'Holistic & Integrative', subcategory: 'Acupuncturist' },
  { terms: ['ayurveda'], category: 'Holistic & Integrative', subcategory: 'Ayurveda Practitioner' },
  { terms: ['functional medicine'], category: 'Holistic & Integrative', subcategory: 'Functional Medicine Practitioner' },
  { terms: ['integrative gp'], category: 'Holistic & Integrative', subcategory: 'Integrative GP/Doctor' },
  { terms: ['kinesiology', 'kinesiologist'], category: 'Holistic & Integrative', subcategory: 'Kinesiologist' },
  { terms: ['breathwork'], category: 'Holistic & Integrative', subcategory: 'Breathwork Facilitator' },
  { terms: ['meditation'], category: 'Holistic & Integrative', subcategory: 'Meditation Teacher' },
  { terms: ['yoga therapy', 'yoga'], category: 'Holistic & Integrative', subcategory: 'Yoga Therapist' },

  { terms: ['blood test', 'pathology', 'lab test'], category: 'Diagnostics & Testing', subcategory: 'Pathology / Lab Testing' },
  { terms: ['x-ray', 'mri', 'ct', 'ultrasound'], category: 'Diagnostics & Testing', subcategory: 'Imaging / Radiology (X-ray, CT, MRI, Ultrasound)' },
  { terms: ['sleep study'], category: 'Diagnostics & Testing', subcategory: 'Sleep Study Clinic' },
  { terms: ['ecg', 'holter', 'heart test'], category: 'Diagnostics & Testing', subcategory: 'Cardiac Testing (ECG/Holter) Clinic' },

  { terms: ['pharmacy', 'medication'], category: 'Pharmacy & Medication Support', subcategory: 'Pharmacy' },
  { terms: ['compounding'], category: 'Pharmacy & Medication Support', subcategory: 'Compounding Pharmacy' },
  { terms: ['medication review'], category: 'Pharmacy & Medication Support', subcategory: 'Medication Review Pharmacist' },

  { terms: ['aged care', 'home nursing', 'nursing'], category: 'Aged Care & Home Care', subcategory: 'Home Nursing' },
  { terms: ['mobile physio', 'home physio'], category: 'Aged Care & Home Care', subcategory: 'Mobile Physio' },
  { terms: ['mobile podiatry', 'home podiatry'], category: 'Aged Care & Home Care', subcategory: 'Mobile Podiatry' },

  { terms: ['always tired', 'fatigue', 'low energy', 'feeling unwell', 'general illness'], category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)' },
  { terms: ['womens health', 'women health', 'period pain', 'heavy periods', 'menstrual pain'], category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)' },
  { terms: ['sexual health', 'sti test', 'std test', 'contraception'], category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)' },
  { terms: ['heart flutter', 'irregular heartbeat', 'atrial fibrillation', 'afib'], category: 'GPs & Doctors', subcategory: 'Cardiologist' },
  { terms: ['insulin resistance', 'metabolic syndrome', 'hormone imbalance', 'menopause symptoms'], category: 'GPs & Doctors', subcategory: 'Endocrinologist' },
  { terms: ['nausea', 'vomiting', 'stomach cramps', 'abdominal pain'], category: 'GPs & Doctors', subcategory: 'Gastroenterologist' },
  { terms: ['brain fog', 'memory loss', 'tremor', 'nerve symptoms', 'neuropathy'], category: 'GPs & Doctors', subcategory: 'Neurologist' },
  { terms: ['joint swelling', 'morning stiffness', 'inflammatory arthritis'], category: 'GPs & Doctors', subcategory: 'Rheumatologist' },
  { terms: ['anaphylaxis', 'allergy testing', 'immune issues'], category: 'GPs & Doctors', subcategory: 'Immunologist / Allergist' },
  { terms: ['wheezing', 'breathing problems', 'chronic cough'], category: 'GPs & Doctors', subcategory: 'Respiratory Physician / Pulmonologist' },
  { terms: ['bladder pain', 'frequent urination', 'urine issues'], category: 'GPs & Doctors', subcategory: 'Urologist' },
  { terms: ['blocked ears', 'sinus headache', 'sinus pressure'], category: 'GPs & Doctors', subcategory: 'ENT Specialist' },
  { terms: ['eye floaters', 'sudden vision changes', 'eye pressure'], category: 'GPs & Doctors', subcategory: 'Ophthalmologist' },
  { terms: ['child fever', 'baby rash', 'kids cough'], category: 'GPs & Doctors', subcategory: 'Paediatrician' },
  { terms: ['daytime sleepiness', 'wake up tired', 'poor sleep quality'], category: 'GPs & Doctors', subcategory: 'Sleep Physician' },

  { terms: ['shoulder pain', 'frozen shoulder', 'rotator cuff', 'acl injury', 'meniscus injury'], category: 'Allied Health', subcategory: 'Physiotherapist' },
  { terms: ['stiff back', 'stiff neck', 'spinal adjustment', 'posture correction'], category: 'Allied Health', subcategory: 'Chiropractor' },
  { terms: ['pelvic pain', 'posture imbalance', 'whole body pain'], category: 'Allied Health', subcategory: 'Osteopath' },
  { terms: ['injury prevention', 'return to exercise', 'exercise plan'], category: 'Allied Health', subcategory: 'Exercise Physiologist' },
  { terms: ['bunion pain', 'achilles pain', 'flat feet', 'foot posture'], category: 'Allied Health', subcategory: 'Podiatrist' },
  { terms: ['daily tasks', 'fine motor skills', 'hand function'], category: 'Allied Health', subcategory: 'Occupational Therapist (OT)' },
  { terms: ['speech delay', 'lisp', 'language delay', 'aphasia'], category: 'Allied Health', subcategory: 'Speech Pathologist' },
  { terms: ['ringing ears', 'muffled hearing', 'hearing assessment'], category: 'Allied Health', subcategory: 'Audiologist' },
  { terms: ['meal plan', 'cholesterol diet', 'gut diet', 'low fodmap'], category: 'Allied Health', subcategory: 'Dietitian' },
  { terms: ['supplement advice', 'natural nutrition', 'micronutrient support'], category: 'Allied Health', subcategory: 'Clinical Nutritionist' },
  { terms: ['glucose monitoring', 'insulin education', 'diabetes management'], category: 'Allied Health', subcategory: 'Diabetes Educator' },
  { terms: ['muscle knots', 'trigger point release', 'myofascial pain'], category: 'Allied Health', subcategory: 'Myotherapist' },
  { terms: ['deep tissue massage', 'tight muscles', 'muscle recovery'], category: 'Allied Health', subcategory: 'Remedial Massage Therapist' },
  { terms: ['lymphedema', 'fluid retention', 'post surgery swelling'], category: 'Allied Health', subcategory: 'Lymphatic Drainage Therapist' },
  { terms: ['carpal tunnel', 'tennis elbow', 'thumb pain'], category: 'Allied Health', subcategory: 'Hand Therapist' },

  { terms: ['anxiety attacks', 'social anxiety', 'overthinking', 'panic attacks'], category: 'Mental Health', subcategory: 'Psychologist' },
  { terms: ['trauma therapy', 'complex trauma', 'childhood trauma'], category: 'Mental Health', subcategory: 'Clinical Psychologist' },
  { terms: ['adhd assessment', 'psychiatric review', 'mood medication'], category: 'Mental Health', subcategory: 'Psychiatrist' },
  { terms: ['burnout', 'work stress', 'life stress', 'grief support'], category: 'Mental Health', subcategory: 'Counsellor' },
  { terms: ['talk counselling', 'psychotherapy', 'emotional support'], category: 'Mental Health', subcategory: 'Psychotherapist' },
  { terms: ['family counselling', 'parenting conflict', 'family relationship'], category: 'Mental Health', subcategory: 'Family Therapist' },
  { terms: ['marriage counselling', 'relationship counselling', 'couples counselling'], category: 'Mental Health', subcategory: 'Couples Therapist' },
  { terms: ['alcohol dependence', 'drug dependence', 'substance abuse help'], category: 'Mental Health', subcategory: 'Addiction Counsellor' },

  { terms: ['ed treatment', 'erection issues', 'libido issues', 'hormone therapy for men'], category: "Men's Health", subcategory: 'Hormone / Testosterone Clinic' },
  { terms: ['mens checkup', 'male wellness', 'prostate check'], category: "Men's Health", subcategory: "Men's Health GP" },
  { terms: ['testicular pain', 'urinary flow issues', 'bladder leakage'], category: "Men's Health", subcategory: 'Urologist' },

  { terms: ['slipped disc', 'herniated disc', 'sciatica pain', 'chronic back pain'], category: 'Musculoskeletal & Pain', subcategory: 'Spinal / Back Pain Clinic' },
  { terms: ['acl rehab', 'runner injury', 'sport recovery', 'sports rehab'], category: 'Musculoskeletal & Pain', subcategory: 'Sports Physiotherapy' },
  { terms: ['persistent pain', 'nerve pain treatment', 'pain clinic'], category: 'Musculoskeletal & Pain', subcategory: 'Pain Specialist' },
  { terms: ['muscle release', 'myofascial release'], category: 'Musculoskeletal & Pain', subcategory: 'Myotherapy' },
  { terms: ['remedial bodywork', 'therapeutic massage'], category: 'Musculoskeletal & Pain', subcategory: 'Remedial Massage' },
  { terms: ['needling therapy', 'trigger point needling'], category: 'Musculoskeletal & Pain', subcategory: 'Dry Needling Practitioner' },
  { terms: ['runner knee', 'sport foot pain'], category: 'Musculoskeletal & Pain', subcategory: 'Podiatry (sports)' },

  { terms: ['ndis support worker', 'disability care', 'support coordination'], category: 'Rehab & Disability Support', subcategory: 'Disability Support Provider' },
  { terms: ['stroke rehabilitation', 'injury rehabilitation doctor'], category: 'Rehab & Disability Support', subcategory: 'Rehabilitation Physician' },
  { terms: ['in home care', 'daily home support', 'at home assistance'], category: 'Rehab & Disability Support', subcategory: 'Home Care Provider' },

  { terms: ['obesity support', 'weight clinic', 'lose weight safely'], category: 'Nutrition & Metabolic Health', subcategory: 'Weight Management Clinic' },
  { terms: ['binge eating', 'anorexia support', 'bulimia support'], category: 'Nutrition & Metabolic Health', subcategory: 'Eating Disorder Dietitian' },
  { terms: ['diet planning', 'ibs diet support', 'cholesterol nutrition'], category: 'Nutrition & Metabolic Health', subcategory: 'Dietitian' },
  { terms: ['cgm support', 'blood sugar education'], category: 'Nutrition & Metabolic Health', subcategory: 'Diabetes Educator' },

  { terms: ['natural therapy', 'holistic health plan'], category: 'Holistic & Integrative', subcategory: 'Naturopath' },
  { terms: ['herbal medicine', 'plant medicine'], category: 'Holistic & Integrative', subcategory: 'Herbalist' },
  { terms: ['tcm clinic', 'qi balance'], category: 'Holistic & Integrative', subcategory: 'Traditional Chinese Medicine (TCM) Practitioner' },
  { terms: ['fertility acupuncture', 'acupuncture for pain'], category: 'Holistic & Integrative', subcategory: 'Acupuncturist' },
  { terms: ['ayurvedic consultation', 'dosha balance'], category: 'Holistic & Integrative', subcategory: 'Ayurveda Practitioner' },
  { terms: ['root cause medicine', 'functional health'], category: 'Holistic & Integrative', subcategory: 'Functional Medicine Practitioner' },
  { terms: ['holistic gp', 'integrative doctor'], category: 'Holistic & Integrative', subcategory: 'Integrative GP/Doctor' },
  { terms: ['kinesiology therapy', 'energy balance'], category: 'Holistic & Integrative', subcategory: 'Kinesiologist' },
  { terms: ['breathing exercises', 'nervous system reset'], category: 'Holistic & Integrative', subcategory: 'Breathwork Facilitator' },
  { terms: ['mindfulness teacher', 'meditation coaching'], category: 'Holistic & Integrative', subcategory: 'Meditation Teacher' },
  { terms: ['yoga for pain', 'therapeutic yoga'], category: 'Holistic & Integrative', subcategory: 'Yoga Therapist' },

  { terms: ['cavity', 'tooth sensitivity', 'broken tooth', 'dental checkup'], category: 'Dental & Oral Health', subcategory: 'Dentist' },
  { terms: ['braces consult', 'invisalign', 'bite correction'], category: 'Dental & Oral Health', subcategory: 'Orthodontist' },
  { terms: ['gum recession', 'gum infection', 'periodontal disease'], category: 'Dental & Oral Health', subcategory: 'Periodontist' },
  { terms: ['impacted wisdom tooth', 'jaw surgery'], category: 'Dental & Oral Health', subcategory: 'Oral Surgeon' },

  { terms: ['dry eyes', 'eye strain', 'glasses check'], category: 'Eye & Hearing', subcategory: 'Optometrist' },
  { terms: ['retina specialist', 'glaucoma treatment', 'cataract surgery'], category: 'Eye & Hearing', subcategory: 'Ophthalmologist' },
  { terms: ['hearing aid fitting', 'hearing screening'], category: 'Eye & Hearing', subcategory: 'Hearing Clinic' },

  { terms: ['blood work', 'lab work', 'health screening blood test'], category: 'Diagnostics & Testing', subcategory: 'Pathology / Lab Testing' },
  { terms: ['ct scan', 'mri scan', 'ultrasound scan', 'xray'], category: 'Diagnostics & Testing', subcategory: 'Imaging / Radiology (X-ray, CT, MRI, Ultrasound)' },
  { terms: ['overnight sleep test', 'sleep lab'], category: 'Diagnostics & Testing', subcategory: 'Sleep Study Clinic' },
  { terms: ['heart monitor test', 'stress test', 'ecg clinic'], category: 'Diagnostics & Testing', subcategory: 'Cardiac Testing (ECG/Holter) Clinic' },

  { terms: ['pharmacist advice', 'medicine advice', 'medication side effects'], category: 'Pharmacy & Medication Support', subcategory: 'Pharmacy' },
  { terms: ['custom medication', 'tailored medication'], category: 'Pharmacy & Medication Support', subcategory: 'Compounding Pharmacy' },
  { terms: ['polypharmacy review', 'medication checkup'], category: 'Pharmacy & Medication Support', subcategory: 'Medication Review Pharmacist' },

  { terms: ['wound care at home', 'elderly nursing care'], category: 'Aged Care & Home Care', subcategory: 'Home Nursing' },
  { terms: ['falls prevention physio', 'senior physiotherapy'], category: 'Aged Care & Home Care', subcategory: 'Mobile Physio' },
  { terms: ['seniors foot care', 'home podiatry for elderly'], category: 'Aged Care & Home Care', subcategory: 'Mobile Podiatry' },
]

function normalize(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function isValidEmail(value: string | null | undefined) {
  if (!value) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function buildAddress(item: SearchResult) {
  return [item.addressLine1, item.suburbCity, item.stateRegion, item.country].filter(Boolean).join(', ')
}

function Tile({
  active,
  label,
  onPress,
}: {
  active?: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? '#9FD6A1' : theme.colors.border,
        backgroundColor: active ? '#EAF8EA' : theme.colors.card,
        paddingVertical: 8,
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          color: active ? '#2E7D32' : theme.colors.muted,
          fontSize: 12,
          fontWeight: '800',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function PickerField({
  label,
  value,
  placeholder,
  disabled,
  onPress,
}: {
  label: string
  value?: string
  placeholder: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <View>
      <Text style={{ fontSize: 11, fontWeight: '900', color: '#9AA8BF', marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: disabled ? '#F8FAFC' : '#FFFFFF',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: value ? theme.colors.text : '#94A3B8',
            fontSize: 14,
            fontWeight: value ? '700' : '600',
            flex: 1,
            marginRight: 8,
          }}
        >
          {value || placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color="#7C8596" />
      </Pressable>
    </View>
  )
}

export function PractitionerDirectoryScreen({ navigation, route }: { navigation: any; route: any }) {
  const [quickAccessOpen, setQuickAccessOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'category' | 'subcategory' | 'radius' | null>(null)
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [query, setQuery] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null)
  const [radiusKm, setRadiusKm] = useState(10)
  const [telehealthOnly, setTelehealthOnly] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [locationLoading, setLocationLoading] = useState(false)
  const hydratedRef = useRef(false)

  const geoKey = useMemo(() => normalize(selectedLocation?.country), [selectedLocation?.country])
  const radiusOptions = [5, 10, 25, 50]
  const selectedCategory = useMemo(() => categories.find((cat) => cat.id === categoryId) || null, [categories, categoryId])
  const subcategories = useMemo(() => categories.find((cat) => cat.id === categoryId)?.children || [], [categories, categoryId])
  const selectedSubcategory = useMemo(() => subcategories.find((sub) => sub.id === subcategoryId) || null, [subcategories, subcategoryId])

  const pickerTitle = pickerMode === 'category' ? 'Practitioner' : pickerMode === 'subcategory' ? 'Subcategory' : pickerMode === 'radius' ? 'Radius' : ''
  const pickerChoices: PickerChoice[] = useMemo(() => {
    if (pickerMode === 'category') {
      return [{ label: 'All categories', value: '' }, ...categories.map((item) => ({ label: item.name, value: item.id }))]
    }
    if (pickerMode === 'subcategory') {
      return [{ label: 'Select a specialty', value: '' }, ...subcategories.map((item) => ({ label: item.name, value: item.id }))]
    }
    if (pickerMode === 'radius') {
      return radiusOptions.map((item) => ({ label: `${item} km`, value: String(item) }))
    }
    return []
  }, [categories, pickerMode, subcategories])

  const categoryMatches = useMemo(() => {
    const q = normalize(query)
    if (!q) return [] as CategoryMatch[]
    const matches: CategoryMatch[] = []

    categories.forEach((category) => {
      const categoryMatch =
        normalize(category.name).includes(q) ||
        (category.synonyms || []).some((synonym) => normalize(synonym).includes(q))

      if (categoryMatch) {
        matches.push({
          id: `cat-${category.id}`,
          label: category.name,
          categoryId: category.id,
        })
      }

      ;(category.children || []).forEach((child) => {
        const childMatch =
          normalize(child.name).includes(q) ||
          (child.synonyms || []).some((synonym) => normalize(synonym).includes(q))
        if (!childMatch) return
        matches.push({
          id: `sub-${child.id}`,
          label: child.name,
          categoryId: category.id,
          subcategoryId: child.id,
          parentLabel: category.name,
        })
      })
    })

    return matches.slice(0, 10)
  }, [categories, query])

  const symptomMatches = useMemo(() => {
    const q = normalize(query)
    if (!q || q.length < 3) return [] as CategoryMatch[]

    const matches: CategoryMatch[] = []
    const categoryLookup = new Map<string, CategoryNode>()
    categories.forEach((category) => {
      categoryLookup.set(normalize(category.name), category)
    })

    SYMPTOM_HINTS.forEach((hint) => {
      const matched = hint.terms.some((term) => {
        const normalizedTerm = normalize(term)
        return normalizedTerm.includes(q) || q.includes(normalizedTerm)
      })
      if (!matched) return
      const category = categoryLookup.get(normalize(hint.category))
      if (!category) return
      let matchedSubcategoryId: string | undefined
      let parentLabel: string | undefined
      if (hint.subcategory) {
        const child = (category.children || []).find((item) => normalize(item.name) === normalize(hint.subcategory))
        if (child) {
          matchedSubcategoryId = child.id
          parentLabel = category.name
        }
      }
      matches.push({
        id: `symptom-${category.id}-${matchedSubcategoryId || 'all'}`,
        label: hint.subcategory || category.name,
        categoryId: category.id,
        subcategoryId: matchedSubcategoryId,
        parentLabel,
      })
    })

    return matches
  }, [categories, query])

  const suggestedMatches = useMemo(() => {
    const merged: CategoryMatch[] = []
    const seen = new Set<string>()
    const add = (item: CategoryMatch) => {
      const key = `${item.categoryId}:${item.subcategoryId || ''}`
      if (seen.has(key)) return
      seen.add(key)
      merged.push(item)
    }
    categoryMatches.forEach(add)
    symptomMatches.forEach(add)
    return merged.slice(0, 10)
  }, [categoryMatches, symptomMatches])

  const persistLocation = async (value: LocationResult) => {
    try {
      await AsyncStorage.setItem(PRACTITIONER_LOCATION_KEY, JSON.stringify(value))
    } catch {
      // Non-blocking.
    }
  }

  const persistSearchState = async (payload: {
    categoryId: string
    subcategoryId: string
    query: string
    locationQuery: string
    selectedLocation: LocationResult | null
    radiusKm: number
    telehealthOnly: boolean
    results: SearchResult[]
  }) => {
    try {
      await AsyncStorage.setItem(PRACTITIONER_SEARCH_STATE_KEY, JSON.stringify(payload))
    } catch {
      // Non-blocking.
    }
  }

  const loadCategories = async () => {
    setCategoriesLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/practitioners/categories`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not load categories.')
      setCategories(Array.isArray(data?.categories) ? data.categories : [])
    } catch {
      setError('Could not load practitioner categories.')
    } finally {
      setCategoriesLoading(false)
    }
  }

  const trackClick = async (item: SearchResult, action: 'call' | 'website' | 'email') => {
    if (!item.id || !item.trackingToken) return
    try {
      await fetch(`${API_BASE_URL}/api/practitioners/contact-click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: item.id,
          action,
          token: item.trackingToken,
        }),
      })
    } catch {
      // Non-blocking.
    }
  }

  const runSearch = async (overrides?: {
    categoryId?: string
    subcategoryId?: string
    query?: string
    selectedLocation?: LocationResult | null
    radiusKm?: number
    telehealthOnly?: boolean
    locationQuery?: string
  }) => {
    const effectiveCategoryId = overrides?.categoryId ?? categoryId
    const effectiveSubcategoryId = overrides?.subcategoryId ?? subcategoryId
    const effectiveQuery = overrides?.query ?? query
    const effectiveSelectedLocation = overrides?.selectedLocation !== undefined ? overrides.selectedLocation : selectedLocation
    const effectiveRadiusKm = overrides?.radiusKm ?? radiusKm
    const effectiveTelehealth = overrides?.telehealthOnly ?? telehealthOnly
    const effectiveLocationQuery = overrides?.locationQuery ?? locationQuery

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (effectiveCategoryId) params.set('categoryId', effectiveCategoryId)
      if (effectiveSubcategoryId) params.set('subcategoryId', effectiveSubcategoryId)
      if (effectiveQuery.trim()) params.set('q', effectiveQuery.trim())
      if (effectiveSelectedLocation) {
        params.set('lat', String(effectiveSelectedLocation.lat))
        params.set('lng', String(effectiveSelectedLocation.lng))
      }
      params.set('radiusKm', String(effectiveRadiusKm))
      params.set('telehealth', effectiveTelehealth ? 'true' : 'false')
      const effectiveGeoKey = normalize(effectiveSelectedLocation?.country)
      if (effectiveGeoKey) params.set('geoKey', effectiveGeoKey)

      const res = await fetch(`${API_BASE_URL}/api/practitioners/search?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Search failed.')

      const nextResults: SearchResult[] = Array.isArray(data?.results) ? data.results : []
      setResults(nextResults)
      await persistSearchState({
        categoryId: effectiveCategoryId,
        subcategoryId: effectiveSubcategoryId,
        query: effectiveQuery,
        locationQuery: effectiveLocationQuery,
        selectedLocation: effectiveSelectedLocation,
        radiusKm: effectiveRadiusKm,
        telehealthOnly: effectiveTelehealth,
        results: nextResults,
      })
    } catch (err: any) {
      setError(err?.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleLocationSearch = async () => {
    if (!locationQuery.trim()) return
    setLocationLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/practitioners/geocode?q=${encodeURIComponent(locationQuery.trim())}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Location lookup failed.')

      const mapped: LocationResult[] = (Array.isArray(data?.results) ? data.results : []).map((item: any) => {
        const address = item?.address || {}
        return {
          lat: Number(item?.lat),
          lng: Number(item?.lon),
          displayName: String(item?.display_name || ''),
          city: String(address?.city || address?.town || address?.village || address?.suburb || ''),
          state: String(address?.state || ''),
          country: String(address?.country || ''),
          postcode: String(address?.postcode || ''),
        }
      })
      setLocationResults(mapped.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && !!item.displayName))
    } catch (err: any) {
      setError(err?.message || 'Location lookup failed.')
    } finally {
      setLocationLoading(false)
    }
  }

  const handleUseCurrentLocation = () => {
    const geo = (globalThis as any)?.navigator?.geolocation
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      Alert.alert('Location unavailable', 'Please enter your location manually for now.')
      return
    }

    geo.getCurrentPosition(
      async (position: any) => {
        const lat = Number(position?.coords?.latitude)
        const lng = Number(position?.coords?.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          Alert.alert('Location unavailable', 'Please enter your location manually for now.')
          return
        }

        try {
          const res = await fetch(`${API_BASE_URL}/api/practitioners/reverse-geocode?lat=${lat}&lng=${lng}`)
          const data = await res.json().catch(() => ({}))
          const address = data?.result?.address || {}
          const location: LocationResult = {
            lat,
            lng,
            displayName: String(data?.result?.display_name || 'Current location'),
            city: String(address?.city || address?.town || address?.village || address?.suburb || ''),
            state: String(address?.state || ''),
            country: String(address?.country || ''),
            postcode: String(address?.postcode || ''),
          }
          setSelectedLocation(location)
          setLocationQuery(location.displayName)
          setLocationResults([])
          await persistLocation(location)
        } catch {
          const fallback: LocationResult = { lat, lng, displayName: 'Current location' }
          setSelectedLocation(fallback)
          setLocationQuery(fallback.displayName)
          setLocationResults([])
          await persistLocation(fallback)
        }
      },
      () => Alert.alert('Location unavailable', 'Please enter your location manually for now.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    )
  }

  const applyCategoryMatch = async (match: CategoryMatch) => {
    setCategoryId(match.categoryId)
    setSubcategoryId(match.subcategoryId || '')
    setQuery('')
    await runSearch({
      categoryId: match.categoryId,
      subcategoryId: match.subcategoryId || '',
      query: '',
    })
  }

  const handleQuickAccess = async (item: QuickAccess) => {
    const category = categories.find((cat) => cat.name === item.category)
    if (!category) {
      setQuery(item.label)
      await runSearch({ query: item.label })
      return
    }
    const sub = (category.children || []).find((child) => child.name === item.subcategory)
    setCategoryId(category.id)
    setSubcategoryId(sub?.id || '')
    await runSearch({
      categoryId: category.id,
      subcategoryId: sub?.id || '',
    })
  }

  const openUrl = async (url: string) => {
    try {
      const ok = await Linking.canOpenURL(url)
      if (!ok) return
      await Linking.openURL(url)
    } catch {
      // Non-blocking.
    }
  }

  const openMapForResult = (item: SearchResult) => {
    if (item.lat != null && item.lng != null) {
      void openUrl(`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`)
      return
    }
    const address = buildAddress(item)
    if (!address) return
    void openUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
  }

  useEffect(() => {
    void loadCategories()
  }, [])

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    ;(async () => {
      try {
        const [savedLocationRaw, savedSearchRaw] = await Promise.all([
          AsyncStorage.getItem(PRACTITIONER_LOCATION_KEY),
          AsyncStorage.getItem(PRACTITIONER_SEARCH_STATE_KEY),
        ])

        if (savedLocationRaw) {
          const savedLocation = JSON.parse(savedLocationRaw)
          if (savedLocation && Number.isFinite(savedLocation.lat) && Number.isFinite(savedLocation.lng)) {
            setSelectedLocation(savedLocation)
            setLocationQuery(String(savedLocation.displayName || ''))
          }
        }

        if (savedSearchRaw) {
          const saved = JSON.parse(savedSearchRaw)
          setCategoryId(String(saved?.categoryId || ''))
          setSubcategoryId(String(saved?.subcategoryId || ''))
          setQuery(String(saved?.query || ''))
          setLocationQuery(String(saved?.locationQuery || ''))
          setSelectedLocation(saved?.selectedLocation || null)
          setRadiusKm(typeof saved?.radiusKm === 'number' ? saved.radiusKm : 10)
          setTelehealthOnly(Boolean(saved?.telehealthOnly))
          setResults(Array.isArray(saved?.results) ? saved.results : [])
        }
      } catch {
        // Ignore storage failures.
      }
    })()
  }, [])

  useEffect(() => {
    const params = route?.params || {}
    const nextCategoryId = String(params?.categoryId || '')
    const nextSubcategoryId = String(params?.subcategoryId || '')
    const nextQuery = String(params?.q || '')
    if (!nextCategoryId && !nextSubcategoryId && !nextQuery) return

    setCategoryId(nextCategoryId)
    setSubcategoryId(nextSubcategoryId)
    setQuery(nextQuery)
    setResults([])
    setError(null)
  }, [route?.params])

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text }}>
            Your health, simplified and within reach.
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Discover trusted healthcare practitioners. Search by name, location, or category to find the right care.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable
              onPress={() => navigation.navigate('PractitionerAZ')}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: theme.colors.card,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 12 }}>Browse Categories A-Z</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('ListYourPractice')}
              style={{
                borderRadius: theme.radius.md,
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: theme.colors.primary,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>List your practice</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            borderRadius: theme.radius.lg,
            padding: 14,
            gap: 12,
          }}
        >
          {categoriesLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={{ color: theme.colors.muted }}>Loading categories…</Text>
            </View>
          ) : null}

          <PickerField
            label="Practitioner"
            value={selectedCategory?.name || ''}
            placeholder="All categories"
            disabled={categoriesLoading}
            onPress={() => setPickerMode('category')}
          />

          <PickerField
            label="Subcategory"
            value={selectedSubcategory?.name || ''}
            placeholder="Select a specialty"
            disabled={categoriesLoading || !categoryId}
            onPress={() => setPickerMode('subcategory')}
          />

          <View>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#9AA8BF', marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Search
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Name, symptom, or category"
              autoCapitalize="none"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: 12,
                paddingVertical: 12,
                backgroundColor: '#FFFFFF',
                color: theme.colors.text,
                fontSize: 14,
                fontWeight: '600',
              }}
            />
          </View>

          {suggestedMatches.length > 0 && (
            <View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.muted, marginBottom: 6 }}>Suggested categories</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {suggestedMatches.map((match) => (
                  <Tile
                    key={match.id}
                    label={match.parentLabel ? `${match.label} · ${match.parentLabel}` : match.label}
                    onPress={() => {
                      void applyCategoryMatch(match)
                    }}
                  />
                ))}
              </View>
            </View>
          )}

          <View>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#9AA8BF', marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Location
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={locationQuery}
                onChangeText={setLocationQuery}
                placeholder="City or suburb"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  backgroundColor: '#FFFFFF',
                  color: theme.colors.text,
                  fontSize: 14,
                  fontWeight: '600',
                }}
              />
              <Pressable
                onPress={() => {
                  void handleLocationSearch()
                }}
                style={{
                  borderRadius: theme.radius.md,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#EAF8EA',
                  borderWidth: 1,
                  borderColor: '#9FD6A1',
                }}
              >
                {locationLoading ? (
                  <ActivityIndicator size="small" color="#2E7D32" />
                ) : (
                  <Text style={{ color: '#2E7D32', fontWeight: '900' }}>Find</Text>
                )}
              </Pressable>
            </View>
            {locationResults.length > 0 && (
              <View
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  backgroundColor: '#FFFFFF',
                }}
              >
                {locationResults.map((item) => (
                  <Pressable
                    key={`${item.displayName}-${item.lat}-${item.lng}`}
                    onPress={() => {
                      setSelectedLocation(item)
                      setLocationQuery(item.displayName)
                      setLocationResults([])
                      void persistLocation(item)
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: '#EEF3F2',
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 13 }}>{item.displayName}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Pressable onPress={handleUseCurrentLocation}>
              <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>Use my current location</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#9AA8BF', letterSpacing: 1.2, textTransform: 'uppercase' }}>Radius</Text>
              <Pressable
                onPress={() => setPickerMode('radius')}
                style={{
                  borderWidth: 1,
                  borderColor: '#D3DCEB',
                  borderRadius: 16,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: '#FFFFFF',
                  minWidth: 96,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>{radiusKm} km</Text>
                <Feather name="chevron-down" size={16} color="#7C8596" />
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Pressable
              onPress={() => setTelehealthOnly((prev) => !prev)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: telehealthOnly ? theme.colors.primary : '#CBD5E1',
                  backgroundColor: telehealthOnly ? '#EAF8EA' : '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {telehealthOnly ? <Feather name="check" size={16} color={theme.colors.primary} /> : null}
              </View>
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>Telehealth only</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void runSearch()
              }}
              style={{
                borderRadius: 20,
                paddingVertical: 12,
                paddingHorizontal: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.primary,
                minWidth: 138,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{loading ? 'Searching…' : 'Search now'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Pressable onPress={() => setQuickAccessOpen((prev) => !prev)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '900', color: theme.colors.muted }}>Quick Access Categories</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 14 }}>{quickAccessOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {quickAccessOpen && (
            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_ACCESS.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => {
                    void handleQuickAccess(item)
                  }}
                  style={{
                    width: '48%',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.card,
                    borderRadius: theme.radius.md,
                    padding: 10,
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <Feather name={item.icon} size={16} color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700', flex: 1 }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Modal visible={pickerMode !== null} transparent animationType="fade" onRequestClose={() => setPickerMode(null)}>
          <Pressable
            onPress={() => setPickerMode(null)}
            style={{
              flex: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.35)',
              justifyContent: 'flex-end',
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingHorizontal: 14,
                paddingTop: 14,
                paddingBottom: 24,
                maxHeight: '70%',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.text, marginBottom: 10 }}>
                {pickerTitle}
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {pickerChoices.map((choice, index) => {
                  const isSelected =
                    pickerMode === 'category'
                      ? choice.value === categoryId
                      : pickerMode === 'subcategory'
                        ? choice.value === subcategoryId
                        : choice.value === String(radiusKm)
                  return (
                    <Pressable
                      key={`${choice.value || 'all'}-${index}`}
                      onPress={() => {
                        if (pickerMode === 'category') {
                          setCategoryId(choice.value)
                          setSubcategoryId('')
                        } else if (pickerMode === 'subcategory') {
                          setSubcategoryId(choice.value)
                        } else if (pickerMode === 'radius') {
                          setRadiusKm(Number(choice.value) || 10)
                        }
                        setPickerMode(null)
                      }}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: '#EEF2F7',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: isSelected ? '800' : '600' }}>
                        {choice.label}
                      </Text>
                      {isSelected ? <Feather name="check" size={16} color={theme.colors.primary} /> : null}
                    </Pressable>
                  )
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Search Results</Text>
          <Text style={{ marginTop: 4, color: theme.colors.muted }}>Results stay here until you run a new search.</Text>

          {error ? (
            <View
              style={{
                marginTop: 12,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: '#F3B4B4',
                backgroundColor: '#FFF5F5',
                padding: 12,
              }}
            >
              <Text style={{ color: '#B42318', fontWeight: '700' }}>{error}</Text>
            </View>
          ) : null}

          {loading ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.card,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={{ color: theme.colors.muted }}>Loading results…</Text>
            </View>
          ) : null}

          {!loading && results.length === 0 ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.card,
                padding: 14,
              }}
            >
              <Text style={{ color: theme.colors.muted }}>No results yet. Try a different search, category, or radius.</Text>
            </View>
          ) : null}

          {!loading &&
            results.map((item) => (
              <View
                key={item.id}
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.card,
                  padding: 14,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: theme.colors.text }}>{item.displayName}</Text>
                  {item.isTopBoost ? (
                    <View style={{ backgroundColor: '#DDF5DE', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: '#2E7D32', fontSize: 11, fontWeight: '900' }}>Top boost</Text>
                    </View>
                  ) : null}
                  {item.isBoosted && !item.isTopBoost ? (
                    <View style={{ backgroundColor: '#EEF9EE', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: '#2E7D32', fontSize: 11, fontWeight: '900' }}>Boosted</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: theme.colors.muted }}>
                  {item.categoryName}
                  {item.subcategoryName ? ` · ${item.subcategoryName}` : ''}
                </Text>
                {item.distanceKm != null ? <Text style={{ color: theme.colors.muted }}>{item.distanceKm.toFixed(1)} km away</Text> : null}
                  {item.description ? <Text style={{ color: theme.colors.text }}>{item.description}</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                  <Pressable onPress={() => navigation.navigate('PractitionerProfile', { slug: item.slug, name: item.displayName })}>
                    <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>View profile</Text>
                  </Pressable>
                  {item.phone ? (
                    <Pressable
                      onPress={() => {
                        void trackClick(item, 'call')
                        void openUrl(`tel:${item.phone}`)
                      }}
                    >
                      <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Call</Text>
                    </Pressable>
                  ) : null}
                  {item.websiteUrl ? (
                    <Pressable
                      onPress={() => {
                        void trackClick(item, 'website')
                        void openUrl(item.websiteUrl as string)
                      }}
                    >
                      <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Website</Text>
                    </Pressable>
                  ) : null}
                  {isValidEmail(item.emailPublic) ? (
                    <Pressable
                      onPress={() => {
                        void trackClick(item, 'email')
                        void openUrl(`mailto:${item.emailPublic}`)
                      }}
                    >
                      <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Email</Text>
                    </Pressable>
                  ) : null}
                  {(item.lat != null && item.lng != null) || buildAddress(item) ? (
                    <Pressable onPress={() => openMapForResult(item)}>
                      <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Map</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
        </View>

        {results.length > 0 ? (
          <View
            style={{
              marginTop: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.card,
              padding: 14,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 6 }}>Map view</Text>
            <Text style={{ color: theme.colors.muted, marginBottom: 8 }}>
              Tap any result&apos;s Map action to open directions in your maps app.
            </Text>
            {selectedLocation ? (
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                Search center: {selectedLocation.displayName} · Radius {radiusKm} km
              </Text>
            ) : (
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>No center selected. Results may include wider locations.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
