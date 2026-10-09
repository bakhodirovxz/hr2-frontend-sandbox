import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronRight, Download, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import * as roles from '@/auth/roles'
import { BonusesPanel } from '@/features/kpi/BonusesPanel'
import { KpiGauge } from '@/features/kpi/KpiGauge'
import { kpiOutcome, OUTCOME_CHIP } from '@/features/kpi/outcome'
import { StakeholdersPanel } from '@/features/kpi/StakeholdersPanel'
import { KpiResultsTab } from '@/features/kpi/KpiResultsTab'
import { KpiSheetsTab } from '@/features/kpi/KpiSheetsTab'
import { KpiSettingsTab } from '@/features/kpi/KpiSettingsTab'
import { KpiGoalsTab } from '@/features/kpi/KpiGoalsTab'
import { KpiReportsTab } from '@/features/kpi/KpiReportsTab'
import { KpiAuditTab } from '@/features/kpi/KpiAuditTab'
import { KpiMonthCloseTab } from '@/features/kpi/KpiMonthCloseTab'
import { useKpiPermissions } from '@/features/kpi/useKpiPermissions'
import { EntryHistoryPanel, EntryTrailPanel } from '@/features/kpi/EntryTrailPanel'
import { useKpiOps } from '@/features/kpi/useKpiOps'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { KPI_EXPORT_MY_SCORECARD } from '@/api/endpoints'
import {
  formatPeriod,
  isPenalty,
  useKpiEntry,
  useKpiMutations,
  useMyScorecard,
  useMyTeam,
  useTaskStatuses,
  type KpiEntry,
  type KpiTask,
  type TeamMember,
} from '@/features/kpi/useKpi'
import { control } from '@/components/ui/control'
import { TH, TD, TD_MESSAGE } from '@/components/data/tableStyles'

const ENTRY_STATUS_KEY: Record<string, string> = {
  draft: 'kpi.statusDraft',
  N: 'kpi.statusN',
  I: 'kpi.statusI',
  D: 'kpi.statusD',
  locked: 'kpi.statusLocked',
}

const isLocked = (e?: KpiEntry | null) => e?.status === 'locked' || e?.status === 'D'

type Tab = 'mine' | 'team' | 'results' | 'close' | 'sheets' | 'goals' | 'reports' | 'audit' | 'settings'

/** URL keys this screen owns. Sub-tabs keep their own filter keys. */
const KPI_KEYS = ['tab', 'entry'] as const

