import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import FeaturePage from '@/components/marketing/FeaturePage'
import { featurePages, getFeaturePage } from '@/data/feature-pages'

const page = getFeaturePage('talk-to-helfi')

export const metadata: Metadata = page
  ? {
      title: `${page.seo.title} | Helfi`,
      description: page.seo.description,
      openGraph: {
        title: page.seo.title,
        description: page.seo.description,
      },
    }
  : {
      title: 'Feature not found | Helfi',
    }

export default function VoiceAiAliasPage() {
  if (!page) notFound()

  const related = featurePages
    .filter((item) => item.slug !== page.slug)
    .slice(0, 3)
    .map((item) => ({
      label: item.title,
      href: `/features/${item.slug}`,
    }))

  return <FeaturePage page={page} related={related} />
}
