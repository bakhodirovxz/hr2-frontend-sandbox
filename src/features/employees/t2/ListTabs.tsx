import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Award, CalendarRange, Landmark, Languages, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { fmtDate, fmtRange } from '../format'
import { useEmployeeOrders } from '../useEmployees'
import type { T2Card, T2Section as T2SectionCode } from '../types'
import type { T2TabProps } from './GeneralTab'
import { EmptyRow, RowsEditor, RowsTable, T2Section, useT2Save, type RowsColumn } from './T2Ui'
import { labelOf, useCodeOptions } from './useT2'

type Row = Record<string, unknown> & { id?: number | string }

const toNull = (v: unknown) => (v === '' || v === undefined ? null : v)
const list = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])

/**
 * One repeating T-2 section (languages, awards, elective bodies, incentives,
 * penalties, relatives): read table ⇄ editor; saving replaces the whole
 * section (`PUT /employees/{pk}/t2/{section}`) with the card's basis.
 */
function RowsSectionTab({
  employeeId,
  canEdit,
  icon,
  title,
  hint,
  saveKey,
  section,
  columns,
  viewColumns,
  current,
  toBody,
}: {
  employeeId: number
  canEdit: boolean
  icon: ReactNode
  title: string
  hint?: string
  saveKey: string
  section: T2SectionCode
  columns: RowsColumn<Row>[]
  viewColumns?: RowsColumn<Row>[]
  current: Row[]
  toBody: (rows: Row[]) => Record<string, unknown>
}) {
  const { saving, put } = useT2Save(employeeId)
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  return (
    <T2Section
      icon={icon}
      title={title}
      hint={hint}
      canEdit={canEdit}
      editing={editing}
      onEdit={() => {
        setRows(current.map((r) => ({ ...r })))
        setEditing(true)
      }}
      onCancel={() => setEditing(false)}
      onSave={async () => {
        if (await put(section, toBody(rows), saveKey)) setEditing(false)
      }}
      saving={saving === saveKey}
    >
      {editing ? <RowsEditor columns={columns} rows={rows} setRows={setRows} /> : <RowsTable columns={viewColumns ?? columns} rows={current} />}
    </T2Section>
  )
}

export function LanguagesTab({ employee, card, canEdit }: T2TabProps) {
  const { t } = useTranslation()
  const langs = useCodeOptions('foreign_languages')
  const levels = useCodeOptions('language_levels')
  const current = list(card.languages).map((r) => ({
    id: r.id,
    language_code: r.language_code || '',
    level: r.level || '',
    _lang: r.language_name,
    _level: r.level_name,
  }))
  const columns: RowsColumn<Row>[] = [
    { key: 'language_code', label: t('personnel.t2.language'), type: 'select', options: langs, width: 220 },
    { key: 'level', label: t('personnel.t2.languageLevel'), type: 'select', options: levels, width: 200 },
  ]
  return (
    <RowsSectionTab
      employeeId={employee.id}
      canEdit={canEdit}
      icon={<Languages size={15} />}
      title={t('personnel.t2.languagesTitle')}
      saveKey="languages"
      section="languages"
      columns={columns}
      viewColumns={[
        { ...columns[0], render: (r) => labelOf(langs, r.language_code as string) || String(r._lang ?? '—') },
        { ...columns[1], render: (r) => labelOf(levels, r.level as string) || String(r._level ?? '—') },
      ]}
      current={current}
      toBody={(rows) => ({
        rows: rows.filter((r) => r.language_code).map((r) => ({ language_code: r.language_code, level: toNull(r.level) })),
      })}
    />
  )
}

export function AwardsTab({ employee, card, canEdit }: T2TabProps) {
  const { t } = useTranslation()
  const awards = useCodeOptions('state_awards')
  const current = list(card.awards).map((r) => ({
    id: r.id,
    award_code: r.award_code || '',
    award_name: r.award_code ? '' : r.award_name || '',
    awarded_year: r.awarded_year ?? '',
    document_number: r.document_number || '',
    _name: r.award_name,
  }))
  const columns: RowsColumn<Row>[] = [
    { key: 'award_code', label: t('personnel.t2.award'), type: 'select', options: awards, width: 260 },
    { key: 'award_name', label: t('personnel.t2.awardOther'), placeholder: t('personnel.t2.awardOtherPh'), width: 220 },
    { key: 'awarded_year', label: t('personnel.t2.awardYear'), type: 'number', width: 130 },
    { key: 'document_number', label: t('personnel.t2.documentNo'), width: 150 },
  ]
  return (
    <RowsSectionTab
      employeeId={employee.id}
      canEdit={canEdit}
      icon={<Award size={15} />}
      title={t('personnel.tabs.awards')}
      saveKey="awards"
      section="awards"
      columns={columns}
      viewColumns={[
        { key: 'award', label: t('personnel.t2.awardName'), render: (r) => labelOf(awards, r.award_code as string) || String(r._name || r.award_name || '—') },
        columns[2],
        columns[3],
      ]}
      current={current}
      toBody={(rows) => ({
        rows: rows
          .filter((r) => r.award_code || r.award_name)
          .map((r) => ({
            award_code: toNull(r.award_code),
            award_name: r.award_code ? null : toNull(r.award_name),
            awarded_year: r.awarded_year === '' || r.awarded_year == null ? null : Number(r.awarded_year),
            document_number: toNull(r.document_number),
          })),
      })}
    />
  )
}