export function KpiPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canManage = roles.canManageKpi(user)
  // KPI is branch-bound (`/me` kpi_enabled). The menu hides it, but a typed or
  // bookmarked /kpi still mounts this page: its own queries must stay quiet
  // there, or each one answers 403 «KPI moduli … yoqilmagan» and lands in the
  // journal as an error before the «not enabled» card below is drawn.
  const kpiOn = user?.kpi_enabled !== false
  // The journal is its own grant (source `audit/kpi_audit`), not just «manager».
  const perms = useKpiPermissions(canManage && kpiOn)

  /**
   * TAB AND OPEN ENTRY LIVE IN THE URL.
   *
   * They used to be `useState`, which made this screen unaddressable: a
   * notification about a KPI task had nowhere to point, and neither did a
   * pasted link. `?tab=…&entry=…` is the same convention the rest of v2 uses
   * (see `features/search/searchRoutes.ts`).
   */
  const { filters, setFilter, setFilters } = useListParams(KPI_KEYS)
  const tab = (filters.tab || (user?.employee?.id ? 'mine' : 'results')) as Tab
  const setTab = (v: Tab) => setFilters({ tab: v, entry: null })
  const openEntryId = filters.entry ? Number(filters.entry) : null
  const setOpenEntryId = (v: number | null) => setFilter('entry', v == null ? '' : String(v))
  /** Whose scorecard is on screen — null = mine. */
  const [viewEmployeeId, setViewEmployeeId] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const { team } = useMyTeam(kpiOn)
  const pendingTotal = team.reduce((sum, m) => sum + (m.pending_tasks ?? 0), 0)

  /**
   * "Mening KPI" is a PERSON's scorecard: `/kpi/my-scorecard` and its export
   * answer `not_an_employee` (400) for a login with no employee row — and no
   * admin account has one. The tab is therefore offered only where it can work.
   */
  const hasEmployee = !!user?.employee?.id
  const tabOptions: { value: Tab; label: string }[] = [
    ...(hasEmployee ? [{ value: 'mine' as Tab, label: t('kpi.tabMine') }] : []),
    ...(team.length > 0 ? [{ value: 'team' as Tab, label: `${t('kpi.tabTeam')} (${team.length})` }] : []),
    ...(canManage
      ? [
          { value: 'results' as Tab, label: t('kpi.tabResults') },
          { value: 'close' as Tab, label: t('kpi.tabMonthClose') },
          { value: 'sheets' as Tab, label: t('kpi.tabSheets') },
          { value: 'goals' as Tab, label: t('kpi.tabGoals') },
          { value: 'reports' as Tab, label: t('kpi.tabReports') },
          ...(perms.can('kpi_audit') ? [{ value: 'audit' as Tab, label: t('kpi.tabAudit') }] : []),
          { value: 'settings' as Tab, label: t('kpi.tabSettings') },
        ]
      : []),
  ]

  const activeTab: Tab = tabOptions.some((o) => o.value === tab) ? tab : (tabOptions[0]?.value ?? 'mine')

  if (user && user.kpi_enabled === false) {
    return (
      <PageContainer>
        <PageHeader title={t('kpi.title')} subtitle={t('kpi.subtitle')} />
        <Card className="p-10 text-center text-sm text-fg-subtle">{t('kpi.notEnabled')}</Card>
      </PageContainer>
    )
  }

  if (openEntryId) {
    return (
      <EntryDetail
        entryId={openEntryId}
        onBack={() => setOpenEntryId(null)}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('kpi.title')} subtitle={t('kpi.subtitle')} />

      {tabOptions.length > 1 && !viewEmployeeId && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented value={activeTab} onChange={(v) => setTab(v)} options={tabOptions} />
          {pendingTotal > 0 && (
            <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
              {t('kpi.pendingCount', { count: pendingTotal })}
            </span>
          )}
        </div>
      )}

      {notice && (
        <div
          className={cn(
            'mb-3 rounded-lg border px-3 py-2 text-sm',
            notice.kind === 'ok'
              ? 'border-success/30 bg-success-soft text-success'
              : 'border-warning/30 bg-warning-soft text-warning',
          )}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {activeTab === 'team' && !viewEmployeeId ? (
        <TeamList team={team} onPick={(id) => setViewEmployeeId(id)} />
      ) : activeTab === 'results' && !viewEmployeeId ? (
        <KpiResultsTab onOpenEntry={setOpenEntryId} />
      ) : activeTab === 'close' && !viewEmployeeId ? (
        <KpiMonthCloseTab onOpenReports={() => setTab('reports')} />
      ) : activeTab === 'sheets' && !viewEmployeeId ? (
        <KpiSheetsTab onNotice={(kind, text) => setNotice({ kind, text })} />
      ) : activeTab === 'goals' && !viewEmployeeId ? (
        <KpiGoalsTab canManage={canManage} />
      ) : activeTab === 'reports' && !viewEmployeeId ? (
        <KpiReportsTab canManage={canManage} />
      ) : activeTab === 'audit' && !viewEmployeeId ? (
        <KpiAuditTab />
      ) : activeTab === 'settings' && !viewEmployeeId ? (
        <KpiSettingsTab onNotice={(kind, text) => setNotice({ kind, text })} />
      ) : (
        <Scorecard
          // `useMyScorecard` is gated on a non-null id (a login without an
          // employee row gets 400), so "Mening KPI" must pass the viewer's own
          // employee id — with `null` the query never ran and every employee
          // saw an empty scorecard.
          employeeId={viewEmployeeId ?? user?.employee?.id ?? null}
          onBack={viewEmployeeId ? () => setViewEmployeeId(null) : undefined}
          onOpenEntry={setOpenEntryId}
        />
      )}
    </PageContainer>
  )
}

// ─── Manager screen (A) ───────────────────────────────────────────────────────

