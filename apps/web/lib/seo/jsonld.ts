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

export function organizationJsonLd(i: { url: string; logo: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: 'KINNSO', url: i.url, logo: i.logo,
  }
}

export function websiteJsonLd(i: { url: string; locale: string; searchUrlTemplate: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: 'KINNSO', url: i.url, inLanguage: i.locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: i.searchUrlTemplate },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function creatorProfileJsonLd(i: {
  name: string; handle: string; url: string; bio: string; niches: string[]
}): Record<string, unknown> {
  const person: Record<string, unknown> = {
    '@type': 'Person', name: i.name, alternateName: `@${i.handle}`, url: i.url,
  }
  if (i.bio) person.description = i.bio
  if (i.niches.length) person.knowsAbout = i.niches
  return {
    '@context': 'https://schema.org', '@type': 'ProfilePage',
    mainEntity: person,
  }
}
