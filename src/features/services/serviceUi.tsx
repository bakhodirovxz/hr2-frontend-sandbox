import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, UserCheck } from 'lucide-react'
import dayjs from 'dayjs'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { DateTimeInput, Field, Select } from '@/components/ui'
import { cn } from '@/lib/cn'
import { errorCode, errorMessage } from '@/api/errorMessage'
import i18n from '@/i18n'
import { inTashkent } from '@/lib/format'
import { uploadServiceAttachment, type ServiceRequestDetail, type ServiceStatus } from './useServices'

/**
 * So'rov vaqtlari Toshkent vaqtida. ⚠️ Bu jadvallarda offsetsiz qiymat ham
 * UTC: o'lchandi — `submitted_at` «…14:59:16Z» va o'sha paytdagi hodisa
 * `created_at` «…14:59:16» (bitta lahza). Umumiy `inTashkent` offsetsizni
 * Toshkent deb oladi va tarix 5 soat orqada ko'rinardi.
 */
export function fmtStamp(v?: string | null, withTime = true): string {
  if (!v) return '—'
  const iso = /(?:[+-]\d{2}:?\d{2}|Z)$/.test(v) ? v : `${v}Z`
  return inTashkent(iso).format(withTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY')
}

/* ── Holat ──────────────────────────────────────────────────────────────── */

export const STATUS_TONE: Record<ServiceStatus, BadgeTone> = {
  accepted: 'neutral',
  in_review: 'warning',
  in_progress: 'info',
  ready: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge tone={STATUS_TONE[status as ServiceStatus] ?? 'neutral'} className={className}>
      {t(`services.status_${status}` as never)}
    </Badge>
  )
}

/* ── Nomzod natijasi (TZ 4.2.12 «Подготовка ответа для Гостя») ─────────── */

export const CANDIDATE_RESULTS = ['interview', 'rejected', 'waiting'] as const
export type CandidateResult = (typeof CANDIDATE_RESULTS)[number]
const RESULT_TONE: Record<CandidateResult, BadgeTone> = { interview: 'success', rejected: 'danger', waiting: 'warning' }

/** Natija maydonlari umumiy payload ro'yxatida takrorlanmaydi. */
export const RESULT_KEYS = ['candidate_result', 'interview_at']

/** Ariza `payload` idagi maydonlar — xom kalit o'rniga yorliq (tahrir tartibi). */
export const PAYLOAD_KEYS = ['last_name', 'first_name', 'middle_name', 'position', 'phone', 'email', 'note'] as const

export function payloadLabel(key: string): string {
  const k = `svc.field_${key}`
  return i18n.exists(k) ? String((i18n.t as unknown as (x: string) => string)(k)) : key
}

const fmtInterview = (v: unknown) => {
  if (!v) return ''
  const d = dayjs(String(v))
  return d.isValid() ? d.format('DD.MM.YYYY HH:mm') : String(v)
}

/** Mehmon «Mening so'rovlarim» da ko'radigan natija (ro'yxat va tafsilot). */
export function CandidateResultBadge({
  payload,
  compact = false,
}: {
  payload?: Record<string, unknown> | null
  compact?: boolean
}) {
  const { t } = useTranslation()
  const code = payload?.candidate_result as CandidateResult | undefined
  if (!code || !CANDIDATE_RESULTS.includes(code)) return null
  const when = code === 'interview' ? fmtInterview(payload?.interview_at) : ''
  const label = t(`svc.result_${code}` as never)
  if (compact) {
    return (
      <span className="mt-1 flex items-center gap-1 text-[11px] text-fg-muted">
        <UserCheck size={11} className="shrink-0" />
        <span className="truncate">
          {label}
          {when ? ` · ${when}` : ''}
        </span>
      </span>
    )
  }
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-inner px-3 py-2.5 text-[12.5px]',
        RESULT_TONE[code] === 'success' && 'bg-success-soft text-success',
        RESULT_TONE[code] === 'danger' && 'bg-danger-soft text-danger',
        RESULT_TONE[code] === 'warning' && 'bg-warning-soft text-warning',
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <UserCheck size={14} /> {t('svc.resultTitle')}: {label}
      </span>
      {when && (
        <span className="flex items-center gap-1.5 text-fg">
          <CalendarClock size={13} /> {t('svc.interviewAt')}: {when}
        </span>
      )}
    </div>
  )
}

export interface CandidateResultValue {
  candidate_result: string
  interview_at: string
}

