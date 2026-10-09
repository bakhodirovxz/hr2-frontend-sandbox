import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, KeyRound, PencilLine, RotateCcw, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ModuleCode, PermissionLevel } from '@/auth/permissions'

/** `inherit` — shaxsiy daraja yo'q, rol hal qiladi (A2, foydalanuvchi tabi). */
export type LevelChoice = PermissionLevel | 'inherit'

const META: Record<LevelChoice, { icon: LucideIcon; on: string }> = {
  inherit: { icon: RotateCcw, on: 'bg-surface-2 text-fg ring-fg-subtle/40' },
  none: { icon: X, on: 'bg-surface-2 text-fg-muted ring-line' },
  view: { icon: Eye, on: 'bg-info-soft text-info ring-info/30' },
  edit: { icon: PencilLine, on: 'bg-warning-soft text-warning ring-warning/30' },
  full: { icon: KeyRound, on: 'bg-success-soft text-success ring-success/30' },
}

export function useLevelLabel() {
  const { t } = useTranslation()
  return (lv: LevelChoice): string =>
    ({
      inherit: t('roleAdmin.lv_inherit'),
      none: t('roleAdmin.lv_none'),
      view: t('roleAdmin.lv_view'),
      edit: t('roleAdmin.lv_edit'),
      full: t('roleAdmin.lv_full'),
    })[lv]
}

export function useModuleLabel() {
  const { t } = useTranslation()
  return (m: ModuleCode): string =>
    ({
      admin: t('roleAdmin.mod_admin'),
      registration: t('roleAdmin.mod_registration'),
      dictionaries: t('roleAdmin.mod_dictionaries'),
      structure: t('roleAdmin.mod_structure'),
      employees: t('roleAdmin.mod_employees'),
      kpi: t('roleAdmin.mod_kpi'),
      work_plans: t('roleAdmin.mod_work_plans'),
      trainings: t('roleAdmin.mod_trainings'),
      inspections: t('roleAdmin.mod_inspections'),
      orders: t('roleAdmin.mod_orders'),
      vacancies: t('roleAdmin.mod_vacancies'),
      statistics: t('roleAdmin.mod_statistics'),
      services: t('roleAdmin.mod_services'),
      attendance: t('roleAdmin.mod_attendance'),
    })[m] ?? m
}

/** Bitta daraja yorlig'i (ro'yxat, «Roldan» / «Samarali» ustunlari). */
export function LevelChip({ level, prefix }: { level: LevelChoice; prefix?: string }) {
  const label = useLevelLabel()
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-tag px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset',
        META[level].on,
      )}
    >
      {prefix ? `${prefix}: ` : ''}
      {label(level)}
    </span>
  )
}

/**
 * Modul uchun daraja tanlagichi — radio guruh (strelkalar bilan ham
 * boshqariladi). `disabled` — faqat ko'rish (tizim roli, huquq yo'q).
 */
export function LevelControl({
  label,
  value,
  levels,
  onChange,
  disabled,
}: {
  label: string
  value: LevelChoice
  levels: readonly LevelChoice[]
  onChange: (lv: LevelChoice) => void
  disabled?: boolean
}) {
  const levelLabel = useLevelLabel()
  const idx = Math.max(0, levels.indexOf(value))
  const onKey = (e: KeyboardEvent) => {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(levels.length - 1, idx + 1)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, idx - 1)
    if (next < 0) return
    e.preventDefault()
    onChange(levels[next])
    const group = e.currentTarget.parentElement
    ;(group?.children[next] as HTMLElement | undefined)?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1">
      {levels.map((lv, i) => {
        const on = lv === value
        const Icon = META[lv].icon
        return (
          <button
            key={lv}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => onChange(lv)}
            onKeyDown={onKey}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-seg px-2.5 text-[12px] font-semibold ring-1 ring-inset transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              'disabled:cursor-not-allowed disabled:opacity-60',
              on ? META[lv].on : 'bg-surface text-fg-subtle ring-line hover:text-fg enabled:hover:bg-surface-2',
            )}
          >
            <Icon size={12} aria-hidden="true" />
            {levelLabel(lv)}
          </button>
        )
      })}
    </div>
  )
}
