import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Plus, Trash2, Video } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { errorMessage } from '@/api/errorMessage'
import { useFileDrop } from '@/hooks/useFileDrop'
import {
  useCourse,
  useCourseQuestions,
  useLearningOps,
  type LearningCourse,
  type LearningLesson,
  type LearningQuestion,
} from './useLearning'

/**
 * KURS MAZMUNI — darslar va yakuniy test.
 *
 * v2 kursni yaratardi va o'chirardi, lekin uning ICHIGA hech narsa qo'ya
 * olmasdi: `lessons` va `questions` marshrutlariga birorta murojaat yo'q edi.
 * Natijada har bir kurs bo'sh qobiq bo'lib qolardi — yozilish mumkin, o'qish
 * mumkin emas.
 */
export function CourseEditorDrawer({
  course,
  onClose,
}: {
  course: LearningCourse | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'lessons' | 'test'>('lessons')

  useEffect(() => {
    if (course) setTab('lessons')
  }, [course])

  return (
    <Modal
      open={!!course}
      onClose={onClose}
      title={`${t('learning.contentTitle')} — ${course?.title ?? ''}`}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        </div>
      }
    >
      {course && (
        <div className="flex flex-col gap-4">
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as 'lessons' | 'test')}
            options={[
              { value: 'lessons', label: `${t('learning.tabLessons')} (${course.lesson_count ?? 0})` },
              { value: 'test', label: `${t('learning.tabTest')} (${course.question_count ?? 0})` },
            ]}
          />
          {tab === 'lessons' ? <LessonsPanel courseId={course.id} /> : <TestPanel courseId={course.id} />}
        </div>
      )}
    </Modal>
  )
}

/* ─────────────────────────────── darslar ─────────────────────────────── */

