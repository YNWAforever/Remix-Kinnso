'use client'
import { useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { AdminUsers } from '@/lib/admin/users-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { UserKind, UserStatus } from '@/lib/admin/users-actions'
import { TicketCard } from '@/components/kinnso/MarketPassport'

type T = Messages['users']
type SetStatus = (kind: UserKind, id: string, status: UserStatus) => Promise<ActionResult<{ id: string; status: UserStatus }>>
type Row = { id: string; name: string; status: string; joined: string }

function statusLabel(t: T, status: string): string {
  switch (status) {
    case 'active': return t.statusActive
    case 'suspended': return t.statusSuspended
    case 'onboarding': return t.statusOnboarding
    case 'paused': return t.statusPaused
    case 'archived': return t.statusArchived
    default: return status
  }
}

function UserSection({ t, heading, kind, rows, onSetStatus }: {
  t: T; heading: string; kind: UserKind; rows: Row[]; onSetStatus: SetStatus
}) {
  const [items, setItems] = useState(rows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function toggle(row: Row) {
    const next: UserStatus = row.status === 'suspended' ? 'active' : 'suspended'
    setBusyId(row.id)
    setErrors((e) => ({ ...e, [row.id]: '' }))
    const res = await onSetStatus(kind, row.id, next)
    setBusyId(null)
    if (res.ok) setItems((list) => list.map((r) => (r.id === row.id ? { ...r, status: res.status } : r)))
    else setErrors((e) => ({ ...e, [row.id]: res.errors.form?.[0] ?? t.errorGeneric }))
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-kinnso-ink">{heading}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((row) => {
            const suspended = row.status === 'suspended'
            return (
              <TicketCard key={row.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-bold text-kinnso-ink">{row.name}</p>
                  <p className="text-sm text-kinnso-muted">
                    <span className={suspended ? 'font-bold text-red-600' : 'font-bold text-kinnso-orange'}>
                      {statusLabel(t, row.status)}
                    </span>
                    {' · '}{t.joined} {new Date(row.joined).toLocaleDateString()}
                  </p>
                  {errors[row.id] ? <p className="mt-1 text-sm text-red-600">{errors[row.id]}</p> : null}
                </div>
                <button
                  onClick={() => toggle(row)}
                  disabled={busyId === row.id}
                  className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50"
                >
                  {suspended ? t.activate : t.suspend}
                </button>
              </TicketCard>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function AdminUsersView({ t, users, onSetStatus }: { t: T; users: AdminUsers; onSetStatus: SetStatus }) {
  return (
    <main>
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
      <UserSection t={t} heading={t.sectionCreators} kind="creator"
        rows={users.creators.map((c) => ({ id: c.id, name: c.display_name || c.handle || t.unnamed, status: c.status, joined: c.created_at }))}
        onSetStatus={onSetStatus} />
      <UserSection t={t} heading={t.sectionMerchants} kind="merchant"
        rows={users.merchants.map((m) => ({ id: m.id, name: m.company_name, status: m.status, joined: m.created_at }))}
        onSetStatus={onSetStatus} />
      <UserSection t={t} heading={t.sectionOps} kind="ops"
        rows={users.ops.map((o) => ({ id: o.id, name: o.display_name, status: o.status, joined: o.created_at }))}
        onSetStatus={onSetStatus} />
    </main>
  )
}

export default AdminUsersView
