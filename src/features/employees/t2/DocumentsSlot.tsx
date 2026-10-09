import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { deleteEmployeeDocument, uploadEmployeeDocument, useEmployeeDocuments } from '../useEmployees'
import { fmtDate } from '../format'
import { useAuthStore } from '@/store/authStore'
import { useT2Card } from './useT2'
import type { EmployeeDocument } from '../types'

export const SCAN_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx'
export const SCAN_MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx']

/** Client-side check of a scan before upload (the server re-checks the content). */
export function scanProblem(file: File): 'type' | 'size' | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_EXT.includes(ext)) return 'type'
  if (file.size > SCAN_MAX_BYTES) return 'size'
  return null
}

const isImage = (d: EmployeeDocument) =>
  /^image\//.test(d.content_type || '') || /\.(png|jpe?g|webp|gif)$/i.test(d.original_name || '')

const fmtSize = (n?: number | null) => {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Document scans of one kind (TZ 4.2.7 «Скан документов», C1 «паспорт,
 * диплом, трудовая книжка»): `GET/POST /employees/{pk}/documents`,
 * `DELETE /employees/{pk}/documents/{id}`. The file link is a short-lived
 * presigned MinIO URL, so it opens without our Authorization header.
 */
export function DocumentsSlot({
  employeeId,
  kind,
  title,
  canEdit,
  alsoShow = [],
}: {
  employeeId: number
  kind: string
  title: string
  canEdit: boolean
  alsoShow?: string[]
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [docTitle, setDocTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  // Scans follow the passport-number rule (backend `_assert_can_read`): the
  // employee himself or a viewer with full PII level — the T-2 card tells
  // which (`relatives_visible`), so nobody else gets a request that 403s.
  const ownId = useAuthStore((s) => s.user?.employee?.id)
  const card = useT2Card(employeeId)
  const allowed = ownId === employeeId || !!card.data?.relatives_visible
  const q = useEmployeeDocuments(employeeId, allowed)
  const kinds = [kind, ...alsoShow]
  const docs = (q.data ?? []).filter((d) => kinds.includes(d.kind))
  const unavailable = q.isError || (!card.isLoading && !allowed)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['employee-docs', employeeId] })
    void qc.invalidateQueries({ queryKey: ['employee-t2', employeeId] })
    void qc.invalidateQueries({ queryKey: ['employee', employeeId, 'history'] })
  }

  const onPick = async (file: File) => {
    const problem = scanProblem(file)
    if (problem) {
      toast.error(problem === 'type' ? t('personnel.docs.wrongType') : t('personnel.docs.tooBig'))
      return
    }
    setUploading(true)
    try {
      const { data } = await uploadEmployeeDocument(employeeId, kind, file, docTitle.trim() || undefined)
      if (data?.kind && data.kind !== kind) toast.info(t('personnel.docs.savedAsOther'))
      else toast.ok(t('personnel.docs.uploaded'))
      setDocTitle('')
      refresh()
    } catch (e) {
      toast.error(errorMessage(e, t('personnel.docs.uploadFailed')))
    } finally {
      setUploading(false)
    }
  }

  const onDelete = async (d: EmployeeDocument) => {
    const ok = await confirm({ kind: 'delete', subject: d.title || d.original_name || '' })
    if (!ok) return
    try {
      await deleteEmployeeDocument(employeeId, d.id)
      toast.ok(t('personnel.docs.deleted'))
      refresh()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Card className="overflow-hidden p-0" role="group" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Paperclip size={14} className="text-brand" aria-hidden />
        <h3 className="text-[13.5px] font-semibold text-fg">{title}</h3>
        <span className="text-[11.5px] text-fg-subtle">{t('personnel.docs.formats')}</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {q.isLoading && allowed ? (
          <span className="flex items-center gap-2 text-[12.5px] text-fg-subtle">
            <Spinner size={14} /> {t('common.loading')}
          </span>
        ) : unavailable ? (
          <p className="text-[12.5px] text-fg-subtle">{t('personnel.docs.restricted')}</p>
        ) : docs.length === 0 ? (
          <p className="text-[12.5px] text-fg-subtle">{t('personnel.docs.none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {docs.map((d) => {
              const name = d.title || d.original_name || t('personnel.docs.document')
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-inner border border-line bg-surface-2/50 p-2">
                  {isImage(d) && d.url ? (
                    <img src={d.url} alt={name} loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-surface-2 text-fg-muted">
                      <FileText size={18} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{name}</span>
                    <span className="block truncate text-[11px] text-fg-subtle">
                      {[d.original_name !== name ? d.original_name : null, fmtSize(d.size_bytes), d.uploaded_at ? fmtDate(d.uploaded_at) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {d.url && (
                    <>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t('personnel.docs.view')}: ${name}`}
                        title={t('personnel.docs.view')}
                        className="grid h-8 w-8 place-items-center rounded-inner text-fg-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <Eye size={15} />
                      </a>
                      <a
                        href={d.url}
                        download={d.original_name || true}
                        aria-label={`${t('common.download')}: ${name}`}
                        title={t('common.download')}
                        className="grid h-8 w-8 place-items-center rounded-inner text-fg-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <Download size={15} />
                      </a>
                    </>
                  )}
                  {canEdit && (
                    <IconButton size="sm" label={`${t('common.delete')}: ${name}`} onClick={() => void onDelete(d)} className="text-danger">
                      <Trash2 size={15} />
                    </IconButton>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {canEdit && !unavailable && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('personnel.docs.titleOptional')} className="min-w-[180px] flex-1">
              <Input value={docTitle} maxLength={255} onChange={(e) => setDocTitle(e.target.value)} />
            </Field>
            <input
              ref={fileRef}
              type="file"
              accept={SCAN_ACCEPT}
              className="hidden"
              aria-label={t('personnel.docs.upload')}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void onPick(f)
              }}
            />
            <Button leftIcon={<Upload size={14} />} loading={uploading} onClick={() => fileRef.current?.click()}>
              {t('personnel.docs.upload')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