function LessonsPanel({ courseId }: { courseId: number }) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useLearningOps()
  const { course, loading, refetch } = useCourse(courseId)
  const [editing, setEditing] = useState<LearningLesson | 'new' | null>(null)
  const [deleting, setDeleting] = useState<LearningLesson | null>(null)

  const lessons = (course?.lessons ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <p className="text-[12.5px] text-fg-muted">{t('learning.lessonsHint')}</p>
        <Button size="sm" className="ml-auto" leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>
          {t('learning.addLesson')}
        </Button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-fg-subtle">…</p>
      ) : lessons.length === 0 ? (
        <EmptyState title={t('learning.lessonsEmpty')} description={t('learning.lessonsEmptyHint')} />
      ) : (
        <ul className="divide-y divide-line rounded-inner border border-line">
          {lessons.map((l, i) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="tabnum w-6 shrink-0 text-[12px] text-fg-subtle">{i + 1}</span>
              <span className="shrink-0 text-fg-subtle">
                {l.lesson_type === 'video' ? <Video size={14} /> : <FileText size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{l.title ?? '—'}</span>
                {l.duration_minutes != null && (
                  <span className="block text-[11px] text-fg-subtle">
                    {t('learning.minutes', { count: l.duration_minutes })}
                  </span>
                )}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>{t('common.edit')}</Button>
              <Button size="icon" variant="ghost" aria-label={t('common.delete')} onClick={() => setDeleting(l)}>
                <Trash2 size={14} className="text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <LessonModal
        courseId={courseId}
        value={editing}
        nextPosition={lessons.length}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await refetch() }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const l = deleting
          setDeleting(null)
          if (!l) return
          try {
            await ops.removeLesson.mutateAsync({ id: l.id, courseId })
            await refetch()
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
        danger
        title={t('learning.deleteLessonTitle')}
        description={deleting?.title ?? ''}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}

function LessonModal({ courseId, value, nextPosition, onClose, onSaved }: {
  courseId: number
  value: LearningLesson | 'new' | null
  nextPosition: number
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useLearningOps()
  const row = value && value !== 'new' ? value : null
  const open = !!value

  const [title, setTitle] = useState('')
  const [type, setType] = useState('text')
  const [content, setContent] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [minutes, setMinutes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(row?.title ?? '')
    setType(row?.lesson_type ?? 'text')
    setContent(row?.content ?? '')
    setVideoUrl(row?.video_url ?? '')
    setMinutes(row?.duration_minutes != null ? String(row.duration_minutes) : '')
    setFile(null)
  }, [open, row])

  // Sudrab tashlash — dars materiali odatda tayyor fayl bo'ladi.
  const { dragging, dropProps } = useFileDrop({ enabled: open, onFiles: (files) => setFile(files[0] ?? null) })

  const save = async () => {
    if (!title.trim()) return toast.error(t('learning.lessonTitleRequired'))
    /* ⚠️ MULTIPART: marshrut `Form(...)` + `File(...)` oladi, JSON emas. */
    const fd = new FormData()
    fd.append('title', title.trim())
    fd.append('lesson_type', type)
    if (content.trim()) fd.append('content', content.trim())
    if (videoUrl.trim()) fd.append('video_url', videoUrl.trim())
    if (minutes.trim()) fd.append('duration_minutes', String(Number(minutes) || 0))
    fd.append('position', String(row?.position ?? nextPosition))
    if (file) fd.append('file', file)
    try {
      if (row) await ops.updateLesson.mutateAsync({ id: row.id, courseId, fd })
      else await ops.createLesson.mutateAsync({ courseId, fd })
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? t('learning.editLesson') : t('learning.addLesson')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={ops.createLesson.isPending || ops.updateLesson.isPending}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('learning.lessonTitle')} required wide>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={t('learning.lessonType')}>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { value: 'text', label: t('learning.lessonTypeText') },
              { value: 'video', label: t('learning.lessonTypeVideo') },
              { value: 'file', label: t('learning.lessonTypeFile') },
            ]}
          />
        </Field>
        <Field label={t('learning.lessonMinutes')}>
          <Input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        {type === 'video' && (
          <Field label={t('learning.videoUrl')} wide>
            <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" />
          </Field>
        )}
        {type !== 'video' && (
          <Field label={t('learning.lessonContent')} wide>
            <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label={t('learning.lessonFile')} hint={row?.file_name ?? undefined}>
            <div
              {...dropProps}
              className={
                dragging
                  ? 'rounded-lg border-2 border-dashed border-brand bg-brand-soft/40 p-3'
                  : 'rounded-lg border-2 border-dashed border-line p-3'
              }
            >
              <input
                type="file"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
                className="text-[13px]"
              />
              {file && <p className="mt-1.5 text-[12px] text-fg-muted">{file.name}</p>}
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/* ──────────────────────────────── test ───────────────────────────────── */

function TestPanel({ courseId }: { courseId: number }) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useLearningOps()
  const { questions, loading } = useCourseQuestions(courseId)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<LearningQuestion | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <p className="text-[12.5px] text-fg-muted">{t('learning.testHint')}</p>
        <Button size="sm" className="ml-auto" leftIcon={<Plus size={14} />} onClick={() => setAdding(true)}>
          {t('learning.addQuestion')}
        </Button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-fg-subtle">…</p>
      ) : questions.length === 0 ? (
        <EmptyState title={t('learning.testEmpty')} description={t('learning.testEmptyHint')} />
      ) : (
        <ul className="divide-y divide-line rounded-inner border border-line">
          {questions.map((q, i) => (
            <li key={q.id} className="px-3 py-2.5">
              <div className="flex items-start gap-3">
                <span className="tabnum w-6 shrink-0 text-[12px] text-fg-subtle">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[13px] text-fg">{q.text}</span>
                <Button size="icon" variant="ghost" aria-label={t('common.delete')} onClick={() => setDeleting(q)}>
                  <Trash2 size={14} className="text-danger" />
                </Button>
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-9">
                {(q.options ?? []).map((o) => {
                  // ⚠️ Javob kaliti SERVERDAN keladi (muharrir ko'rinishida
                  // `correct_ids` bor); mijozda hisoblab chiqarilmaydi.
                  const right = (q.correct_ids ?? []).includes(o.id ?? '')
                  return (
                    <li
                      key={o.id}
                      className={
                        right
                          ? 'rounded-pill bg-success/[0.14] px-2 py-0.5 text-[11.5px] font-medium text-success'
                          : 'rounded-pill bg-surface-2 px-2 py-0.5 text-[11.5px] text-fg-muted'
                      }
                    >
                      {o.text}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <QuestionModal
        open={adding}
        courseId={courseId}
        nextPosition={questions.length}
        onClose={() => setAdding(false)}
        onSaved={() => setAdding(false)}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const q = deleting
          setDeleting(null)
          if (!q) return
          try {
            await ops.removeQuestion.mutateAsync({ id: q.id, courseId })
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
        danger
        title={t('learning.deleteQuestionTitle')}
        description={deleting?.text ?? ''}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}

function QuestionModal({ open, courseId, nextPosition, onClose, onSaved }: {
  open: boolean
  courseId: number
  nextPosition: number
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useLearningOps()
  const [text, setText] = useState('')
  /** Variantlar: id — harf, matn — foydalanuvchi yozgani. */
  const [options, setOptions] = useState<{ id: string; text: string; correct: boolean }[]>([])

  useEffect(() => {
    if (!open) return
    setText('')
    setOptions([
      { id: 'a', text: '', correct: false },
      { id: 'b', text: '', correct: false },
    ])
  }, [open])

  const addOption = () =>
    setOptions((prev) => [
      ...prev,
      { id: String.fromCharCode(97 + prev.length), text: '', correct: false },
    ])

  const save = async () => {
    const filled = options.filter((o) => o.text.trim())
    if (!text.trim()) return toast.error(t('learning.questionTextRequired'))
    if (filled.length < 2) return toast.error(t('learning.questionOptionsRequired'))
    if (!filled.some((o) => o.correct)) return toast.error(t('learning.questionCorrectRequired'))
    try {
      await ops.createQuestion.mutateAsync({
        courseId,
        body: {
          text: text.trim(),
          options: filled.map((o) => ({ id: o.id, text: o.text.trim() })),
          correct_ids: filled.filter((o) => o.correct).map((o) => o.id),
          position: nextPosition,
        },
      })
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('learning.addQuestion')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={ops.createQuestion.isPending}>{t('common.save')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('learning.questionText')} required>
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
        <Field label={t('learning.questionOptions')} hint={t('learning.questionOptionsHint')}>
          <ul className="flex flex-col gap-2">
            {options.map((o, i) => (
              <li key={o.id} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-[12px] font-semibold uppercase text-fg-subtle">{o.id}</span>
                <Input
                  value={o.text}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                  }
                  className="flex-1"
                />
                <button
                  type="button"
                  aria-pressed={o.correct}
                  onClick={() =>
                    setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, correct: !x.correct } : x)))
                  }
                  className={
                    o.correct
                      ? 'shrink-0 rounded-pill bg-success/[0.14] px-2.5 py-1 text-[11.5px] font-semibold text-success'
                      : 'shrink-0 rounded-pill border border-line px-2.5 py-1 text-[11.5px] text-fg-muted'
                  }
                >
                  {t('learning.correct')}
                </button>
              </li>
            ))}
          </ul>
        </Field>
        <Button size="sm" variant="outline" className="self-start" leftIcon={<Plus size={14} />} onClick={addOption}>
          {t('learning.addOption')}
        </Button>
      </div>
    </Modal>
  )
}
