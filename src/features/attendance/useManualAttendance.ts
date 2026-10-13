import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '@/api/http'

const MANUAL = 'manual-attendance'

/**
 * DAVOMATNI QO'LDA TUZATISH (TZ I2 «Учёт посещаемости», 5–14 qadamlar).
 *
 * Tuzatish turniket yozuvi USTIDAN qo'llanadi; turniket qaydlari o'chirilmaydi,
 * shuning uchun tuzatishni istalgan vaqtda olib tashlash mumkin va kim, qachon
 * kiritgani ko'rinib turadi. Server: `attendance >= edit` (kadr — o'z darajasi,
 * bo'lim boshlig'i — o'z bo'linmasi).
 */
export interface ManualRow {
  id: number
  employee_id?: number | null
  work_date?: string | null
  day_type?: string | null
  day_type_label?: string | null
  check_in?: string | null
  check_out?: string | null
  /** «Основание отсутствия» — buyruq yoki kasallik varaqasi raqami. */
  absence_basis?: string | null
  work_minutes?: number | null
  work_hours?: number | null
  comment?: string | null
  created_by_name?: string | null
  created_at?: string | null
}

/**
 * TZ'dagi oltita kun turi (`models/attendance_manual.DAY_TYPES`). `basis` —
 * yo'qlik asosi so'raladigan turlar; kelish/ketish vaqti faqat ish kunida.
 */
export const MANUAL_DAY_TYPES = [
  { value: 'present', basis: false },
  { value: 'day_off', basis: false },
  { value: 'sick', basis: true },
  { value: 'vacation', basis: true },
  { value: 'business_trip', basis: true },
  { value: 'absent', basis: true },
] as const
export type ManualDayType = (typeof MANUAL_DAY_TYPES)[number]['value']

export const dayTypeNeedsBasis = (v?: string | null) =>
  !!MANUAL_DAY_TYPES.find((d) => d.value === v)?.basis

/** "HH:MM" juftligidan daqiqa farqi; vaqt yo'q bo'lsa null, teskari bo'lsa manfiy. */
export function diffMinutes(checkIn?: string | null, checkOut?: string | null): number | null {
  const toMin = (v?: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v ?? '')
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const a = toMin(checkIn)
  const b = toMin(checkOut)
  return a == null || b == null ? null : b - a
}

/** Qatordagi ishlangan vaqt: `work_minutes` → `work_hours` → vaqtlardan. */
export function rowWorkMinutes(r: ManualRow): number | null {
  if (r.work_minutes != null) return Number(r.work_minutes)
  if (r.work_hours != null) return Math.round(Number(r.work_hours) * 60)
  const d = diffMinutes(r.check_in, r.check_out)
  return d != null && d >= 0 ? d : null
}

/**
 * Server qabul qiladigan kun turlari (`manual-attendance/meta`). Ro'yxat
 * shundan filtrlanadi — server bilmaydigan tur 422 bermasin. Yorliqlar esa
 * lug'atdan (ikki tilli interfeys), serverning o'zbekcha matnidan emas.
 */
export function useManualMeta(enabled: boolean) {
  const q = useQuery({
    enabled,
    queryKey: [MANUAL, 'meta'],
    queryFn: () => apiGet<{ day_types?: { value: string; label: string }[] }>(`${MANUAL}/meta`),
    staleTime: 30 * 60_000,
  })
  const known = q.data?.day_types?.map((d) => d.value) ?? []
  return {
    dayTypes: known.length ? MANUAL_DAY_TYPES.filter((d) => known.includes(d.value)) : MANUAL_DAY_TYPES,
  }
}

/**
 * Bir xodimning tuzatishlari. `from`/`to` berilsa — faqat shu davr (xodim
 * davomati paneli), aks holda hammasi (tuzatish oynasi).
 */
export function useManualRows(employeeId: number | null, range?: { from?: string; to?: string }, enabled = true) {
  const q = useQuery({
    enabled: enabled && !!employeeId,
    queryKey: [MANUAL, 'list', employeeId, range?.from ?? '', range?.to ?? ''],
    queryFn: () =>
      apiGet<{ items?: ManualRow[] }>(MANUAL, {
        employee_id: employeeId,
        date_from: range?.from || undefined,
        date_to: range?.to || undefined,
        _no_branch_inject: true,
      }),
  })
  return { rows: q.data?.items ?? [], loading: q.isLoading }
}

export function useManualMutations() {
  const qc = useQueryClient()
  // Tuzatish tabel raqamlarini o'zgartiradi — ikkala kesh ham yangilanadi.
  const done = () => {
    qc.invalidateQueries({ queryKey: [MANUAL] })
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  return {
    save: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<ManualRow>(MANUAL, body), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${MANUAL}/${id}`), onSuccess: done }),
  }
}

/** `POST /manual-attendance/bulk` chegaralari (backend `BULK_MAX_*`, `BulkIn`). */
export const BULK_MAX_DAYS = 62
export const BULK_MAX_CELLS = 5000
export const BULK_MAX_EMPLOYEES = 500

export interface BulkResultRow {
  employee_id: number
  /** Bo'sh — xodim darajasidagi rad (topilmadi / ko'lamdan tashqari): barcha kunlar. */
  work_date?: string | null
  ok: boolean
  id?: number
  status_code?: number
  code?: string | null
  error?: string | null
}

export interface BulkResult {
  total: number
  saved: number
  failed: number
  items: BulkResultRow[]
}

/**
 * TZ I2 1639 «Массовое заполнение»: bir xil qiymat tanlangan xodimlar ×
 * sanalar oralig'iga. Javob — har katak bo'yicha natija; rad etilgani
 * boshqalarini to'xtatmaydi.
 */
export function useBulkManualAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<BulkResult>(`${MANUAL}/bulk`, body),
    // Xato oynaning o'zida ko'rsatiladi (`bulk_too_large` chegaralari bilan).
    meta: { silent: true },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MANUAL] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}
