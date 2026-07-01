'use client'
import Link from 'next/link'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { TeamOverview } from '@/lib/admin/team-queries'

const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const

export function TeamOverviewView({ t, locale, overview }: {
  t: Messages['team']
  locale: Locale
  overview: TeamOverview
}) {
  const roleLabel: Record<string, string> = {
    owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, analyst: t.roleAnalyst,
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-kinnso-ink">{t.overviewTitle}</h1>
        <p className="text-sm text-kinnso-muted">{t.overviewSubtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label={t.kpiMembers} value={overview.members.length} />
        <KpiCard label={t.kpiPending} value={overview.pendingInvites} />
        {ROLES.map((role) => (
          <KpiCard key={role} label={roleLabel[role]} value={overview.byRole[role] ?? 0} />
        ))}
      </div>
      <div>
        <Link
          href={`/${locale}/admin/team/directory`}
          className="text-sm font-semibold text-kinnso-orange hover:underline"
        >
          {t.directoryTitle} →
        </Link>
      </div>
    </div>
  )
}
