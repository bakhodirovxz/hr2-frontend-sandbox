import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Activity, ClipboardCheck, ConciergeBell } from 'lucide-react'
import { apiGet } from '@/api/http'
import { useAuthStore } from '@/store/authStore'
import { can } from '@/auth/permissions'
import { serviceLabel } from '@/features/services/serviceLabel'
import type { ServiceRequestRow, ServiceStatus } from '@/features/services/useServices'
import type { WorkPlan } from '@/features/workplan/useWorkPlan'
import { Panel, PanelEmpty } from './Panel'
import { IconCell, ListRow, RowList, StatusPill, type RowTone } from './rows'
import { ToneTile } from './boardDrill'

/**
 * XODIM DOSKASINING TZ MANBALARI — shaxsiy kabinet (TZ 4.2.4) bilan bog'liq
 * uchta savol: so'rovlarim qayerda (I1, interaktiv xizmatlar), ish rejamda nima
 * ochiq (K2) va bu oy KPI'm qanday (4.2.8, `kpi/my-scorecard`). Har biri faqat
 * modul ochiq bo'lsa so'raladi — yopiq modul bloki jim qoladi.
 */

const OPEN_SERVICE: ServiceStatus[] = ['accepted', 'in_review', 'in_progress', 'ready']
const OPEN_PLAN = ['planned', 'in_progress']

export function useMyServices(enabled: boolean) {
  const q = useQuery({
    queryKey: ['board', 'my-services'],
    queryFn: () => apiGet<{ items: ServiceRequestRow[]; total: number }>('service-requests/my', { page: 1, size: 100 }),
    enabled,
    retry: false,
  })
  const rows = q.data?.items ?? []
  return {
    rows: rows.slice(0, 6),
    pending: rows.filter((r) => OPEN_SERVICE.includes(r.status)).length,
    loading: q.isLoading,
  }
}

export function useMyWorkPlans(employeeId: number | undefined, enabled: boolean) {
  const q = useQuery({
    queryKey: ['board', 'my-work-plans', employeeId],
    queryFn: () => apiGet<{ items: WorkPlan[] }>('work-plans', { employee_id: employeeId }),
    enabled: enabled && !!employeeId,
    retry: false,
  })
  return useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD')
    const open = (q.data?.items ?? [])
      .filter((p) => OPEN_PLAN.includes(p.status ?? ''))
      .sort((a, b) => String(a.end_date ?? '').localeCompare(String(b.end_date ?? '')))
    const overdue = open.filter((p) => p.end_date && p.end_date < today).length
    return { open, overdue, loading: q.isLoading }
  }, [q.data, q.isLoading])
}

export interface MyScorecard {
  employee_id: number
  result_percent: number | null
  period: string
  entries: {
    id: number
    plan_value: number | null
    fact_value: number | null
    result_percent: number | null
    status: string
    indicator?: { name?: string | null; unit?: string | null } | null
  }[]
}

