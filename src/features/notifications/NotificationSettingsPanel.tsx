import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Lock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { LoadError } from '@/components/data/LoadError'
import { apiGet, apiPut } from '@/api/http'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'

/**
 * TZ L3 985 «Настройка уведомлений — запускается при переходе в настройки.
 * Пользователь может выбрать типы уведомлений для получения».
 *
 * `GET /notifications/settings` — every type the system creates, with its
 * group and `optional`; `PUT {types: {code: bool}}` changes only the codes
 * sent. Security / system types and the result of one's own background job
 * are mandatory (`optional: false`) — shown switched on and locked (the
 * server refuses them with 422 `notification_type_mandatory` anyway).
 * A switched-off type is not CREATED for this account at all.
 */

interface NotificationTypeSetting {
  code: string
  label?: string
  group: string
  group_label?: string
  optional: boolean
  enabled: boolean
}

interface NotificationSettings {
  types: NotificationTypeSetting[]
  disabled?: string[]
}

const KEY = ['notifications', 'settings']

/** Translated type / group name; the server's Uzbek text for anything new. */
const tr = (key: string, fallback?: string) =>
  i18n.exists(key) ? String((i18n.t as unknown as (k: string) => string)(key)) : (fallback ?? key.split('.').pop() ?? '')

export function NotificationSettingsPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<NotificationSettings>('notifications/settings'),
  })
  const save = useMutation({
    meta: { silent: true },
    mutationFn: (types: Record<string, boolean>) => apiPut<NotificationSettings>('notifications/settings', { types }),
    // Optimistic: the switch moves at once, a refusal puts it back.
    onMutate: async (types) => {
      await qc.cancelQueries({ queryKey: KEY })
      const prev = qc.getQueryData<NotificationSettings>(KEY)
      if (prev) {
        qc.setQueryData<NotificationSettings>(KEY, {
          ...prev,
          types: prev.types.map((x) => (x.code in types ? { ...x, enabled: types[x.code] } : x)),
        })
      }
      return { prev }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev)
      toast.error(errorMessage(err, t('common.actionFailed')))
    },
    onSuccess: (data) => {
      qc.setQueryData(KEY, data)
      toast.ok(t('common.saved'))
    },
  })

  const groups = useMemo(() => {
    const out: { group: string; label: string; items: NotificationTypeSetting[] }[] = []
    for (const x of q.data?.types ?? []) {
      let g = out.find((o) => o.group === x.group)
      if (!g) {
        g = { group: x.group, label: tr(`notifSettings.group_${x.group}`, x.group_label), items: [] }
        out.push(g)
      }
      g.items.push(x)
    }
    // Mandatory (system) group last — it is not a choice.
    return out.sort((a, b) => Number(a.items.every((i) => !i.optional)) - Number(b.items.every((i) => !i.optional)))
  }, [q.data])

  if (q.isError) {
    return (
      <Card className="p-6">
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    )
  }
  if (!q.data) return <CenteredSpinner />

  const optional = q.data.types.filter((x) => x.optional)
  const offCount = optional.filter((x) => !x.enabled).length

  return (
    <div className="grid gap-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inner bg-brand-soft text-brand-strong">
          <BellRing size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-fg">{t('notifSettings.title')}</p>
          <p className="m-0 mt-0.5 text-xs text-fg-muted">{t('notifSettings.hint')}</p>
        </div>
        <span className="text-xs text-fg-muted">
          {t('notifSettings.offCount', { count: offCount, total: optional.length })}
        </span>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const opt = g.items.filter((i) => i.optional)
          const allOn = opt.length > 0 && opt.every((i) => i.enabled)
          return (
            <Card key={g.group} className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <h3 className="m-0 flex-1 text-sm font-semibold text-fg">{g.label}</h3>
                {opt.length > 1 && (
                  <button
                    type="button"
                    disabled={save.isPending}
                    onClick={() => save.mutate(Object.fromEntries(opt.map((i) => [i.code, !allOn])))}
                    className="rounded-control px-2 py-1 text-xs font-medium text-brand-strong hover:bg-brand-soft disabled:opacity-50"
                  >
                    {allOn ? t('notifSettings.allOff') : t('notifSettings.allOn')}
                  </button>
                )}
              </div>
              <ul className="m-0 list-none divide-y divide-line p-0">
                {g.items.map((x) => {
                  const label = tr(`notifSettings.type_${x.code}`, x.label)
                  return (
                    <li key={x.code} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[13.5px] text-fg">{label}</p>
                        {!x.optional && (
                          <p className="m-0 mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-fg-subtle">
                            <Lock size={11} aria-hidden="true" /> {t('notifSettings.mandatory')}
                          </p>
                        )}
                      </div>
                      <Switch
                        label={label}
                        checked={x.optional ? x.enabled : true}
                        disabled={!x.optional || save.isPending}
                        title={x.optional ? undefined : t('notifSettings.mandatory')}
                        onChange={(on) => save.mutate({ [x.code]: on })}
                      />
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
  title,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  label: string
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-brand' : 'bg-line-strong',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-5 w-5 rounded-pill bg-surface shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
