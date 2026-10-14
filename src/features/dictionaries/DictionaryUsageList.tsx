import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Button, Modal, Spinner } from '@/components/ui'
import { useServerText } from '@/features/statistics/serverText'
import { useUsageRegistry, type DictionaryType, type DictionaryUsageRef, localizedName } from './useDictionaries'

/**
 * TZ D2 1583 «Просмотр связанных объектов — запускается при нажатии на связь.
 * Система отображает объекты, использующие данную запись» and D1 1558
 * «список зависимостей».
 *
 * The usage refs come per source column (`table`, `column`); here they are
 * grouped by PLACE (employees, positions, organisations…), and each place
 * links to its screen — the sample objects open that screen filtered by name.
 */

/** Screens that list the objects of a source table (`q` = search). */
const PLACE_ROUTE: Record<string, string> = {
  employees: '/employees',
  job_positions: '/job-positions',
  departments: '/departments',
  organization_branches: '/branches',
  staff_positions: '/staffing',
  order_acts: '/orders',
  registration_requests: '/registrations',
  kpi_indicators: '/kpi',
}
/** Screens without a name search — linked without `?q=`. */
const NO_SEARCH = new Set(['kpi_indicators'])
const CHILDREN = '_children'

type PlaceKey =
  | 'employees'
  | 'job_positions'
  | 'departments'
  | 'organization_branches'
  | 'staff_positions'
  | 'order_acts'
  | 'registration_requests'
  | 'kpi_indicators'
  | 'dictionary_types'
  | '_children'
const KNOWN = new Set<string>([...Object.keys(PLACE_ROUTE), 'dictionary_types', CHILDREN])

export function usePlaceLabel() {
  const { t } = useTranslation()
  return (table: string) => (KNOWN.has(table) ? t(`hrExt.usage.place_${table as PlaceKey}`) : table)
}

/** Link to the objects of a ref (archived employees open the archive tab). */
function placeHref(table: string, column: string | null | undefined, q?: string): string | null {
  const base = PLACE_ROUTE[table]
  if (!base) return null
  const sp = new URLSearchParams()
  if (table === 'employees' && column?.includes('_archive')) sp.set('status', 'archive')
  if (q && !NO_SEARCH.has(table)) sp.set('q', q)
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

/** «Xodimlar kartasi (T-2): nationality_code» → «Xodimlar kartasi (T-2)» (raw column names are not shown to users). */
function refTitle(label: string, column?: string | null): string {
  if (column && label.endsWith(`: ${column}`)) return label.slice(0, -(column.length + 2))
  return label
}

export function DictionaryUsageList({ refs, compact = false }: { refs: DictionaryUsageRef[]; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const st = useServerText()
  const placeLabel = usePlaceLabel()
  const ru = i18n.language === 'ru'
  const groups = useMemo(() => {
    const map = new Map<string, DictionaryUsageRef[]>()
    for (const r of refs) {
      const key = r.table || CHILDREN
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.entries()]
  }, [refs])

  return (
    <ul className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3'}>
      {groups.map(([table, items]) => {
        const total = items.reduce((n, r) => n + (r.count || 0), 0)
        const href = placeHref(table, items[0]?.column)
        return (
          <li key={table} className="rounded-inner border border-line bg-surface-2/40 px-3 py-2">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-semibold text-fg">{placeLabel(table)}</span>
              <span className="text-fg-muted tabular-nums">{t('orgRef.countItems', { count: total })}</span>
              {href && !compact && (
                <Link to={href} className="ml-auto inline-flex items-center gap-1 text-[12px] text-brand hover:underline">
                  {t('hrExt.usage.open')} <ExternalLink size={12} aria-hidden />
                </Link>
              )}
            </div>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {items.map((r, i) => (
                <li key={i} className="text-[12.5px] text-fg">
                  <span>{ru && r.label_ru ? r.label_ru : st(refTitle(r.label, r.column))}</span>
                  <span className="ml-1.5 text-fg-muted tabular-nums">— {t('orgRef.countItems', { count: r.count })}</span>
                  {r.sample?.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px]">
                      {r.sample.slice(0, compact ? 3 : 5).map((name, j) => {
                        const to = compact ? null : placeHref(table, r.column, name)
                        return to ? (
                          <Link key={j} to={to} className="text-brand hover:underline">
                            {name}
                          </Link>
                        ) : (
                          <span key={j} className="text-fg-subtle">
                            {name}
                          </span>
                        )
                      })}
                      {r.count > r.sample.length && <span className="text-fg-subtle">…</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The dependency registry of ONE dictionary type: every table / column that
 * stores its codes (`GET /dictionaries/usage-registry`), grouped by place.
 */
export function DictionaryRegistryModal({ type, open, onClose }: { type: DictionaryType | null; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const st = useServerText()
  const placeLabel = usePlaceLabel()
  const q = useUsageRegistry(open)
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; column: string }[]>()
    for (const r of q.data?.refs ?? []) {
      if (r.type_code !== type?.code) continue
      const column = r.column + (r.path?.length ? `.${r.path.join('.')}` : '') + (r.key ? `[].${r.key}` : '')
      map.set(r.table, [...(map.get(r.table) ?? []), { label: refTitle(r.label, r.column), column }])
    }
    return [...map.entries()]
  }, [q.data, type?.code])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      placement="right"
      title={t('hrExt.usage.registryTitle')}
      description={type ? localizedName(type, i18n.language) : undefined}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <p className="mb-3 text-[13px] text-fg-muted">{t('hrExt.usage.registryHint')}</p>
      {q.isLoading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t('hrExt.usage.registryEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map(([table, items]) => {
            const href = placeHref(table, null)
            return (
              <li key={table} className="rounded-inner border border-line px-3 py-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold text-fg">{placeLabel(table)}</span>
                  {href && (
                    <Link to={href} className="ml-auto inline-flex items-center gap-1 text-[12px] text-brand hover:underline">
                      {t('hrExt.usage.open')} <ExternalLink size={12} aria-hidden />
                    </Link>
                  )}
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {items.map((r, i) => (
                    <li key={i} className="text-[12.5px] text-fg">
                      {st(r.label)}
                      <code className="ml-1.5 rounded bg-surface-2 px-1 text-[11px] text-fg-subtle">{`${table}.${r.column}`}</code>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
