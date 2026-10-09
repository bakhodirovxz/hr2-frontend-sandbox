import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPut } from '@/api/http'
import { EMPLOYEE_T2, EMPLOYEE_T2_SECTION } from '@/api/endpoints'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import type { User } from '@/types'
import * as roles from '@/auth/roles'

/**
 * T-2 SHAXSIY KARTOCHKASI — TZ 4.2.7.
 *
 * The card is split the way the paper form is: SCALAR facts at the top (one
 * PATCH), REPEATING sections below (each replaced whole with a PUT). Row-level
 * CRUD would have meant eighteen endpoints and eighteen pieces of optimistic
 * state for a form that is filled once and corrected rarely.
 *
 * Every classified list here comes from Ma'lumotnomalar (TZ 4.2.5) by code —
 * nothing on this card is a hardcoded dropdown.
 */

export interface T2Scalars {
  nationality_code?: string | null
  military_obligation_code?: string | null
  military_rank_code?: string | null
  political_party_code?: string | null
  education_level_code?: string | null
  education_specialty_code?: string | null
  education_institution?: string | null
  education_graduation_year?: number | null
  academic_degree_code?: string | null
  academic_title_code?: string | null
  birth_country_code?: string | null
  birth_region_code?: string | null
  birth_district_code?: string | null
  residence_region_code?: string | null
  residence_district_code?: string | null
  pasport_issue_date?: string | null
  pasport_expiry_date?: string | null
  previous_experience_months?: number | null
}

interface T2Experience {
  current_months: number
  previous_months: number
  total_months: number
  total_years: number
  total_rest_months: number
}

interface T2Language {
  id: number
  language_code: string
  language_name?: string | null
  level?: string | null
  level_name?: string | null
}
interface T2Award {
  id: number
  award_code?: string | null
  award_name?: string | null
  awarded_year?: number | null
  document_number?: string | null
  note?: string | null
}
interface T2ElectiveBody {
  id: number
  body_code?: string | null
  body_name?: string | null
  position?: string | null
  period_from?: string | null
  period_to?: string | null
}
interface T2Merit {
  id: number
  kind: string
  title: string
  order_number?: string | null
  order_date?: string | null
  issued_by?: string | null
  lifted_at?: string | null
  note?: string | null
}
interface T2Relative {
  id: number
  relation_code?: string | null
  relation_name?: string | null
  full_name?: string | null
  birth_date?: string | null
  birth_place?: string | null
  workplace?: string | null
  position?: string | null
  address?: string | null
}

interface T2Card {
  employee_id: number
  values: T2Scalars
  nationality_name?: string | null
  education_level_name?: string | null
  experience: T2Experience
  languages: T2Language[]
  awards: T2Award[]
  elective_bodies: T2ElectiveBody[]
  incentives: T2Merit[]
  penalties: T2Merit[]
  /** null = hidden for this viewer; [] = none recorded. */
  relatives: T2Relative[] | null
  relatives_visible: boolean
}

/** Same gate as the backend: the personnel office and the site master admin. */
export function canEditT2(user: User | null | undefined): boolean {
  return roles.isHR(user) || roles.isSiteMasterAdmin(user)
}

export function useT2Card(employeeId: number | null) {
  const q = useQuery({
    queryKey: ['employee-t2', employeeId],
    queryFn: () => apiGet<T2Card>(EMPLOYEE_T2(employeeId as number)),
    enabled: !!employeeId,
  })
  return { card: q.data ?? null, loading: q.isLoading, denied: q.isError }
}

export type T2Section = 'languages' | 'awards' | 'elective-bodies' | 'merits' | 'relatives'

export function useT2Mutations(employeeId: number | null) {
  const qc = useQueryClient()
  const write = (data: T2Card) => qc.setQueryData(['employee-t2', employeeId], data)

  return {
    saveScalars: useMutation({
      mutationFn: (values: T2Scalars) =>
        apiPatch<T2Card>(EMPLOYEE_T2(employeeId as number), values),
      onSuccess: write,
    }),
    saveSection: useMutation({
      mutationFn: ({ section, body }: { section: T2Section; body: Record<string, unknown> }) =>
        apiPut<T2Card>(EMPLOYEE_T2_SECTION(employeeId as number, section), body),
      onSuccess: write,
    }),
  }
}

/** The dictionary codes this card reads, in one place. */
export const T2_DICTIONARIES = {
  nationalities: 'nationalities',
  militaryObligation: 'military_obligation',
  militaryRanks: 'military_ranks',
  parties: 'political_parties',
  educationLevels: 'education_levels',
  educationSpecialties: 'education_specialties',
  academicDegrees: 'academic_degrees',
  academicTitles: 'academic_titles',
  countries: 'countries',
  regions: 'regions',
  districts: 'districts',
  languages: 'foreign_languages',
  languageLevels: 'language_levels',
  stateAwards: 'state_awards',
  electiveBodies: 'elective_bodies',
  relationTypes: 'relation_types',
} as const

/** `{value: code, label: name}` for a dictionary — the shape every picker wants. */
export function useCodeOptions(code: string | null, enabled = true) {
  const { options } = useDictionaryOptions(enabled ? code : null)
  return options.map((o) => ({ value: o.code, label: o.name }))
}

/**
 * Districts of ONE region. All 200-odd districts in a single list is not a
 * picker, it is a haystack — so the child list is fetched by the parent row's
 * id once a region is chosen.
 */
export function useDistrictOptions(regionCode: string | null | undefined) {
  const { options: regions } = useDictionaryOptions('regions')
  const region = regions.find((r) => r.code === regionCode)
  const { options } = useDictionaryOptions(region ? 'districts' : null)
  return options
    .filter((d) => !region || d.parent_id === region.id)
    .map((d) => ({ value: d.code, label: d.name }))
}
