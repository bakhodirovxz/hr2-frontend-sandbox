import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Target } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { useListParams } from '@/hooks/useListParams'
import { useMyTeam } from '@/features/kpi/api'
import { useKpiAccess } from '@/features/kpi/useKpiAccess'
import { EmployeeScorecard, TeamTab } from '@/features/kpi/EmployeeScorecard'
import { EntryDetailModal, KpiResultsTab } from '@/features/kpi/KpiResultsTab'
import { KpiScorecardsTab } from '@/features/kpi/KpiScorecardsTab'
import { KpiReportsTab } from '@/features/kpi/KpiReportsTab'
import { KpiIndicatorsTab } from '@/features/kpi/KpiIndicatorsTab'
import { JustificationsTab } from '@/features/kpi/JustificationsTab'

/*
 * KPI — TZ 4.2.8 (425–430, 2158–2163), K1, K3.
 *
 * Management and HR (`canWriteOrg('kpi')`): «Natijalar» (entries), «Baholash
 * varaqalari» (scorecards), «Hisobot» (K3), «KPI sozlamalari» (K1 catalogue
 * and evaluation periods) and «Markaziy obosnovaniyalar» (the master admin's
 * central catalogue). Everyone with an employee card: «Mening KPI»; a head
 * also «Xodimlarim samaradorligi».
 *
 * The tab and an opened entry live in the URL (`?tab=…&entry=…`) — the
 * notification link is `/kpi?tab=mine&entry=<id>`; v1's navigation state
 * `{openKpiEntryId}` is honoured too.
 */

type Tab = 'mine' | 'team' | 'results' | 'sheets' | 'reports' | 'settings' | 'justifications'
const KEYS = ['tab', 'entry'] as const

export function KpiPage() {
  const { t } = useTranslation()
  const acc = useKpiAccess()
  const location = useLocation()
  const navigate = useNavigate()
  const { filters, setFilter } = useListParams(KEYS)
  const { members } = useMyTeam(null, acc.enabled && acc.hasEmployee)

  // v1 deep link: `navigate('/kpi', { state: { openKpiEntryId } })`.
  const stateEntry = (location.state as { openKpiEntryId?: number } | null)?.openKpiEntryId
  useEffect(() => {
    if (!stateEntry) return
    setFilter('entry', String(stateEntry))
    navigate({ search: `?entry=${stateEntry}` }, { replace: true, state: null })
  }, [stateEntry]) // eslint-disable-line react-hooks/exhaustive-deps

  const options: { value: Tab; label: string }[] = [
    // TZ K1 1334–1335: opening «KPI» shows the list of indicators first.
    ...(acc.manager
      ? [
          { value: 'settings' as Tab, label: t('kpi.tabSettings') },
          { value: 'results' as Tab, label: t('kpi.tabResults') },
          { value: 'sheets' as Tab, label: t('kpi.tabSheets') },
          ...(acc.can('kpi_report') ? [{ value: 'reports' as Tab, label: t('kpi.tabReports') }] : []),
          { value: 'justifications' as Tab, label: t('kpi.tabJustifications') },
        ]
      : []),
    // TZ K3 «Руководитель … желает сформировать отчёт»: a department head
    // reports on his own unit (the server limits the rows).
    ...(!acc.manager && acc.can('kpi_report', 'run') ? [{ value: 'reports' as Tab, label: t('kpi.tabReports') }] : []),
    ...(acc.hasEmployee ? [{ value: 'mine' as Tab, label: t('kpi.tabMine') }] : []),
    ...(members.length > 0 ? [{ value: 'team' as Tab, label: t('kpi.tabTeam', { count: members.length }) }] : []),
  ]
  const requested = filters.tab as Tab
  const tab: Tab | undefined = options.some((o) => o.value === requested) ? requested : options[0]?.value
  const openEntry = filters.entry ? Number(filters.entry) : null

  if (!acc.enabled) {
    return (
      <PageContainer>
        <PageHeader title={t('kpi.title')} subtitle={t('kpi.subtitle')} />
        <Card className="p-6">
          <EmptyState icon={<Target size={22} />} title={t('kpi.notEnabled')} />
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={acc.manager ? t('kpi.title') : t('kpi.titleEmployee')} subtitle={t('kpi.subtitle')} />

      {options.length > 1 && (
        <div className="scroll-thin mb-4 overflow-x-auto">
          <Segmented
            value={tab ?? 'mine'}
            onChange={(v) => {
              // A tab owns its own filters — they do not leak into the next one.
              navigate({ search: `?tab=${v}` }, { replace: true })
            }}
            options={options}
          />
        </div>
      )}

      {!tab ? (
        <Card className="p-6">
          <EmptyState icon={<Target size={22} />} title={t('kpi.noCard')} description={t('kpi.noCardHint')} />
        </Card>
      ) : tab === 'results' ? (
        <KpiResultsTab onOpenEntry={(id) => setFilter('entry', String(id))} />
      ) : tab === 'sheets' ? (
        <KpiScorecardsTab />
      ) : tab === 'reports' ? (
        <KpiReportsTab />
      ) : tab === 'settings' ? (
        <KpiIndicatorsTab />
      ) : tab === 'justifications' ? (
        <JustificationsTab canManage={acc.master} />
      ) : tab === 'team' ? (
        <TeamTab />
      ) : (
        <EmployeeScorecard employeeId={null} onOpenEntry={(id) => setFilter('entry', String(id))} />
      )}

      <EntryDetailModal id={openEntry} onClose={() => setFilter('entry', '')} />
    </PageContainer>
  )
}
