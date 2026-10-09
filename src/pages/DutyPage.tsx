import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Building2, CalendarRange, Check, ChevronRight, Clock, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { TimeInput } from '@/components/ui/TimeInput'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { HeadsPicker } from '@/features/structure/HeadsPicker'
import { cn } from '@/lib/cn'
import { useBranchStore } from '@/store/branchStore'
import {
  useDutyGroupMembers,
  useDutyGroups,
  useDutyMutations,
  useMyDutyGroups,
  useScheduleDays,
  type DutyGroup,
  type Shift,
} from '@/features/duty/useDuty'
import { DutyGrid } from '@/features/duty/DutyGrid'
import { Segmented } from '@/components/ui/Segmented'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions, useDepartmentRecords } from '@/hooks/useReferenceData'
import { Checkbox } from '@/components/ui/Checkbox'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useStructure, type Department } from '@/features/structure/useStructure'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { LABEL_CLS } from '@/components/ui/control'
import { control } from '@/components/ui/control'
import { canManageStructure } from '@/auth/canManage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { toItems } from '@/types'
import { tabPill } from '@/components/ui/control'
import type { DutyMember } from '@/features/duty/useDuty'
import type { Page } from '@/features/employees/useEmployees'
import { useAuthStore } from '@/store/authStore'
import { LoadError } from '@/components/data/LoadError'
import { isInvalidRange } from '@/lib/dateRange'

/** Compact control inside a roster row — same chrome as every other field. */
const cellCls = control({ className: 'w-full px-2' })

