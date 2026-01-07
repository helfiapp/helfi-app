import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import FeaturePage from '@/components/marketing/FeaturePage'
import { featurePages, getFeaturePage } from '@/data/feature-pages'

type FeaturePageParams = {
  params: { slug: string }
}

export function generateStaticParams() {
  return featurePages.map((page) => ({ slug: page.slug }))
}

export function generateMetadata({ params }: FeaturePageParams): Metadata {
  const page = getFeaturePage(params.slug)
  if (!page) {
    return {
      title: 'Feature not found | Helfi',
    }
  }

  return {
    title: `${page.seo.title} | Helfi`,
    description: page.seo.description,
    openGraph: {
      title: page.seo.title,
      description: page.seo.description,
    },
  }
}

export default function FeaturePageRoute({ params }: FeaturePageParams) {
  const page = getFeaturePage(params.slug)
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
