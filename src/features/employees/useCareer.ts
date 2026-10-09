import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPatch, apiPost } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'

/**
 * KARYERA YOZUVLARI — ta'lim va oldingi ish joylari (TZ 4.2.7).
 *
 * ⚠️ Backendda to'liq CRUD bor edi (`/employees/{id}/educations`,
 * `/employees/{id}/work-experiences`), v2 esa ularni FAQAT O'QIRDI: kadr
 * xodimning ta'limi yoki ish tajribasini kirita olmasdi, TZ esa aynan
 * «период обучения (от и до) · учебное заведение · специальность» va
 * «организация · должность · дата начала · дата завершения» ni talab qiladi.
 */
interface EducationRow {
  id?: number
  institution_name: string
  faculty_name: string
  degree_name: string
  start_date: string
  end_date: string
}

interface ExperienceRow {
  id?: number
  company_name: string
  position: string
  start_date: string
  end_date: string
}

export function useCareerMutations(employeeId: number) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['employee', employeeId] })
  const base = `${EMPLOYEES_LIST}/${employeeId}`
  return {
    invalidate,
    createEducation: useMutation({
      mutationFn: (body: EducationRow) => apiPost(`${base}/educations`, body),
    }),
    updateEducation: useMutation({
      mutationFn: ({ id, body }: { id: number; body: EducationRow }) =>
        apiPatch(`${base}/educations/${id}`, body),
    }),
    removeEducation: useMutation({
      mutationFn: (id: number) => apiDelete(`${EMPLOYEES_LIST}/educations/${id}`),
    }),
    createExperience: useMutation({
      mutationFn: (body: ExperienceRow) => apiPost(`${base}/work-experiences`, body),
    }),
    updateExperience: useMutation({
      mutationFn: ({ id, body }: { id: number; body: ExperienceRow }) =>
        apiPatch(`${base}/work-experiences/${id}`, body),
    }),
    removeExperience: useMutation({
      mutationFn: (id: number) => apiDelete(`${EMPLOYEES_LIST}/work-experiences/${id}`),
    }),
  }
}
