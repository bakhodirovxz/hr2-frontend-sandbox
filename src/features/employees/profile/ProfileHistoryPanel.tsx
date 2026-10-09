import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Card, CardHeader } from '@/components/ui/Card'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadError } from '@/components/data/LoadError'
import { Badge } from '@/components/ui/Badge'
import { TD, TD_COMPACT, TH } from '@/components/data/tableStyles'
import { formatDateTime } from '@/lib/format'

interface Change { field: string; label?: string | null; value?: unknown }
interface HistoryRow { id: number; action?: string | null; at?: string | null; actor?: string | null; changes?: Change[] | null }
interface AsOfField {
  field: string
  label?: string | null
  value?: unknown
  current?: unknown
  source?: string | null
  changed_after?: boolean
}

// Objects (a weekly schedule map, a nested record) are spelled out — the
// server now formats the known ones, this keeps «[object Object]» from ever
// reaching the screen for the rest (audit 2026-09-22).
const show = (x: unknown): string => {
  if (x === null || x === undefined || x === '') return '—'
  if (typeof x === 'boolean') return x ? '✓' : '—'
  if (Array.isArray(x)) return x.map(show).join(', ')
  if (typeof x === 'object') return Object.entries(x as Record<string, unknown>).map(([k, v]) => `${k}: ${show(v)}`).join(', ')
  return String(x)
}

/**
 * WHAT THIS RECORD USED TO SAY.
 *
 * Personnel disputes are almost always about a date: which department someone
 * was in when a decree was signed, what their position said last March. Two
 * readings answer that — the running change log, and the record RECONSTRUCTED
 * as of a chosen day. v2 had neither, so the only way to settle such a question
 * was to ask the database directly.
 *
 * `changed_after` is the interesting flag on the as-of view: it marks a field
 * that has been edited since the chosen date, i.e. exactly the fields where
 * "what it says now" and "what it said then" disagree.
 */
export function ProfileHistoryPanel({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  const [on, setOn] = useState('')

  const history = useQuery({
    queryKey: ['employee-history', employeeId],
    queryFn: () =>
      apiGet<{ items?: HistoryRow[] | null }>(`${EMPLOYEES_LIST}/${employeeId}/history`, { limit: 50 }),
  })
  const asOf = useQuery({
    queryKey: ['employee-as-of', employeeId, on],
    queryFn: () =>
      apiGet<{ fields?: AsOfField[] | null }>(`${EMPLOYEES_LIST}/${employeeId}/as-of`, { on }),
    enabled: !!on,
  })

  const rows = history.data?.items ?? []
  const changed = (asOf.data?.fields ?? []).filter((f) => f.changed_after)

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t('profile.asOfTitle')} icon={<History size={16} />} />
        <div className="max-w-xs">
          <Field label={t('profile.asOfDate')}>
            <DateInput value={on} onChange={setOn} />
          </Field>
        </div>
        {on && asOf.isLoading && <Skeleton className="mt-3 h-24 w-full" />}
        {on && !asOf.isLoading && (
          changed.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t('profile.asOfSame')}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={TH}>{t('profile.colField')}</th>
                    <th className={TH}>{t('profile.colThen')}</th>
                    <th className={TH}>{t('profile.colNow')}</th>
                  </tr>
                </thead>
                <tbody>
                  {changed.map((f) => (
                    <tr key={f.field} className="border-t border-border">
                      <td className={TD}>{f.label || f.field}</td>
                      <td className={TD_COMPACT}>{show(f.value)}</td>
                      <td className={TD_COMPACT}>{show(f.current)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      <Card className="p-0">
        <div className="px-4 pt-4">
          <CardHeader title={t('profile.historyTitle')} />
        </div>
        {history.isLoading ? (
          <div className="p-4"><Skeleton className="h-24 w-full" /></div>
        ) : history.isError ? (
          /* This is the employee card's AUDIT TRAIL — "never changed" is a claim, not a fallback. */
          <div className="p-4"><LoadError error={history.error} onRetry={() => history.refetch()} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('profile.noHistory')} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.action === 'DELETE' ? 'danger' : r.action === 'CREATE' ? 'success' : 'neutral'}>
                    {r.action || '—'}
                  </Badge>
                  <span className="text-[13px] text-fg-muted">{r.at ? formatDateTime(r.at) : '—'}</span>
                  {r.actor && <span className="text-[13px] text-fg-subtle">· {r.actor}</span>}
                </div>
                {(r.changes ?? []).length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {(r.changes ?? []).map((c, i) => (
                      <li key={`${c.field}-${i}`} className="text-[13px] text-fg-muted">
                        <span className="text-fg-subtle">{c.label || c.field}:</span>{' '}
                        <span className="text-fg">{show(c.value)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
