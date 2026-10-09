import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Paperclip, Trash2, Upload, Lock } from 'lucide-react'
import { apiClient } from '@/api/client'
import { apiDelete, apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { formatAppDate } from '@/lib/format'
import axios from 'axios'
import { LoadError } from '@/components/data/LoadError'

/**
 * HUJJAT SKANLARI — TZ 4.2.7 («Скан документов», «Скан диплома»,
 * «Другие сертификаты (скан)»).
 *
 * ⚠️ Bu bo'lim BUTUNLAY YO'Q edi: backendda `employee_documents` jadvali
 * bo'lsa-da, na endpoint, na ekran bor edi — ya'ni TZ ning uchta bandi
 * bajarilmagan holatda turardi. Fayl MinIO'da, havola qisqa muddatli
 * presigned (shaxsni tasdiqlovchi hujjat).
 */
interface EmployeeDocumentRow {
  id: number
  kind: string
  title?: string | null
  original_name?: string | null
  size_bytes?: number | null
  uploaded_at?: string | null
  url?: string | null
}

const KINDS = ['passport', 'diploma', 'certificate', 'military', 'other'] as const

export function DocumentsSection({ employeeId, canEdit }: { employeeId: number; canEdit: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<string>('passport')

  const q = useQuery({
    queryKey: ['employee-documents', employeeId],
    queryFn: () => apiGet<EmployeeDocumentRow[]>(`${EMPLOYEES_LIST}/${employeeId}/documents`),
  })
  const rows = q.data ?? []

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      fd.append('title', file.name)
      await apiClient.post(`${EMPLOYEES_LIST}/${employeeId}/documents`, fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-documents', employeeId] })
      toast.ok(t('common.saved'))
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`${EMPLOYEES_LIST}/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-documents', employeeId] })
      toast.ok(t('common.saved'))
    },
  })

  const size = (n?: number | null) =>
    !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label={t('t2.docKind')}
            options={KINDS.map((k) => ({ value: k, label: t(`t2.docKind_${k}` as never) }))}
            wrapperClassName="w-48"
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload.mutate(f)
              e.target.value = ''
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Upload size={14} />}
            loading={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {t('t2.docUpload')}
          </Button>
          <span className="text-[11px] text-fg-subtle">{t('t2.docHint')}</span>
        </div>
      )}

      {q.isError && axios.isAxiosError(q.error) && q.error.response?.status === 403 ? (
        /* A 403 is a rule, not a hiccup — «Qayta urinish» could never help
           (a ministr on another branch's card got exactly that). */
        <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
          <Lock size={13} /> {t('t2.docsHidden')}
        </p>
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">{t('t2.docEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-inner border border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText size={15} className="shrink-0 text-brand-strong" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">
                  {r.title || r.original_name || '—'}
                </p>
                <p className="text-[11px] text-fg-subtle">
                  {t(`t2.docKind_${r.kind}` as never)}
                  {r.uploaded_at ? ` · ${formatAppDate(r.uploaded_at)}` : ''}
                  {r.size_bytes ? ` · ${size(r.size_bytes)}` : ''}
                </p>
              </div>
              {r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-control-sm shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium text-brand-strong hover:bg-brand-soft"
                >
                  <Paperclip size={13} /> {t('t2.docOpen')}
                </a>
              )}
              {canEdit && (
                <IconButton size="sm" label={t('common.delete')} onClick={async () => { if (await confirm({ kind: 'delete', subject: r.title || r.original_name })) remove.mutate(r.id) }}>
                  <Trash2 size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
