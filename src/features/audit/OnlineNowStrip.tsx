import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Circle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useOnlineHistory, useOnlineNow } from './useAuditLogs'

/**
 * HOZIR ONLAYN — how many people are in the system right now, with the daily
 * peaks beside it so the number means something. Presence is held in Redis and
 * keyed per device, so one person on a laptop and a phone counts once.
 */
export function OnlineNowStrip() {
  const { t } = useTranslation()
  const { count, users, denied } = useOnlineNow()
  const { rows } = useOnlineHistory(14)
  const [open, setOpen] = useState(false)

  if (denied) return null

  const peak = rows.reduce((m, r) => Math.max(m, r.peak_count ?? 0), 0)
  const todayRow = rows[rows.length - 1]

  return (
    <Card className="mb-4 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 text-left"
        aria-expanded={open}
      >
        <Circle size={10} className="shrink-0 fill-success text-success" />
        <span className="text-[15px] font-semibold text-fg">{t('audit.onlineNow')}</span>
        <span className="rounded-tag bg-success-soft px-2 py-0.5 text-[13px] font-bold tabular-nums text-success">
          {count}
        </span>
        <span className="text-[12px] text-fg-muted">
          {t('audit.onlineToday')}: <span className="tabular-nums">{todayRow?.peak_count ?? 0}</span>
          {' · '}
          {t('audit.onlineRecord')}: <span className="tabular-nums">{peak}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn('ml-auto shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {users.length === 0 ? (
            <p className="text-[12.5px] text-fg-subtle">{t('audit.onlineEmpty')}</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {users.map((u) => (
                <li key={u.user_id} className="rounded-inner bg-surface-2 px-3 py-2">
                  <p className="truncate text-[13px] font-medium text-fg">{u.name ?? '—'}</p>
                  <p className="truncate text-[11px] text-fg-subtle">
                    {u.organization_branch_name ?? ''}
                    {u.devices?.length ? ` · ${u.devices.length}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
