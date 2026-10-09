import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import type { DepartmentChangeLogEntry } from './useDepartmentAdmin'

/**
 * O'zgarishlar tarixi (TZ S1/S2 «Просмотр истории изменений», 4.2.6 · 2034,
 * 2051): bo'lim yoki lavozimning `extra.change_log` yozuvlari
 * `{at, by, field, old, new, old_label, new_label, basis_number, basis_date}`.
 * Maydon nomlari o'qiladigan yorliqqa, sanalar DD.MM.YYYY, atributlar
 * «kalit: qiymat» ko'rinishida (xom JSON/ISO emas).
 */

const FIELD_KEYS = {
  name: 'logName',
  code: 'logCode',
  parent_id: 'logParent',
  head_employee_id: 'logHead',
  head_ids: 'logHead',
  'extra.functions': 'logFunctions',
  functions: 'logFunctions',
  'extra.established_at': 'logEstablished',
  established_at: 'logEstablished',
  'extra.attributes': 'logAttributes',
  attributes: 'logAttributes',
  closed_at: 'logClosedAt',
  closed_reason: 'logClosedReason',
  reopen_reason: 'logReopenReason',
  organization_branch_id: 'logBranch',
  short_name: 'logShortName',
  razryad: 'logRazryad',
  category: 'logCategory',
} as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/

function fmtDate(v: string, withTime: boolean) {
  const d = dayjs(v)
  return d.isValid() ? d.format(withTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY') : v
}

export function ChangeLogList({ items }: { items?: DepartmentChangeLogEntry[] | null }) {
  const { t } = useTranslation()

  const fieldLabel = (f?: string | null) => {
    if (!f) return t('orgAdmin.logChange')
    const key = FIELD_KEYS[f as keyof typeof FIELD_KEYS]
    return key ? t(`orgAdmin.${key}`) : f
  }
  const show = (v: unknown): string => {
    if (v === undefined || v === null || v === '') return '—'
    if (typeof v === 'boolean') return v ? t('orgAdmin.yes') : t('orgAdmin.no')
    if (Array.isArray(v)) return v.length ? v.map(show).join(', ') : '—'
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.name === 'string') return o.name
      const parts = Object.entries(o)
        .filter(([, x]) => x !== null && x !== undefined && x !== '')
        .map(([k, x]) => `${k}: ${show(x)}`)
      return parts.length ? parts.join('; ') : '—'
    }
    if (typeof v === 'string' && ISO_DATE.test(v)) return fmtDate(v, v.length > 10)
    return String(v)
  }
  const value = (r: DepartmentChangeLogEntry, which: 'old' | 'new') => {
    const label = r[`${which}_label`]
    return label ? label : show(r[which])
  }
  const author = (by: DepartmentChangeLogEntry['by']) => {
    if (!by) return '—'
    if (typeof by === 'string') return by
    return by.name || (by.user_id != null ? `#${by.user_id}` : '—')
  }

  const rows = (items ?? [])
    .filter((r) => r && typeof r === 'object')
    .slice()
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))

  if (!rows.length) {
    return <EmptyState icon={<History size={22} />} title={t('orgAdmin.historyEmpty')} />
  }

  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={`${r.at ?? ''}-${r.field ?? ''}-${i}`} className="rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 text-[13px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-fg">{fieldLabel(r.field)}</span>
            <span className="whitespace-nowrap text-[12px] tabular-nums text-fg-subtle">{r.at ? fmtDate(r.at, true) : ''}</span>
          </div>
          {(r.old !== undefined || r.new !== undefined) && (
            <div className="mt-1 break-words text-fg-muted">
              <span className="text-fg-subtle line-through decoration-line">{value(r, 'old')}</span>
              <span className="mx-1.5 text-fg-subtle">→</span>
              <span className="text-fg">{value(r, 'new')}</span>
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
            <span>
              {t('orgAdmin.logAuthor')}: {author(r.by)}
            </span>
            {(r.basis_number || r.basis_date) && (
              <span>
                {t('orgAdmin.logBasis')}: {r.basis_number ? `№ ${r.basis_number}` : ''}
                {r.basis_date ? ` · ${fmtDate(r.basis_date, false)}` : ''}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
