export interface ArticleLdInput {
  headline: string; description: string; url: string; images: string[]
  publishedAt: string | null; modifiedAt: string | null; authorName: string | null; locale: string
}

export function articleJsonLd(i: ArticleLdInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: i.headline, description: i.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': i.url },
    image: i.images, inLanguage: i.locale,
    datePublished: i.publishedAt ?? undefined,
    dateModified: i.modifiedAt ?? i.publishedAt ?? undefined,   // <-- the fix: never omit dateModified
    publisher: { '@type': 'Organization', name: 'Kinnso' },
  }
  if (i.authorName) ld.author = { '@type': 'Person', name: i.authorName }
  return ld
}

export function faqJsonLd(faqs: Array<{ question: string; answer: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question', name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type': 'ListItem', position: idx + 1, name: it.name, item: it.url,
    })),
  }
}
