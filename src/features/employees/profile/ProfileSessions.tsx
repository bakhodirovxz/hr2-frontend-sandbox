import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, LogOut, MapPin, Monitor } from 'lucide-react'
import { inTashkent } from '@/lib/format'
import { apiDelete, apiGet } from '@/api/http'
import { SESSIONS, SESSION_DETAIL } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { useConfirm } from '@/components/data/useConfirm'

/** Exactly the fields `GET /sessions` returns — see schemas/session.py. */
interface SessionRow {
  id: number
  ip_address?: string | null
  user_agent?: string | null
  device_name?: string | null
  device_type?: string | null
  location?: string | null
  created_at?: string | null
  last_active?: string | null
  expires_at?: string | null
  revoked_at?: string | null
  is_active?: boolean | null
  /** Computed per request from the bearer token — THIS session. */
  is_current?: boolean | null
}

/** `device_name` is often the raw user agent; anything that still looks like
 *  one is parsed into "Chrome · Windows" instead of being printed verbatim. */
const looksLikeMachineString = (v: string) =>
  /Mozilla\/|AppleWebKit|Gecko|Chrome\/|Safari\/|ANGLE|Direct3D|OpenGL|Win32|WebKit/i.test(v) || v.length > 40

function readableDevice(ua: string | null | undefined): string {
  if (!ua) return ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : ''
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return [browser, os].filter(Boolean).join(' · ') || ua.split(' ').slice(0, 2).join(' ')
}

function deviceLabel(r: SessionRow): string {
  const name = (r.device_name ?? '').trim()
  if (name && !looksLikeMachineString(name)) return name
  return readableDevice(r.user_agent || name)
}

/**
 * «Faol qurilmalar jadvali» — TZ U1 · 763, 4.2.4 «Xavfsizlik».
 * `GET /sessions` (faqat O'Z faol sessiyalari), `DELETE /sessions/{id}` —
 * qo'ldan chiqqan qurilmadagi kirishni yakunlashning yagona yo'li.
 */
export function ProfileSessions() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiGet<SessionRow[]>(SESSIONS),
    retry: false,
  })

  const revoke = useMutation({
    mutationFn: (id: number) => apiDelete(SESSION_DETAIL(id)),
    onSuccess: () => {
      toast.ok(t('account.sessionClosed'))
      void qc.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (e) => toast.error(errorMessage(e, t('account.sessionCloseFailed'))),
  })

  const rows = [...(Array.isArray(q.data) ? q.data : [])].sort((a, b) => {
    if (!!b.is_current !== !!a.is_current) return b.is_current ? 1 : -1
    return String(b.last_active ?? b.created_at ?? '').localeCompare(String(a.last_active ?? a.created_at ?? ''))
  })

  const columns: Column<SessionRow>[] = [
    { key: 'n', header: '№', className: 'w-12 text-fg-muted', cell: (_r, i) => `${i + 1}.` },
    {
      key: 'device',
      header: t('account.sessDevice'),
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Monitor size={15} className="shrink-0 text-fg-subtle" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{deviceLabel(r) || t('account.sessUnknownDevice')}</p>
            <p className="truncate text-xs text-fg-subtle" title={r.user_agent ?? undefined}>
              {[r.device_type, r.user_agent?.split(' ').slice(0, 3).join(' ')].filter(Boolean).join(' • ') || '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'ip',
      header: t('account.sessIp'),
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <Globe size={13} aria-hidden />
          {r.ip_address || '—'}
        </span>
      ),
    },
    {
      key: 'location',
      header: t('account.sessLocation'),
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <MapPin size={13} aria-hidden />
          {r.location || t('account.unknown')}
        </span>
      ),
    },
    {
      key: 'last',
      header: t('account.sessLastActive'),
      cell: (r) => (
        <span className="tabnum text-fg-muted">
          {r.last_active || r.created_at ? inTashkent(r.last_active || r.created_at).format('DD.MM.YYYY HH:mm:ss') : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('account.sessStatus'),
      cell: (r) =>
        r.is_current ? (
          <Badge tone="success">{t('account.sessCurrent')}</Badge>
        ) : r.is_active !== false && !r.revoked_at ? (
          <Badge tone="info">{t('account.sessActive')}</Badge>
        ) : (
          <Badge tone="danger">{t('account.sessInactive')}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-14 text-right',
      cell: (r) =>
        r.is_current ? null : (
          <IconButton
            size="sm"
            label={t('account.sessClose')}
            disabled={revoke.isPending}
            onClick={async () => {
              if (
                await confirm({
                  kind: 'action',
                  title: t('account.sessClose'),
                  subject: deviceLabel(r) || t('account.sessUnknownDevice'),
                  description: t('account.sessCloseConfirm'),
                  confirmLabel: t('account.sessCloseShort'),
                })
              )
                revoke.mutate(r.id)
            }}
          >
            <LogOut size={15} />
          </IconButton>
        ),
    },
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader title={t('account.sessTitle')} icon={<Monitor />} />
      <DataTable
        rows={rows}
        columns={columns}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        emptyTitle={t('account.sessEmpty')}
        minWidth={860}
      />
    </Card>
  )
}