/** Ko'rib chiquvchi natijani belgilaydi — holat o'zgarishi bilan BIRGA yuboriladi. */
export function CandidateResultEditor({
  value,
  onChange,
  error,
}: {
  value: CandidateResultValue
  onChange: (v: CandidateResultValue) => void
  error?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-inner border border-line p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
        <UserCheck size={14} className="text-brand" /> {t('svc.resultEditor')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('svc.result')}>
          <Select
            value={value.candidate_result}
            onChange={(e) =>
              onChange({
                candidate_result: e.target.value,
                interview_at: e.target.value === 'interview' ? value.interview_at : '',
              })
            }
            placeholder={t('svc.resultNone')}
            options={CANDIDATE_RESULTS.map((r) => ({ value: r, label: t(`svc.result_${r}` as never) }))}
          />
        </Field>
        {value.candidate_result === 'interview' && (
          <Field label={t('svc.interviewAt')} required error={error}>
            <DateTimeInput
              value={value.interview_at}
              onChange={(v) => onChange({ ...value, interview_at: v })}
              invalid={!!error}
              aria-label={t('svc.interviewAt')}
            />
          </Field>
        )}
      </div>
      {error && value.candidate_result !== 'interview' && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      <p className="mt-2 text-[11.5px] text-fg-subtle">{t('svc.resultHint')}</p>
    </div>
  )
}

/** Formadagi natijani payload ga qo'shadi (mavjud maydonlar saqlanadi). */
export function mergeCandidateResult(
  payload: Record<string, unknown> | null | undefined,
  r: CandidateResultValue,
): Record<string, unknown> | null {
  if (!r.candidate_result) return null
  const at =
    r.candidate_result === 'interview' && r.interview_at
      ? dayjs(r.interview_at).format('YYYY-MM-DDTHH:mm:ssZ')
      : null
  return { ...(payload ?? {}), candidate_result: r.candidate_result, interview_at: at }
}

/* ── Biriktirilgan hujjatlar (TZ I1 1597) ──────────────────────────────── */

export const ATTACH_MAX = 10
export const ATTACH_MAX_BYTES = 20 * 1024 * 1024
export const ATTACH_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx']
export const ATTACH_ACCEPT = ATTACH_EXT.join(',')

/** Drop/paste dan kelgan HAMMA fayl qabul qilinadi — turi tekshiruvda aytiladi. */
export const acceptAnyFile = () => true

export function formatBytes(n?: number | null): string {
  if (!n) return ''
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** Brauzerda oldindan tekshirish — server baribir o'zi tekshiradi. */
function localProblem(file: File): string | null {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  const tr = i18n.t as unknown as (k: string, o?: object) => string
  if (!ATTACH_EXT.includes(ext)) return tr('svc.errType')
  if (file.size > ATTACH_MAX_BYTES) return tr('svc.errSize')
  return null
}

/** Server xatosi → aniq matn (kod bo'yicha, ikkala tilda). */
export function attachmentError(err: unknown, fallbackKey: 'svc.uploadFailed' | 'svc.removeFailed'): string {
  const tr = i18n.t as unknown as (k: string, o?: object) => string
  switch (errorCode(err)) {
    case 'scan_type_not_allowed':
      return tr('svc.errType')
    case 'file_too_large':
      return tr('svc.errSize')
    case 'attachments_limit':
      return tr('svc.errLimit', { max: ATTACH_MAX })
    case 'conflict':
      return tr('svc.errLocked')
    default:
      return errorMessage(err, tr(fallbackKey))
  }
}

export interface QueueItem {
  key: string
  file: File
  state: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string | null
  /** Tarmoq/server xatosi — qayta urinish mumkin (tur/hajm xatosi emas). */
  retryable?: boolean
}

/**
 * Yuklash navbati: fayllar bitta-bittadan yuboriladi (backend limiti va
 * tartib aniq bo'lsin), har birining foizi va xatosi alohida ko'rinadi.
 */
export function useAttachmentQueue() {
  const [items, setItemsState] = useState<QueueItem[]>([])
  const ref = useRef<QueueItem[]>([])
  const seq = useRef(0)
  const setItems = useCallback((next: QueueItem[]) => {
    ref.current = next
    setItemsState(next)
  }, [])
  const patch = useCallback(
    (key: string, p: Partial<QueueItem>) => setItems(ref.current.map((x) => (x.key === key ? { ...x, ...p } : x))),
    [setItems],
  )

  /**
   * `room` — yana nechta fayl sig'adi (10 − serverdagilar). Ortig'i, noto'g'ri
   * turdagi va 20 MB dan kattasi xato bilan ko'rsatiladi (yuborilmaydi).
   * Qaytaradi: qo'shilgan elementlar.
   */
  const add = useCallback(
    (files: File[], room: number): QueueItem[] => {
      const tr = i18n.t as unknown as (k: string, o?: object) => string
      let free = room - ref.current.filter((x) => x.state === 'pending' || x.state === 'uploading').length
      const added = files.map((file) => {
        let error = localProblem(file)
        if (!error) {
          if (free <= 0) error = tr('svc.errLimit', { max: ATTACH_MAX })
          else free -= 1
        }
        seq.current += 1
        const item: QueueItem = {
          key: `${seq.current}-${file.name}`,
          file,
          state: error ? 'error' : 'pending',
          progress: 0,
          error,
          retryable: false,
        }
        return item
      })
      setItems([...ref.current, ...added])
      return added
    },
    [setItems],
  )

  const remove = useCallback((key: string) => setItems(ref.current.filter((x) => x.key !== key)), [setItems])
  const clear = useCallback(() => setItems([]), [setItems])

  /**
   * `pending` fayllarni yuboradi. Har muvaffaqiyatli yuklashdan keyingi
   * tafsilot `onDetail` ga beriladi. Qaytaradi: xato bo'lganlar soni.
   */
  const uploadPending = useCallback(
    async (requestId: number, onDetail?: (d: ServiceRequestDetail) => void): Promise<number> => {
      let failed = 0
      // Yuklash paytida qo'shilgan fayllar ham shu siklda olinadi.
      for (;;) {
        const it = ref.current.find((x) => x.state === 'pending')
        if (!it) break
        patch(it.key, { state: 'uploading', progress: 0, error: null })
        try {
          const d = await uploadServiceAttachment(requestId, it.file, (pct) => patch(it.key, { progress: pct }))
          patch(it.key, { state: 'done', progress: 100 })
          onDetail?.(d)
        } catch (e) {
          failed += 1
          const code = errorCode(e)
          patch(it.key, {
            state: 'error',
            error: attachmentError(e, 'svc.uploadFailed'),
            retryable: code !== 'scan_type_not_allowed' && code !== 'file_too_large',
          })
        }
      }
      return failed
    },
    [patch],
  )

  /** Xato bergan faylni qayta navbatga qo'yadi. */
  const requeue = useCallback((key: string) => patch(key, { state: 'pending', progress: 0, error: null }), [patch])

  return { items, add, remove, clear, uploadPending, requeue }
}
