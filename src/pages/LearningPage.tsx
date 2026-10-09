import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { useTranslation } from 'react-i18next'
import { Award, BookOpen, Clock, ListChecks, Pencil, PlayCircle, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { SearchInput } from '@/components/data/SearchInput'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { errorMessage } from '@/api/errorMessage'
import { useBranchStore } from '@/store/branchStore'
import { useListParams } from '@/hooks/useListParams'
import { CourseEditorDrawer } from '@/features/learning/CourseEditorDrawer'
import { CoursePlayer } from '@/features/learning/CoursePlayer'
import type { Employee } from '@/types'
import {
  useCourseEnrollments,
  useCourses,
  useLearningMeta,
  useLearningOps,
  useMyEnrollments,
  type LearningCourse,
} from '@/features/learning/useLearning'

/**
 * O'QUV MARKAZI (NTM) — the internal course catalogue.
 *
 * ⚠️ THE MODULE EXISTED ONLY IN v1. Its backend has been live all along
 * (`/learning`, 20 routes) and v2 mentioned it nowhere, so courses could be
 * published, assigned and sat only from the old product.
 *
 * Two tabs, as in v1: what this person is enrolled on, and the catalogue.
 * Everything a MANAGER may do is gated on `meta.is_manager` — a SERVER answer,
 * because the right comes from the `lms_manager` branch-leader role, which
 * `/auth/me` does not report. Re-deriving it on the client is exactly how the
 * chancellery and system-admin buttons ended up lying about what was allowed.
 */
export function LearningPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { search, setSearch } = useListParams()
  const [tab, setTab] = useState<'my' | 'catalog'>('my')

  const { isManager, trainingTypes } = useLearningMeta()
  const catalog = useCourses(search, branchId, isManager)
  const mine = useMyEnrollments()
  const ops = useLearningOps()

  const [editing, setEditing] = useState<LearningCourse | null>(null)
  const [creating, setCreating] = useState(false)
  const [assignTo, setAssignTo] = useState<LearningCourse | null>(null)
  const [enrolleesOf, setEnrolleesOf] = useState<LearningCourse | null>(null)
  /** Kurs MAZMUNI (darslar + test) va tinglovchi uchun PLEYER — modulning
   *  yarmi shu ikkisida edi va v2 da ikkalasi ham yo'q edi. */
  const [contentOf, setContentOf] = useState<LearningCourse | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<LearningCourse | null>(null)

  const courses = catalog.data ?? []
  const enrollments = mine.data ?? []
  const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.course_id)), [enrollments])

  const typeLabel = (v?: string | null) =>
    trainingTypes.find((x) => x.value === v)?.label ?? v ?? ''

  const enroll = async (c: LearningCourse) => {
    if (!(await confirm({ kind: 'action', subject: c.title, confirmLabel: t('learning.enroll') }))) return
    ops.enroll.mutate(c.id, {
      onSuccess: () => toast.ok(t('learning.enrolled')),
      onError: (e) => toast.error(errorMessage(e, t('learning.enrollFailed'))),
    })
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('learning.title')}
        subtitle={t('learning.subtitle')}
        actions={
          isManager && (
            <Button leftIcon={<Plus size={15} />} onClick={() => setCreating(true)}>
              {t('learning.addCourse')}
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as 'my' | 'catalog')}
          options={[
            { value: 'my', label: `${t('learning.tabMy')} (${enrollments.length})` },
            { value: 'catalog', label: t('learning.tabCatalog') },
          ]}
        />
        {tab === 'catalog' && (
          <SearchInput value={search} onChange={setSearch} placeholder={t('learning.searchCourse')} />
        )}
      </div>

      {tab === 'catalog' ? (
        catalog.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <Card>
            <EmptyState
              icon={<BookOpen size={26} />}
              title={t('learning.emptyCatalog')}
              description={t('learning.emptyCatalogHint')}
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <Card key={c.id} className="flex flex-col gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{c.title}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {c.provider || t('learning.internalCourse')}
                      {c.training_type ? ` · ${typeLabel(c.training_type)}` : ''}
                    </p>
                  </div>
                  {!c.is_published && <Badge tone="warning">{t('learning.draft')}</Badge>}
                </div>

                {c.description && (
                  <p className="line-clamp-2 text-[13px] text-fg-muted">{c.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
                  {c.hours != null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} /> {c.hours} {t('learning.hours')}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <BookOpen size={11} /> {c.lesson_count ?? 0} {t('learning.lessons')}
                  </span>
                  {(c.question_count ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Award size={11} /> {t('learning.test')} {c.pass_score}%
                    </span>
                  )}
                  {isManager && (
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} /> {c.enrolled ?? 0}
                    </span>
                  )}
                </div>

                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {enrolledIds.has(c.id) ? (
                    <Badge tone="success">{t('learning.alreadyEnrolled')}</Badge>
                  ) : c.is_open_enrollment ? (
                    <Button size="sm" variant="secondary" onClick={() => enroll(c)} loading={ops.enroll.isPending}>
                      {t('learning.enroll')}
                    </Button>
                  ) : (
                    <span className="text-[11.5px] text-fg-subtle">{t('learning.byAssignment')}</span>
                  )}
                  {isManager && (
                    <>
                      <Button size="sm" variant="ghost" leftIcon={<Pencil size={13} />} onClick={() => setEditing(c)}>
                        {t('common.edit')}
                      </Button>
                      {/* Kursning ICHI: dars va test. Usiz kurs bo'sh qobiq. */}
                      <Button size="sm" variant="ghost" leftIcon={<ListChecks size={13} />} onClick={() => setContentOf(c)}>
                        {t('learning.contentTitle')}
                      </Button>
                      <Button size="sm" variant="ghost" leftIcon={<UserPlus size={13} />} onClick={() => setAssignTo(c)}>
                        {t('learning.assign')}
                      </Button>
                      <Button size="sm" variant="ghost" leftIcon={<Users size={13} />} onClick={() => setEnrolleesOf(c)}>
                        {t('learning.enrollees')}
                      </Button>
                      <Button size="sm" variant="ghost" leftIcon={<Trash2 size={13} />} onClick={() => setConfirmDelete(c)}>
                        {t('common.delete')}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : mine.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : enrollments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={26} />}
            title={t('learning.emptyMine')}
            description={t('learning.emptyMineHint')}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {enrollments.map((e) => (
            <Card key={e.id} className="flex flex-col gap-2 p-4">
              <button
                type="button"
                onClick={() => setPlaying(e.id)}
                className="truncate text-left font-semibold text-fg hover:text-brand-strong"
              >
                {e.course_title}
              </button>
              <div className="flex items-center gap-2">
                <Badge tone={e.status === 'completed' ? 'success' : 'brand'}>
                  {e.status_label || e.status}
                </Badge>
                {e.score != null && (
                  <span className="text-[11.5px] text-fg-subtle">
                    {t('learning.score')}: {e.score}
                  </span>
                )}
              </div>
              {/* The bar is the honest reading of `progress`; a course with no
                  lessons reports 0 and must not look broken. */}
              <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
                <div
                  className="h-full rounded-pill bg-brand"
                  style={{ width: `${Math.min(100, Math.max(0, Number(e.progress ?? 0)))}%` }}
                />
              </div>
              {e.deadline && (
                <p className="text-[11.5px] text-fg-subtle">
                  {t('learning.deadline')}: {e.deadline}
                </p>
              )}
              {e.certificate_number && (
                <p className="text-[11.5px] text-fg-muted">
                  {t('learning.certificate')}: {e.certificate_number}
                </p>
              )}
              <Button size="sm" className="mt-auto self-start" leftIcon={<PlayCircle size={14} />} onClick={() => setPlaying(e.id)}>
                {e.status === 'completed' ? t('learning.review') : t('learning.continue')}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <CourseEditorDrawer course={contentOf} onClose={() => setContentOf(null)} />
      <CoursePlayer enrollmentId={playing} onClose={() => setPlaying(null)} />

      <CourseModal
        open={creating || !!editing}
        course={editing}
        trainingTypes={trainingTypes}
        branchId={branchId}
        saving={ops.create.isPending || ops.update.isPending}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSave={(body) => {
          const done = {
            onSuccess: () => {
              toast.ok(t('common.saved'))
              setCreating(false)
              setEditing(null)
            },
            onError: (e: unknown) => toast.error(errorMessage(e, t('learning.saveFailed'))),
          }
          if (editing) ops.update.mutate({ id: editing.id, body }, done)
          else ops.create.mutate(body, done)
        }}
      />

      <AssignModal
        course={assignTo}
        branchId={branchId}
        saving={ops.assign.isPending}
        onClose={() => setAssignTo(null)}
        onAssign={(ids, deadline) =>
          ops.assign.mutate(
            { id: assignTo!.id, employee_ids: ids, deadline },
            {
              onSuccess: () => {
                toast.ok(t('learning.assigned'))
                setAssignTo(null)
              },
              onError: (e) => toast.error(errorMessage(e, t('learning.assignFailed'))),
            },
          )
        }
      />

      <EnrolleesModal course={enrolleesOf} onClose={() => setEnrolleesOf(null)} />

      <ConfirmDialog
        open={!!confirmDelete}
        title={t('learning.deleteTitle')}
        description={t('learning.deleteHint', { title: confirmDelete?.title ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        loading={ops.remove.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() =>
          ops.remove.mutate(confirmDelete!.id, {
            onSuccess: () => {
              toast.ok(t('common.deleted'))
              setConfirmDelete(null)
            },
            onError: (e) => toast.error(errorMessage(e, t('learning.deleteFailed'))),
          })
        }
      />
    </PageContainer>
  )
}

/**
 * Only the keys `CourseUpdate` declares. The list row also carries `id`,
 * `lesson_count`, `question_count`, `enrolled`, `completed`, `published_at`…
 * and request bodies are strict (`extra='forbid'`), so seeding the form with
 * the whole row made every course EDIT answer 422 «Extra inputs are not
 * permitted» (measured 2026-09-17). Create was unaffected: it seeds a literal.
 */
const COURSE_EDITABLE = [
  'title', 'description', 'provider', 'training_type', 'hours', 'organization_branch_id',
  'is_open_enrollment', 'is_published', 'pass_score', 'certificate_validity_months',
] as const
function pickEditable(course: LearningCourse): Partial<LearningCourse> {
  const out: Partial<LearningCourse> = {}
  for (const k of COURSE_EDITABLE) if (k in course) (out as Record<string, unknown>)[k] = course[k]
  return out
}

function CourseModal({
  open,
  course,
  trainingTypes,
  branchId,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  course: LearningCourse | null
  trainingTypes: { value: string; label: string }[]
  branchId: number | null
  saving: boolean
  onClose: () => void
  onSave: (body: Partial<LearningCourse>) => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<Partial<LearningCourse>>({})
  const [seeded, setSeeded] = useState<number | 'new' | null>(null)

  // Seed once per opened course rather than in an effect: the modal is
  // remounted-in-place and an effect would fight the user's own typing.
  const key = course?.id ?? 'new'
  if (open && seeded !== key) {
    setSeeded(key)
    setForm(
      course
        ? pickEditable(course)
        : {
            title: '',
            training_type: 'course',
            pass_score: 60,
            is_open_enrollment: true,
            is_published: false,
            organization_branch_id: branchId,
          },
    )
  }
  if (!open && seeded !== null) setSeeded(null)

  const set = (k: keyof LearningCourse, v: unknown) => setForm((p) => ({ ...p, [k]: v }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={course ? t('learning.editCourse') : t('learning.addCourse')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => onSave(form)}
            loading={saving}
            disabled={!String(form.title ?? '').trim()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('learning.fieldTitle')} required wide>
          <Input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} autoFocus />
        </Field>
        <Field label={t('learning.fieldDescription')} wide>
          <Textarea rows={3} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label={t('learning.fieldProvider')}>
          <Input value={form.provider ?? ''} onChange={(e) => set('provider', e.target.value)} />
        </Field>
        <Field label={t('learning.fieldType')}>
          <Select
            value={form.training_type ?? 'course'}
            onChange={(e) => set('training_type', e.target.value)}
            options={trainingTypes}
          />
        </Field>
        <Field label={t('learning.fieldHours')}>
          <Input
            type="number"
            min={0}
            value={form.hours ?? ''}
            onChange={(e) => set('hours', e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
        <Field label={t('learning.fieldPassScore')} hint={t('learning.passScoreHint')}>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.pass_score ?? 60}
            onChange={(e) => set('pass_score', Number(e.target.value))}
          />
        </Field>
        {/* Sertifikat AMAL MUDDATI — `certificate_validity_months` sxemada
            bor, v2 esa uni hech qachon qo'ymasdi, ya'ni berilgan sertifikat
            hech qachon eskirmasdi. */}
        <Field label={t('learning.fieldCertValidity')} hint={t('learning.certValidityHint')}>
          <Input
            type="number"
            min={0}
            value={form.certificate_validity_months ?? ''}
            onChange={(e) =>
              set('certificate_validity_months', e.target.value === '' ? null : Number(e.target.value))
            }
          />
        </Field>
        <label className="flex items-center gap-2.5">
          <Checkbox
            checked={!!form.is_open_enrollment}
            onChange={(e) => set('is_open_enrollment', e.target.checked)}
            srLabel={t('learning.openEnrollment')}
          />
          <span className="text-[13px] text-fg">{t('learning.openEnrollment')}</span>
        </label>
        <label className="flex items-center gap-2.5">
          <Checkbox
            checked={!!form.is_published}
            onChange={(e) => set('is_published', e.target.checked)}
            srLabel={t('learning.published')}
          />
          <span className="text-[13px] text-fg">{t('learning.published')}</span>
        </label>
      </div>
    </Modal>
  )
}

function AssignModal({
  course,
  branchId,
  saving,
  onClose,
  onAssign,
}: {
  course: LearningCourse | null
  branchId: number | null
  saving: boolean
  onClose: () => void
  onAssign: (ids: number[], deadline: string | null) => void
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Employee[]>([])
  const [deadline, setDeadline] = useState('')

  const close = () => {
    setPicked([])
    setDeadline('')
    onClose()
  }

  return (
    <Modal
      open={!!course}
      onClose={close}
      title={t('learning.assignTitle', { title: course?.title ?? '' })}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => onAssign(picked.map((p) => p.id), deadline || null)}
            loading={saving}
            disabled={picked.length === 0}
          >
            {t('learning.assign')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label={t('learning.pickEmployees')} hint={t('learning.pickEmployeesHint')}>
          <EmployeePicker
            value={null}
            branchId={branchId}
            onChange={(emp) => {
              if (emp && !picked.some((p) => p.id === emp.id)) setPicked((p) => [...p, emp])
            }}
          />
        </Field>
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                className="rounded-pill bg-brand px-2.5 py-1 text-[11.5px] font-medium text-fg-on-brand"
              >
                {p.legal_name} ×
              </button>
            ))}
          </div>
        )}
        <Field label={t('learning.deadline')}>
          <DateInput value={deadline} onChange={setDeadline} aria-label={t('learning.deadline')} />
        </Field>
      </div>
    </Modal>
  )
}

function EnrolleesModal({ course, onClose }: { course: LearningCourse | null; onClose: () => void }) {
  const { t } = useTranslation()
  const list = useCourseEnrollments(course?.id ?? null)
  const rows = list.data ?? []

  return (
    <Modal open={!!course} onClose={onClose} title={t('learning.enrolleesTitle', { title: course?.title ?? '' })}>
      {list.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t('learning.noEnrollees')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              {/* The name was never shown — only «#2288» — though the roster
                  route returns it. */}
              <span className="flex min-w-0 items-center gap-2">
                <Avatar src={e.employee_photo_thumb_path} fallbackSrc={e.employee_photo_path} name={e.employee_name ?? '?'} size={28} />
                <span className="truncate text-[13px] text-fg">{e.employee_name || `#${e.employee_id}`}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={e.status === 'completed' ? 'success' : 'neutral'}>
                  {e.status_label || e.status}
                </Badge>
                {e.score != null && <span className="text-[11.5px] text-fg-subtle">{e.score}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
