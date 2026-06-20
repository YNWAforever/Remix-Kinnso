import { ReceiptRow, RouteMarkers, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import { creators, missions, tickerSeed } from '@/lib/creator-mock'

export function PassportHeroStack() {
  const creator = creators[0]
  const mission = missions[0]
  const payout = tickerSeed[0]

  return (
    <div className="relative min-h-[360px]">
      <TicketCard className="absolute left-0 top-4 w-[68%] rotate-[-5deg] bg-kinnso-ink p-5 text-white">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-white/60">
          <span>Studio pass</span>
          <span>{creator.tier}</span>
        </div>
        <TicketDivider className="my-4 opacity-40" />
        <div className="text-4xl font-black leading-none">{creator.name}</div>
        <div className="k-mono mt-3 text-sm text-kinnso-amber">@{creator.handle}</div>
        <div className="mt-2 text-sm text-white/70">{creator.homeCity} / {creator.category}</div>
      </TicketCard>

      <TicketCard className="absolute right-0 top-16 w-[78%] rotate-[2deg] p-5">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-kinnso-muted">
          <span>Social scan</span>
          <span>{creator.score}/100</span>
        </div>
        <TicketDivider className="my-4" />
        <div className="k-display text-5xl font-black text-kinnso-orange">{creator.guides}</div>
        <div className="text-sm font-bold text-kinnso-ink">published guides</div>
        <RouteMarkers className="mt-5" points={['HK', 'JP', 'TW']} />
      </TicketCard>

      <TicketCard className="absolute bottom-2 left-8 w-[72%] rotate-[-2deg] p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-kinnso-muted">Payout receipt</div>
        <ReceiptRow
          label={mission.title}
          meta={payout.ago}
          value={`+HK$${payout.amount.toLocaleString('en-HK')}`}
          tone="positive"
        />
      </TicketCard>
    </div>
  )
}

export default PassportHeroStack
