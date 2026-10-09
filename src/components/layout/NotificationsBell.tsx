import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CheckCheck, ClipboardList, FileText, FolderKanban, Target, Trash2, Wrench } from 'lucide-react'
import { inTashkent } from '@/lib/format'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  deleteNotification,
  deleteReadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications'
import { useUnreadNotifications } from '@/hooks/useMenuBadges'
import { cn } from '@/lib/cn'
import { POPOVER } from '@/components/ui/control'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import {
  notificationTitleKey,
  resolveNotificationUrl,
} from '@/features/notifications/notificationRoutes'

/**
 * Icon and colour per notification family — v1's `NotificationSidebar` groups
 * them the same way. Without this every row carried an identical dot, so a KPI
 * notice and a helpdesk reply looked alike in a list of forty.
 */
function typeFace(type?: string | null): { Icon: typeof ClipboardList; color: string } {
  const k = String(type ?? '')
  if (k.startsWith('kpi')) return { Icon: Target, color: '--info' }
  if (k.startsWith('support_ticket')) return { Icon: Wrench, color: '--brand' }
  if (k.includes('order')) return { Icon: FileText, color: '--success' }
  if (k.startsWith('workspace') || k.startsWith('card')) return { Icon: FolderKanban, color: '--brand-strong' }
  return { Icon: ClipboardList, color: '--warning' }
}

export function NotificationsBell() {
  const [tab, setTab] = useState<'unread' | 'all'>('all')
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const { items, unread: unreadFromList, isLoading } = useNotifications(open, tab === 'unread')
  // Server-side count when the API offers it; the list-derived number is the
  // fallback for an older API (and for the panel while it is open).
  const unreadCount = useUnreadNotifications()
  const unread = unreadCount ?? unreadFromList
  // ⚠️ NO `.slice(0, 20)` HERE ANY MORE. The server returns the whole list
  // (`DEFAULT_NOTIFICATION_LIMIT = 0` — no ceiling), v2 fetched all of it and
  // then displayed only the newest twenty, so anyone past that count could
  // never reach an older notice at all — there is no notifications page in
  // either version to fall back to.
  const shown = items
  const navigate = useNavigate()

  /**
   * Opening a notification is what marks it read — keeping the tick button as
   * the only way to clear the badge meant people either read nothing or read
   * everything. The mark is fired without awaiting so the badge drops at once;
   * navigation does not wait on the network either.
   */
  const openNotification = (n: (typeof items)[number]) => {
    if (!n.is_read) void markNotificationRead(n.id)
    setOpen(false)
    const url = resolveNotificationUrl(n)
    if (url) navigate(url)
  }

  return (
    <div className="relative">
      <IconButton
        ref={btnRef}
        label={
          unread > 0
            ? `${t('header.notifications')} (${unread})`
            : t('header.notifications')
        }
        badge={unread > 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={19} />
      </IconButton>
      {/* Announce newly arriving notifications to screen readers. */}
      <span aria-live="polite" className="sr-only">
        {unread > 0 ? `${t('header.notifications')}: ${unread}` : ''}
      </span>

      <AnchoredPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        width={POPOVER.notifW}
        height={420}
        role="dialog"
        label={t('header.notifications')}
        className="overflow-hidden"
      >
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-fg">
              {t('header.notifications')}
              {unread > 0 && (
                <span className="tabnum ml-2 rounded-xs bg-danger-soft px-1.5 py-0.5 text-[11px] font-bold text-danger">
                  {unread}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline"
                >
                  <CheckCheck size={14} />
                  {t('header.markAllRead')}
                </button>
              )}
              {/* Tidying up: clear what has already been read, keeping the
                  unread ones. Without it the list only ever grew. */}
              {items.some((n) => n.is_read) && (
                <button
                  type="button"
                  onClick={() => deleteReadNotifications()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg hover:underline"
                >
                  <Trash2 size={14} />
                  {t('header.clearRead')}
                </button>
              )}
            </div>
          </div>

          {/* Unread / all — v1's drawer splits the same way. Without a split the
              only way to find an old notice was to scroll past every new one. */}
          <div className="flex gap-1 border-b border-line px-4 pb-2">
            {(['unread', 'all'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  'rounded-pill px-3 py-1 text-xs font-medium transition-colors',
                  tab === k ? 'bg-brand-soft text-brand-strong' : 'text-fg-muted hover:text-fg',
                )}
              >
                {t(`header.tab_${k}` as never)}
                {k === 'unread' && unread > 0 ? ` (${unread})` : ''}
              </button>
            ))}
          </div>

          <div className="scroll-thin max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
            {isLoading ? (
              <p className="py-8 text-center text-xs text-fg-subtle">{t('common.loading')}</p>
            ) : items.length === 0 ? (
              <EmptyState title={t('header.noNotifications')} description={t('header.noNotificationsHint')} />
            ) : (
              shown.map((n) => {
                /*
                 * ⚠️ ONLY A ROW THAT LEADS SOMEWHERE LOOKS CLICKABLE. Every row
                 * used to get `cursor-pointer`, `role="button"` and a keyboard
                 * handler; when the resolver returned null the click merely
                 * closed the panel and nothing happened — with no visible
                 * difference from one that works. Rows without a destination are
                 * now plain text (still markable as read by their own button).
                 */
                const url = resolveNotificationUrl(n)
                return (
                <div
                  key={n.id}
                  {...(url
                    ? {
                        role: 'button' as const,
                        tabIndex: 0,
                        onClick: () => openNotification(n),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openNotification(n)
                          }
                        },
                      }
                    : {})}
                  className={cn(
                    'group flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0',
                    url
                      ? 'cursor-pointer hover:bg-fg/[0.04] focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-brand'
                      : 'cursor-default',
                    !n.is_read && 'bg-brand-soft/40',
                  )}
                >
                  {(() => {
                    const { Icon, color } = typeFace(n.notification_type)
                    return (
                      <span
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                        style={{
                          backgroundColor: `rgb(var(${color}) / 0.14)`,
                          color: `rgb(var(${color}))`,
                          opacity: n.is_read ? 0.55 : 1,
                        }}
                      >
                        <Icon size={15} />
                      </span>
                    )
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-fg">
                      {/* The server's own title wins; the type map is what
                          turns a bare `card_member_added` into a sentence. */}
                      {n.title || t(notificationTitleKey(n.notification_type) as never)}
                    </p>
                    {n.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{n.description}</p>
                    )}
                    {n.created_at && (
                      <p className="mt-1 text-[11px] text-fg-subtle">
                        {inTashkent(n.created_at).format('DD.MM.YYYY HH:mm')}
                      </p>
                    )}
                  </div>
                  {/* Per-item actions. Reading one at a time is the point:
                      keeping a single notice unread as a reminder used to mean
                      leaving the whole list unread. */}
                  <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {!n.is_read && (
                      <button
                        type="button"
                        aria-label={t('header.markRead')}
                        title={t('header.markRead')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void markNotificationRead(n.id)
                        }}
                        className="rounded-xs p-1 text-fg-subtle hover:bg-fg/[0.08] hover:text-fg"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteNotification(n.id)
                      }}
                      className="rounded-xs p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                )
              })
            )}
          </div>
        </div>
      </AnchoredPanel>
    </div>
  )
}
