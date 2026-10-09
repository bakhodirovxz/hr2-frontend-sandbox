import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Monitor, ShieldCheck } from 'lucide-react'
import { inTashkent } from '@/lib/format'
import { apiDelete, apiGet } from '@/api/http'
import { SESSIONS, SESSION_DETAIL } from '@/api/endpoints'
import { Card, CardHeader, EmptyState, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { IconButton } from '@/components/ui/IconButton'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { LoadError } from '@/components/data/LoadError'
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
  /** Set at LOGIN when no other session was active — the OLDEST one, not
   *  necessarily this one. Never use it to decide "current". */
  is_main?: boolean | null
  /** Computed per request from the bearer token — THIS session. */
  is_current?: boolean | null
}

/** A long-lived account accumulates hundreds of rows; the useful ones are the
 *  live sessions, newest first. */
const MAX_SHOWN = 12

/** `device_name` arrives as raw junk from the client: sometimes the user
 *  agent, sometimes the WebGL renderer ("Win32 (ANGLE (Intel…D3D11))"). Either
 *  way it is not a device name a person would recognise. */
const looksLikeMachineString = (v: string) =>
  /Mozilla\/|AppleWebKit|Gecko|Chrome\/|Safari\/|ANGLE|Direct3D|OpenGL|Win32|WebKit/i.test(v) ||
  v.length > 40

function deviceLabel(r: { device_name?: string | null; user_agent?: string | null }): string {
  const name = (r.device_name ?? '').trim()
  if (name && !looksLikeMachineString(name)) return name
  return readableDevice(r.user_agent || name) || '—'
}

/**
 * "Mozilla/5.0 (Windows NT 10.0…) Chrome/…" → "Chrome · Windows".
 *
 * `device_name` on this API is usually the RAW user-agent, so printing it
 * verbatim filled every row with 90 characters of boilerplate. Anything that
 * still looks like a UA string gets parsed instead of shown.
 */
function readableDevice(ua: string | null | undefined): string {
  if (!ua) return '—'
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox'
    : '—'
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : ''
  return [browser, os].filter((x) => x && x !== '—').join(' · ') || '—'
}

/**
 * FAOL SESSIYALAR — the "where am I signed in" panel (TZ 4.2.4).
 *
 * The reason this exists is not curiosity: it is the only way a person can end
 * a session on a device they no longer hold. Ending one is therefore a plain,
 * always-available button — not something hidden behind a settings page.
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
      toast.ok(t('profile.sessionClosed'))
      void qc.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (e) => toast.error(errorMessage(e, t('profile.sessionCloseFailed'))),
  })

  const all = (Array.isArray(q.data) ? q.data : []).filter(
    (r) => !r.revoked_at && r.is_active !== false,
  )
  const rows = [...all]
    .sort((a, b) => {
      if (!!b.is_current !== !!a.is_current) return b.is_current ? 1 : -1
      return String(b.last_active ?? b.created_at ?? '').localeCompare(
        String(a.last_active ?? a.created_at ?? ''),
      )
    })
    .slice(0, MAX_SHOWN)
  const hidden = all.length - rows.length

  return (
    <Card className="flex flex-col">
      <CardHeader title={t('profile.sectionSessions')} icon={<ShieldCheck size={16} />} />
      {q.isLoading ? (
        <CenteredSpinner />
      ) : q.isError ? (
        /* "No active sessions" is a security statement. On a failed request
         * this screen made it anyway — the one place a person checks to see
         * whether someone else is logged in as them. */
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Monitor size={20} />} title={t('profile.noSessions')} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-inner',
                  r.is_current ? 'bg-success/[0.14] text-success' : 'bg-fg/[0.06] text-fg-muted',
                )}
              >
                <Monitor size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-fg">
                    {deviceLabel(r)}
                  </span>
                  {r.is_current && (
                    <span className="rounded-pill bg-success/[0.12] px-2 py-0.5 text-[10px] font-semibold text-success">
                      {t('profile.currentSession')}
                    </span>
                  )}
                </span>
                <span className="tabnum block truncate text-[11px] text-fg-subtle">
                  {[r.ip_address, r.location].filter(Boolean).join(' · ') || '—'}
                  {r.last_active
                    ? ` · ${t('profile.lastSeen', { when: inTashkent(r.last_active).format('DD.MM.YYYY HH:mm') })}`
                    : r.created_at
                      ? ` · ${inTashkent(r.created_at).format('DD.MM.YYYY HH:mm')}`
                      : ''}
                </span>
              </span>
              {!r.is_current && (
                <IconButton
                  size="sm"
                  label={t('profile.closeSession')}
                  disabled={revoke.isPending}
                  onClick={async () => { if (await confirm({ kind: 'action', subject: deviceLabel(r), confirmLabel: t('profile.closeSession') })) revoke.mutate(r.id) }}
                >
                  <LogOut size={15} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-fg-subtle">
          {t('profile.moreSessions', { count: hidden })}
        </p>
      )}
    </Card>
  )
}
