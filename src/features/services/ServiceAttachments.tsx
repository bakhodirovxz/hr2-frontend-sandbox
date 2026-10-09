import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle2, Download, FileText, Paperclip, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { Button, IconButton, useToast } from '@/components/ui'
import { useConfirm } from '@/components/data/useConfirm'
import { useFileDrop } from '@/hooks/useFileDrop'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/api/errorMessage'
import {
  fetchServiceAttachmentUrl,
  useServiceMutations,
  type ServiceRequestDetail,
} from './useServices'
import {
  ATTACH_ACCEPT,
  ATTACH_MAX,
  acceptAnyFile,
  attachmentError,
  fmtStamp,
  formatBytes,
  useAttachmentQueue,
  type QueueItem,
} from './serviceUi'

/**
 * Fayl tashlash maydoni — tanlash tugmasi, sudrab tashlash va Ctrl+V
 * (`useFileDrop`). Paste faqat `enabled` paytida tinglanadi.
 */
export function AttachmentDropZone({
  enabled,
  disabled,
  onFiles,
}: {
  enabled: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const { dragging, dropProps, take } = useFileDrop({ enabled: enabled && !disabled, onFiles, accept: acceptAnyFile })
  return (
    <div
      {...(disabled ? {} : dropProps)}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-inner border border-dashed px-3.5 py-3 transition-colors',
        dragging ? 'border-brand bg-brand-soft' : 'border-line bg-surface-2',
        disabled && 'opacity-60',
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inner bg-brand-soft text-brand-strong">
        <Upload size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-fg">{t('svc.dropTitle')}</p>
        <p className="text-[11.5px] text-fg-subtle">{t('svc.dropHint', { max: ATTACH_MAX })}</p>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={ATTACH_ACCEPT}
        className="hidden"
        aria-label={t('svc.pickFiles')}
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
      <Button size="sm" variant="secondary" leftIcon={<Paperclip size={14} />} disabled={disabled} onClick={() => input.current?.click()}>
        {t('svc.pickFiles')}
      </Button>
    </div>
  )
}

/** Navbatdagi fayllar: foiz, holat va xato har biri uchun alohida. */
export function AttachmentQueueList({
  items,
  onRemove,
  onRetry,
  locked,
}: {
  items: QueueItem[]
  onRemove: (key: string) => void
  onRetry?: (key: string) => void
  /** Yuklash davom etayotganda ro'yxatni o'zgartirib bo'lmaydi. */
  locked?: boolean
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  return (
    <ul className="divide-y divide-line rounded-inner border border-line" aria-live="polite">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-3 px-3 py-2">
          {it.state === 'done' ? (
            <CheckCircle2 size={15} className="shrink-0 text-success" />
          ) : it.state === 'error' ? (
            <AlertCircle size={15} className="shrink-0 text-danger" />
          ) : (
            <FileText size={15} className="shrink-0 text-brand-strong" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-fg">{it.file.name}</p>
            {it.state === 'uploading' ? (
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-pill bg-fg/[0.08]"
                  role="progressbar"
                  aria-valuenow={it.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={it.file.name}
                >
                  <div className="h-full rounded-pill bg-brand transition-[width]" style={{ width: `${it.progress}%` }} />
                </div>
                <span className="w-9 text-right text-[11px] tabnum text-fg-muted">{it.progress}%</span>
              </div>
            ) : (
              <p className={cn('text-[11px]', it.state === 'error' ? 'text-danger' : 'text-fg-subtle')}>
                {it.state === 'error'
                  ? it.error
                  : `${formatBytes(it.file.size)} · ${it.state === 'done' ? t('svc.fileDone') : t('svc.filePending')}`}
              </p>
            )}
          </div>
          {it.state === 'error' && it.retryable && onRetry && (
            <IconButton size="sm" label={t('svc.retry')} disabled={locked} onClick={() => onRetry(it.key)}>
              <RotateCcw size={14} />
            </IconButton>
          )}
          {it.state !== 'uploading' && it.state !== 'done' && (
            <IconButton size="sm" label={t('svc.removeFromList')} disabled={locked} onClick={() => onRemove(it.key)}>
              <X size={14} />
            </IconButton>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * So'rov tafsilotidagi «Biriktirilgan hujjatlar» (TZ I1 1597).
 * Ochish/yuklab olish — egasi va ko'rib chiquvchi; qo'shish/olib tashlash —
 * faqat egasi va faqat «Qabul qilindi» holatida (`canEdit`).
 */
export function ServiceAttachmentsSection({
  request,
  canEdit,
}: {
  request: ServiceRequestDetail
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { settle, removeAttachment } = useServiceMutations()
  const queue = useAttachmentQueue()
  const [busy, setBusy] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const files = request.attachments ?? []

  // Boshqa so'rov ochilsa — navbat tozalanadi.
  const { clear } = queue
  useEffect(() => clear(), [request.id, clear])

  // Bir vaqtda bitta yuklash sikli (yangi fayllarni u o'zi oladi).
  const running = useRef(false)
  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    setUploading(true)
    try {
      const failed = await queue.uploadPending(request.id, settle)
      // Yuklanganlar endi server ro'yxatida — navbatda faqat xatolar ko'rinadi.
      if (!failed) toast.ok(t('svc.filesUploaded'))
    } finally {
      running.current = false
      setUploading(false)
    }
  }, [queue, request.id, settle, toast, t])

  const onFiles = useCallback(
    (list: File[]) => {
      const added = queue.add(list, ATTACH_MAX - files.length)
      // Yuklash ketayotgan bo'lsa, yangi fayllarni o'sha sikl oladi.
      if (added.some((x) => x.state === 'pending')) void run()
    },
    [queue, files.length, run],
  )

  const open = async (attId: string) => {
    setBusy(attId)
    try {
      const url = await fetchServiceAttachmentUrl(request.id, attId)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast.error(errorMessage(e, t('svc.openFailed')))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (attId: string, name: string) => {
    if (!(await confirm({ kind: 'delete', subject: name }))) return
    setBusy(attId)
    try {
      await removeAttachment.mutateAsync({ id: request.id, attachmentId: attId })
      toast.ok(t('svc.fileRemoved'))
    } catch (e) {
      toast.error(attachmentError(e, 'svc.removeFailed'))
    } finally {
      setBusy(null)
    }
  }

  const visibleQueue = queue.items.filter((x) => x.state !== 'done')

  return (
    <section aria-label={t('svc.attachments')}>
      <p className="engrave mb-2 flex items-center gap-1.5 text-fg">
        <Paperclip size={13} /> {t('svc.attachments')}
        <span className="text-fg-subtle tabnum">
          {files.length}/{ATTACH_MAX}
        </span>
      </p>
      {files.length === 0 && !canEdit ? (
        <p className="text-[12.5px] text-fg-subtle">{t('svc.noAttachments')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {files.length > 0 && (
            <ul className="divide-y divide-line rounded-inner border border-line">
              {files.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <FileText size={15} className="shrink-0 text-brand-strong" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-fg" title={a.name}>
                      {a.name}
                    </p>
                    <p className="text-[11px] text-fg-subtle">
                      {[formatBytes(a.size), a.uploaded_at ? fmtStamp(a.uploaded_at) : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <IconButton size="sm" label={t('svc.openFile')} disabled={busy === a.id} onClick={() => open(a.id)}>
                    <Download size={14} />
                  </IconButton>
                  {canEdit && (
                    <IconButton
                      size="sm"
                      label={t('svc.removeFile')}
                      disabled={busy === a.id || uploading}
                      onClick={() => remove(a.id, a.name)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <>
              <AttachmentQueueList
                items={visibleQueue}
                locked={uploading}
                onRemove={queue.remove}
                onRetry={(key) => {
                  queue.requeue(key)
                  void run()
                }}
              />
              {files.length < ATTACH_MAX && <AttachmentDropZone enabled={canEdit} onFiles={onFiles} />}
            </>
          )}
        </div>
      )}
    </section>
  )
}
