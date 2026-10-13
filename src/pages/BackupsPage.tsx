import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  DatabaseBackup,
  Download,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { RequireRole } from '@/components/layout/RequireRole'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { downloadFile } from '@/lib/download'
import { formatDateTime, inTashkent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { LABEL_CLS } from '@/components/ui/control'
import { RestoreWizard, type RestoreTarget } from '@/features/system/RestoreWizard'
import {
  BACKUP,
  BACKUP_DOWNLOAD,
  BACKUPS,
  BACKUPS_SCHEDULE,
  BACKUPS_STORAGE_CHECK,
  NO_BRANCH,
  SCHEDULE_DEFAULTS,
  formatBytes,
  useBackupSchedule,
  useBackups,
  type Backup,
  type BackupSchedule,
  type BackupStorage,
  type BackupType,
  type StorageCheck,
} from '@/features/system/useBackups'

/*
 * ZAXIRA NUSXALASH — TZ E1 «Резервное копирование БД» (faqat sayt master-admini).
 *
 *   • ro'yxat: sana, tur, saqlash joyi, hajm, SHA-256 (nusxa olish bilan),
 *     holat, tavsif, kim yaratgan; yuklab olish va o'chirish;
 *   • yangi nusxa: tur (to'liq / inkremental), joy (lokal / masofaviy — avval
 *     `storage-check` bilan tekshiriladi), tavsif, siqish 0–9, shifrlash;
 *     jarayon `GET /system/backups/{id}` bilan har 2 soniyada kuzatiladi;
 *   • jadval: avtomatik nusxa (davriylik, soat, tur, joy, siqish, shifrlash,
 *     nechta saqlanadi).
 *
 * Nusxa olinayotganda server yozuvlarni bloklaydi (503
 * `system_backup_in_progress`) — sahifa buni ogohlantirish bilan ko'rsatadi.
 */

const NB = NO_BRANCH

function BackupsPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<Backup | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  // TZ E1 1669 / E3 1729: tanlangan nusxadan tiklash ustasi.
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null)
  // A write refused with 503 `system_backup_in_progress` while the list has
  // not caught up yet (a scheduled backup started in the background).
  const [blocked, setBlocked] = useState(false)

  const { rows, running, loading, fetching, error, refetch } = useBackups((b) => {
    if (b.status === 'done') toast.ok(t('backups.done'))
    else toast.error(b.error ? t('backups.failedWith', { error: b.error }) : t('backups.failed'))
  })

  useEffect(() => {
    if (!running) setBlocked(false)
  }, [running])

  const onBlocked = (e: unknown) => {
    if (errorCode(e) === 'system_backup_in_progress') {
      setBlocked(true)
      void refetch()
    }
  }

  const remove = useMutation({
    mutationFn: (b: Backup) => apiDelete(BACKUP(b.id), { params: NB }),
    onSuccess: () => {
      toast.ok(t('common.deleted'))
      setDeleting(null)
      void qc.invalidateQueries({ queryKey: ['backups', 'list'] })
    },
    onError: onBlocked,
  })

  const download = async (b: Backup) => {
    setDownloadingId(b.id)
    try {
      await downloadFile({
        url: BACKUP_DOWNLOAD(b.id),
        params: NB,
        filename: b.file_name || `backup-${b.id}-${inTashkent(b.started_at).format('YYYYMMDD-HHmm')}.dump`,
      })
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      toast.error(status === 404 || status === 410 ? t('backups.fileMissing') : t('backups.downloadFailed'))
    } finally {
      setDownloadingId(null)
    }
  }

  const columns: Column<Backup>[] = [
    {
      key: 'date',
      header: t('backups.colDate'),
      skeleton: 'w-28',
      className: 'whitespace-nowrap tabular-nums text-fg',
      cell: (b) => (
        <>
          {b.started_at ? formatDateTime(b.started_at) : '—'}
          {b.finished_at && (
            <span className="block text-[11.5px] text-fg-subtle">→ {inTashkent(b.finished_at).format('HH:mm:ss')}</span>
          )}
        </>
      ),
    },
    {
      key: 'type',
      header: t('backups.colType'),
      skeleton: 'w-24',
      className: 'text-fg-muted',
      cell: (b) => (b.type === 'incremental' ? t('backups.typeIncremental') : t('backups.typeFull')),
    },
    {
      key: 'storage',
      header: t('backups.colStorage'),
      skeleton: 'w-20',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (b) => (
        <span className="inline-flex items-center gap-1.5">
          {b.storage === 'remote' ? <CloudUpload size={14} aria-hidden /> : <HardDrive size={14} aria-hidden />}
          {b.storage === 'remote' ? t('backups.storageRemote') : t('backups.storageLocal')}
          {b.encrypted && (
            <span title={t('backups.encrypted')} className="inline-flex text-brand">
              <Lock size={13} aria-hidden />
              <span className="sr-only">{t('backups.encrypted')}</span>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'size',
      header: t('backups.colSize'),
      headerClassName: 'text-right',
      skeleton: 'w-14',
      className: 'whitespace-nowrap text-right tabular-nums text-fg-muted',
      cell: (b) => formatBytes(b.size_bytes),
    },
    {
      key: 'sha',
      header: 'SHA-256',
      skeleton: 'w-28',
      cell: (b) => <ChecksumCell sha={b.sha256} />,
    },
    {
      key: 'status',
      header: t('backups.colStatus'),
      skeleton: 'w-24',
      cell: (b) => <StatusCell b={b} />,
    },
    {
      key: 'description',
      header: t('backups.colDescription'),
      skeleton: 'w-32',
      className: 'max-w-[240px] text-fg-muted',
      cell: (b) => (
        <>
          <span className="break-words">{b.description || '—'}</span>
          {b.status === 'failed' && b.error && (
            <span className="mt-0.5 block break-words text-[12px] text-danger">{b.error}</span>
          )}
        </>
      ),
    },
    {
      key: 'actor',
      header: t('backups.colActor'),
      skeleton: 'w-24',
      className: 'text-fg-muted',
      cell: (b) => b.actor_name || t('backups.auto'),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-32',
      className: 'pr-4 text-right',
      skeleton: 'w-12',
      cell: (b) => {
        const when = b.started_at ? formatDateTime(b.started_at) : `#${b.id}`
        return (
          <span className="inline-flex justify-end gap-1">
            <IconButton
              size="sm"
              label={`${t('sysOps.restore')}: ${when}`}
              disabled={b.status !== 'done' || running}
              onClick={() =>
                setRestoring({ id: b.id, type: b.type, when: b.finished_at || b.started_at, file_name: b.file_name })
              }
            >
              <RotateCcw size={15} />
            </IconButton>
            <IconButton
              size="sm"
              label={`${t('common.download')}: ${when}`}
              disabled={b.status !== 'done' || downloadingId === b.id}
              onClick={() => void download(b)}
            >
              {downloadingId === b.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            </IconButton>
            <IconButton
              size="sm"
              label={`${t('common.delete')}: ${when}`}
              disabled={b.status === 'running' || (remove.isPending && remove.variables?.id === b.id)}
              onClick={() => setDeleting(b)}
            >
              <Trash2 size={15} />
            </IconButton>
          </span>
        )
      },
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('backups.title')}
        subtitle={t('backups.subtitle')}
        actions={
          <>
            <IconButton label={t('common.refresh')} onClick={() => void refetch()}>
              <RefreshCw size={16} className={cn(fetching && 'animate-spin')} />
            </IconButton>
            <Button leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)} disabled={running}>
              {t('backups.create')}
            </Button>
          </>
        }
      />

      {(running || blocked) && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning"
        >
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t('backups.runningBanner')}</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Card className="flex min-w-0 flex-col overflow-hidden">
          <DataTable
            tableId="system-backups"
            rows={rows}
            columns={columns}
            loading={loading}
            error={error}
            onRetry={() => void refetch()}
            emptyTitle={t('backups.empty')}
            skeletonRows={4}
            minWidth={1100}
          />
        </Card>
        <ScheduleCard onBlocked={onBlocked} />
      </div>

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onBlocked={onBlocked}
        onStarted={() => {
          setCreateOpen(false)
          void qc.invalidateQueries({ queryKey: ['backups', 'list'] })
        }}
      />

      <RestoreWizard target={restoring} onClose={() => setRestoring(null)} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        danger
        loading={remove.isPending}
        title={t('backups.deleteTitle')}
        description={t('backups.deleteConfirm', {
          date: deleting?.started_at ? formatDateTime(deleting.started_at) : `#${deleting?.id ?? ''}`,
        })}
        confirmLabel={t('common.delete')}
      />
    </PageContainer>
  )
}

function StatusCell({ b }: { b: Backup }) {
  const { t } = useTranslation()
  const progress = Math.max(0, Math.min(100, b.progress ?? 0))
  if (b.status === 'running') {
    return (
      <div className="min-w-[140px]">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-strong">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          {t('backups.statusRunning', { progress })}
        </span>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={t('backups.progressLabel')}
        >
          <div className="h-full bg-brand transition-all duration-500" style={{ width: `${Math.max(2, progress)}%` }} />
        </div>
      </div>
    )
  }
  if (b.status === 'failed') {
    return (
      <Badge tone="danger" title={b.error ?? undefined}>
        <XCircle size={12} aria-hidden className="mr-1 inline" />
        {t('backups.statusFailed')}
      </Badge>
    )
  }
  const verified = b.verify?.ok
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge tone="success">
        <CheckCircle2 size={12} aria-hidden className="mr-1 inline" />
        {t('backups.statusDone')}
      </Badge>
      {verified !== undefined && (
        <span
          className={cn('inline-flex items-center gap-1 text-[11.5px]', verified ? 'text-success' : 'text-warning')}
          title={b.verify?.detail ?? undefined}
        >
          <ShieldCheck size={12} aria-hidden />
          {verified ? t('backups.verified') : t('backups.notVerified')}
        </span>
      )}
    </span>
  )
}

