import React from 'react'

export function DetailBox({
  id, title, time, price, phone, address, website,
}: {
  id: string; title?: string; time?: string; price?: string; phone?: string
  address?: { label?: string; link?: string }; website?: { label?: string; link?: string }
}) {
  const rows: Array<[string, React.ReactNode]> = []
  if (time) rows.push(['🕑', time])
  if (price) rows.push(['💰', price])
  if (phone) rows.push(['📞', phone])
  if (address?.label)
    rows.push(['📍', address.link
      ? <a href={address.link} target="_blank" rel="noopener noreferrer nofollow" className="text-info underline">{address.label}</a>
      : address.label])
  if (website?.label)
    rows.push(['🔗', website.link
      ? <a href={website.link} target="_blank" rel="noopener noreferrer nofollow" className="text-info underline">{website.label}</a>
      : website.label])
  return (
    <section id={id} className="scroll-mt-24 mb-8 rounded-card border border-cream-2 p-5">
      {title && <h3 className="text-lg font-bold text-ink mb-3">{title}</h3>}
      <dl className="grid gap-2">
        {rows.map(([icon, val]) => (
          <div key={icon as string} className="flex gap-2"><dt aria-hidden>{icon}</dt><dd>{val}</dd></div>
        ))}
      </dl>
    </section>
  )
}
