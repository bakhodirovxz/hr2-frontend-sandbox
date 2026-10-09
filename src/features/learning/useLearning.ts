import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'

/**
 * O'QUV MARKAZI — the organisation's OWN courses, lessons and tests.
 *
 * ⚠️ NOT the same module as «Malaka oshirish» (`/malaka-oshirish`), which
 * records attestations and external training, nor «LMS integratsiyasi»
 * (`/lms`), which pulls records from an outside platform. This one is the
 * internal course catalogue the NTM publishes and employees sit.
 *
 * The whole backend already existed (`app/api/v1/learning.py`, 20 routes) and
 * v2 referenced it nowhere — the module was reachable only through v1.
 */

const BASE = 'learning'

export interface LearningCourse {
  id: number
  title: string
  description?: string | null
  provider?: string | null
  training_type?: string | null
  hours?: number | null
  organization_branch_id?: number | null
  is_open_enrollment?: boolean
  is_published?: boolean
  pass_score?: number | null
  certificate_validity_months?: number | null
  lesson_count?: number
  question_count?: number
  enrolled?: number
  completed?: number
}

export interface LearningEnrollment {
  id: number
  course_id: number
  employee_id: number
  /** Course roster only (manager view). */
  employee_name?: string | null
  employee_photo_thumb_path?: string | null
  employee_photo_path?: string | null
  course_title?: string | null
  provider?: string | null
  hours?: number | null
  status: string
  status_label?: string | null
  progress?: number | null
  score?: number | null
  attempts?: number | null
  deadline?: string | null
  started_at?: string | null
  completed_at?: string | null
  certificate_number?: string | null
  certificate_expires_at?: string | null
}

/** Kurs mazmuni — matn, video yoki fayl. */
export interface LearningLesson {
  id: number
  course_id?: number
  title?: string | null
  lesson_type?: 'text' | 'video' | 'file' | string | null
  content?: string | null
  video_url?: string | null
  file_name?: string | null
  /** Serverdan kelgan tayyor havola (MinIO) — mijoz o'zi qurmaydi. */
  file_url?: string | null
  duration_minutes?: number | null
  position?: number | null
}

/**
 * ⚠️ IKKI XIL SHAKL. Muharrir uchun (`courses/{id}/questions`) `correct_ids`
 * BOR; tinglovchi uchun (`enrollments/{id}/test`) u HECH QACHON kelmaydi
 * (`questions_for_employee`). Javob kalitini mijozda hisoblab chiqarmang.
 */
export interface LearningQuestion {
  id: number
  text?: string | null
  options?: { id?: string; text?: string }[] | null
  correct_ids?: string[] | null
  position?: number | null
}

/** Bitta yozuv + kurs mazmuni + qaysi darslar bajarilgani. */
export interface EnrollmentDetail extends LearningEnrollment {
  lessons?: LearningLesson[]
  completed_lesson_ids?: number[]
  has_test?: boolean
  pass_score?: number | null
}

interface Meta {
  /** Server-decided: holds `lms_manager` in some branch, or is an admin. */
  is_manager: boolean
  training_types: { value: string; label: string }[]
  statuses: { value: string; label: string }[]
}

/** ⚠️ The manager flag comes from the SERVER, never re-derived here — the
 *  branch role that grants it is not on `/auth/me`. */
export function useLearningMeta() {
  const q = useQuery({
    queryKey: ['learning-meta'],
    queryFn: () => apiGet<Meta>(`${BASE}/meta`),
    staleTime: 10 * 60_000,
    retry: false,
  })
  return {
    isManager: !!q.data?.is_manager,
    trainingTypes: q.data?.training_types ?? [],
    statuses: q.data?.statuses ?? [],
    loading: q.isLoading,
  }
}

export function useCourses(search: string, branchId: number | null, allStates: boolean) {
  return useQuery({
    queryKey: ['learning-courses', { search, branchId, allStates }],
    queryFn: () =>
      apiGet<LearningCourse[]>(`${BASE}/courses`, {
        search: search || undefined,
        organization_branch_id: branchId || undefined,
        // Managers also see drafts; for everyone else the server ignores it.
        all_states: allStates || undefined,
      }),
    retry: false,
  })
}

export function useMyEnrollments() {
  return useQuery({
    queryKey: ['learning-my'],
    queryFn: () => apiGet<LearningEnrollment[]>(`${BASE}/my`),
    retry: false,
  })
}

export function useCourseEnrollments(courseId: number | null) {
  return useQuery({
    queryKey: ['learning-enrollments', courseId],
    queryFn: () => apiGet<LearningEnrollment[]>(`${BASE}/courses/${courseId}/enrollments`),
    enabled: courseId != null,
    retry: false,
  })
}

