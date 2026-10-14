import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/api/http'
import { fetchAllPages } from '@/api/fetchAll'
import { PDF_MIME, XLSX_MIME, downloadFile } from '@/lib/download'
import dayjs from 'dayjs'

/**
 * «Vakansiyalar» (TZ 4.2.10, V3) — shtat jadvalidan avtomatik hisoblangan bo'sh
 * o'rinlar, HAR BIR logingan foydalanuvchi uchun (mehmon ham: unga faqat
 * portalga chiqariladiganlari — backend hal qiladi).
 *
 *   GET  staff-positions/vacancies          — ro'yxat (ustun filtrlari, saralash)
 *   POST vacancy-applications/{staff_pos}    — ariza / suhbatga yozilish
 *   GET  vacancy-applications/mine           — o'z arizalari va holati
 *
 * ⚠️ `_no_branch_inject`: ro'yxat butun guruh bo'yicha (TZ «все организации»),
 * shapkada tanlangan filial unga qo'shilmasligi kerak.
 */
export interface Named {
  id: number
  name: string | null
}

export interface RequiredLanguage {
  language_code: string
  level_code?: string | null
}

export interface Vacancy {
  id: number
  organization: Named | null
  department: Named | null
  job_position: Named | null
  requirements: string | null
  required_skills: string | null
  required_languages: RequiredLanguage[] | null
  education_level_code: string | null
  experience_years: number | null
  vacant_count: number | null
  available_from: string | null
  salary_from: number | null
  salary_to: number | null
  schedule: string | null
  employment_type: string | null
  application_deadline: string | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  status: string | null
}

/** Serverga boradigan ustun filtrlari (`list_vacancies` parametrlari). */
export interface VacancyFilters {
  organization: string
  department: string
  job_position: string
  requirements: string
  vacant_count_min: string
  date_from: string
  date_to: string
  /** TZ V3 1311 status filter: '' = open (default), paused, closed. */
  status?: string
}

export type VacancySortKey =
  | 'organization'
  | 'department'
  | 'job_position'
  | 'requirements'
  | 'vacant_count'
  | 'available_from'

function vacancyParams(filters: VacancyFilters, sort: VacancySortKey, order: 'asc' | 'desc') {
  return {
    _no_branch_inject: true,
    organization: filters.organization.trim() || undefined,
    department: filters.department.trim() || undefined,
    job_position: filters.job_position.trim() || undefined,
    requirements: filters.requirements.trim() || undefined,
    vacant_count_min: filters.vacant_count_min !== '' ? Number(filters.vacant_count_min) : undefined,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    status: filters.status || undefined,
    sort,
    order,
  }
}

/** `POST staff-positions/vacancies/export?format=` — same filters as the list; every signed-in user. */
export const exportVacancies = (
  filters: VacancyFilters,
  sort: VacancySortKey,
  order: 'asc' | 'desc',
  format: 'xlsx' | 'pdf',
  columns: string[] = [],
) =>
  downloadFile({
    url: 'staff-positions/vacancies/export',
    method: 'post',
    mime: format === 'pdf' ? PDF_MIME : XLSX_MIME,
    filename: `Vakansiyalar_${dayjs().format('DD.MM.YYYY')}.${format}`,
    params: { ...vacancyParams(filters, sort, order), format, columns: columns.length ? columns : undefined },
  })

/** The vacancy's own link: `/vacancies?open={id}` opens its card (absolute URL). */
export const vacancyLink = (id: number) => new URL(`/vacancies?open=${id}`, window.location.origin).toString()

/**
 * «Ulashish»: the link goes to the clipboard, and on devices with the Web
 * Share API the system share sheet opens as well.
 */
export async function shareVacancy(v: Vacancy, title: string): Promise<'copied' | 'shared' | 'cancelled' | 'failed'> {
  const url = vacancyLink(v.id)
  let copied = false
  try {
    await navigator.clipboard.writeText(url)
    copied = true
  } catch {
    /* insecure context or denied — the share sheet may still work */
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return copied ? 'copied' : 'cancelled'
    }
  }
  return copied ? 'copied' : 'failed'
}

export function useVacancies(filters: VacancyFilters, sort: VacancySortKey, order: 'asc' | 'desc') {
  return useQuery({
    queryKey: ['vacancies', filters, sort, order],
    // Hamma sahifa olinadi: saralash va sahifalash butun ro'yxat ustida
    // (v1 bilan bir xil) — server sahifasi 200 tadan.
    queryFn: () =>
      fetchAllPages<Vacancy>(
        'staff-positions/vacancies',
        vacancyParams(filters, sort, order),
        200,
        20,
      ),
    placeholderData: (prev) => prev,
  })
}

export interface VacancyApplication {
  id: number
  staff_position_id: number
  job_position_name?: string | null
  department_name?: string | null
  organization_name?: string | null
  vacancy_title?: string | null
  full_name: string
  phone: string | null
  email: string | null
  about: string | null
  preferred_date: string | null
  status: 'new' | 'invited' | 'interviewed' | 'hired' | 'rejected' | string
  status_label?: string | null
  interview_at: string | null
  review_note: string | null
  created_at: string | null
}

const MINE_KEY = ['vacancy-applications', 'mine'] as const

export function useMyApplications(enabled = true) {
  return useQuery({
    queryKey: MINE_KEY,
    queryFn: () => apiGet<VacancyApplication[]>('vacancy-applications/mine', { _no_branch_inject: true }),
    enabled,
  })
}

export interface ApplyBody {
  full_name: string
  phone: string | null
  email: string | null
  about: string | null
  preferred_date: string | null
}

export function useApplyVacancy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ApplyBody }) =>
      apiPost<VacancyApplication>(`vacancy-applications/${id}`, body),
    // Xato shaklning o'zida ko'rsatiladi (FormError) — umumiy toast takrorlamasin.
    meta: { silent: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: MINE_KEY }),
  })
}
