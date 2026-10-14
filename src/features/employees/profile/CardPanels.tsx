import { useState } from 'react'
import { ln } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Building2, Clock, ExternalLink, FileText, History, Route, Search } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { LoadError } from '@/components/data/LoadError'
import { todayIso } from '@/lib/today'
import { errorMessage } from '@/api/errorMessage'
import { fmtDate, fmtDateTime, fmtRange } from '../format'
import { useEmployeeAsOf, useEmployeeCareer, useEmployeeHistory, useEmployeeOrders } from '../useEmployees'
import type { EmployeeFull, EmployeeOrder } from '../types'
import { CareerTable } from '../t2/EducationExperienceTabs'
import { EmptyRow, T2Section } from '../t2/T2Ui'

const ORDER_TONE: Record<string, BadgeTone> = {
  applied: 'success',
  confirmed: 'success',
  rejected: 'danger',
  draft: 'neutral',
}

/** «Buyruqlar» tab: orders the employee is named in (`GET /employees/{pk}/orders`). */
export function OrdersTab({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  const q = useEmployeeOrders(employeeId)
  const rows = q.data?.items ?? []
  const statusLabel = (s?: string | null) =>
    s === 'applied'
      ? t('personnel.orders.applied')
      : s === 'confirmed'
        ? t('personnel.orders.confirmed')
        : s === 'rejected'
          ? t('personnel.orders.rejected')
          : s === 'draft'
            ? t('personnel.orders.draft')
            : t('personnel.orders.inProgress')
  const text = (o: EmployeeOrder) => o.short_text || o.summary || o.name || ln(o.category_rel) || '—'

  return (
    <T2Section icon={<FileText size={15} />} title={t('personnel.tabs.orders')}>
      {q.isLoading ? (
        <EmptyRow text={t('common.loading')} />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyRow text={t('personnel.orders.none')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="text-left text-fg-subtle">
                <th className="w-10 py-1.5 pr-3 font-medium">№</th>
                <th className="py-1.5 pr-3 font-medium">{t('personnel.orders.date')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('personnel.orders.number')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('personnel.orders.summary')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('personnel.orders.status')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('personnel.orders.fullText')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.id} className="border-t border-line/70 align-top">
                  <td className="py-2 pr-3 text-fg-subtle">{i + 1}.</td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-fg-muted">{fmtDate(o.act_date)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-fg-muted">{o.act_number ? `№${o.act_number}` : '—'}</td>
                  <td className="max-w-[380px] py-2 pr-3 text-fg">
                    <span className="line-clamp-2">{text(o)}</span>
                    {o.category_rel?.name && <span className="mt-0.5 block text-[11px] text-fg-subtle">{ln(o.category_rel)}</span>}
                    {o.mentioned && <span className="mt-0.5 block text-[11px] text-brand">{t('ordVac.mentionedInText')}</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={ORDER_TONE[o.status ?? ''] ?? 'info'}>{statusLabel(o.status)}</Badge>
                  </td>
                  <td className="py-2 pr-3">
                    <Link to={`/orders?open=${o.id}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                      <ExternalLink size={13} aria-hidden /> {t('personnel.open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </T2Section>
  )
}

const SOURCE_TONE: Record<string, BadgeTone> = { history: 'brand', current: 'neutral', unknown: 'warning' }
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

/**
 * «Holat sanasi bo'yicha» (TZ 4.2.7 · 2140): the card as it was on a past
 * date (`/as-of?on=`) and the change history with authors and bases
 * (`/history?limit=60`, TZ C3 «История»).
 */
export function AsOfTab({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [date, setDate] = useState('')
  const [on, setOn] = useState<string | null>(null)
  const asOf = useEmployeeAsOf(employeeId, on)
  const history = useEmployeeHistory(employeeId)
  const data = asOf.data
  const sourceLabel = (s?: string) =>
    s === 'history' ? t('personnel.asof.fromHistory') : s === 'unknown' ? t('personnel.asof.unknown') : t('personnel.asof.unchanged')

  return (
    <div className="flex flex-col gap-3">
      <T2Section icon={<History size={15} />} title={t('personnel.asof.title')} hint={t('personnel.asof.hint')}>
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label={t('personnel.asof.date')} className="w-[200px]">
            <DateInput value={date} max={todayIso()} onChange={setDate} aria-label={t('personnel.asof.date')} />
          </Field>
          <Button
            leftIcon={<Search size={14} />}
            loading={asOf.isFetching}
            onClick={() => {
              if (!date) {
                toast.error(t('personnel.asof.pickDate'))
                return
              }
              setOn(date)
            }}
          >
            {t('personnel.asof.show')}
          </Button>
          {data && (
            <span className="text-[12px] text-fg-subtle">
              {t('personnel.asof.restored')}: {data.restored_fields ?? 0} · {t('personnel.asof.unknown')}: {data.unknown_fields ?? 0}
            </span>
          )}
        </div>
        {asOf.isError && <p className="mt-3 text-[12.5px] text-danger">{errorMessage(asOf.error, t('common.actionFailed'))}</p>}
      </T2Section>

      {data?.before_hire && (
        <div role="status" className="rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          {t('personnel.asof.beforeHire')}
          {data.hire_date ? ` (${t('personnel.asof.hireDate')}: ${fmtDate(data.hire_date)})` : ''}
        </div>
      )}

      {data && !data.before_hire && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-2.5 text-[13.5px] font-semibold text-fg">
            {t('personnel.asof.stateOn', { date: fmtDate(data.as_of) })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-fg-subtle">
                  <th className="w-[220px] px-4 py-2 font-medium">{t('personnel.asof.field')}</th>
                  <th className="px-4 py-2 font-medium">{t('personnel.asof.thatDay')}</th>
                  <th className="px-4 py-2 font-medium">{t('personnel.asof.now')}</th>
                  <th className="w-[140px] px-4 py-2 font-medium">{t('personnel.asof.source')}</th>
                </tr>
              </thead>
              <tbody>
                {data.fields.map((f) => (
                  <tr key={f.field} className="border-t border-line/70">
                    <td className="px-4 py-1.5 text-fg">{f.label || f.field}</td>
                    <td className="px-4 py-1.5 text-fg-muted">{show(f.value)}</td>
                    <td className={`px-4 py-1.5 ${f.changed_after ? 'text-warning' : 'text-fg-subtle'}`}>{show(f.current)}</td>
                    <td className="px-4 py-1.5">
                      <Badge tone={SOURCE_TONE[f.source ?? 'current'] ?? 'neutral'}>{sourceLabel(f.source)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.note && <p className="border-t border-line px-4 py-2 text-[11.5px] text-fg-subtle">{data.note}</p>}
        </Card>
      )}

      <T2Section icon={<Clock size={15} />} title={t('personnel.asof.history')}>
        {history.isLoading ? (
          <EmptyRow text={t('common.loading')} />
        ) : history.isError ? (
          <LoadError error={history.error} onRetry={() => void history.refetch()} />
        ) : (history.data?.items ?? []).length === 0 ? (
          <EmptyRow text={t('personnel.asof.noHistory')} />
        ) : (
          <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
            {(history.data?.items ?? []).map((i) => (
              <li key={i.id} className="flex flex-col gap-0.5 border-b border-line/60 pb-2 text-[12px] last:border-b-0">
                <div className="flex flex-wrap items-start gap-2.5">
                  <span className="w-[120px] shrink-0 tabular-nums text-fg-subtle">{fmtDateTime(i.at)}</span>
                  <span className="w-[130px] shrink-0 text-fg-muted">{i.action_label || i.action || ''}</span>
                  <span className="flex-1 text-right text-fg-subtle">{i.actor || ''}</span>
                </div>
                {i.summary && <div className="text-fg sm:pl-[130px]">{i.summary}</div>}
                {(i.changes ?? []).map((c) => (
                  <div key={c.field} className="break-words text-fg-muted sm:pl-[130px]">
                    <span className="text-fg">{c.label || c.field}</span>:{' '}
                    {c.old !== null && c.old !== undefined && c.old !== '' && (
                      <>
                        <span className="text-fg-subtle line-through">{String(c.old)}</span>
                        <span className="mx-1.5 text-fg-subtle">→</span>
                      </>
                    )}
                    <span>{show(c.value)}</span>
                  </div>
                ))}
                {i.basis_label && (
                  <div className="text-fg-subtle sm:pl-[130px]">
                    {t('personnel.career.basis')}: {i.basis_label}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </T2Section>
    </div>
  )
}

/** «Karyera»: positions inside the organisation + work and study records. */
export function CareerTab({ employee }: { employee: EmployeeFull }) {
  const { t } = useTranslation()
  const career = useEmployeeCareer(employee.id)
  const exps = employee.work_experiences ?? []
  const edus = employee.educations ?? []
  return (
    <div className="flex flex-col gap-3">
      <T2Section icon={<Route size={15} />} title={t('personnel.career.title')}>
        <CareerTable rows={career.data?.items} loading={career.isLoading} failed={career.isError} />
      </T2Section>
      <div className="grid gap-3 md:grid-cols-2">
        <T2Section icon={<Building2 size={15} />} title={t('personnel.career.work')}>
          {exps.length === 0 ? (
            <EmptyRow text={t('personnel.rec.noExperience')} />
          ) : (
            <ul className="divide-y divide-line/60">
              {exps.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-fg">{x.company_name}</span>
                    <span className="block text-[12px] text-fg-muted">{x.position}</span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">
                    {fmtRange(x.start_date, x.is_current ? null : x.end_date, t('personnel.rec.untilNow'))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </T2Section>
        <T2Section icon={<Building2 size={15} />} title={t('personnel.career.study')}>
          {edus.length === 0 ? (
            <EmptyRow text={t('personnel.rec.noEducation')} />
          ) : (
            <ul className="divide-y divide-line/60">
              {edus.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-fg">{x.institution_name}</span>
                    <span className="block text-[12px] text-fg-muted">{[x.faculty_name, x.degree_name].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">
                    {fmtRange(x.start_date, x.is_current ? null : x.end_date, t('personnel.rec.studyingShort'))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </T2Section>
      </div>
    </div>
  )
}
