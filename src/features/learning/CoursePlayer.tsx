import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Award, Check, FileText, PlayCircle, Video } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { formatAppDate } from '@/lib/format'
import { useEnrollment, useEnrollmentTest, useLearningOps } from './useLearning'

/**
 * KURS PLEYERI — xodim kursni AYNAN shu yerda o'taydi.
 *
 * v2 kursga yozila olardi va yozuvni ro'yxatda ko'rardi, xolos: darsni ochish,
 * uni yakunlangan deb belgilash va yakuniy testni topshirish yo'llari
 * (`enrollments/{id}`, `.../lessons/{lid}/complete`, `.../test`) hech qayerdan
 * chaqirilmasdi. Ya'ni yozilgan kursni TUGATIB bo'lmasdi va sertifikat hech
 * qachon berilmasdi.
 */
export function CoursePlayer({ enrollmentId, onClose }: {
  enrollmentId: number | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useLearningOps()
  const { enrollment, loading, refetch } = useEnrollment(enrollmentId)
  const [openLesson, setOpenLesson] = useState<number | null>(null)
  const [testOpen, setTestOpen] = useState(false)

  const lessons = useMemo(
    () => (enrollment?.lessons ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [enrollment],
  )
  const done = new Set(enrollment?.completed_lesson_ids ?? [])
  const allDone = lessons.length > 0 && lessons.every((l) => done.has(l.id))
  const current = lessons.find((l) => l.id === openLesson) ?? null

  useEffect(() => {
    if (enrollmentId == null) {
      setOpenLesson(null)
      setTestOpen(false)
    }
  }, [enrollmentId])

  // Ochilganda birinchi TUGALLANMAGAN darsga tushamiz — odam qayerda
  // to'xtaganini qidirmasin.
  useEffect(() => {
    if (openLesson != null || lessons.length === 0) return
    setOpenLesson((lessons.find((l) => !done.has(l.id)) ?? lessons[0]).id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons.length])

  const completeCurrent = async () => {
    if (!enrollmentId || !current) return
    try {
      await ops.completeLesson.mutateAsync({ enrollmentId, lessonId: current.id })
      await refetch()
      const next = lessons.find((l) => !done.has(l.id) && l.id !== current.id)
      if (next) setOpenLesson(next.id)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={enrollmentId != null}
      onClose={onClose}
      title={enrollment?.course_title ?? t('learning.player')}
      size="lg"
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="text-[12.5px] text-fg-muted">
            {t('learning.progressOf', { done: done.size, total: lessons.length })}
          </span>
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
            {current && !done.has(current.id) && (
              <Button onClick={completeCurrent} loading={ops.completeLesson.isPending} leftIcon={<Check size={14} />}>
                {t('learning.markDone')}
              </Button>
            )}
            {allDone && enrollment?.has_test && (
              <Button onClick={() => setTestOpen(true)} leftIcon={<Award size={14} />}>
                {t('learning.startTest')}
              </Button>
            )}
          </span>
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">…</p>
      ) : lessons.length === 0 ? (
        <EmptyState title={t('learning.noLessons')} description={t('learning.noLessonsHint')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
          {/* Darslar zinapoyasi */}
          <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {lessons.map((l, i) => {
              const ok = done.has(l.id)
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setOpenLesson(l.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px]',
                      openLesson === l.id ? 'bg-brand-soft text-fg' : 'hover:bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                        ok ? 'bg-success text-white' : 'bg-surface-2 text-fg-subtle',
                      )}
                    >
                      {ok ? <Check size={11} /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Dars mazmuni */}
          <div className="min-w-0">
            {current ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-fg-subtle">
                    {current.lesson_type === 'video' ? <Video size={15} /> : <FileText size={15} />}
                  </span>
                  <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{current.title}</h3>
                  {done.has(current.id) && <Badge tone="success">{t('learning.doneLabel')}</Badge>}
                </div>

                {current.video_url && (
                  <a
                    href={current.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] text-brand-strong hover:underline"
                  >
                    <PlayCircle size={15} /> {t('learning.openVideo')}
                  </a>
                )}
                {current.file_url && (
                  <a
                    href={current.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] text-brand-strong hover:underline"
                  >
                    <FileText size={15} /> {current.file_name || t('learning.openFile')}
                  </a>
                )}
                {current.content && (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{current.content}</p>
                )}
              </div>
            ) : null}

            {enrollment?.certificate_number && (
              <div className="mt-4 rounded-inner border border-success/30 bg-success-soft px-3 py-2.5">
                <p className="text-[13px] font-semibold text-success">
                  {t('learning.certificate')}: {enrollment.certificate_number}
                </p>
                {enrollment.certificate_expires_at && (
                  <p className="text-[11.5px] text-success">
                    {t('learning.validUntil', { date: formatAppDate(enrollment.certificate_expires_at) })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <TestModal
        open={testOpen}
        enrollmentId={enrollmentId}
        passScore={enrollment?.pass_score ?? 0}
        onClose={() => setTestOpen(false)}
        onDone={async () => { setTestOpen(false); await refetch() }}
      />
    </Modal>
  )
}

/** Yakuniy test. ⚠️ Savollar javob kalitiSIZ keladi — natijani SERVER aytadi. */
function TestModal({ open, enrollmentId, passScore, onClose, onDone }: {
  open: boolean
  enrollmentId: number | null
  passScore: number
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const ops = useLearningOps()
  const { questions, loading } = useEnrollmentTest(enrollmentId, open)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    setAnswers({})
    setResult(null)
  }, [open])

  const toggle = (qid: number, oid: string, on: boolean) =>
    setAnswers((prev) => {
      const cur = prev[String(qid)] ?? []
      return { ...prev, [String(qid)]: on ? [...cur, oid] : cur.filter((x) => x !== oid) }
    })

  const submit = async () => {
    if (!enrollmentId) return
    // The final test is graded once — answers cannot be changed after this.
    if (!(await confirm({ kind: 'send', confirmLabel: t('learning.submitTest') }))) return
    try {
      const res = await ops.submitTest.mutateAsync({ enrollmentId, answers })
      setResult({ score: res.score, passed: res.passed })
      onDone()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('learning.finalTest')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          {!result && (
            <Button onClick={submit} loading={ops.submitTest.isPending} disabled={questions.length === 0}>
              {t('learning.submitTest')}
            </Button>
          )}
        </div>
      }
    >
      {result ? (
        <div className="py-6 text-center">
          <p className={cn('text-2xl font-bold tabular-nums', result.passed ? 'text-success' : 'text-danger')}>
            {result.score}%
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">
            {result.passed ? t('learning.testPassed') : t('learning.testFailed', { score: passScore })}
          </p>
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-fg-subtle">…</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <li key={q.id}>
              <p className="mb-2 text-[13px] font-medium text-fg">
                {i + 1}. {q.text}
              </p>
              <ul className="flex flex-col gap-1.5 pl-4">
                {(q.options ?? []).map((o) => (
                  <li key={o.id}>
                    <Checkbox
                      checked={(answers[String(q.id)] ?? []).includes(o.id ?? '')}
                      onChange={(e) => toggle(q.id, o.id ?? '', e.target.checked)}
                      label={o.text ?? ''}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
