export type NativeBillingProductCode =
  | 'plan_10_monthly'
  | 'plan_20_monthly'
  | 'plan_30_monthly'
  | 'plan_50_monthly'
  | 'credits_250'
  | 'credits_500'
  | 'credits_1000'

export type NativeBillingProduct = {
  code: NativeBillingProductCode
  kind: 'subscription' | 'topup'
  title: string
  credits: number
  priceCents: number
  iosProductId: string
  androidProductId: string
}

type PlatformReadiness = {
  ready: boolean
  warnings: string[]
}

export type NativeBillingCatalogResponse = {
  products: NativeBillingProduct[]
  ios: PlatformReadiness
  android: PlatformReadiness
}

function sanitizeEnvValue(value: unknown): string {
  let text = String(value || '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\\t/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim()

  const startsWithQuote = text.startsWith('"') || text.startsWith("'")
  const endsWithQuote = text.endsWith('"') || text.endsWith("'")
  if (startsWithQuote && endsWithQuote && text.length >= 2) {
    text = text.slice(1, -1).trim()
  }

  return text
}

function envString(key: string): string {
  return sanitizeEnvValue(process.env[key])
}

function getProducts(): NativeBillingProduct[] {
  return [
    {
      code: 'plan_10_monthly',
      kind: 'subscription',
      title: '$10/month',
      credits: 700,
      priceCents: 1000,
      iosProductId: envString('IOS_IAP_PLAN_10'),
      androidProductId: envString('ANDROID_IAP_PLAN_10'),
    },
    {
      code: 'plan_20_monthly',
      kind: 'subscription',
      title: '$20/month',
      credits: 1400,
      priceCents: 2000,
      iosProductId: envString('IOS_IAP_PLAN_20'),
      androidProductId: envString('ANDROID_IAP_PLAN_20'),
    },
    {
      code: 'plan_30_monthly',
      kind: 'subscription',
      title: '$30/month',
      credits: 2100,
      priceCents: 3000,
      iosProductId: envString('IOS_IAP_PLAN_30'),
      androidProductId: envString('ANDROID_IAP_PLAN_30'),
    },
    {
      code: 'plan_50_monthly',
      kind: 'subscription',
      title: '$50/month',
      credits: 3500,
      priceCents: 5000,
      iosProductId: envString('IOS_IAP_PLAN_50'),
      androidProductId: envString('ANDROID_IAP_PLAN_50'),
    },
    {
      code: 'credits_250',
      kind: 'topup',
      title: '$5 credits',
      credits: 250,
      priceCents: 500,
      iosProductId: envString('IOS_IAP_CREDITS_250'),
      androidProductId: envString('ANDROID_IAP_CREDITS_250'),
    },
    {
      code: 'credits_500',
      kind: 'topup',
      title: '$10 credits',
      credits: 500,
      priceCents: 1000,
      iosProductId: envString('IOS_IAP_CREDITS_500'),
      androidProductId: envString('ANDROID_IAP_CREDITS_500'),
    },
    {
      code: 'credits_1000',
      kind: 'topup',
      title: '$20 credits',
      credits: 1000,
      priceCents: 2000,
      iosProductId: envString('IOS_IAP_CREDITS_1000'),
      androidProductId: envString('ANDROID_IAP_CREDITS_1000'),
    },
  ]
}

function getIosReadiness(products: NativeBillingProduct[]): PlatformReadiness {
  const warnings: string[] = []
  const hasAllProductIds = products.every((p) => p.iosProductId.length > 0)
  if (!hasAllProductIds) warnings.push('iOS product IDs are not fully configured.')
  if (!envString('APPLE_IAP_BUNDLE_ID')) warnings.push('Apple bundle ID is missing.')
  const hasSharedSecret = envString('APPLE_IAP_SHARED_SECRET').length > 0
  const hasAppStoreApiCreds =
    envString('APPLE_IAP_ISSUER_ID').length > 0 &&
    envString('APPLE_IAP_KEY_ID').length > 0 &&
    envString('APPLE_IAP_PRIVATE_KEY').length > 0
  if (!hasSharedSecret && !hasAppStoreApiCreds) {
    warnings.push('Apple purchase verification key/secret is missing.')
  }
  return { ready: warnings.length === 0, warnings }
}

function getAndroidReadiness(products: NativeBillingProduct[]): PlatformReadiness {
  const warnings: string[] = []
  const hasAllProductIds = products.every((p) => p.androidProductId.length > 0)
  if (!hasAllProductIds) warnings.push('Android product IDs are not fully configured.')
  if (!envString('GOOGLE_PLAY_PACKAGE_NAME')) warnings.push('Google Play package name is missing.')
  if (!envString('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')) warnings.push('Google Play service account JSON is missing.')
  return { ready: warnings.length === 0, warnings }
}

export function getNativeBillingCatalog(): NativeBillingCatalogResponse {
  const products = getProducts()
  return {
    products,
    ios: getIosReadiness(products),
    android: getAndroidReadiness(products),
  }
}

export function getNativeStoreProductId(
  platform: 'ios' | 'android',
  code: NativeBillingProductCode,
): string {
  const product = getNativeBillingProductByCode(code)
  if (!product) return ''
  return platform === 'ios' ? product.iosProductId : product.androidProductId
}

export function getNativeBillingProductByCode(code: NativeBillingProductCode): NativeBillingProduct | null {
  const product = getProducts().find((p) => p.code === code)
  return product || null
}