/** Bitta kurs, DARSLARI bilan (`with_lessons=True`). */
export function useCourse(courseId: number | null) {
  const q = useQuery({
    queryKey: ['learning-course', courseId],
    queryFn: () => apiGet<LearningCourse & { lessons?: LearningLesson[] }>(`${BASE}/courses/${courseId}`),
    enabled: courseId != null,
    retry: false,
  })
  return { course: q.data ?? null, loading: q.isLoading, refetch: q.refetch }
}

/** Kurs test savollari — FAQAT muharrir uchun (javob kaliti bilan). */
export function useCourseQuestions(courseId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['learning-questions', courseId],
    queryFn: () => apiGet<LearningQuestion[]>(`${BASE}/courses/${courseId}/questions`),
    enabled: enabled && courseId != null,
    retry: false,
  })
  return { questions: q.data ?? [], loading: q.isLoading }
}

/** Kurs pleyeri uchun: darslar, bajarilganlari va test bor-yo'qligi. */
export function useEnrollment(enrollmentId: number | null) {
  const q = useQuery({
    queryKey: ['learning-enrollment', enrollmentId],
    queryFn: () => apiGet<EnrollmentDetail>(`${BASE}/enrollments/${enrollmentId}`),
    enabled: enrollmentId != null,
    retry: false,
  })
  return { enrollment: q.data ?? null, loading: q.isLoading, refetch: q.refetch }
}

/** Yakuniy test savollari — javob kalitiSIZ. */
export function useEnrollmentTest(enrollmentId: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['learning-test', enrollmentId],
    queryFn: () => apiGet<LearningQuestion[]>(`${BASE}/enrollments/${enrollmentId}/test`),
    enabled: enabled && enrollmentId != null,
    retry: false,
  })
  return { questions: q.data ?? [], loading: q.isLoading }
}

export function useLearningOps() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['learning-courses'] })
    void qc.invalidateQueries({ queryKey: ['learning-my'] })
  }

  return {
    create: useMutation({
      mutationFn: (body: Partial<LearningCourse>) => apiPost(`${BASE}/courses`, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<LearningCourse> }) =>
        apiPatch(`${BASE}/courses/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(`${BASE}/courses/${id}`),
      onSuccess: invalidate,
    }),
    enroll: useMutation({
      mutationFn: (id: number) => apiPost(`${BASE}/courses/${id}/enroll`, {}),
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: ({ id, employee_ids, deadline }: { id: number; employee_ids: number[]; deadline?: string | null }) =>
        apiPost(`${BASE}/courses/${id}/assign`, { employee_ids, deadline: deadline || null }),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-enrollments', v.id] })
      },
    }),

    /* ── DARSLAR ──────────────────────────────────────────────────────
       ⚠️ MULTIPART, JSON EMAS: marshrut `Form(...)` + `File(...)` oladi.
       JSON yuborilsa 422 keladi. */
    createLesson: useMutation({
      mutationFn: ({ courseId, fd }: { courseId: number; fd: FormData }) =>
        apiPost(`${BASE}/courses/${courseId}/lessons`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-course', v.courseId] })
      },
    }),
    updateLesson: useMutation({
      mutationFn: ({ id, fd }: { id: number; courseId: number; fd: FormData }) =>
        apiPatch(`${BASE}/lessons/${id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-course', v.courseId] })
      },
    }),
    removeLesson: useMutation({
      mutationFn: ({ id }: { id: number; courseId: number }) => apiDelete(`${BASE}/lessons/${id}`),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-course', v.courseId] })
      },
    }),

    /* ── TEST SAVOLLARI ───────────────────────────────────────────── */
    createQuestion: useMutation({
      mutationFn: ({ courseId, body }: { courseId: number; body: Record<string, unknown> }) =>
        apiPost(`${BASE}/courses/${courseId}/questions`, body),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-questions', v.courseId] })
      },
    }),
    removeQuestion: useMutation({
      mutationFn: ({ id }: { id: number; courseId: number }) => apiDelete(`${BASE}/questions/${id}`),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-questions', v.courseId] })
      },
    }),

    /* ── PLEYER ───────────────────────────────────────────────────── */
    completeLesson: useMutation({
      mutationFn: ({ enrollmentId, lessonId }: { enrollmentId: number; lessonId: number }) =>
        apiPost(`${BASE}/enrollments/${enrollmentId}/lessons/${lessonId}/complete`, {}),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-enrollment', v.enrollmentId] })
      },
    }),
    submitTest: useMutation({
      mutationFn: ({ enrollmentId, answers }: { enrollmentId: number; answers: Record<string, string[]> }) =>
        apiPost<{ score: number; passed: boolean; certificate_number?: string | null }>(
          `${BASE}/enrollments/${enrollmentId}/test`,
          { answers },
        ),
      onSuccess: (_d, v) => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['learning-enrollment', v.enrollmentId] })
      },
    }),
  }
}
