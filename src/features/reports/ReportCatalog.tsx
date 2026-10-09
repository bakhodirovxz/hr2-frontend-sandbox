import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarClock, ChevronRight, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchInput } from '@/components/data/SearchInput'
import { useDynamicT } from '@/i18n/dynamicKey'
import { reportLabel } from './reportStyles'
import type { ReportCatalogItem, ReportCategory } from './types'
import { useReportCatalog } from './useReportCatalog'

const GROUPS: { key: ReportCategory; labelKey: string; icon: typeof Users }[] = [
  { key: 'attendance', labelKey: 'reports.groupAttendance', icon: CalendarClock },
  { key: 'hr', labelKey: 'reports.groupHr', icon: Users },
  { key: 'kpi', labelKey: 'reports.groupKpi', icon: BarChart3 },
]

/** The report catalogue: what this person may run, grouped like the source menu. */
export function ReportCatalog() {
  const { t } = useTranslation()
  const dt = useDynamicT()
  const { byCategory, isLoading, isError, items } = useReportCatalog()
  // 29 reports is past the point where the eye finds one by scanning.
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const matches = useMemo(() => (r: ReportCatalogItem) => {
    if (!term) return true
    const title = reportLabel(r.title_key, r.code).toLowerCase()
    const desc = dt(`reports.desc.${r.code}`).toLowerCase()
    return title.includes(term) || desc.includes(term) || r.code.includes(term)
  }, [term, dt])

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}
      </div>
    )
  }
  if (isError || items.length === 0) {
    return <EmptyState title={t('reports.catalogEmpty')} description={t('reports.catalogEmptyHint')} />
  }
  return (
    <div className="space-y-8">
      <div className="max-w-md">
        <SearchInput value={q} onChange={setQ} placeholder={t('reports.searchPlaceholder')} />
      </div>
      {GROUPS.map(({ key, labelKey, icon: Icon }) => {
        const list: ReportCatalogItem[] = byCategory[key].filter(matches)
        if (!list.length) return null
        return (
          <section key={key}>
            <h2 className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold text-fg-muted">
              <Icon size={14} /> {t(labelKey as never) as string}
              <span className="tabnum rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-fg-subtle">{list.length}</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {list.map((r) => (
                <Link key={r.code} to={`/reports/${r.code}`} className="group focus:outline-none">
                  <Card interactive className="flex h-full items-center gap-3 p-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-fg">{reportLabel(r.title_key, r.code)}</span>
                      <span className="mt-0.5 block text-[12px] text-fg-subtle">
                        {t(`reports.desc.${r.code}` as never, { defaultValue: '' }) as string}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
