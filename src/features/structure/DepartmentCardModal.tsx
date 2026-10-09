import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, Pencil, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/data/LoadError'
import { ChangeLogList } from './ChangeLogList'
import { ExtraAttributesView } from './ExtraAttributesFields'
import { useDepartmentDetail, type DepartmentRow } from './useDepartmentAdmin'

export type CardTab = 'info' | 'history'

/**
 * Bo'lim kartochkasi (TZ S2 «карточка подразделения», S1 «История»): nomi,
 * kodi, yuqori bo'lim, rahbari, xodimlar soni, tashkil etilgan sana,
 * funksiyalari, qo'shimcha ma'lumotlar, quyi bo'limlar, o'zgarishlar tarixi
 * va bo'lim xodimlari ro'yxatiga havola. Ma'lumot `GET /departments/{pk}` dan.
 */
export function DepartmentCardModal({
  id,
  tab,
  onTab,
  all,
  onOpen,
  onClose,
  onEdit,
}: {
  id: number | null
  tab: CardTab
  onTab: (tab: CardTab) => void
  /** Ro'yxat — quyi bo'limlarni topish uchun. */
  all: DepartmentRow[]
  onOpen: (id: number) => void
  onClose: () => void
  /** Berilmasa «Tahrirlash» tugmasi chizilmaydi. */
  onEdit?: (d: DepartmentRow) => void
}) {
  const { t } = useTranslation()
  const q = useDepartmentDetail(id)
  const d = q.data
  const extra = d?.extra ?? {}
  const log = Array.isArray(extra.change_log) ? extra.change_log : []
  const children = id == null ? [] : all.filter((x) => x.parent_id === id).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'uz'))
  const heads = (d?.heads ?? []).map((h) => h.legal_name).filter(Boolean)
  const parentName = d?.parent_name ?? (d?.parent_id != null ? all.find((x) => x.id === d.parent_id)?.name : null)
  const fmt = (v?: string | null) => (v && dayjs(v).isValid() ? dayjs(v).format('DD.MM.YYYY') : '—')

  return (
    <Modal
      open={id != null}
      onClose={onClose}
      placement="right"
      size="md"
      title={d?.name ?? t('orgAdmin.cardTitle')}
      description={d?.code ? `${t('orgAdmin.colCode')}: ${d.code}` : t('orgAdmin.cardTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          {onEdit && d && (
            <Button leftIcon={<Pencil size={15} />} onClick={() => onEdit(d)}>
              {t('common.edit')}
            </Button>
          )}
        </>
      }
    >
      <Segmented
        size="sm"
        className="mb-4"
        value={tab}
        onChange={onTab}
        options={[
          { value: 'info', label: t('orgAdmin.tabInfo') },
          { value: 'history', label: t('orgAdmin.tabHistory'), count: log.length || undefined },
        ]}
      />

      {q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : q.error ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : tab === 'history' ? (
        <ChangeLogList items={log} />
      ) : (
        <div className="flex flex-col gap-5">
          {d?.closed_at && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">
              <Badge tone="warning">{t('orgAdmin.closedBadge')}</Badge>
              <span className="ml-2 tabular-nums">{fmt(d.closed_at)}</span>
              {d.closed_reason && <p className="mt-1.5 text-fg-muted">{d.closed_reason}</p>}
            </div>
          )}
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label={t('orgAdmin.colName')}>{d?.name || '—'}</Info>
            <Info label={t('orgAdmin.colCode')}>{d?.code || '—'}</Info>
            <Info label={t('orgAdmin.colParent')}>{parentName || '—'}</Info>
            <Info label={t('orgAdmin.colHeads')}>{heads.length ? heads.join(', ') : '—'}</Info>
            <Info label={t('orgAdmin.staffCount')}>{d?.staff_count ?? '—'}</Info>
            <Info label={t('orgAdmin.established')}>{fmt(extra.established_at)}</Info>
          </dl>

          <div>
            <p className="mb-1 text-[12px] text-fg-muted">{t('orgAdmin.functions')}</p>
            <p className="whitespace-pre-wrap text-[14px] text-fg">{extra.functions || '—'}</p>
          </div>

          <ExtraAttributesView target="department" value={extra.attributes} />

          <div>
            <p className="mb-2 text-[12px] text-fg-muted">
              {t('orgAdmin.children')} ({children.length})
            </p>
            {children.length ? (
              <ul className="flex flex-col gap-1.5">
                {children.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 text-left text-[13px] text-fg transition-colors hover:border-brand/50"
                    >
                      <Building2 size={14} className="text-fg-subtle" />
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.staff_count != null && <span className="tabular-nums text-[12px] text-fg-subtle">{c.staff_count}</span>}
                      <ChevronRight size={14} className="text-fg-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[13px] text-fg-subtle">—</span>
            )}
          </div>

          {id != null && (
            <Link
              to={`/employees?dept=${id}`}
              onClick={onClose}
              className="inline-flex h-9 items-center gap-2 self-start rounded-lg bg-surface-2 px-3 text-[13px] font-semibold text-fg transition-colors hover:bg-brand-soft hover:text-brand-strong"
            >
              <Users size={14} /> {t('orgAdmin.employeesLink')}
            </Link>
          )}
        </div>
      )}
    </Modal>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd className="break-words text-[14px] text-fg">{children}</dd>
    </div>
  )
}
