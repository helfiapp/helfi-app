export type PractitionerCategorySeed = {
  name: string
  slug: string
  synonyms?: string[]
  children?: PractitionerCategorySeed[]
}

export const PRACTITIONER_CATEGORIES: PractitionerCategorySeed[] = [
  {
    name: "GPs & Doctors",
    slug: "gps-and-doctors",
    synonyms: ["doctor", "gp", "general practitioner"],
    children: [
      { name: "General Practitioner (GP)", slug: "general-practitioner", synonyms: ["gp", "general practitioner"] },
      { name: "Family Doctor", slug: "family-doctor", synonyms: ["family gp"] },
      { name: "Telehealth GP", slug: "telehealth-gp", synonyms: ["telehealth doctor", "online gp"] },
      { name: "Sports Doctor", slug: "sports-doctor" },
      { name: "Occupational Physician", slug: "occupational-physician" },
      { name: "Dermatologist", slug: "dermatologist", synonyms: ["skin doctor"] },
      { name: "Cardiologist", slug: "cardiologist", synonyms: ["heart doctor"] },
      { name: "Endocrinologist", slug: "endocrinologist" },
      { name: "Gastroenterologist", slug: "gastroenterologist", synonyms: ["gastro", "gut doctor"] },
      { name: "Neurologist", slug: "neurologist" },
      { name: "Rheumatologist", slug: "rheumatologist" },
      { name: "Immunologist / Allergist", slug: "immunologist-allergist", synonyms: ["allergist"] },
      { name: "Respiratory Physician / Pulmonologist", slug: "respiratory-physician", synonyms: ["pulmonologist"] },
      { name: "Urologist", slug: "urologist" },
      { name: "ENT Specialist", slug: "ent-specialist", synonyms: ["ent"] },
      { name: "Ophthalmologist", slug: "ophthalmologist", synonyms: ["eye specialist"] },
      { name: "Paediatrician", slug: "paediatrician", synonyms: ["pediatrician", "kids doctor"] },
      { name: "Geriatrician", slug: "geriatrician" },
      { name: "Pain Specialist", slug: "pain-specialist" },
      { name: "Sleep Physician", slug: "sleep-physician" },
      { name: "Infectious Disease Physician", slug: "infectious-disease-physician" }
    ]
  },
  {
    name: "Allied Health",
    slug: "allied-health",
    synonyms: ["physio", "chiro", "allied"],
    children: [
      { name: "Physiotherapist", slug: "physiotherapist", synonyms: ["physio"] },
      { name: "Chiropractor", slug: "chiropractor", synonyms: ["chiro"] },
      { name: "Osteopath", slug: "osteopath", synonyms: ["osteo"] },
      { name: "Exercise Physiologist", slug: "exercise-physiologist" },
      { name: "Podiatrist", slug: "podiatrist" },
      { name: "Occupational Therapist (OT)", slug: "occupational-therapist", synonyms: ["ot"] },
      { name: "Speech Pathologist", slug: "speech-pathologist" },
      { name: "Audiologist", slug: "audiologist" },
      { name: "Dietitian", slug: "dietitian", synonyms: ["dietician"] },
      { name: "Clinical Nutritionist", slug: "clinical-nutritionist" },
      { name: "Diabetes Educator", slug: "diabetes-educator" },
      { name: "Myotherapist", slug: "myotherapist" },
      { name: "Remedial Massage Therapist", slug: "remedial-massage-therapist", synonyms: ["remedial massage"] },
      { name: "Bowen Therapist", slug: "bowen-therapist" },
      { name: "Lymphatic Drainage Therapist", slug: "lymphatic-drainage-therapist" },
      { name: "Hand Therapist", slug: "hand-therapist" }
    ]
  },
  {
    name: "Mental Health",
    slug: "mental-health",
    synonyms: ["psych", "therapy"],
    children: [
      { name: "Psychologist", slug: "psychologist" },
      { name: "Clinical Psychologist", slug: "clinical-psychologist" },
      { name: "Psychiatrist", slug: "psychiatrist" },
      { name: "Counsellor", slug: "counsellor", synonyms: ["counselor"] },
      { name: "Psychotherapist", slug: "psychotherapist" },
      { name: "Mental Health Social Worker", slug: "mental-health-social-worker" },
      { name: "Family Therapist", slug: "family-therapist" },
      { name: "Couples Therapist", slug: "couples-therapist" },
      { name: "Addiction Counsellor", slug: "addiction-counsellor", synonyms: ["addiction counselor"] }
    ]
  },
  {
    name: "Men's Health",
    slug: "mens-health",
    children: [
      { name: "Men's Health GP", slug: "mens-health-gp" },
      { name: "Urologist", slug: "urologist" },
      { name: "Andrologist", slug: "andrologist" },
      { name: "Sexual Health Doctor", slug: "sexual-health-doctor" },
      { name: "Hormone / Testosterone Clinic", slug: "hormone-testosterone-clinic", synonyms: ["testosterone clinic"] }
    ]
  },
  {
    name: "Musculoskeletal & Pain",
    slug: "musculoskeletal-and-pain",
    synonyms: ["pain", "sports injury"],
    children: [
      { name: "Sports Physiotherapy", slug: "sports-physiotherapy" },
      { name: "Spinal / Back Pain Clinic", slug: "spinal-back-pain-clinic" },
      { name: "Pain Specialist", slug: "pain-specialist" },
      { name: "Myotherapy", slug: "myotherapy" },
      { name: "Remedial Massage", slug: "remedial-massage" },
      { name: "Acupuncturist", slug: "acupuncturist" },
      { name: "Dry Needling Practitioner", slug: "dry-needling-practitioner" },
      { name: "Podiatry (sports)", slug: "podiatry-sports" }
    ]
  },
  {
    name: "Rehab & Disability Support",
    slug: "rehab-and-disability-support",
    children: [
      { name: "Occupational Therapy (NDIS/rehab)", slug: "occupational-therapy-ndis-rehab" },
      { name: "Physiotherapy (rehab)", slug: "physiotherapy-rehab" },
      { name: "Speech Pathology", slug: "speech-pathology" },
      { name: "Exercise Physiology", slug: "exercise-physiology" },
      { name: "Rehabilitation Physician", slug: "rehabilitation-physician" },
      { name: "Disability Support Provider", slug: "disability-support-provider" },
      { name: "Home Care Provider", slug: "home-care-provider" }
    ]
  },
  {
    name: "Nutrition & Metabolic Health",
    slug: "nutrition-and-metabolic-health",
    synonyms: ["nutrition", "metabolic"],
    children: [
      { name: "Dietitian", slug: "dietitian", synonyms: ["dietician"] },
      { name: "Clinical Nutritionist", slug: "clinical-nutritionist" },
      { name: "Weight Management Clinic", slug: "weight-management-clinic", synonyms: ["weight loss clinic"] },
      { name: "Diabetes Educator", slug: "diabetes-educator" },
      { name: "Eating Disorder Dietitian", slug: "eating-disorder-dietitian" }
    ]
  },
  {
    name: "Holistic & Integrative",
    slug: "holistic-and-integrative",
    synonyms: ["holistic", "integrative"],
    children: [
      { name: "Naturopath", slug: "naturopath" },
      { name: "Herbalist", slug: "herbalist" },
      { name: "Traditional Chinese Medicine (TCM) Practitioner", slug: "tcm-practitioner", synonyms: ["tcm", "traditional chinese medicine"] },
      { name: "Acupuncturist", slug: "acupuncturist" },
      { name: "Ayurveda Practitioner", slug: "ayurveda-practitioner" },
      { name: "Functional Medicine Practitioner", slug: "functional-medicine-practitioner" },
      { name: "Integrative GP/Doctor", slug: "integrative-gp-doctor" },
      { name: "Kinesiologist", slug: "kinesiologist" },
      { name: "Breathwork Facilitator", slug: "breathwork-facilitator" },
      { name: "Meditation Teacher", slug: "meditation-teacher" },
      { name: "Yoga Therapist", slug: "yoga-therapist" }
    ]
  },
  {
    name: "Dental & Oral Health",
    slug: "dental-and-oral-health",
    children: [
      { name: "Dentist", slug: "dentist" },
      { name: "Dental Hygienist", slug: "dental-hygienist" },
      { name: "Orthodontist", slug: "orthodontist" },
      { name: "Periodontist", slug: "periodontist" },
      { name: "Oral Surgeon", slug: "oral-surgeon" }
    ]
  },
  {
    name: "Eye & Hearing",
    slug: "eye-and-hearing",
    children: [
      { name: "Optometrist", slug: "optometrist" },
      { name: "Ophthalmologist", slug: "ophthalmologist" },
      { name: "Audiologist", slug: "audiologist" },
      { name: "Hearing Clinic", slug: "hearing-clinic" }
    ]
  },
  {
    name: "Diagnostics & Testing",
    slug: "diagnostics-and-testing",
    children: [
      { name: "Pathology / Lab Testing", slug: "pathology-lab-testing", synonyms: ["lab testing"] },
      { name: "Imaging / Radiology (X-ray, CT, MRI, Ultrasound)", slug: "imaging-radiology" },
      { name: "Sleep Study Clinic", slug: "sleep-study-clinic" },
      { name: "Cardiac Testing (ECG/Holter) Clinic", slug: "cardiac-testing-clinic" },
      { name: "Blood Testing Clinic", slug: "blood-testing-clinic" }
    ]
  },
  {
    name: "Pharmacy & Medication Support",
    slug: "pharmacy-and-medication-support",
    children: [
      { name: "Pharmacy", slug: "pharmacy" },
      { name: "Compounding Pharmacy", slug: "compounding-pharmacy" },
      { name: "Medication Review Pharmacist", slug: "medication-review-pharmacist" }
    ]
  },
  {
    name: "Aged Care & Home Care",
    slug: "aged-care-and-home-care",
    children: [
      { name: "Aged Care Provider", slug: "aged-care-provider" },
      { name: "Home Nursing", slug: "home-nursing" },
      { name: "Mobile Physio", slug: "mobile-physio" },
      { name: "Mobile Podiatry", slug: "mobile-podiatry" }
    ]
  }
]
