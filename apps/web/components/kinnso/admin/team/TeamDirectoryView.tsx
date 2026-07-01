'use client'
import type { Messages } from '@/lib/i18n/messages/en'
import type { MemberRow } from '@/lib/admin/team-queries'

export function TeamDirectoryView({ t, members }: {
  t: Messages['team']
  members: MemberRow[]
}) {
  const roleLabel: Record<string, string> = {
    owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, analyst: t.roleAnalyst,
  }
  const statusLabel: Record<string, string> = {
    active: t.statusActive, suspended: t.statusSuspended,
  }
  const roleBadgeClass: Record<string, string> = {
    owner:     'bg-amber-100 text-amber-700',
    admin:     'bg-blue-100 text-blue-700',
    moderator: 'bg-purple-100 text-purple-700',
    analyst:   'bg-gray-100 text-gray-700',
  }
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-kinnso-ink">{t.directoryTitle}</h2>
      <div className="overflow-x-auto rounded-xl border border-kinnso-border">
        <table className="min-w-full divide-y divide-kinnso-border text-sm">
          <thead className="bg-kinnso-bg-muted">
            <tr>
              {[t.colName, t.colRole, t.colStatus, t.colJoined].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-kinnso-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-kinnso-border bg-white">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-kinnso-ink">{m.displayName}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass[m.role] ?? 'bg-gray-100 text-gray-700'}`}>
                    {roleLabel[m.role] ?? m.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-kinnso-muted">
                  {statusLabel[m.status] ?? m.status}
                </td>
                <td className="px-4 py-3 text-kinnso-muted">
                  {m.joinedAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
