import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, Pencil, ShieldCheck, XCircle } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { pathVerdict } from '@/components/layout/navConfig'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/data/LoadError'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useBranchStore } from '@/store/branchStore'
import { apiGet } from '@/api/http'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { formatDateTime } from '@/lib/format'

/*
 * KADR NAZORATI — a protocol of what is MISSING from the employee cards.
 *
 * It is a report, not an editor: each row names one person and one rule they
 * fail, so HR can work down the list. Errors are cards that cannot be used as
 * they stand (no PINFL, no position); warnings are cards that merely look
 * unfinished.
 */
interface QualityRow {
  employee_id: number
  employee_name?: string | null
  employee_photo_thumb_path?: string | null
  employee_photo_path?: string | null
  rule?: string | null
  rule_title?: string | null
  severity?: string | null
  detail?: string | null
}

interface Protocol {
  checked: number
  issues: number
  errors: number
  warnings: number
  clean: number
  by_rule?: { rule: string; rule_title?: string; severity?: string; count: number }[]
  items?: QualityRow[]
  truncated?: boolean
  generated_at?: string
}

function HrQualityPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { filters, setFilter, activeFilterCount, reset } = useListParams(['severity', 'dept', 'rule'])
  const departments = useDepartmentOptions(branchId)
  const [exporting, setExporting] = useState(false)

  const q = useQuery({
    queryKey: ['employee-quality', { branchId, ...filters }],
    queryFn: () =>
      apiGet<Protocol>('employees/quality', {
        organization_branch_id: branchId || undefined,
        department_id: filters.dept || undefined,
        severity: filters.severity || undefined,
        // The rule narrows on the server (the list is capped at 2 000 rows).
        rule: filters.rule || undefined,
      }),
    placeholderData: (prev) => prev,
  })

  const data = q.data
  const rows = data?.items ?? []
  const navigate = useNavigate()
  const me = useAuthStore((st) => st.user)
  const canOpenCard = pathVerdict('/employees/1', me) === 'ok'
  /** Group the protocol by person; worst cards (most errors) first. */
  const people = useMemo(() => {
    const m = new Map<number, { id: number; name: string; photo?: string | null; photoFull?: string | null; issues: QualityRow[]; errors: number; warnings: number }>()
    for (const r of rows) {
      const p = m.get(r.employee_id) ?? { id: r.employee_id, name: r.employee_name ?? '—', photo: r.employee_photo_thumb_path, photoFull: r.employee_photo_path, issues: [], errors: 0, warnings: 0 }
      p.issues.push(r)
      if (r.severity === 'error') p.errors++
      else p.warnings++
      m.set(r.employee_id, p)
    }
    return [...m.values()].sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || a.name.localeCompare(b.name))
  }, [rows])

  const exportProtocol = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: 'employees/quality/export',
        mime: XLSX_MIME,
        filename: 'kadr-nazorat-protokoli.xlsx',
        params: {
          organization_branch_id: branchId || undefined,
          department_id: filters.dept || undefined,
          severity: filters.severity || undefined,
        },
      })
      toast.ok(t('hrQuality.exported'))
    } catch {
      toast.error(t('hrQuality.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('hrQuality.title')}
        subtitle={t('hrQuality.subtitle')}
        actions={
          <Button size="sm" variant="outline" leftIcon={<Download size={14} />} loading={exporting} onClick={exportProtocol}>
            Excel
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ShieldCheck} tone="brand" label={t('hrQuality.checked')} value={data?.checked ?? 0} />
        <Stat icon={CheckCircle2} tone="success" label={t('hrQuality.clean')} value={data?.clean ?? 0} />
        <Stat icon={XCircle} tone="danger" label={t('hrQuality.errors')} value={data?.errors ?? 0} />
        <Stat icon={AlertTriangle} tone="warning" label={t('hrQuality.warnings')} value={data?.warnings ?? 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-ui">
        <Combobox
          value={filters.severity || ''}
          onChange={(v) => setFilter('severity', v)}
          options={[
            { value: 'error', label: t('hrQuality.onlyErrors') },
            { value: 'warning', label: t('hrQuality.onlyWarnings') },
          ]}
          placeholder={t('hrQuality.allLevels')}
          className="w-full sm:w-48"
        />
        <Combobox
          value={filters.dept || ''}
          onChange={(v) => setFilter('dept', v)}
          options={departments}
          placeholder={t('hrQuality.allDepartments')}
          className="w-full sm:w-56"
        />
        <FilterReset count={activeFilterCount} onReset={reset} />
        {data?.generated_at && (
          <span className="ml-auto text-[11.5px] text-fg-subtle">{formatDateTime(data.generated_at)}</span>
        )}
      </div>

      {(data?.by_rule ?? []).length > 0 && (
        /* Rule chips are FILTERS now (redesign 2026-09-24): «who has no PINFL»
           is one click, not a scroll through 157 rows. */
        <Card className="mb-4 p-card">
          <p className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('hrQuality.byRule')}</p>
          <div className="flex flex-wrap gap-1.5">
            {data!.by_rule!.map((r) => {
              const on = filters.rule === r.rule
              return (
                <button
                  key={r.rule}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter('rule', on ? '' : r.rule)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors',
                    r.severity === 'error' ? 'border-danger/25 bg-danger-soft text-danger' : 'border-warning/25 bg-warning-soft text-warning',
                    on && 'ring-2 ring-brand ring-offset-1 ring-offset-surface',
                  )}
                >
                  {r.rule_title || r.rule}
                  <span className="rounded-pill bg-surface/70 px-1.5 tabular-nums">{r.count}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : q.isError ? (
        /*
         * ⚠️ A FAILED REQUEST IS NOT A CLEAN BILL OF HEALTH: without this branch
         * a 403/500 drew a green «no issues found» with every counter on 0.
         */
        <Card className="p-6">
          <LoadError error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : people.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={<CheckCircle2 size={22} />} title={t('hrQuality.noIssues')} description={t('hrQuality.noIssuesHint')} />
        </Card>
      ) : (
        /* ONE ROW PER PERSON with all their problems as chips — the same name
           used to repeat once per failed rule (8× for one card). HR fixes a
           CARD, so the card is the unit; «Tuzatish» opens it. */
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-line bg-surface-2/50 px-4 py-2 text-[12px] text-fg-subtle">
            <span className="flex-1">{t('hrQuality.peopleCount', { count: people.length })}</span>
            <span>{t('hrQuality.sortedWorst')}</span>
          </div>
          <ul className="divide-y divide-line/60">
            {people.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-3 sm:w-[300px] sm:shrink-0">
                  <Avatar src={p.photo} fallbackSrc={p.photoFull} name={p.name} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-fg">{p.name}</span>
                    <span className="flex gap-2 text-[11.5px] font-semibold">
                      {p.errors > 0 && <span className="text-danger">{t('hrQuality.nErrors', { count: p.errors })}</span>}
                      {p.warnings > 0 && <span className="text-warning">{t('hrQuality.nWarnings', { count: p.warnings })}</span>}
                    </span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {p.issues.map((r, i) => (
                    <span
                      key={`${r.rule}-${i}`}
                      title={r.detail ?? undefined}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11.5px] font-medium',
                        r.severity === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', r.severity === 'error' ? 'bg-danger' : 'bg-warning')} />
                      {r.rule_title}
                      {r.detail ? <span className="font-normal opacity-80">· {r.detail}</span> : null}
                    </span>
                  ))}
                </div>
                {canOpenCard && (
                  <Button size="sm" variant="secondary" leftIcon={<Pencil size={13} />} onClick={() => navigate(`/employees/${p.id}`)} className="shrink-0 self-start sm:self-center">
                    {t('hrQuality.fix')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {data?.truncated && <p className="px-4 py-2 text-[11.5px] text-fg-subtle">{t('hrQuality.truncated')}</p>}
        </Card>
      )}
    </PageContainer>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldCheck
  label: string
  value: number
  tone: 'brand' | 'success' | 'danger' | 'warning'
}) {
  const cls = {
    brand: 'bg-brand-soft text-brand-strong',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
  }[tone]
  return (
    <Card className="flex items-center gap-3 p-card">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${cls}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-fg-muted">{label}</span>
        <span className="block truncate text-[16px] font-semibold tabular-nums text-fg">{value}</span>
      </span>
    </Card>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function HrQualityPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.isHR(user) || roles.isSiteMasterAdmin(user)} title={t('hrQuality.title')}>
      <HrQualityPageInner />
    </RequireRole>
  )
}