function TeamList({ team, onPick }: { team: TeamMember[]; onPick: (id: number) => void }) {
  const { t } = useTranslation()
  if (team.length === 0) {
    return <Card className="p-10 text-center text-sm text-fg-subtle">{t('kpi.teamEmpty')}</Card>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {team.map((m) => (
        <Card key={m.employee_id} className="p-0">
          <button
            type="button"
            onClick={() => onPick(m.employee_id)}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-2"
          >
            <Avatar src={m.photo_thumb_path} fallbackSrc={m.photo_path} name={m.legal_name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{m.legal_name ?? '—'}</p>
              <p className="truncate text-xs text-fg-subtle">{m.job_position_name ?? ''}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                  OUTCOME_CHIP[kpiOutcome(m.result_percent, m.penalty_points)])}>
                  {Math.round(m.result_percent ?? 0)}%
                </span>
                {(m.pending_tasks ?? 0) > 0 && (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                    {t('kpi.pendingCount', { count: m.pending_tasks ?? 0 })}
                  </span>
                )}
                {m.all_done && (
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                    {t('kpi.allDone')}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={16} className="shrink-0 text-fg-subtle" />
          </button>
        </Card>
      ))}
    </div>
  )
}

// ─── Employee screen (B) ──────────────────────────────────────────────────────

function Scorecard({
  employeeId,
  onBack,
  onOpenEntry,
}: {
  employeeId: number | null
  onBack?: () => void
  onOpenEntry: (id: number) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [period, setPeriod] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const { scorecard, loading } = useMyScorecard(employeeId, period)

  const exportScorecard = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: KPI_EXPORT_MY_SCORECARD,
        mime: XLSX_MIME,
        filename: `KPI_varaqa_${period ?? 'joriy'}.xlsx`,
        params: { employee_id: employeeId || undefined, period: period || undefined },
      })
      toast.ok(t('kpi.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.exportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const profile = scorecard?.profile
  const entries = scorecard?.entries ?? []
  const periods = scorecard?.available_periods ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={15} /> {t('kpi.back')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          loading={exporting}
          leftIcon={<Download size={14} />}
          onClick={exportScorecard}
        >
          Excel
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="flex flex-col items-center gap-4 p-5">
          <Avatar src={profile?.photo_thumb_path} fallbackSrc={profile?.photo_path} name={profile?.legal_name} size={72} />
          <div className="text-center">
            <p className="text-base font-semibold text-fg">{profile?.legal_name ?? '—'}</p>
            <p className="text-xs text-fg-subtle">{profile?.job_position_name ?? ''}</p>
          </div>
          <KpiGauge value={scorecard?.result_percent ?? 0} bonus={scorecard?.bonus_points} penalty={scorecard?.penalty_points} />
          <dl className="w-full space-y-1.5 text-xs">
            <Row label={t('kpi.profileDepartment')} value={profile?.department_name} />
            <Row label={t('kpi.profileSupervisor')} value={profile?.supervisor_name} />
          </dl>
          {periods.length > 0 && (
            <div className="w-full">
              <label className="mb-1 block text-xs text-fg-muted">{t('kpi.period')}</label>
              <Select
                value={period ?? scorecard?.period ?? ''}
                onChange={(e) => setPeriod(e.target.value || null)}
                options={periods.map((p) => ({ value: p, label: formatPeriod(p) }))}
              />
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
              <thead>
                <tr className="border-b border-line text-[11.5px] font-semibold text-fg-muted">
                  <th className={TH}>{t('kpi.colIndicator')}</th>
                  <th className={cn(TH, "text-right")}>{t('kpi.colPlan')}</th>
                  <th className={cn(TH, "text-right")}>{t('kpi.colFact')}</th>
                  <th className={cn(TH, "text-right")}>{t('kpi.colResult')}</th>
                  <th className={TH}>{t('kpi.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={TD_MESSAGE}>
                      …
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={TD_MESSAGE}>
                      {t('kpi.entriesEmpty')}
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => {
                    const penalty = isPenalty(e)
                    return (
                      <tr
                        key={e.id}
                        onClick={() => onOpenEntry(e.id)}
                        className="cursor-pointer border-b border-line text-sm transition-colors last:border-0 hover:bg-surface-2"
                      >
                        <td className={TD}>
                          <span className={cn('font-medium', penalty ? 'text-danger' : 'text-fg')}>
                            {penalty && <span className="mr-1 font-bold">{t('kpi.penalty')} −</span>}
                            {e.indicator?.name ?? '—'}
                          </span>
                        </td>
                        <td className={cn(TD, "text-right tabular-nums text-fg-muted")}>
                          {e.plan_value ?? 0}
                        </td>
                        <td className={cn(TD, "text-right tabular-nums text-fg-muted")}>
                          {e.fact_value ?? 0}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right font-semibold tabular-nums',
                            // A penalty row is red only when a penalty was
                            // actually given; 0 on it is the good outcome.
                            penalty ? (Number(e.fact_value ?? 0) > 0 ? 'text-danger' : 'text-fg-muted') : 'text-fg',
                          )}
                        >
                          {Math.round(e.result_percent ?? 0)}%
                        </td>
                        <td className={TD}>
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
                            {isLocked(e) && <Lock size={10} />}
                            {t((ENTRY_STATUS_KEY[e.status ?? 'draft'] ?? 'kpi.statusDraft') as never)}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="truncate text-right text-fg-muted">{value}</dd>
    </div>
  )
}

// ─── Entry detail (C) ─────────────────────────────────────────────────────────

function EntryDetail({ entryId, onBack }: { entryId: number; onBack: () => void }) {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { entry, loading } = useKpiEntry(entryId)
  const statuses = useTaskStatuses(branchId)
  const mut = useKpiMutations()
  const confirm = useConfirm()

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScore, setNewScore] = useState('')
  const [deleteTask, setDeleteTask] = useState<KpiTask | null>(null)
  const [detailTab, setDetailTab] = useState<
    'tasks' | 'trail' | 'history' | 'bonuses' | 'access'
  >('tasks')
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusValue, setStatusValue] = useState('')
  /** The submit → review loop. v2 had neither end of it: a task could be
   *  graded straight away, but never SENT for grading and never refused. */
  const [renaming, setRenaming] = useState<KpiTask | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [reviewing, setReviewing] = useState<{ task: KpiTask; approve: boolean } | null>(null)
  const [reviewScore, setReviewScore] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const ops = useKpiOps()
  const toast = useToast()

  const access = entry?.my_access ?? {}
  const locked = isLocked(entry)
  const canEdit = !locked && (access.edit_access || access.is_owner || access.manage_access)
  const canGrade = !locked && (access.task_approve_access || access.manage_access)
  // Server (kpi.set_entry_status): manager OR the `status_change_access`
  // stakeholder grant. Grading tasks (`task_approve_access`) is a different
  // right — a supervisor saw «Holatni o‘zgartirish» and got 403 (09-25 sweep).
  const canChangeStatus = !locked && (access.status_change_access || access.manage_access)
  // Granting capabilities to others is a management action — it stays available
  // even on a locked entry (you may still need to fix who can see it).
  const canManageAccess = !!access.manage_access

  const tasks = entry?.tasks ?? []
  /** Only the person the entry belongs to may hand a task in (`submit_task`). */
  const isOwner = !locked && !!access.is_owner

  const runTask = async (p: Promise<unknown>, msg: string) => {
    try {
      await p
      mut.invalidate()
      toast.ok(msg)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const submitNew = async () => {
    if (!newName.trim()) return
    await mut.addTask.mutateAsync({
      entry_id: entryId,
      name: newName.trim(),
      score: newScore.trim() === '' ? null : Number(newScore),
    })
    setNewName('')
    setNewScore('')
    setAdding(false)
    mut.invalidate()
  }

  const doDelete = async () => {
    if (!deleteTask) return
    await mut.removeTask.mutateAsync(deleteTask.id)
    setDeleteTask(null)
    mut.invalidate()
  }

  return (
    <PageContainer>
      <PageHeader
        title={entry?.indicator?.name ?? t('kpi.title')}
        subtitle={
          entry?.employee?.legal_name ? (
            <span className="inline-flex items-center gap-2">
              <Avatar src={entry.employee.photo_thumb_path} name={entry.employee.legal_name} size={22} />
              {entry.employee.legal_name}
            </span>
          ) : undefined
        }
        actions={
          <>
            {canChangeStatus && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusValue(entry?.status ?? '')
                  setStatusOpen(true)
                }}
              >
                {t('kpi.changeStatus')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={15} /> {t('kpi.back')}
            </Button>
          </>
        }
      />

      {locked && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          <Lock size={14} /> {t('kpi.entryLocked')}
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-fg-subtle">{t('kpi.summaryPlan')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-fg">{entry?.plan_value ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-fg-subtle">{t('kpi.summaryFact')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-fg">{entry?.fact_value ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-fg-subtle">{t('kpi.summaryTasks')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-fg">{tasks.length}</p>
        </Card>
      </div>

      <div className="mb-3">
        <Segmented
          value={detailTab}
          onChange={(v) => setDetailTab(v)}
          options={[
            { value: 'tasks', label: t('kpi.entryTabTasks') },
            { value: 'trail', label: t('kpi.entryTabTrail') },
            { value: 'history', label: t('kpi.entryTabHistory') },
            { value: 'bonuses', label: t('kpi.entryTabBonuses') },
            ...(canManageAccess ? [{ value: 'access' as const, label: t('kpi.entryTabAccess') }] : []),
          ]}
        />
      </div>

      {detailTab === 'trail' && (
        <Card className="p-4">
          <EntryTrailPanel entryId={entryId} canEdit={!!canEdit} />
        </Card>
      )}

      {detailTab === 'history' && (
        <Card className="p-4">
          <EntryHistoryPanel entryId={entryId} />
        </Card>
      )}

      {detailTab === 'bonuses' && (
        <Card className="p-4">
          <BonusesPanel objectType="entry" objectId={entryId} canManage={!!canGrade} />
        </Card>
      )}

      {detailTab === 'access' && (
        <Card className="p-4">
          <StakeholdersPanel objectType="entry" objectId={entryId} canManage={canManageAccess} />
        </Card>
      )}

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        size="sm"
        title={t('kpi.changeStatus')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={ops.setEntryStatus.isPending}
              onClick={async () => {
                try {
                  await ops.setEntryStatus.mutateAsync({
                    id: entryId,
                    current: entry?.status,
                    status: statusValue,
                  })
                  toast.ok(t('kpi.statusChanged'))
                  setStatusOpen(false)
                } catch (e) {
                  toast.error(errorMessage(e, t('kpi.statusChangeFailed')))
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Select
            value={statusValue}
            onChange={(e) => setStatusValue(e.target.value)}
            options={[
              { value: 'N', label: t('kpi.statusN') },
              { value: 'I', label: t('kpi.statusI') },
              { value: 'D', label: t('kpi.statusD') },
            ]}
            placeholder={t('kpi.changeStatus')}
            aria-label={t('kpi.changeStatus')}
          />
          {/* ⚠️ NO COMMENT FIELD. `POST /kpi/entries/{id}/status` accepts only
              `action`; the box that used to sit here wrote to a key the server
              discards, so every note typed into it was lost without a word. The
              action itself is recorded in the entry's history. */}
        </div>
      </Modal>

      <Card className={cn('overflow-hidden', detailTab !== 'tasks' && 'hidden')}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{t('kpi.tasksTitle')}</h2>
          {canEdit && (
            <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
              <Plus size={14} /> {t('kpi.addTask')}
            </Button>
          )}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-fg-subtle">…</p>
        ) : tasks.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-subtle">{t('kpi.tasksEmpty')}</p>
        ) : (
          <ul>
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{task.name ?? '—'}</span>

                {/* Hand in for grading — the owner's move, and only from a
                    draft (`submit_task` refuses anything else). */}
                {isOwner && task.status === 'draft' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!(await confirm({ kind: 'send', subject: task.name, confirmLabel: t('kpi.taskSubmit') }))) return
                      await runTask(ops.submitTask.mutateAsync(task.id), t('kpi.taskSubmitted'))
                    }}
                  >
                    {t('kpi.taskSubmit')}
                  </Button>
                )}

                {/* The reviewer's pair. `review_task` accepts only a SUBMITTED
                    task, so the buttons follow that and not "can I grade". */}
                {canGrade && task.status === 'submitted' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        setReviewScore(task.score == null ? '' : String(task.score))
                        setReviewNote('')
                        setReviewing({ task, approve: true })
                      }}
                    >
                      {t('kpi.taskConfirm')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setReviewNote('')
                        setReviewing({ task, approve: false })
                      }}
                    >
                      {t('kpi.taskReject')}
                    </Button>
                  </>
                )}

                {canGrade ? (
                  <input
                    type="number"
                    defaultValue={task.score ?? ''}
                    aria-label={t('kpi.taskScore')}
                    onBlur={(e) => {
                      const v = e.target.value
                      if (v === '' || Number(v) === task.score) return
                      void mut.setTaskGrade
                        .mutateAsync({ id: task.id, score: Number(v) })
                        .then(() => mut.invalidate())
                    }}
                    className={cn(control(), 'h-8 w-20 px-2 tabular-nums')}
                  />
                ) : (
                  <span className="w-20 text-right text-sm font-semibold tabular-nums text-fg">
                    {task.score ?? 0}
                  </span>
                )}

                {canChangeStatus && statuses.length > 0 ? (
                  <Select
                    wrapperClassName="w-44"
                    value={String(task.status_id ?? '')}
                    onChange={async (e) => {
                      const id = Number(e.target.value)
                      if (!id) return
                      if (!(await confirm({ kind: 'status', subject: task.name }))) return
                      void mut.setTaskStatus
                        .mutateAsync({ id: task.id, status_id: id })
                        .then(() => mut.invalidate())
                    }}
                    options={statuses.map((s) => ({ value: String(s.id), label: s.name ?? '' }))}
                    className="h-8"
                  />
                ) : (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: task.task_status?.color ? `${task.task_status.color}22` : undefined,
                      color: task.task_status?.color ?? undefined,
                    }}
                  >
                    {task.task_status?.name ?? task.status ?? '—'}
                  </span>
                )}

                {/* Mirror the server: a task is renamed only while it is a draft
                    (`update_task`), and the owner may delete only a draft while a
                    manager may delete any (`delete_task`). The buttons used to
                    show for every status and answered with a 403 toast. */}
                {canEdit && task.status === 'draft' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('common.edit')}
                    onClick={() => {
                      setRenameValue(task.name ?? '')
                      setRenaming(task)
                    }}
                  >
                    <Pencil size={14} />
                  </Button>
                )}
                {canEdit && (task.status === 'draft' || access.manage_access) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-danger"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleteTask(task)}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={t('kpi.addTask')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitNew} disabled={!newName.trim() || mut.addTask.isPending}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('kpi.taskName')}</span>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </label>
          {canGrade && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('kpi.taskScore')}</span>
              <Input type="number" value={newScore} onChange={(e) => setNewScore(e.target.value)} />
            </label>
          )}
        </div>
      </Modal>

      {/* Vazifa nomini tahrirlash — `updateTask` yozilgan edi, hech kim
          chaqirmasdi, ya'ni noto'g'ri yozilgan nomni tuzatib bo'lmasdi. */}
      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title={t('kpi.renameTaskTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={async () => {
                const task = renaming
                if (!task) return
                setRenaming(null)
                await runTask(
                  mut.updateTask.mutateAsync({ id: task.id, body: { name: renameValue.trim() } }),
                  t('kpi.saved'),
                )
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <Field label={t('kpi.taskName')}>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
        </Field>
      </Modal>

      {/* Ko'rib chiqish: tasdiqlashda BAHO, rad etishda SABAB. Serverdagi
          `KpiTaskReview` ikkalasini ham oladi; mijoz ilgari hech birini
          yubormasdi, chunki bu oqim umuman ulanmagandi. */}
      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={reviewing?.approve ? t('kpi.taskConfirmTitle') : t('kpi.taskRejectTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReviewing(null)}>{t('common.cancel')}</Button>
            <Button
              variant={reviewing?.approve ? 'primary' : 'danger'}
              disabled={!reviewing?.approve && !reviewNote.trim()}
              onClick={async () => {
                const r = reviewing
                if (!r) return
                setReviewing(null)
                await runTask(
                  ops.reviewTask.mutateAsync({
                    id: r.task.id,
                    approved: r.approve,
                    score: r.approve && reviewScore.trim() !== '' ? Number(reviewScore) : null,
                    note: reviewNote.trim() || undefined,
                  }),
                  r.approve ? t('kpi.taskConfirmed') : t('kpi.taskRejected'),
                )
              }}
            >
              {reviewing?.approve ? t('kpi.taskConfirm') : t('kpi.taskReject')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {reviewing?.approve && (
            <Field label={t('kpi.taskScore')}>
              <Input
                type="number"
                value={reviewScore}
                onChange={(e) => setReviewScore(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          )}
          <Field label={t('kpi.reviewNote')} required={!reviewing?.approve}>
            <Textarea rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTask}
        onClose={() => setDeleteTask(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteTaskTitle')}
        description={t('kpi.deleteTaskConfirm')}
        confirmLabel={t('common.delete')}
      />
    </PageContainer>
  )
}
