import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlertTriangle, Check, HeartPulse, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import * as roles from '@/auth/roles'
import {
  useHealthAccess,
  useHealthMutations,
  useHealthRoster,
  type HealthRosterRow,
  type HealthStatus,
} from '@/features/health/useHealthChecks'

/*
 * SOG'LIQ KO'RIGI — the nurse's pre-shift grading.
 *
 * NOT the same module as "Tibbiy ko'rik" (`/tibbiy-korik`), which is the
 * periodic clinic examination for the whole organisation. This one is a DAILY
 * roster of the people the fleet may put behind a wheel, graded Sog'lom /
 * E'tiborga muhtoj / Kasal.
 *
 * WHAT IT DECIDES: an employee marked "Kasal" cannot be assigned as a driver on
 * those days (the server answers 400), and "E'tiborga muhtoj" still can be, but
 * the fleet is warned. That is why a grade can carry an end date: an illness
 * lasts longer than the shift it was noticed in.
 *
 * The roster's SCOPE is not chosen here — the server takes it from the same
 * "Haydovchi doirasi" (department / position / employee) the fleet uses to fill
 * its driver picker, so the two lists can never drift apart.
 */

const STATUSES: { key: HealthStatus; labelKey: string; tone: BadgeTone; icon: typeof Check }[] = [
  { key: 'good', labelKey: 'health.statusGood', tone: 'success', icon: Check },
  { key: 'limited', labelKey: 'health.statusLimited', tone: 'warning', icon: AlertTriangle },
  { key: 'unfit', labelKey: 'health.statusUnfit', tone: 'danger', icon: X },
]

const metaOf = (status?: string | null) => STATUSES.find((s) => s.key === status) ?? null

interface EditState {
  employee_id: number
  check_id: number | null
  had_status: boolean
  status: HealthStatus | ''
  note: string
  date_to: string
}

function HealthChecksPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const [day, setDay] = useState(() => dayjs().format('YYYY-MM-DD'))
  // Search lives in the URL like every other list (back button / share).
  const { search, setSearch, reset } = useListParams()
  const [editing, setEditing] = useState<EditState | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  // A nurse works in THEIR OWN branch (the server enforces it too). For a
  // master-admin who is not a nurse there is no such branch, so the one picked
  // in the header stands in — otherwise no branch could be determined at all.
  const { access } = useHealthAccess(selectedBranchId)
  const branchId = user?.nurse_branch_ids?.[0] ?? access?.nurse_branch_ids?.[0] ?? selectedBranchId ?? null

  // The counts come from the full roster; the list from the searched one.
  const { rows, loading, fetching } = useHealthRoster(branchId, day)
  const { rows: filtered } = useHealthRoster(branchId, day, search)
  const mut = useHealthMutations()
  // The server flag already covers the site master-admin; the OR bolted a ministr on top (403).
  const canCheck = !!access?.can_check

  const counts = useMemo(
    () => ({
      total: rows.length,
      checked: rows.filter((r) => r.status).length,
      unfit: rows.filter((r) => r.status === 'unfit').length,
    }),
    [rows],
  )

  const ungraded = useMemo(() => rows.filter((r) => !r.status).map((r) => r.employee_id), [rows])

  const openForm = (row: HealthRosterRow) =>
    setEditing({
      employee_id: row.employee_id,
      check_id: row.check_id ?? null,
      had_status: !!row.status,
      status: (row.status as HealthStatus) || '',
      note: row.note || '',
      date_to: row.date_to && row.date_to !== day ? row.date_to : '',
    })

  const save = async () => {
    if (!editing?.status) return toast.error(t('health.pickStatus'))
    try {
      await mut.grade.mutateAsync({
        employee_id: editing.employee_id,
        status: editing.status,
        date_from: day,
        // No end date means THIS DAY only — a shift grade, not a standing one.
        date_to: editing.date_to || day,
        note: editing.note.trim() || null,
      })
      toast.ok(editing.had_status ? t('health.gradeChanged') : t('health.saved'))
      setEditing(null)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const removeCheck = async () => {
    if (!editing?.check_id) return
    try {
      await mut.removeCheck.mutateAsync(editing.check_id)
      toast.ok(t('health.gradeRemoved'))
      setEditing(null)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setRemoving(false)
    }
  }

  const bulkGood = async () => {
    if (!ungraded.length) return
    try {
      const res = await mut.bulkGrade.mutateAsync({
        employee_ids: ungraded,
        status: 'good',
        date_from: day,
        date_to: day,
      })
      ;(res?.failed ?? []).forEach((f) => toast.error(`#${f.id}: ${f.error}`))
      if (res?.ok?.length) toast.ok(t('health.bulkDone', { count: res.ok.length }))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBulkOpen(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('health.title')}
        subtitle={t('health.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-ui">
            <span className="text-[12px] tabular-nums text-fg-muted">
              {t('health.checkedOf', { checked: counts.checked, total: counts.total })}
              {counts.unfit > 0 && <span className="text-danger"> · {t('health.unfitCount', { count: counts.unfit })}</span>}
            </span>
            <div className="w-[10.5rem]">
              <DateInput value={day} onChange={setDay} aria-label={t('health.day')} />
            </div>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-ui sm:flex-row sm:items-center">
        <div className="max-w-branch flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={t('health.searchPlaceholder')} />
        </div>
        <FilterReset count={search ? 1 : 0} onReset={reset} />
        {canCheck && ungraded.length > 0 && (
          <Button size="sm" variant="outline" leftIcon={<Check size={14} />} onClick={() => setBulkOpen(true)}>
            {t('health.bulkGood', { count: ungraded.length })}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<HeartPulse size={22} />}
            title={search ? t('list.noResultsFiltered') : branchId ? t('health.empty') : t('health.noBranch')}
            description={search ? t('list.noResultsFilteredHint') : branchId ? t('health.emptyHint') : t('health.noBranchHint')}
            action={<FilterReset count={search ? 1 : 0} onReset={reset} />}
          />
        </Card>
      ) : (
        <div className={cn('space-y-2', fetching && 'opacity-70')}>
          {filtered.map((row) => {
            const meta = metaOf(row.status)
            const open = editing?.employee_id === row.employee_id
            return (
              <Card key={row.employee_id} className="p-card">
                <div className="flex items-center gap-3">
                  <Avatar name={row.legal_name ?? ''} src={row.photo_path ?? undefined} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">{row.legal_name || '—'}</span>
                    <span className="block truncate text-[11.5px] text-fg-subtle">{row.position || '—'}</span>
                  </span>
                  {meta ? (
                    <Badge tone={meta.tone}>
                      {t(meta.labelKey as never)}
                      {row.date_to && row.date_to !== day ? ` · ${dayjs(row.date_to).format('DD.MM')}` : ''}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{t('health.notChecked')}</Badge>
                  )}
                  {canCheck && (
                    <Button
                      size="sm"
                      variant={open ? 'secondary' : 'outline'}
                      onClick={() => (open ? setEditing(null) : openForm(row))}
                      aria-label={row.status ? t('health.update') : t('health.add')}
                    >
                      {open ? <X size={15} /> : row.status ? <Pencil size={14} /> : <Plus size={16} />}
                    </Button>
                  )}
                </div>

                {!!row.note && !open && <p className="mt-2 text-[12px] text-fg-muted">{t('health.note')}: {row.note}</p>}

                {open && editing && (
                  <div className="mt-3 space-y-3 border-t border-line pt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-14 text-[12px] text-fg-subtle">{t('health.status')}</span>
                      {STATUSES.map((st) => {
                        const Ico = st.icon
                        const active = editing.status === st.key
                        return (
                          <button
                            key={st.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setEditing((p) => (p ? { ...p, status: st.key } : p))}
                            className={cn(
                              'flex h-control-sm items-center gap-1.5 rounded-inner border px-3 text-[12px] transition-colors',
                              active
                                ? st.tone === 'success'
                                  ? 'border-success bg-success-soft text-success'
                                  : st.tone === 'warning'
                                    ? 'border-warning bg-warning-soft text-warning'
                                    : 'border-danger bg-danger-soft text-danger'
                                : 'border-line text-fg-muted hover:text-fg',
                            )}
                          >
                            <Ico size={13} /> {t(st.labelKey as never)}
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex flex-wrap items-end gap-ui">
                      <div className="min-w-[14rem] flex-1">
                        <Input
                          value={editing.note}
                          onChange={(e) => setEditing((p) => (p ? { ...p, note: e.target.value } : p))}
                          placeholder={t('health.notePlaceholder')}
                          aria-label={t('health.note')}
                        />
                      </div>
                      <div className="w-[13rem]">
                        {/* Labelled, not just placeholdered: an empty date box
                            next to a note field reads as "when did this happen",
                            and it is in fact "until when does it hold". */}
                        <Field label={t('health.until')}>
                          <DateInput
                            value={editing.date_to}
                            onChange={(v) => setEditing((p) => (p ? { ...p, date_to: v } : p))}
                            aria-label={t('health.until')}
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={save} loading={mut.grade.isPending} disabled={!editing.status}>
                        {t('common.save')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        {t('common.cancel')}
                      </Button>
                      {/* Saving again REPLACES the grade; this is the only way to
                          take it back off entirely. */}
                      {editing.check_id && (
                        <Button size="sm" variant="danger-ghost" leftIcon={<Trash2 size={13} />} onClick={() => setRemoving(true)}>
                          {t('common.delete')}
                        </Button>
                      )}
                      <span className="text-[11px] text-fg-subtle">
                        {editing.had_status ? `${t('health.replaceHint')} ` : ''}
                        {t('health.untilHint', { date: dayjs(day).format('DD.MM.YYYY') })}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={bulkOpen}
        title={t('health.bulkTitle')}
        description={t('health.bulkConfirm', { count: ungraded.length })}
        confirmLabel={t('health.bulkConfirmBtn')}
        loading={mut.bulkGrade.isPending}
        onClose={() => setBulkOpen(false)}
        onConfirm={bulkGood}
      />
      <ConfirmDialog
        open={removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('health.removeTitle')}
        description={t('health.removeConfirm')}
        loading={mut.removeCheck.isPending}
        onClose={() => setRemoving(false)}
        onConfirm={removeCheck}
      />
    </PageContainer>
  )
}

/**
 * Only a nurse works here (the site master-admin sets it up). The roster
 * endpoint answers 403 to anyone else, so the page must not render for them.
 */
export function HealthChecksPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const allowed = (user?.nurse_branch_ids?.length ?? 0) > 0 || roles.isSiteMasterAdmin(user)
  return (
    <RequireRole allowed={allowed} title={t('health.title')}>
      <HealthChecksPageInner />
    </RequireRole>
  )
}

