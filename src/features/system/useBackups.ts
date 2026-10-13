import { useEffect, useMemo, useRef } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'

/*
 * TZ E1 «Резервное копирование БД» — data layer of /system/backups.
 *
 * Every call opts out of the header branch: backups are site-wide and the
 * endpoints are master-admin only (`_require_master_admin`).
 */
export const NO_BRANCH = { _no_branch_inject: true } as const

export const BACKUPS = 'system/backups'
export const BACKUP = (id: number | string) => `system/backups/${id}`
export const BACKUP_DOWNLOAD = (id: number | string) => `system/backups/${id}/download`
export const BACKUPS_SCHEDULE = 'system/backups/schedule'
export const BACKUPS_STORAGE_CHECK = 'system/backups/storage-check'

export type BackupType = 'full' | 'incremental'
export type BackupStorage = 'local' | 'remote'
export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

/** `BackupService.to_read` */
export interface Backup {
  id: number
  type?: BackupType | null
  storage?: BackupStorage | null
  description?: string | null
  status: 'running' | 'done' | 'failed'
  progress?: number | null
  size_bytes?: number | null
  sha256?: string | null
  encrypted?: boolean
  compression_level?: number | null
  started_at?: string | null
  finished_at?: string | null
  actor_name?: string | null
  verify?: { ok?: boolean; detail?: string } | null
  error?: string | null
  file_name?: string | null
  scheduled?: boolean
}

export interface BackupSchedule {
  enabled: boolean
  hour: number
  type: BackupType
  storage: BackupStorage
  keep_last: number
  compression_level: number
  encrypt: boolean
  frequency: BackupFrequency
  /** 0 = Monday … 6 = Sunday */
  weekday: number
  /** 1–28 */
  day_of_month: number
}

export const SCHEDULE_DEFAULTS: BackupSchedule = {
  enabled: false,
  hour: 2,
  type: 'full',
  storage: 'local',
  keep_last: 7,
  compression_level: 6,
  encrypt: false,
  frequency: 'daily',
  weekday: 0,
  day_of_month: 1,
}

export interface StorageCheck {
  ok: boolean
  free_bytes?: number | null
  detail?: string | null
}

/** Polling period for a running backup (v1: every 2 s). */
const POLL_MS = 2000

/**
 * The backup list with every RUNNING row refreshed from `GET /system/backups/{id}`
 * every two seconds. `onFinished` fires once per backup when its status leaves
 * `running` (the page toasts it and reloads the list).
 */
export function useBackups(onFinished: (b: Backup) => void) {
  const list = useQuery({
    queryKey: ['backups', 'list'],
    queryFn: () => apiGet<Backup[] | { items?: Backup[] }>(BACKUPS, NO_BRANCH),
    select: (d) => (Array.isArray(d) ? d : (d?.items ?? [])),
  })

  const runningIds = useMemo(
    () => (list.data ?? []).filter((b) => b.status === 'running').map((b) => b.id),
    [list.data],
  )

  const polls = useQueries({
    queries: runningIds.map((id) => ({
      queryKey: ['backups', 'one', id],
      queryFn: () => apiGet<Backup>(BACKUP(id), NO_BRANCH),
      refetchInterval: POLL_MS,
      meta: { silent: true },
    })),
  })

  const polled = new Map<number, Backup>()
  polls.forEach((p) => {
    if (p.data) polled.set(p.data.id, p.data)
  })

  // Report each finished backup once, then let the list catch up.
  const notified = useRef(new Set<number>())
  const finishedKey = [...polled.values()]
    .filter((b) => b.status !== 'running')
    .map((b) => `${b.id}:${b.status}`)
    .join(',')
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished
  useEffect(() => {
    if (!finishedKey) return
    let any = false
    for (const b of polled.values()) {
      if (b.status === 'running' || notified.current.has(b.id)) continue
      notified.current.add(b.id)
      onFinishedRef.current(b)
      any = true
    }
    if (any) void list.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedKey])

  const rows = (list.data ?? []).map((b) => polled.get(b.id) ?? b)
  return {
    rows,
    running: rows.some((b) => b.status === 'running'),
    loading: list.isLoading,
    fetching: list.isFetching,
    error: list.error,
    refetch: list.refetch,
  }
}

export function useBackupSchedule() {
  return useQuery({
    queryKey: ['backups', 'schedule'],
    queryFn: () => apiGet<Partial<BackupSchedule> | null>(BACKUPS_SCHEDULE, NO_BRANCH),
    select: (d): BackupSchedule => ({
      enabled: !!d?.enabled,
      hour: d?.hour ?? SCHEDULE_DEFAULTS.hour,
      type: d?.type || SCHEDULE_DEFAULTS.type,
      storage: d?.storage || SCHEDULE_DEFAULTS.storage,
      keep_last: d?.keep_last ?? SCHEDULE_DEFAULTS.keep_last,
      compression_level: d?.compression_level ?? SCHEDULE_DEFAULTS.compression_level,
      encrypt: !!d?.encrypt,
      frequency: d?.frequency || SCHEDULE_DEFAULTS.frequency,
      weekday: d?.weekday ?? SCHEDULE_DEFAULTS.weekday,
      day_of_month: d?.day_of_month ?? SCHEDULE_DEFAULTS.day_of_month,
    }),
    meta: { silent: true },
  })
}

/** «12.4 MB» — binary units, one decimal under ten. */
export function formatBytes(n?: number | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = Number(n)
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

// ── TZ E1 1669 / E3 1729: zaxiradan to'liq / qisman tiklash ────────────────

export const BACKUP_RESTORE = (id: number | string) => `system/backups/${id}/restore`
export const RESTORE_COMPONENTS = 'system/backups/restore/components'

/** Qisman tiklash komponenti: modul jadvallari + FK yopilmasi (birga tiklanadi). */
export interface RestoreComponent {
  code: string
  label: string
  tables: string[]
  closure: string[]
}

/** Eng so'nggi tekshirilgan to'liq nusxa (butunlik buzilganda taklif qilinadi). */
export interface VerifiedFull {
  backup_id: number
  finished_at?: string | null
  file_name?: string | null
  storage?: string | null
  size_bytes?: number | null
  confirm_phrase: string
}

export interface RestoreComponents {
  components: RestoreComponent[]
  protected_tables: string[]
  latest_verified_full?: VerifiedFull | null
}

/** `POST …/restore` javobidagi reja (tekshiruvlardan o'tgan). */
export interface RestorePlan {
  backup_id: number
  mode: 'full' | 'partial'
  components: string[]
  chain: number[]
  tables: string[]
  manifests?: { backup_id: number; type?: string; tables?: number }[]
}

/** Tugagan `backup_restore` vazifasining natijasi. */
export interface RestoreReport {
  backup_id?: number
  mode?: string
  chain?: number[]
  safety_backup_id?: number
  sessions?: unknown
  tables?: string[]
  row_counts?: Record<string, number>
  detached_references?: { constraint: string; table: string; columns: string[]; parent: string; rows: number; action: string }[]
  integrity?: { ok?: boolean; problems?: unknown[] }
  elapsed_seconds?: number
  system_mode?: string
  incident_id?: number
  rolled_back?: boolean
}

/** Tasdiqlash iborasi — server `confirm_phrase` bilan bir xil. */
export const restorePhrase = (id: number) => `TIKLASH ${id}`

export function useRestoreComponents(enabled: boolean) {
  return useQuery({
    queryKey: ['backups', 'restore-components'],
    queryFn: () => apiGet<RestoreComponents>(RESTORE_COMPONENTS, NO_BRANCH),
    enabled,
    staleTime: 60_000,
  })
}