export function ElectiveTab({ employee, card, canEdit }: T2TabProps) {
  const { t } = useTranslation()
  const bodies = useCodeOptions('elective_bodies')
  const current = list(card.elective_bodies).map((r) => ({
    id: r.id,
    body_code: r.body_code || '',
    position: r.position || '',
    period_from: r.period_from || '',
    period_to: r.period_to || '',
    _name: r.body_name,
  }))
  const columns: RowsColumn<Row>[] = [
    { key: 'body_code', label: t('personnel.t2.electiveBody'), type: 'select', options: bodies, width: 300 },
    { key: 'position', label: t('personnel.t2.electivePosition'), width: 180 },
    { key: 'period_from', label: t('personnel.rec.from'), type: 'date', width: 160 },
    { key: 'period_to', label: t('personnel.rec.until'), type: 'date', width: 160 },
  ]
  return (
    <RowsSectionTab
      employeeId={employee.id}
      canEdit={canEdit}
      icon={<Landmark size={15} />}
      title={t('personnel.t2.electiveTitle')}
      saveKey="elective"
      section="elective-bodies"
      columns={columns}
      viewColumns={[{ ...columns[0], render: (r) => labelOf(bodies, r.body_code as string) || String(r._name || '—') }, ...columns.slice(1)]}
      current={current}
      toBody={(rows) => ({
        rows: rows
          .filter((r) => r.body_code || r.position)
          .map((r) => ({
            body_code: toNull(r.body_code),
            position: toNull(r.position),
            period_from: toNull(r.period_from),
            period_to: toNull(r.period_to),
          })),
      })}
    />
  )
}

export function MeritsTab({ employee, card, canEdit, kind }: T2TabProps & { kind: 'incentive' | 'penalty' }) {
  const { t } = useTranslation()
  const isPenalty = kind === 'penalty'
  const columns: RowsColumn<Row>[] = [
    { key: 'title', label: t('personnel.t2.meritTitle'), width: 250 },
    { key: 'order_number', label: t('personnel.t2.orderNo'), width: 130 },
    { key: 'order_date', label: t('personnel.t2.orderDate'), type: 'date', width: 160 },
    { key: 'issued_by', label: isPenalty ? t('personnel.t2.penaltyBy') : t('personnel.t2.incentiveBy'), width: 200 },
  ]
  if (isPenalty) columns.push({ key: 'lifted_at', label: t('personnel.t2.liftedAt'), type: 'date', width: 160 })
  const keys = columns.map((c) => c.key)
  const current = list(isPenalty ? card.penalties : card.incentives).map((r) => ({
    id: r.id,
    ...Object.fromEntries(keys.map((k) => [k, (r as unknown as Record<string, unknown>)[k] ?? ''])),
  }))
  return (
    <RowsSectionTab
      key={kind}
      employeeId={employee.id}
      canEdit={canEdit}
      icon={isPenalty ? <ThumbsDown size={15} /> : <ThumbsUp size={15} />}
      title={isPenalty ? t('personnel.tabs.penalties') : t('personnel.tabs.incentives')}
      saveKey={isPenalty ? 'penalties' : 'incentives'}
      section="merits"
      columns={columns}
      current={current}
      toBody={(rows) => ({
        kind,
        rows: rows
          .filter((r) => String(r.title ?? '').trim())
          .map((r) => Object.fromEntries(keys.map((k) => [k, toNull(r[k])]))),
      })}
    />
  )
}

