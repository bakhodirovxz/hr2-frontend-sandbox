import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { errorMessage } from '@/api/errorMessage'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import {
  fetchDashboardPreferences,
  fetchDrill,
  saveDashboardPreferences,
  type DashboardCategory,
  type DashboardChart,
  type DashboardParams,
  type DashboardWidget,
} from './api'
import { dmy } from './reportUtils'
import { useServerText } from './serverText'
import { numberLocale } from '@/lib/format'

/**
 * R2 · panel kengaytmalari: ko'rsatkich ortidagi qatorlar (batafsil) va
 * panelni sozlash (qaysi vidjet / diagramma ko'rinadi).
 */

export interface DrillTarget {
  widget: string
  key?: string | null
  title: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/

function cellText(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? '✓' : '—'
  if (typeof v === 'number') return v.toLocaleString(numberLocale(), { maximumFractionDigits: 2 })
  if (typeof v === 'string' && ISO_DATE.test(v)) return dmy(v.slice(0, 10))
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

type DrillRow = Record<string, unknown> & { id: number }

export function DrillDrawer({ target, params, onClose }: { target: DrillTarget; params: DashboardParams; onClose: () => void }) {
  const { t } = useTranslation()
  const st = useServerText()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const q = useQuery({
    queryKey: ['statistics-drill', params, target.widget, target.key ?? null, page, size],
    queryFn: () => fetchDrill({ ...params, widget: target.widget, key: target.key ?? undefined, page, size }),
    retry: false,
    placeholderData: (prev) => prev,
  })
  const data = q.data
  const rows = useMemo<DrillRow[]>(
    () => (data?.items ?? []).map((it, i) => ({ ...it, id: (data!.page - 1) * data!.size + i + 1 })),
    [data],
  )
  const columns: Column<DrillRow>[] = [
    {
      key: '__n',
      header: '№',
      className: 'w-10 tabular-nums text-fg-subtle',
      cell: (r) => r.id,
    },
    ...(data?.columns ?? []).map((c) => ({
      key: c.key,
      header: st(c.label),
      label: st(c.label),
      cell: (r: DrillRow) => <span className="text-fg-muted">{cellText(r[c.key])}</span>,
    })),
  ]
  const total = data?.total ?? 0
  return (
    <Modal
      open
      onClose={onClose}
      placement="right"
      size="lg"
      title={target.title}
      description={t('statDash.drillCount', { count: total })}
    >
      <DataTable
        rows={rows}
        columns={columns}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyTitle={t('statistics.noData')}
        density="compact"
        minWidth={Math.max(520, columns.length * 140)}
      />
      <Pagination
        page={data?.page ?? page}
        size={data?.size ?? size}
        total={total}
        pages={Math.max(1, Math.ceil(total / (data?.size ?? size)))}
        onPage={setPage}
        onSize={(s) => {
          setSize(s)
          setPage(1)
        }}
        loading={q.isFetching}
      />
    </Modal>
  )
}

export function DashboardSettings({
  category,
  widgets,
  charts,
  onClose,
}: {
  category: DashboardCategory
  widgets: DashboardWidget[]
  charts: DashboardChart[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const st = useServerText()
  const toast = useToast()
  const qc = useQueryClient()
  const prefs = useQuery({ queryKey: ['statistics-dashboard-prefs'], queryFn: fetchDashboardPreferences, retry: false })
  const [w, setW] = useState<string[]>(() => widgets.filter((x) => x.visible !== false).map((x) => x.code))
  const [c, setC] = useState<string[]>(() => charts.filter((x) => x.visible !== false).map((x) => x.code))
  useEffect(() => {
    if (prefs.data) {
      setW(prefs.data.widgets[category] ?? [])
      setC(prefs.data.charts[category] ?? [])
    }
  }, [prefs.data, category])

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['statistics-dashboard'] })
    void qc.invalidateQueries({ queryKey: ['statistics-dashboard-prefs'] })
    onClose()
  }
  const save = useMutation({
    // PUT butun sozlamani almashtiradi: boshqa toifalar o'z holida qoladi.
    mutationFn: () =>
      saveDashboardPreferences({
        default_category: prefs.data?.default_category,
        widgets: { ...(prefs.data?.widgets ?? {}), [category]: w },
        charts: { ...(prefs.data?.charts ?? {}), [category]: c },
      }),
    onSuccess: () => {
      toast.ok(t('statDash.settingsSaved'))
      done()
    },
    onError: (e) => toast.error(errorMessage(e, t('common.actionFailed'))),
  })
  const reset = useMutation({
    mutationFn: () => saveDashboardPreferences({}),
    onSuccess: () => {
      toast.ok(t('statDash.settingsReset'))
      done()
    },
    onError: (e) => toast.error(errorMessage(e, t('common.actionFailed'))),
  })

  const toggle = (list: string[], set: (v: string[]) => void, code: string, on: boolean, all: string[]) =>
    set(all.filter((x) => (x === code ? on : list.includes(x))))
  const wAll = widgets.map((x) => x.code)
  const cAll = charts.map((x) => x.code)

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('statDash.settingsTitle')}
      description={t('statDash.settingsHint')}
      footer={
        <>
          <Button variant="ghost" leftIcon={<RotateCcw size={14} />} loading={reset.isPending} disabled={save.isPending} onClick={() => reset.mutate()}>
            {t('statDash.settingsDefault')}
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={prefs.isLoading || !!prefs.error || !w.length || (charts.length > 0 && !c.length)} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-fg-subtle">{t('statDash.settingsMin')}</p>
        {prefs.error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {errorMessage(prefs.error, t('statistics.loadFailed'))}
          </p>
        )}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-fg">{t('statDash.widgets')}</legend>
          <ul className="flex flex-col gap-1.5">
            {widgets.map((x) => (
              <li key={x.code}>
                <Checkbox label={st(x.label)} checked={w.includes(x.code)} onChange={(e) => toggle(w, setW, x.code, e.target.checked, wAll)} />
              </li>
            ))}
          </ul>
        </fieldset>
        {charts.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold text-fg">{t('statDash.charts')}</legend>
            <ul className="flex flex-col gap-1.5">
              {charts.map((x) => (
                <li key={x.code}>
                  <Checkbox label={st(x.label)} checked={c.includes(x.code)} onChange={(e) => toggle(c, setC, x.code, e.target.checked, cAll)} />
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </div>
    </Modal>
  )
}