export function useMyScorecard(enabled: boolean) {
  const q = useQuery({
    queryKey: ['board', 'my-scorecard'],
    queryFn: () => apiGet<MyScorecard>('kpi/my-scorecard'),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { data: q.data ?? null, loading: q.isLoading }
}

/** Qaysi bloklar shu hisob uchun ochiq — modul darajasi + KPI yoqilganmi. */
export function useMyTzAccess() {
  const user = useAuthStore((s) => s.user)
  return {
    services: can(user, 'services'),
    workPlans: can(user, 'work_plans'),
    kpi: !!user?.kpi_enabled && can(user, 'kpi') && !!user?.employee,
  }
}

const SERVICE_TONE: Partial<Record<ServiceStatus, RowTone>> = {
  accepted: 'info',
  in_review: 'warning',
  in_progress: 'warning',
  ready: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

export function MyServicesFace({ rows }: { rows: ServiceRequestRow[] }) {
  const { t } = useTranslation()
  if (rows.length === 0) return <PanelEmpty text={t('dashboard.myTz.servicesEmpty')} />
  return (
    <RowList className="pt-1">
      {rows.map((r) => (
        <ListRow key={r.id} filled className="max-h-[58px]">
          <IconCell icon={ConciergeBell} tone="brand" size={30} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[12.5px] font-medium text-fg">
              {serviceLabel(r.service_type, r.service_type)}
            </span>
            <span className="truncate text-[11px] text-fg-subtle tabnum">
              № {r.number}
              {r.submitted_at ? ` · ${dayjs(r.submitted_at).format('DD.MM.YYYY')}` : ''}
            </span>
          </span>
          <StatusPill tone={SERVICE_TONE[r.status] ?? 'neutral'}>
            {t(`services.status_${r.status}` as never)}
          </StatusPill>
        </ListRow>
      ))}
    </RowList>
  )
}

export function MyWorkPlanFace({ plans }: { plans: WorkPlan[] }) {
  const { t } = useTranslation()
  if (plans.length === 0) return <PanelEmpty text={t('dashboard.myTz.plansEmpty')} />
  const today = dayjs().format('YYYY-MM-DD')
  return (
    <RowList className="pt-1">
      {plans.slice(0, 6).map((p) => {
        const late = !!p.end_date && p.end_date < today
        return (
          <ListRow key={p.id} filled className="max-h-[58px]">
            <IconCell icon={ClipboardCheck} tone={late ? 'danger' : 'info'} size={30} />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-medium text-fg">{p.title || '—'}</span>
              <span className="truncate text-[11px] text-fg-subtle tabnum">
                {p.end_date ? t('dashboard.myTz.until', { date: dayjs(p.end_date).format('DD.MM.YYYY') }) : ''}
              </span>
            </span>
            <StatusPill tone={late ? 'danger' : p.status === 'in_progress' ? 'warning' : 'neutral'}>
              {late ? t('dashboard.myTz.overdue') : (p.status_label ?? p.status ?? '')}
            </StatusPill>
          </ListRow>
        )
      })}
    </RowList>
  )
}

const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}%`)

/** Joriy davr KPI varaqasi: umumiy natija va ko'rsatkichlar (reja → fakt). */
export function MyScorecardCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const access = useMyTzAccess()
  const { data, loading } = useMyScorecard(access.kpi)
  if (!access.kpi) return null
  return (
    <Panel wash="violet" className={className} label={t('dashboard.myKpi.title')}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3.5">
        <h2 className="m-0 flex min-w-0 items-center gap-2.5 text-[15px] font-bold text-fg">
          <ToneTile icon={Activity} size={30} />
          <span className="truncate">{t('dashboard.myKpi.title')}</span>
        </h2>
        {data?.period && <span className="text-[11.5px] text-fg-subtle tabnum">{data.period}</span>}
      </div>
      {loading ? null : !data || data.entries.length === 0 ? (
        <PanelEmpty text={t('dashboard.myKpi.empty')} />
      ) : (
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3">
          <span className="text-[36px] font-extrabold leading-none tracking-[-0.04em] text-brand-strong tabnum">
            {pct(data.result_percent)}
          </span>
          <RowList>
            {data.entries.map((e) => (
              <ListRow key={e.id} filled className="max-h-[54px]">
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[12.5px] font-medium text-fg">{e.indicator?.name ?? '—'}</span>
                  <span className="truncate text-[11px] text-fg-subtle tabnum">
                    {t('dashboard.myTz.planFact', { plan: e.plan_value ?? '—', fact: e.fact_value ?? '—' })}
                  </span>
                </span>
                <span className="text-[13px] font-semibold text-fg tabnum">{pct(e.result_percent)}</span>
              </ListRow>
            ))}
          </RowList>
        </div>
      )}
    </Panel>
  )
}

export const myTzIcons = { services: ConciergeBell, plans: ClipboardCheck }