export function RelativesTab({ employee, card, canEdit }: T2TabProps) {
  const { t } = useTranslation()
  const relations = useCodeOptions('relation_types')
  if (!card.relatives_visible) {
    return (
      <T2Section icon={<Users size={15} />} title={t('personnel.tabs.relatives')}>
        <EmptyRow text={t('personnel.t2.relativesHidden')} />
      </T2Section>
    )
  }
  const columns: RowsColumn<Row>[] = [
    { key: 'relation_code', label: t('personnel.t2.relation'), type: 'select', options: relations, width: 170 },
    { key: 'full_name', label: t('personnel.f.fullName'), width: 240 },
    { key: 'birth_date', label: t('personnel.f.birthDate'), type: 'date', width: 160 },
    { key: 'birth_place', label: t('personnel.t2.relBirthPlace'), width: 170 },
    { key: 'workplace', label: t('personnel.t2.workplace'), width: 190 },
    { key: 'position', label: t('personnel.t2.electivePosition'), width: 160 },
    { key: 'address', label: t('personnel.t2.residence'), width: 220 },
  ]
  const keys = columns.map((c) => c.key)
  const current = list(card.relatives).map((r) => ({
    id: r.id,
    ...Object.fromEntries(keys.map((k) => [k, (r as unknown as Record<string, unknown>)[k] ?? ''])),
    _rel: r.relation_name,
  }))
  return (
    <RowsSectionTab
      employeeId={employee.id}
      canEdit={canEdit}
      icon={<Users size={15} />}
      title={t('personnel.tabs.relatives')}
      hint={t('personnel.t2.relativesHint')}
      saveKey="relatives"
      section="relatives"
      columns={columns}
      viewColumns={[{ ...columns[0], render: (r) => labelOf(relations, r.relation_code as string) || String(r._rel || '—') }, ...columns.slice(1)]}
      current={current}
      toBody={(rows) => ({
        rows: rows
          .filter((r) => String(r.full_name ?? '').trim())
          .map((r) => Object.fromEntries(keys.map((k) => [k, toNull(r[k])]))),
      })}
    />
  )
}

/**
 * «Ta'til» (TZ 4.2.7 · 2126–2129) — READ ONLY, from the orders module: the
 * card's `vacations` (days written by an applied order) plus the employee's
 * `vacation` orders; one order never shows twice.
 */
export function VacationTab({ employee, card }: { employee: { id: number }; card: T2Card }) {
  const { t } = useTranslation()
  const orders = useEmployeeOrders(employee.id)
  const fromCard = list(card.vacations)
  const seen = new Set(fromCard.map((v) => v.order_act_id).filter(Boolean))
  const rows: Row[] = [
    ...fromCard.map((v) => ({
      id: `v-${v.id}`,
      order_act_id: v.order_act_id,
      order_date: v.order_date,
      order_number: v.order_number,
      from: v.start_date,
      to: v.end_date,
      type: v.type_name || v.order_title,
    })),
    ...list(orders.data?.items)
      .filter((o) => (o.category_rel?.code === 'vacation' || !!o.details?.leave_from) && !seen.has(o.id))
      .map((o) => ({
        id: `o-${o.id}`,
        order_act_id: o.id,
        order_date: o.act_date,
        order_number: o.act_number,
        from: o.details?.leave_from || o.effective_start_date,
        to: o.details?.leave_to || o.effective_end_date,
        type: o.category_rel?.name || o.summary,
      })),
  ].sort((a, b) => String(b.from ?? '').localeCompare(String(a.from ?? '')))

  const columns: RowsColumn<Row>[] = [
    { key: 'order_date', label: t('personnel.t2.orderDate'), render: (r) => fmtDate(r.order_date as string) },
    {
      key: 'order_number',
      label: t('personnel.t2.orderNumber'),
      render: (r) =>
        r.order_act_id ? (
          <Link to={`/orders?open=${String(r.order_act_id)}`} className="text-brand hover:underline">
            №{String(r.order_number || r.order_act_id)}
          </Link>
        ) : r.order_number ? (
          `№${String(r.order_number)}`
        ) : (
          '—'
        ),
    },
    { key: 'period', label: t('personnel.t2.vacationPeriod'), render: (r) => fmtRange(r.from as string, r.to as string) },
    { key: 'type', label: t('personnel.t2.vacationType'), render: (r) => String(r.type || '—') },
  ]
  return (
    <T2Section icon={<CalendarRange size={15} />} title={t('personnel.t2.vacations')} hint={t('personnel.t2.vacationsHint')}>
      {orders.isLoading && rows.length === 0 ? (
        <EmptyRow text={t('common.loading')} />
      ) : (
        <RowsTable columns={columns} rows={rows} emptyText={t('personnel.t2.noVacations')} />
      )}
    </T2Section>
  )
}
