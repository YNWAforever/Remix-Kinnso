'use client'
import { useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { AdminPerk } from '@/lib/admin/perks-queries'
import type { PerkInput } from '@/lib/admin/perks-validation'
import type { ActionResult } from '@/lib/admin/result'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { AdminPerkForm } from '@/components/kinnso/admin/AdminPerkForm'

type SaveResult = ActionResult<{ id: string }>
type ToggleResult = ActionResult<{ id: string; active: boolean }>

export function AdminPerksView({
  t, perks, onCreate, onUpdate, onToggle,
}: {
  t: Messages['perks']
  perks: AdminPerk[]
  onCreate: (input: PerkInput) => Promise<SaveResult>
  onUpdate: (id: string, input: PerkInput) => Promise<SaveResult>
  onToggle: (id: string, active: boolean) => Promise<ToggleResult>
}) {
  const [editing, setEditing] = useState<AdminPerk | null | 'new'>(null)

  if (editing !== null) {
    const perk = editing === 'new' ? null : editing
    return (
      <main>
        <h1 className="k-display">{perk ? t.admin.editPerk : t.admin.newPerk}</h1>
        <div className="mt-6 max-w-2xl">
          <AdminPerkForm
            t={t.admin}
            perk={perk}
            onSave={(input) => (perk ? onUpdate(perk.id, input) : onCreate(input))}
            onCancel={() => setEditing(null)}
          />
        </div>
      </main>
    )
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="k-display">{t.admin.title}</h1>
          <p className="mt-2 text-kinnso-muted">{t.admin.subtitle}</p>
        </div>
        <button onClick={() => setEditing('new')}
          className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white">{t.admin.newPerk}</button>
      </div>
      {perks.length === 0 ? (
        <p className="mt-8 text-kinnso-muted">{t.admin.empty}</p>
      ) : (
        <div className="mt-8 grid gap-4">
          {perks.map((perk) => (
            <TicketCard key={perk.id} className="flex items-center justify-between p-5">
              <div>
                <p className="font-bold text-kinnso-ink">{perk.title}</p>
                <p className="text-sm text-kinnso-muted">{perk.partner_name} · {perk.discount_label}</p>
                <span className={`mt-1 inline-block text-xs font-bold ${perk.active ? 'text-kinnso-orange' : 'text-kinnso-muted'}`}>
                  {perk.active ? t.admin.statusActive : t.admin.statusInactive}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(perk)}
                  className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink">{t.admin.editPerk}</button>
                <button onClick={() => onToggle(perk.id, !perk.active)}
                  className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink">
                  {perk.active ? t.admin.deactivate : t.admin.activate}
                </button>
              </div>
            </TicketCard>
          ))}
        </div>
      )}
    </main>
  )
}

export default AdminPerksView
