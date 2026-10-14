import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookmarkPlus, GitCompareArrows, Mail, Save, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { TD, TH } from '@/components/data/tableStyles'
import { useServerText } from '@/features/statistics/serverText'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { formatRange, numberLocale } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useIntervals, type KpiInterval, type KpiReport } from './api'
import {
  useCompare,
  useReportExtMutations,
  useReportTemplates,
  type CompareGroupBy,
  type CompareParams,
  type KpiReportTemplate,
  type TemplateParams,
} from './extApi'
import { PositionGroupFilter } from './PositionGroupControls'
import { useKpiAccess } from './useKpiAccess'

// recharts loads only when a comparison is on screen.
const ReportBarChart = lazy(() => import('@/features/statistics/ReportBarChart'))

// ─── «Сохранение шаблона отчёта» ─────────────────────────────────────────────

/**
 * K3 · 1412: saved report parameters. A template is private or shared;
 * only its author (or the master admin) changes or deletes it.
 */
export function ReportTemplatesBar({ current, onApply }: { current: () => TemplateParams; onApply: (p: TemplateParams) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const acc = useKpiAccess()
  const { templates } = useReportTemplates()
  const mut = useReportExtMutations()
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState<KpiReportTemplate | 'new' | null>(null)
  const tpl = templates.find((x) => String(x.id) === selected) ?? null
  const mine = !!tpl && (tpl.is_mine || acc.master)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3 lg:flex-row lg:items-center">
      <span className="text-[12.5px] font-semibold text-fg-muted">{t('kpiExt.templates')}</span>
      <Combobox
        value={selected}
        onChange={(v) => {
          setSelected(v)
          const found = templates.find((x) => String(x.id) === v)
          if (found) onApply(found.params ?? {})
        }}
        options={templates.map((x) => ({
          value: String(x.id),
          label: x.name,
          subLabel: x.is_shared ? t('kpiExt.templateShared') : t('kpiExt.templatePrivate'),
        }))}
        placeholder={templates.length ? t('kpiExt.templatePick') : t('kpiExt.templatesEmpty')}
        className="w-full lg:w-72"
      />
      <div className="flex flex-wrap gap-2 lg:ml-auto">
        {mine && tpl && (
          <>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Save size={14} />}
              loading={mut.updateTemplate.isPending}
              onClick={async () => {
                try {
                  await mut.updateTemplate.mutateAsync({ id: tpl.id, body: { params: current() } })
                  toast.ok(t('kpiExt.templateUpdated'))
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                }
              }}
            >
              {t('kpiExt.templateOverwrite')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSaving(tpl)}>
              {t('common.edit')}
            </Button>
            <Button
              size="sm"
              variant="danger-ghost"
              leftIcon={<Trash2 size={14} />}
              onClick={async () => {
                if (!(await confirm({ kind: 'delete', subject: tpl.name }))) return
                try {
                  await mut.deleteTemplate.mutateAsync(tpl.id)
                  setSelected('')
                  toast.ok(t('common.deleted'))
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        )}
        <Button size="sm" variant="secondary" leftIcon={<BookmarkPlus size={14} />} onClick={() => setSaving('new')}>
          {t('kpiExt.templateSave')}
        </Button>
      </div>
      <TemplateModal value={saving} current={current} onClose={() => setSaving(null)} onSaved={(x) => setSelected(String(x.id))} />
    </div>
  )
}

function TemplateModal({
  value,
  current,
  onClose,
  onSaved,
}: {
  value: KpiReportTemplate | 'new' | null
  current: () => TemplateParams
  onClose: () => void
  onSaved: (t: KpiReportTemplate) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useReportExtMutations()
  const row = value && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    setName(row?.name ?? '')
    setShared(row?.is_shared ?? false)
    setError('')
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!name.trim()) return setError(t('kpiExt.templateNameRequired'))
    setError('')
    try {
      const r = row
        ? await mut.updateTemplate.mutateAsync({ id: row.id, body: { name: name.trim(), is_shared: shared } })
        : await mut.createTemplate.mutateAsync({ name: name.trim(), is_shared: shared, params: current() })
      toast.ok(t('kpiExt.templateSaved'))
      onSaved(r)
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      size="sm"
      title={row ? t('kpiExt.templateEdit') : t('kpiExt.templateSave')}
      description={row ? undefined : t('kpiExt.templateSaveHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={mut.createTemplate.isPending || mut.updateTemplate.isPending} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('kpiExt.templateName')} required error={error || undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} invalid={!!error} />
        </Field>
        <Checkbox label={t('kpiExt.templateShareLabel')} checked={shared} onChange={(e) => setShared(e.target.checked)} />
      </div>
    </Modal>
  )
}

// ─── «Отправка отчёта по email» ──────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function SendReportModal({ report, onClose }: { report: KpiReport | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useReportExtMutations()
  const [emails, setEmails] = useState('')
  const [format, setFormat] = useState<'xlsx' | 'pdf' | 'docx'>('xlsx')
  const [error, setError] = useState('')
  const [smtpDown, setSmtpDown] = useState(false)

  useEffect(() => {
    if (!report) return
    setEmails('')
    setFormat('xlsx')
    setError('')
    setSmtpDown(false)
  }, [report])

  const submit = async () => {
    if (!report) return
    const list = [...new Set(emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))]
    const bad = list.filter((x) => !EMAIL_RE.test(x))
    if (!list.length) return setError(t('kpiExt.sendEmailsRequired'))
    if (bad.length) return setError(t('kpiExt.sendEmailsInvalid', { list: bad.join(', ') }))
    if (list.length > 20) return setError(t('kpiExt.sendEmailsMax'))
    setError('')
    setSmtpDown(false)
    try {
      const r = await mut.send.mutateAsync({ id: report.id, emails: list, format })
      toast.ok(t('kpiExt.sendQueued', { count: r?.emails?.length ?? list.length }))
      onClose()
    } catch (e) {
      if (errorCode(e) === 'smtp_not_configured') return setSmtpDown(true)
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!report}
      onClose={onClose}
      size="md"
      title={t('kpiExt.sendTitle')}
      description={report?.title ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Mail size={14} />} loading={mut.send.isPending} onClick={submit}>
            {t('kpiExt.sendRun')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {smtpDown && (
          <div role="alert" className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] text-fg">
            <b className="text-warning">{t('kpiExt.smtpTitle')}</b>
            <p className="mt-0.5 text-fg-muted">{t('kpiExt.smtpBody')}</p>
          </div>
        )}
        <Field label={t('kpiExt.sendEmails')} hint={t('kpiExt.sendEmailsHint')} required>
          <Textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ism@uzbekgidroenergo.uz" invalid={!!error} />
        </Field>
        <Field label={t('kpiExt.sendFormat')}>
          <Segmented
            value={format}
            onChange={setFormat}
            options={[
              { value: 'xlsx', label: 'Excel' },
              { value: 'pdf', label: 'PDF' },
              { value: 'docx', label: 'Word' },
            ]}
          />
        </Field>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

// ─── «Сравнение периодов» ─────────────────────────────────────────────────────

const GROUPS: { value: CompareGroupBy; key: string }[] = [
  { value: 'department', key: 'kpi.groupByDepartment' },
  { value: 'employee', key: 'kpi.groupByEmployee' },
  { value: 'indicator', key: 'kpi.groupByIndicator' },
  { value: 'group', key: 'kpi.groupByGroup' },
]
const GROUP_COL: Record<CompareGroupBy, string> = {
  department: 'kpi.colDepartment',
  employee: 'kpi.colEmployee',
  indicator: 'kpi.colIndicatorShort',
  group: 'kpi.colGroup',
}
const newestFirst = (a: KpiInterval, b: KpiInterval) => String(b.begin_date).localeCompare(String(a.begin_date))
const n2 = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString(numberLocale(), { maximumFractionDigits: 2 }))

/**
 * K3 · 1412 «Сравнение периодов — система формирует сравнительный отчёт»:
 * two evaluation periods side by side per department / employee /
 * indicator / group — plan, fact, completion % and the change.
 */
export function KpiCompareView() {
  const { t } = useTranslation()
  const sx = useServerText()
  const { intervals } = useIntervals()
  const sorted = useMemo(() => [...intervals].sort(newestFirst), [intervals])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [groupBy, setGroupBy] = useState<CompareGroupBy>('department')
  const [pg, setPg] = useState('')
  const [params, setParams] = useState<CompareParams | null>(null)
  const [err, setErr] = useState('')
  const { data, loading, error } = useCompare(params)

  // The two latest periods are offered at once: the previous one as A, the newest as B.
  useEffect(() => {
    if (a || b || sorted.length < 2) return
    setB(String(sorted[0].id))
    setA(String(sorted[1].id))
  }, [sorted]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    if (!a || !b) return setErr(t('kpiExt.comparePickBoth'))
    if (a === b) return setErr(t('kpiExt.compareSame'))
    setErr('')
    setParams({ interval_a: Number(a), interval_b: Number(b), group_by: groupBy, position_group: pg || undefined })
  }

  const ivOptions = sorted.map((iv) => ({ value: String(iv.id), label: iv.name || formatRange(iv.begin_date, iv.end_date), subLabel: formatRange(iv.begin_date, iv.end_date) }))
  const nameA = data?.interval_a?.name || 'A'
  const nameB = data?.interval_b?.name || 'B'
  const rows = data?.rows ?? []
  const chartRows = (data?.chart?.data ?? []).map((d) => ({ ...d, __x: sx(d.label) }))

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompareArrows size={17} className="text-brand" aria-hidden />
        <h3 className="text-[14px] font-semibold text-fg">{t('kpiExt.compareTitle')}</h3>
        <span className="text-[12px] text-fg-subtle">{t('kpiExt.compareHint')}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label={t('kpiExt.periodA')}>
          <Combobox value={a} onChange={setA} options={ivOptions} placeholder={t('kpi.pickInterval')} clearable={false} />
        </Field>
        <Field label={t('kpiExt.periodB')}>
          <Combobox value={b} onChange={setB} options={ivOptions} placeholder={t('kpi.pickInterval')} clearable={false} />
        </Field>
        <Field label={t('kpi.grouping')}>
          <Combobox
            value={groupBy}
            onChange={(v) => v && setGroupBy(v as CompareGroupBy)}
            options={GROUPS.map((g) => ({ value: g.value, label: t(g.key as never) }))}
            clearable={false}
          />
        </Field>
        <Field label={t('kpiExt.staffGroup')}>
          <PositionGroupFilter value={pg} onChange={setPg} className="lg:w-full" />
        </Field>
        <div className="flex items-end">
          <Button leftIcon={<GitCompareArrows size={15} />} loading={loading} onClick={run}>
            {t('kpiExt.compareRun')}
          </Button>
        </div>
      </div>
      <FormError className="text-xs">{err}</FormError>

      {params &&
        (loading && !data ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <p className="py-8 text-center text-sm text-danger">{errorMessage(error, t('list.loadFailed'))}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-subtle">{t('kpi.noData')}</p>
        ) : (
          <>
            <div className="rounded-xl border border-line p-3">
              <p className="mb-1.5 text-[12px] text-fg-muted">{t('kpiExt.compareChart')}</p>
              <Suspense fallback={<Skeleton className="h-72 w-full" />}>
                <ReportBarChart
                  rows={chartRows}
                  series={[
                    { key: 'a_percent', label: `${t('kpi.colPercent')} · ${sx(nameA)}` },
                    { key: 'b_percent', label: `${t('kpi.colPercent')} · ${sx(nameB)}` },
                  ]}
                  height={300}
                />
              </Suspense>
            </div>
            <div className="scroll-thin max-h-[480px] overflow-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-left" style={{ minWidth: 980 }}>
                <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgb(var(--border))]">
                  <tr>
                    <th scope="col" rowSpan={2} className={cn(TH, 'align-bottom')}>
                      {t(GROUP_COL[data?.group_by ?? groupBy] as never)}
                    </th>
                    <th scope="colgroup" colSpan={3} className={cn(TH, 'border-l border-line text-center')}>
                      A · {sx(nameA)}
                    </th>
                    <th scope="colgroup" colSpan={3} className={cn(TH, 'border-l border-line text-center')}>
                      B · {sx(nameB)}
                    </th>
                    <th scope="colgroup" colSpan={2} className={cn(TH, 'border-l border-line text-center')}>
                      {t('kpiExt.compareDelta')}
                    </th>
                  </tr>
                  <tr>
                    {['a', 'b'].map((p) => (
                      <PeriodHeads key={p} />
                    ))}
                    <th scope="col" className={cn(TH, 'border-l border-line text-right')}>{t('kpi.colFact')}</th>
                    <th scope="col" className={cn(TH, 'text-right')}>{t('kpiExt.deltaPp')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.key ?? 'x'}-${i}`} className="border-b border-line last:border-0">
                      <td className={cn(TD, 'max-w-[18rem] py-2.5')}>
                        <span className="line-clamp-2 text-fg">{sx(r.label) || '—'}</span>
                      </td>
                      <td className={cn(TD, 'border-l border-line text-right tabular-nums')}>{n2(r.a_plan)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{n2(r.a_fact)}</td>
                      <td className={cn(TD, 'text-right tabular-nums font-semibold')}>{r.a_percent == null ? '—' : `${n2(r.a_percent)}%`}</td>
                      <td className={cn(TD, 'border-l border-line text-right tabular-nums')}>{n2(r.b_plan)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{n2(r.b_fact)}</td>
                      <td className={cn(TD, 'text-right tabular-nums font-semibold')}>{r.b_percent == null ? '—' : `${n2(r.b_percent)}%`}</td>
                      <td className={cn(TD, 'border-l border-line text-right tabular-nums')}>{n2(r.delta_fact)}</td>
                      <td className={cn(TD, 'text-right')}>
                        <Trend value={r.delta_percent} trend={r.trend} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
    </Card>
  )
}

function PeriodHeads() {
  const { t } = useTranslation()
  return (
    <>
      <th scope="col" className={cn(TH, 'border-l border-line text-right')}>{t('kpi.colPlan')}</th>
      <th scope="col" className={cn(TH, 'text-right')}>{t('kpi.colFact')}</th>
      <th scope="col" className={cn(TH, 'text-right')}>{t('kpi.colPercent')}</th>
    </>
  )
}

function Trend({ value, trend }: { value: number | null; trend: 'up' | 'down' | 'flat' }) {
  const { t } = useTranslation()
  if (value == null) return <span className="text-fg-subtle">—</span>
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ArrowRight
  return (
    <Badge tone={trend === 'up' ? 'success' : trend === 'down' ? 'danger' : 'neutral'}>
      <span className="inline-flex items-center gap-1 tabular-nums" title={t(`kpiExt.trend_${trend}` as never)}>
        <Icon size={12} aria-hidden />
        {value > 0 ? '+' : ''}
        {n2(value)}
      </span>
    </Badge>
  )
}