export function DutyPage() {
  // ⚠️ Yozuv huquqi — `auth/canManage.ts` dagi YAGONA manbadan
  // (backend darvozasining ko'zgusi). Ilgari tugmalar hammaga
  // ko'rinardi va faqat saqlashda 403 chiqardi.
  const currentUser = useAuthStore((st) => st.user)
  const canWrite = canManageStructure(currentUser)
  const { t } = useTranslation()
  const weekdays = t('date.weekdaysShort', { returnObjects: true }) as unknown as string[]
  const { groups, loading, error: groupsError, refetch: refetchGroups } = useDutyGroups()
  const mut = useDutyMutations()

  const { filters, setFilter } = useListParams(['tab'])
  /**
   * A person who is ON the roster but does not manage groups opens on the
   * ROSTER. The groups tab is a management screen — its list, its create button
   * and its edit dialogs are all `canWrite` — so defaulting everyone to it gave
   * the employees this page now serves an empty screen and one useless tab.
   */
  // The ROSTER is what people come for, managers included (redesign
  // 2026-09-24, shift-roster screens on Refero open on the schedule); the
  // groups are setup, one tab away.
  const tab = canWrite ? filters.tab || 'roster' : 'roster'
  const [editing, setEditing] = useState<DutyGroup | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<DutyGroup | null>(null)
  const [generating, setGenerating] = useState<DutyGroup | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deptDialog, setDeptDialog] = useState(false)
  const confirm = useConfirm()

  const doDelete = async () => {
    if (!deleting) return
    const g = deleting
    setDeleting(null)
    await mut.remove.mutateAsync(g.id)
    mut.invalidate()
    setNotice(t('duty.deleted'))
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('duty.title')}
        subtitle={t('duty.subtitle')}
        actions={
          canWrite && tab === 'groups' ? (
            <span className="flex flex-wrap gap-2">
              {/* Qaysi bo'limlar navbatchilik yuritadi — v2 da bu ekran umuman
                  yo'q edi, `has_navbatchilik` ni faqat bazadan qo'yish mumkin
                  edi. */}
              <Button variant="outline" leftIcon={<Building2 size={16} />} onClick={() => setDeptDialog(true)}>
                {t('duty.deptSettings')}
              </Button>
              <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
                {t('duty.create')}
              </Button>
            </span>
          ) : undefined
        }
      />

      {canWrite && (
        <div className="mb-4">
          <Segmented
            value={tab}
            onChange={(v) => setFilter('tab', v === 'roster' ? '' : v)}
            options={[
              { value: 'roster', label: t('duty.tabRoster') },
              { value: 'groups', label: t('duty.tabGroups') },
            ]}
          />
        </div>
      )}

      {tab === 'roster' ? (
        <RosterTab canWrite={canWrite} />
      ) : (
      <>

      {notice && (
        <div role="status" className="mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">{notice}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : groupsError ? (
        <Card className="p-6"><LoadError error={groupsError} onRetry={() => void refetchGroups()} /></Card>
      ) : groups.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<CalendarRange size={22} />} title={t('duty.empty')} description={t('duty.emptyHint')} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} className="group flex flex-col p-4">
              <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{g.name}</h3>
                <Badge tone={g.is_active ? 'success' : 'neutral'}>{g.is_active ? t('duty.active') : t('duty.inactive')}</Badge>
                <div className="flex gap-1">
                  {canWrite && (
                    <>
                      <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(g)}><Pencil size={15} /></IconButton>
                      <IconButton size="sm" label={t('common.delete')} onClick={() => setDeleting(g)}><Trash2 size={15} /></IconButton>
                    </>
                  )}
                </div>
              </div>

              {/* weekdays */}
              <div className="mt-3 flex flex-wrap gap-1">
                {weekdays.map((w, i) => (
                  <span key={i} className={cn('grid h-6 w-8 place-items-center rounded text-[11px] font-semibold', g.weekdays?.includes(i) ? 'bg-brand text-fg-on-brand' : 'bg-surface-2 text-fg-subtle')}>{w}</span>
                ))}
              </div>

              {/* shifts */}
              {g.shifts?.length > 0 && (
                <div className="mt-3 space-y-1">
                  {g.shifts.map((s, i) => (
                    <p key={i} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2/60 px-2 py-0.5 text-[12px] text-fg-muted">
                      <Clock size={12} />{s.name}: {s.start}–{s.end}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted"><Users size={13} />{t('duty.members', { count: g.effective_member_count ?? g.employees?.length ?? 0 })}</span>
                {canWrite && (
                  <Button size="sm" variant="secondary" leftIcon={<CalendarRange size={14} />} onClick={() => setGenerating(g)}>{t('duty.generate')}</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      </>
      )}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} danger title={t('duty.deleteTitle')} description={t('duty.deleteConfirm')} confirmLabel={t('common.delete')} />

      <GroupModal
        open={creating || !!editing}
        group={editing}
        loading={mut.create.isPending || mut.update.isPending}
        onClose={() => { setCreating(false); setEditing(null) }}
        onSubmit={async (body) => {
          if (editing && !(await confirm({ kind: 'action', subject: editing.name ?? '', confirmLabel: t('common.save') }))) return
          if (editing) await mut.update.mutateAsync({ id: editing.id, body })
          else await mut.create.mutateAsync(body)
          mut.invalidate()
          setCreating(false); setEditing(null)
          setNotice(editing ? t('duty.updated') : t('duty.created'))
        }}
      />

      <GenerateModal
        group={generating}
        loading={mut.generate.isPending}
        onClose={() => setGenerating(null)}
        onSubmit={async (from, to) => {
          const g = generating!
          const res = await mut.generate.mutateAsync({ id: g.id, from, to })
          mut.invalidate()
          setGenerating(null)
          setNotice(t('duty.generated', { count: (res as { count: number })?.count ?? 0 }))
        }}
      />
      <DutyDepartmentsModal
        open={deptDialog}
        onClose={() => setDeptDialog(false)}
        onDone={(msg) => { setDeptDialog(false); setNotice(msg) }}
      />
    </PageContainer>
  )
}

/**
 * NAVBATCHILIK YURITADIGAN BO'LIMLAR + RAHBAR TASDIG'I.
 *
 * ⚠️ FAQAT O'ZGARGANLARI yuboriladi. v1 saqlash bosilganda HAR BIR bo'limni
 * PATCH qilardi (`WorkSchedulePage.jsx:177`) — 40 ta bo'limda 40 ta so'rov,
 * ularning 38 tasi hech nimani o'zgartirmasdi.
 */
function DutyDepartmentsModal({ open, onClose, onDone }: {
  open: boolean
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  // Navbatchilik bayrog'i bo'lim ro'yxatidan o'qiladi; sahifalash kerak emas —
  // bitta filialdagi bo'limlar soni kichik.
  const { departments, refetchDepartments } = useStructure('', 1, 200)
  // `Department.id` sxemada ixtiyoriy — idsiz qatorni tanlab ham bo'lmaydi.
  const deptRows = departments.filter((d): d is Department & { id: number } => d.id != null)
  const mut = useDutyMutations()
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPicked(new Set(deptRows.filter((d) => d.has_navbatchilik).map((d) => d.id)))
  }, [open, deptRows])

  const save = async () => {
    setBusy(true)
    try {
      const changed = deptRows.filter((d) => !!d.has_navbatchilik !== picked.has(d.id))
      for (const d of changed) {
        await mut.toggleDeptDuty.mutateAsync({ id: d.id, enabled: picked.has(d.id) })
      }
      mut.invalidate()
      await refetchDepartments()
      onDone(t('duty.deptSaved', { count: changed.length }))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('duty.deptSettings')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('common.save')}</Button>
        </div>
      }
    >
      <p className="mb-3 text-[12.5px] text-fg-muted">{t('duty.deptSettingsHint')}</p>
      <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-inner border border-line">
        {deptRows.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
            <Checkbox
              checked={picked.has(d.id)}
              onChange={(e) =>
                setPicked((prev) => {
                  const next = new Set(prev)
                  if (e.target.checked) next.add(d.id)
                  else next.delete(d.id)
                  return next
                })
              }
              label={d.name ?? `#${d.id}`}
            />
            {/* Rahbar tasdig'i — jadval o'zgargach bo'lim boshlig'i uni
                tasdiqlaydi va bayroq tushadi. */}
            {d.navbatchilik_needs_approval && (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                loading={mut.approveDeptDuty.isPending}
                onClick={async () => {
                  if (!(await confirm({ kind: 'approve', subject: d.name, confirmLabel: t('duty.approve') }))) return
                  try {
                    await mut.approveDeptDuty.mutateAsync(d.id)
                    mut.invalidate()
                    await refetchDepartments()
                    onDone(t('duty.deptApproved'))
                  } catch (e) {
                    toast.error(errorMessage(e, t('common.actionFailed')))
                  }
                }}
              >
                {t('duty.approve')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/**
 * The monthly roster.
 *
 * Which rows appear depends on who is looking, exactly as the backend decides:
 * a manager picks any group, a member sees the groups they belong to (`/my`),
 * and a viewer gets the same board read-only. A department whose
 * `has_navbatchilik` is on has no group at all — its whole staff is the roster,
 * which is why the department batch route exists alongside the group one.
 */
function RosterTab({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation()
  const user = useAuthStore((st) => st.user)
  const { groups: allGroups, loading: loadingAll, error: allError, refetch: refetchAll } = useDutyGroups()
  const { groups: myGroups, loading: loadingMine, error: myError, refetch: refetchMy } = useMyDutyGroups(!canWrite)
  const groups = canWrite ? allGroups : myGroups
  const loadingGroups = canWrite ? loadingAll : loadingMine

  const dept = user?.employee?.department
  /**
   * A department flagged `has_navbatchilik` keeps its own K/T/D board — no
   * group, its whole staff is the roster. Anyone working in that department
   * gets it, managers included: it is their own department's duty sheet, and
   * hiding it behind "you also manage groups" would lose the board v1 gave them.
   */
  const hasDeptBoard = !!dept?.has_navbatchilik && !!dept?.id

  /**
   * A manager (HR, master) sees EVERY department board of the branch, as in
   * v1's manager screen — not only their own department's. «Vaziyatlar
   * markazi» keeps a K/T/D board, and HR, who works elsewhere, could not open
   * it at all (2026-09-28).
   */
  const deptRecords = useDepartmentRecords<Department>()
  const dutyDepts = canWrite
    ? deptRecords
        .filter((d) => d.has_navbatchilik && d.id != null && d.id !== dept?.id)
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    : []

  type Board = { key: string; name: string; groupId?: number; deptId?: number; shifts?: Shift[] | null; weekdays?: number[] | null; viewerOnly?: boolean }
  const boards: Board[] = [
    ...(hasDeptBoard ? [{ key: `d${dept!.id}`, name: dept!.name ?? t('duty.deptBoard'), deptId: dept!.id }] : []),
    ...dutyDepts.map((d) => ({ key: `d${d.id}`, name: d.name ?? t('duty.deptBoard'), deptId: d.id! })),
    ...groups.map((g) => ({
      key: `g${g.id}`,
      name: g.name,
      groupId: g.id,
      shifts: g.shifts ?? null,
      weekdays: g.weekdays ?? null,
      viewerOnly: !!g.is_viewer_only,
    })),
  ]

  const [boardKey, setBoardKey] = useState<string | null>(null)
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const board = boards.find((b) => b.key === boardKey) ?? boards[0] ?? null
  useEffect(() => {
    if (!boardKey && boards.length) setBoardKey(boards[0].key)
  }, [boardKey, boards])

  const boardDept = board?.deptId ? deptRecords.find((d) => d.id === board.deptId) : undefined
  const mut = useDutyMutations()
  const qc = useQueryClient()
  const toast = useToast()
  const { members, loading: loadingMembers } = useDutyGroupMembers(board?.groupId ?? null)
  const { members: deptMembers, loading: loadingDept } = useDeptMembers(board?.deptId ?? null)
  const rows = board?.deptId ? deptMembers : members

  const from = month.startOf('month').format('YYYY-MM-DD')
  const to = month.endOf('month').format('YYYY-MM-DD')
  const { map, refetch } = useScheduleDays(
    { groupId: board?.groupId ?? null, departmentId: board?.deptId ?? null },
    from,
    to,
  )

  if (loadingGroups) return <Card className="p-6"><Skeleton className="h-64 w-full" /></Card>

  // Without this the roster tab says "you have no roster" to someone whose
  // group list simply failed to load — and there is nothing on the screen
  // that would let them tell the difference or try again.
  const groupsError = canWrite ? allError : myError
  if (groupsError) {
    return (
      <Card className="p-6">
        <LoadError error={groupsError} onRetry={() => void (canWrite ? refetchAll() : refetchMy())} />
      </Card>
    )
  }

  if (!board) {
    return (
      <Card className="p-6">
        <EmptyState icon={<CalendarRange size={22} />} title={t('duty.noRoster')} description={t('duty.noRosterHint')} />
      </Card>
    )
  }

  // A viewer watches the board; members and managers write to it.
  const readOnly = !!board.viewerOnly

  return (
    <Card className="flex min-h-[60vh] flex-col overflow-hidden p-0">
      {boards.length > 1 && (
        <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
          {boards.map((b) => (
            <button key={b.key} type="button" onClick={() => setBoardKey(b.key)} className={tabPill(board.key === b.key)}>
              {b.name}
            </button>
          ))}
        </div>
      )}
      {canWrite && boardDept?.navbatchilik_needs_approval && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-warning/[0.08] px-4 py-2 text-[12px] text-fg-muted">
          <span className="font-medium text-warning">{t('duty.needsApproval')}</span>
          {boardDept.navbatchilik_changed_by_name && <span>· {boardDept.navbatchilik_changed_by_name}</span>}
          {boardDept.navbatchilik_changed_at && <span>· {dayjs(boardDept.navbatchilik_changed_at).format('DD.MM.YYYY HH:mm')}</span>}
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            loading={mut.approveDeptDuty.isPending}
            onClick={async () => {
              try {
                await mut.approveDeptDuty.mutateAsync(boardDept.id!)
                await qc.invalidateQueries({ queryKey: ['departments'] })
                toast.ok(t('duty.deptApproved'))
              } catch (e) {
                toast.error(errorMessage(e, t('common.actionFailed')))
              }
            }}
          >
            {t('duty.approve')}
          </Button>
        </div>
      )}
      <DutyGrid
        readOnly={readOnly}
        members={rows}
        loadingMembers={board.deptId ? loadingDept : loadingMembers}
        map={map}
        month={month}
        onMonthChange={setMonth}
        shifts={board.shifts ?? null}
        weekdays={board.weekdays ?? null}
        canAutoFill={!readOnly}
        onReload={refetch}
      />
    </Card>
  )
}

/** Staff of one department — the rows of a department-mode roster. */
function useDeptMembers(departmentId: number | null) {
  const q = useQuery({
    enabled: !!departmentId,
    queryKey: ['duty-dept-members', departmentId],
    queryFn: () => apiGet<Page<DutyMember>>(EMPLOYEES_LIST, { department_id: departmentId, size: 200 }),
  })
  return { members: toItems(q.data), loading: q.isLoading }
}

function GroupModal({ open, group, loading, onClose, onSubmit }: { open: boolean; group: DutyGroup | null; loading: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const { t } = useTranslation()
  const weekdays = t('date.weekdaysShort', { returnObjects: true }) as unknown as string[]
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const departments = useDepartmentOptions(branchId)
  const [name, setName] = useState('')
  const [days, setDays] = useState<number[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [memberIds, setMemberIds] = useState<number[]>([])
  /**
   * Whole DEPARTMENTS as members. Duty is usually a department's job, and
   * ticking forty people one by one was the slowest part of this form — the
   * server has always accepted `department_ids`, v2 simply sent an empty list.
   */
  const [deptIds, setDeptIds] = useState<number[]>([])
  const [deptQuery, setDeptQuery] = useState('')
  /** Folded by default: a group is usually a whole department, not a hand-picked list. */
  const [showMembers, setShowMembers] = useState(false)
  /** Read-only watchers of this roster — see `DutyGroup.viewers`. */
  const [viewerIds, setViewerIds] = useState<number[]>([])
  const [showViewers, setShowViewers] = useState(false)
  const [active, setActive] = useState(true)
  /** Off = the roster is the HR office's to fill; members only read it. */
  const [membersCanEdit, setMembersCanEdit] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(group?.name ?? '')
    setDays(group?.weekdays ?? [])
    setShifts(group?.shifts ?? [{ name: '1-smena', start: '09:00', end: '18:00' }])
    setMemberIds(group?.employees?.map((e) => e.id) ?? [])
    setViewerIds(group?.viewers?.map((e) => e.id) ?? [])
    setShowViewers((group?.viewers?.length ?? 0) > 0)
    setDeptIds(group?.departments?.map((d) => d.id) ?? [])
    setDeptQuery('')
    // Open the person list straight away when the group was built from people.
    setShowMembers((group?.employees?.length ?? 0) > 0)
    setActive(group?.is_active ?? true)
    setMembersCanEdit(group?.members_can_edit ?? true)
    setError('')
  }, [open, group])

  const shownDepartments = departments.filter((d) =>
    d.label.toLowerCase().includes(deptQuery.trim().toLowerCase()),
  )

  const toggleDay = (i: number) => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))
  const setShift = (i: number, patch: Partial<Shift>) => setShifts((s) => s.map((sh, j) => (j === i ? { ...sh, ...patch } : sh)))
  const addShift = () => setShifts((s) => [...s, { name: `${s.length + 1}-smena`, start: '09:00', end: '18:00' }])
  const removeShift = (i: number) => setShifts((s) => s.filter((_, j) => j !== i))

  const submit = () => {
    if (!name.trim()) return setError(t('duty.nameRequired'))
    if (days.length === 0) return setError(t('duty.weekdaysRequired'))
    const named = shifts.filter((sh) => sh.name.trim())
    if (named.length === 0) return setError(t('duty.shiftsRequired'))
    // A shift whose start equals its end is 0 hours: it saved fine and then
    // marked nobody as on duty.
    if (named.some((sh) => shiftHours(sh) <= 0)) return setError(t('duty.shiftTimeInvalid'))
    if (memberIds.length === 0 && deptIds.length === 0) return setError(t('duty.membersRequired'))
    onSubmit({
      name: name.trim(),
      weekdays: days,
      shifts: shifts.filter((s) => s.name.trim()),
      is_active: active,
      employee_ids: memberIds,
      department_ids: deptIds,
      viewer_ids: viewerIds,
      members_can_edit: membersCanEdit,
      organization_branch_id: branchId,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={group ? t('duty.editTitle') : t('duty.createTitle')} size="lg" footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
        <Button onClick={submit} loading={loading}>{t('common.save')}</Button>
      </>
    }>
      <div className="space-y-4">
        <Field label={t('duty.fieldName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('duty.fieldName')} autoFocus />
        </Field>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={cn(LABEL_CLS, 'mb-0')}>{t('duty.fieldWeekdays')}</span>
            {/* Setting a Mon–Fri group meant seven separate clicks; the three
                patterns people actually use are one click each. */}
            <span className="ml-auto flex flex-wrap gap-1">
              <DayPreset onClick={() => setDays([0, 1, 2, 3, 4])}>{t('duty.presetWorkdays')}</DayPreset>
              <DayPreset onClick={() => setDays([5, 6])}>{t('duty.presetWeekend')}</DayPreset>
              <DayPreset onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>{t('duty.presetEveryDay')}</DayPreset>
              <DayPreset onClick={() => setDays([])}>{t('common.clearValue')}</DayPreset>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {weekdays.map((w, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)} aria-pressed={days.includes(i)} aria-label={w}
                className={cn('grid h-9 w-11 place-items-center rounded-lg text-[13px] font-semibold transition-colors', days.includes(i) ? 'bg-brand text-fg-on-brand' : 'bg-surface-2 text-fg-muted hover:bg-surface-2/70')}>{w}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-fg">{t('duty.fieldShifts')}</span>
            <span className="ml-auto flex flex-wrap gap-1">
              {/* The three rosters this company actually runs. Building the
                  two-shift pattern by hand was four fields and two typos. */}
              <DayPreset onClick={() => setShifts([{ name: t('duty.shiftDayName'), start: '09:00', end: '18:00' }])}>
                {t('duty.presetOneShift')}
              </DayPreset>
              <DayPreset onClick={() => setShifts([
                { name: t('duty.shiftDayName'), start: '08:00', end: '20:00' },
                { name: t('duty.shiftNightName'), start: '20:00', end: '08:00' },
              ])}>
                {t('duty.presetTwoShifts')}
              </DayPreset>
              <DayPreset onClick={() => setShifts([{ name: t('duty.shiftFullName'), start: '00:00', end: '24:00' }])}>
                {t('duty.presetFullDay')}
              </DayPreset>
            </span>
            <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />} onClick={addShift}>{t('duty.addShift')}</Button>
          </div>
          <div className="space-y-2">
            {shifts.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input value={s.name} onChange={(e) => setShift(i, { name: e.target.value })} placeholder={t('duty.shiftName')} aria-label={`${t('duty.shiftName')} ${i + 1}`} wrapperClassName="min-w-[120px] flex-1" />
                <TimeInput value={s.start} onChange={(v) => setShift(i, { start: v })} aria-label={`${t('duty.shiftStart')} ${i + 1}`} className={cn(cellCls, 'w-24')} />
                <span className="text-fg-subtle">–</span>
                <TimeInput value={s.end} onChange={(v) => setShift(i, { end: v })} aria-label={`${t('duty.shiftEnd')} ${i + 1}`} className={cn(cellCls, 'w-24')} />
                {/* The length in words: "20:00–08:00" is easy to read as an
                    error, and a 0-hour shift used to save silently. */}
                <span className={cn('w-20 shrink-0 text-[11.5px] tabular-nums', shiftHours(s) > 0 ? 'text-fg-subtle' : 'text-danger')}>
                  {shiftHours(s) > 0 ? t('duty.shiftHours', { hours: shiftHours(s) }) : t('duty.shiftBad')}
                </span>
                <IconButton size="sm" label={t('common.delete')} onClick={() => removeShift(i)}><X size={15} /></IconButton>
              </div>
            ))}
          </div>
        </div>

        {/* A wall of 54 department chips over a wall of 2 000 names was the
            slowest part of this form. The department is SEARCHED, and the
            person list stays folded until it is actually wanted — most groups
            are a whole department and never need to open it at all. */}
        <div>
          <span className={LABEL_CLS}>{t('duty.fieldDepartments')}</span>
          <p className="mb-1.5 text-[11.5px] text-fg-subtle">{t('duty.departmentsHint')}</p>
          <Input
            value={deptQuery}
            onChange={(e) => setDeptQuery(e.target.value)}
            placeholder={t('duty.searchDepartment')}
            leftIcon={<Search size={15} />}
          />
          {deptIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {deptIds.map((id) => {
                const d = departments.find((x) => Number(x.value) === id)
                return (
                  <span key={id} className="inline-flex max-w-[240px] items-center gap-1 rounded-pill bg-brand px-2.5 py-1 text-[11.5px] font-medium text-fg-on-brand">
                    <span className="truncate">{d?.label ?? `#${id}`}</span>
                    <button type="button" aria-label={t('common.delete')} onClick={() => setDeptIds((p) => p.filter((x) => x !== id))}>
                      <X size={12} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          {deptQuery.trim() && (
            <div className="scroll-thin mt-2 max-h-40 overflow-y-auto rounded-inner border border-line">
              {shownDepartments.length === 0 ? (
                <p className="px-3 py-3 text-center text-[12px] text-fg-subtle">{t('common.noResults')}</p>
              ) : (
                shownDepartments.map((d) => {
                  const id = Number(d.value)
                  const on = deptIds.includes(id)
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDeptIds((prev) => (on ? prev.filter((x) => x !== id) : [...prev, id]))}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-fg">{d.label}</span>
                      {on && <Check size={14} className="text-brand-strong" />}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className={cn(LABEL_CLS, 'mb-0')}>{t('duty.fieldMembers')}</span>
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-bold tabular-nums text-fg-muted">
              {memberIds.length}
            </span>
            <ChevronRight size={15} className={cn('ml-auto text-fg-subtle transition-transform', showMembers && 'rotate-90')} />
          </button>
          {showMembers ? (
            <div className="mt-2">
              <HeadsPicker branchId={branchId} value={memberIds} onChange={setMemberIds} preselected={group?.employees ?? undefined} />
            </div>
          ) : (
            <p className="mt-1 text-[11.5px] text-fg-subtle">{t('duty.membersFoldedHint')}</p>
          )}
        </div>

        {/* VIEWERS — see the roster, never write to it. Kept apart from members
            on purpose: no shift is written for them and duty does not enter
            their attendance. */}
        <div>
          <button
            type="button"
            onClick={() => setShowViewers((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className={cn(LABEL_CLS, 'mb-0')}>{t('duty.fieldViewers')}</span>
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-bold tabular-nums text-fg-muted">
              {viewerIds.length}
            </span>
            <ChevronRight size={15} className={cn('ml-auto text-fg-subtle transition-transform', showViewers && 'rotate-90')} />
          </button>
          {showViewers ? (
            <div className="mt-2">
              <HeadsPicker branchId={branchId} value={viewerIds} onChange={setViewerIds} preselected={group?.viewers ?? undefined} />
            </div>
          ) : (
            <p className="mt-1 text-[11.5px] text-fg-subtle">{t('duty.viewersHint')}</p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5">
          <Checkbox inLabel checked={membersCanEdit} onChange={(e) => setMembersCanEdit(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="block text-sm text-fg">{t('duty.fieldMembersCanEdit')}</span>
            <span className="text-[11.5px] text-fg-subtle">{t('duty.membersCanEditHint')}</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox inLabel checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="text-sm text-fg">{t('duty.fieldActive')}</span>
        </label>

        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}


/**
 * Shift length in hours, crossing midnight the way a night shift does
 * (20:00–08:00 is twelve hours, not minus twelve). 0 means the two times are
 * the same, which is never a real shift.
 */
function shiftHours(sh: { start?: string | null; end?: string | null }): number {
  const min = (v?: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? ''))
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const a = min(sh.start)
  const b = min(sh.end)
  if (a == null || b == null) return 0
  const diff = b > a ? b - a : b === a ? 0 : 24 * 60 - a + b
  return Math.round((diff / 60) * 10) / 10
}

/** A one-click pattern above the weekday row / the shift list. */
function DayPreset({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-fg-muted transition-colors hover:text-fg"
    >
      {children}
    </button>
  )
}

function GenerateModal({ group, loading, onClose, onSubmit }: { group: DutyGroup | null; loading: boolean; onClose: () => void; onSubmit: (from: string, to: string) => void }) {
  const { t } = useTranslation()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  useEffect(() => {
    if (group) {
      setFrom(dayjs().format('YYYY-MM-DD'))
      setTo(dayjs().add(1, 'month').format('YYYY-MM-DD'))
    }
  }, [group])
  return (
    <Modal open={!!group} onClose={onClose} title={t('duty.generateTitle')} description={group?.name} size="sm" footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
        <Button onClick={() => onSubmit(from, to)} loading={loading} disabled={!from || !to || isInvalidRange(from, to)}>{t('duty.generate')}</Button>
      </>
    }>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('duty.generateFrom')} error={isInvalidRange(from, to) ? t('list.invalidRange') : undefined}>
          <DateInput value={from} onChange={(v) => setFrom(v)} aria-label={t('duty.generateFrom')} invalid={isInvalidRange(from, to)} />
        </Field>
        <Field label={t('duty.generateTo')}>
          <DateInput value={to} onChange={(v) => setTo(v)} min={from || undefined} aria-label={t('duty.generateTo')} invalid={isInvalidRange(from, to)} />
        </Field>
      </div>
    </Modal>
  )
}
