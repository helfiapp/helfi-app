export type PartnerOutreachSeedEntry = {
  name: string
  email: string
  company: string
  region?: string
  notes?: string
  sourceUrl?: string
}

export const partnerOutreachSeed: PartnerOutreachSeedEntry[] = [
  {
    name: 'PartnerHub Support',
    email: 'partnerhub@woolworths.com.au',
    company: 'Woolworths Group',
    region: 'AU',
    notes: 'Supplier onboarding / NPC support',
    sourceUrl: 'https://gs1au.org/services/data-and-content/national-product-catalogue/supplier-onboarding/woolworths-npc'
  },
  {
    name: 'NPC Customer Support',
    email: 'npccustomersupport@gs1au.org',
    company: 'GS1 Australia (NPC)',
    region: 'AU',
    notes: 'National Product Catalogue support',
    sourceUrl: 'https://gs1au.org/services/data-and-content/national-product-catalogue/supplier-onboarding/woolworths-npc'
  },
  {
    name: 'Customer Services (Suppliers)',
    email: 'customer.service@metcashfg.com',
    company: 'Metcash / IGA',
    region: 'AU',
    notes: 'Supplier enquiries',
    sourceUrl: 'https://www.metcash.com/contact/'
  },
  {
    name: 'General Support',
    email: 'info@gs1us.org',
    company: 'GS1 US',
    region: 'US',
    notes: 'GS1 US contact',
    sourceUrl: 'https://www.gs1us.org/who-we-are/contact-us'
  },
  {
    name: 'Business Development',
    email: 'businessdevelopment@gs1us.org',
    company: 'GS1 US Data Hub',
    region: 'US',
    notes: 'Data Hub View/Use inquiries',
    sourceUrl: 'https://www.gs1us.org/lp/data-hub-search-verify/confirmation'
  },
  {
    name: 'API Support',
    email: 'api@edamam.com',
    company: 'Edamam',
    region: 'US',
    notes: 'Food Database API support',
    sourceUrl: 'https://developer.edamam.com/faq'
  },
  {
    name: 'Contact',
    email: 'contact@openfoodfacts.org',
    company: 'Open Food Facts',
    region: 'Global',
    notes: 'Open data contact',
    sourceUrl: 'https://world.openfoodfacts.org/contact'
  }
]