function ChecksumCell({ sha }: { sha?: string | null }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  if (!sha) return <span className="text-fg-subtle">—</span>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sha)
      setCopied(true)
      toast.ok(t('backups.copied'))
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('backups.copyFailed'))
    }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono text-[12px] text-fg-muted" title={sha}>
        {sha.slice(0, 12)}…
      </code>
      <IconButton size="sm" label={t('backups.copySha')} onClick={() => void copy()}>
        {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </IconButton>
    </span>
  )
}

/** Two-up radio cards (backup type, storage) — the choice is the whole field. */
function ChoiceCards<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
}: {
  name: string
  legend: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
}) {
  return (
    <fieldset>
      <legend className={LABEL_CLS}>{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex h-control cursor-pointer items-center gap-2 rounded-control border px-3 text-sm transition-colors',
              value === o.value
                ? 'border-brand bg-brand-soft text-fg'
                : 'border-line text-fg-muted hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-brand"
            />
            {o.icon}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function CompressionField({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <label className={cn('flex flex-col gap-1.5', disabled && 'opacity-60')}>
      <span className="flex justify-between text-sm font-medium text-fg">
        {t('backups.compression')} <b className="tabular-nums">{value}</b>
      </span>
      <input
        type="range"
        min={0}
        max={9}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-brand"
        aria-valuetext={String(value)}
      />
      <span className="flex justify-between text-[11.5px] text-fg-subtle">
        <span>{t('backups.compressionMin')}</span>
        <span>{t('backups.compressionMax')}</span>
      </span>
    </label>
  )
}

function CreateModal({
  open,
  onClose,
  onStarted,
  onBlocked,
}: {
  open: boolean
  onClose: () => void
  onStarted: () => void
  onBlocked: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [type, setType] = useState<BackupType>('full')
  const [storage, setStorage] = useState<BackupStorage>('local')
  const [description, setDescription] = useState('')
  const [compression, setCompression] = useState(6)
  const [encrypt, setEncrypt] = useState(false)
  const [check, setCheck] = useState<(StorageCheck & { loading?: boolean }) | null>(null)

  const runCheck = async (where: BackupStorage) => {
    setCheck({ ok: false, loading: true })
    try {
      const data = await apiGet<StorageCheck>(BACKUPS_STORAGE_CHECK, { storage: where, ...NB })
      setCheck({ ok: !!data?.ok, free_bytes: data?.free_bytes ?? null, detail: data?.detail ?? '' })
    } catch (e) {
      setCheck({ ok: false, free_bytes: null, detail: errorMessage(e, t('list.loadFailed')) })
    }
  }

  useEffect(() => {
    if (!open) return
    setType('full')
    setStorage('local')
    setDescription('')
    setCompression(6)
    setEncrypt(false)
    void runCheck('local')
  }, [open])

  const start = useMutation({
    mutationFn: () =>
      apiPost<{ id: number; status: string }>(BACKUPS, {
        type,
        storage,
        description: description.trim() || null,
        compression_level: compression,
        encrypt,
      }, { params: NB }),
    onSuccess: () => {
      toast.ok(t('backups.started'))
      onStarted()
    },
    onError: onBlocked,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('backups.create')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={start.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            leftIcon={<DatabaseBackup size={15} />}
            loading={start.isPending}
            disabled={!check?.ok || check.loading}
            onClick={() => start.mutate()}
          >
            {t('backups.start')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ChoiceCards
          name="backup-type"
          legend={t('backups.fieldType')}
          value={type}
          onChange={setType}
          options={[
            { value: 'full', label: t('backups.typeFull') },
            { value: 'incremental', label: t('backups.typeIncremental') },
          ]}
        />

        <div>
          <ChoiceCards
            name="backup-storage"
            legend={t('backups.fieldStorage')}
            value={storage}
            onChange={(v) => {
              setStorage(v)
              void runCheck(v)
            }}
            options={[
              { value: 'local', label: t('backups.storageLocalLong'), icon: <HardDrive size={15} aria-hidden /> },
              { value: 'remote', label: t('backups.storageRemoteLong'), icon: <CloudUpload size={15} aria-hidden /> },
            ]}
          />
          <div className="mt-2 text-[12.5px]" aria-live="polite">
            {check?.loading ? (
              <span className="inline-flex items-center gap-1.5 text-fg-muted">
                <Loader2 size={13} className="animate-spin" aria-hidden /> {t('backups.checking')}
              </span>
            ) : check?.ok ? (
              <span className="inline-flex flex-wrap items-center gap-1.5 text-success">
                <CheckCircle2 size={13} aria-hidden /> {t('backups.storageOk')}
                {check.free_bytes != null && (
                  <span className="text-fg-muted">· {t('backups.freeSpace', { size: formatBytes(check.free_bytes) })}</span>
                )}
              </span>
            ) : check ? (
              <span className="flex items-start gap-1.5 text-danger">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  {t('backups.storageBad')}
                  {check.detail ? `: ${check.detail}` : ''}. {t('backups.storageBadHint')}{' '}
                  <button type="button" onClick={() => void runCheck(storage)} className="font-medium text-brand underline">
                    {t('backups.recheck')}
                  </button>
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <Field label={t('backups.fieldDescription')}>
          <Input
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('backups.descriptionPlaceholder')}
            aria-label={t('backups.fieldDescription')}
          />
        </Field>

        <CompressionField value={compression} onChange={setCompression} />

        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox inLabel checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <span className="inline-flex items-center gap-1.5 text-sm text-fg">
            <Lock size={14} className="text-fg-muted" aria-hidden />
            {t('backups.encrypt')}
          </span>
        </label>

        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {t('backups.blockWarn')}
        </p>
      </div>
    </Modal>
  )
}

function ScheduleCard({ onBlocked }: { onBlocked: (e: unknown) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const schedule = useBackupSchedule()
  const [form, setForm] = useState<BackupSchedule | null>(null)

  useEffect(() => {
    if (schedule.data) setForm(schedule.data)
    else if (schedule.isError) setForm({ ...SCHEDULE_DEFAULTS })
  }, [schedule.data, schedule.isError])

  const save = useMutation({
    mutationFn: (body: BackupSchedule) =>
      apiPut<BackupSchedule>(BACKUPS_SCHEDULE, {
        ...body,
        keep_last: Math.min(365, Math.max(1, Number(body.keep_last) || 1)),
      }, { params: NB }),
    onSuccess: () => {
      toast.ok(t('backups.scheduleSaved'))
      void qc.invalidateQueries({ queryKey: ['backups', 'schedule'] })
    },
    onError: onBlocked,
  })

  const set = <K extends keyof BackupSchedule>(k: K, v: BackupSchedule[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))
  const off = !form?.enabled

  const hourOptions = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))
  const weekdayOptions = Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: t(`backups.wd_${i}` as 'backups.wd_0') }))
  const monthDayOptions = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
  const typeOptions = [
    { value: 'full', label: t('backups.typeFull') },
    { value: 'incremental', label: t('backups.typeIncremental') },
  ]
  const storageOptions = [
    { value: 'local', label: t('backups.storageLocalLong') },
    { value: 'remote', label: t('backups.storageRemoteLong') },
  ]

  return (
    <Card className="p-card">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg">
        <CalendarClock size={17} className="text-brand" aria-hidden />
        {t('backups.scheduleTitle')}
      </h2>
      {!form ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(form)
          }}
        >
          {schedule.isError && <p className="text-[12.5px] text-warning">{t('backups.scheduleFailed')}</p>}
          <Checkbox
            label={t('backups.scheduleEnabled')}
            checked={form.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Field label={t('backups.frequency')}>
              <Select
                value={form.frequency}
                disabled={off}
                onChange={(e) => set('frequency', e.target.value as BackupSchedule['frequency'])}
                options={[
                  { value: 'daily', label: t('backups.daily') },
                  { value: 'weekly', label: t('backups.weekly') },
                  { value: 'monthly', label: t('backups.monthly') },
                ]}
              />
            </Field>
            {form.frequency === 'weekly' ? (
              <Field label={t('backups.weekday')}>
                <Select
                  value={String(form.weekday)}
                  disabled={off}
                  onChange={(e) => set('weekday', Number(e.target.value))}
                  options={weekdayOptions}
                />
              </Field>
            ) : form.frequency === 'monthly' ? (
              <Field label={t('backups.monthDay')}>
                <Select
                  value={String(form.day_of_month)}
                  disabled={off}
                  onChange={(e) => set('day_of_month', Number(e.target.value))}
                  options={monthDayOptions}
                />
              </Field>
            ) : null}
            <Field label={t('backups.hour')}>
              <Select
                value={String(form.hour)}
                disabled={off}
                onChange={(e) => set('hour', Number(e.target.value))}
                options={hourOptions}
              />
            </Field>
            <Field label={t('backups.keepLast')}>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.keep_last}
                disabled={off}
                onChange={(e) => set('keep_last', Number(e.target.value))}
                aria-label={t('backups.keepLast')}
              />
            </Field>
            <Field label={t('backups.fieldType')}>
              <Select
                value={form.type}
                disabled={off}
                onChange={(e) => set('type', e.target.value as BackupType)}
                options={typeOptions}
              />
            </Field>
            <Field label={t('backups.fieldStorage')}>
              <Select
                value={form.storage}
                disabled={off}
                onChange={(e) => set('storage', e.target.value as BackupStorage)}
                options={storageOptions}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 items-center gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,28rem)_auto_1fr]">
            <CompressionField value={form.compression_level} disabled={off} onChange={(v) => set('compression_level', v)} />
            <label className={cn('flex cursor-pointer items-center gap-2.5', off && 'opacity-60')}>
              <Checkbox inLabel checked={form.encrypt} disabled={off} onChange={(e) => set('encrypt', e.target.checked)} />
              <span className="inline-flex items-center gap-1.5 text-sm text-fg">
                <Lock size={14} className="text-fg-muted" aria-hidden />
                {t('backups.encrypt')}
              </span>
            </label>
            <div className="flex justify-end">
              <Button type="submit" loading={save.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Card>
  )
}

/** Master-admin only — the sidebar hides it; this stops a typed URL. */
export function BackupsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={isSiteMasterAdmin(user)} title={t('backups.title')}>
      <BackupsPageInner />
    </RequireRole>
  )
}
