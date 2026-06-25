import Link from 'next/link'
export function ArticleCard({
  href, title, thumbnail, summary,
}: { href: string; title: string; thumbnail?: string; summary?: string | null }) {
  return (
    <Link href={href} aria-label={title} className="block rounded-card overflow-hidden bg-white shadow-sm hover:shadow-md transition">
      {thumbnail && <img src={thumbnail} alt={title} loading="lazy" className="w-full h-44 object-cover" />}
      <div className="p-4">
        <h3 className="font-semibold text-ink line-clamp-2">{title}</h3>
        {summary && <p className="text-sm text-muted mt-1 line-clamp-2">{summary}</p>}
        <span aria-hidden="true" className="mt-2 inline-block text-sm font-bold text-kinnso-orange">→</span>
      </div>
    </Link>
  )
}
