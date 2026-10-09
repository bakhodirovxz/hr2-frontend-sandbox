import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import { dmy, formatHm } from './period'
import { rowWorkMinutes, type ManualRow } from './useManualAttendance'

/**
 * Qo'lda kiritilgan kunlar (TZ I2): sana, kun turi, vaqt va hisoblangan soat
 * yoki yo'qlik asosi, izoh va kim kiritgani. Tuzatish oynasida (o'chirish
 * bilan) ham, xodim davomati panelida (faqat ko'rish) ham shu ro'yxat.
 */
export function ManualRecordsList({
  rows,
  onRemove,
  compact = false,
}: {
  rows: ManualRow[]
  onRemove?: (row: ManualRow) => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  if (!rows.length) return null
  return (
    <ul className="divide-y divide-line rounded-inner border border-line">
      {rows.map((r) => {
        const present = r.day_type === 'present'
        const known = ['present', 'day_off', 'sick', 'vacation', 'business_trip', 'absent'].includes(r.day_type ?? '')
        const type = known ? t(`davomat.dt_${r.day_type as 'present'}`) : r.day_type_label || r.day_type || '—'
        return (
          <li key={r.id} className="flex items-start gap-3 px-3 py-2">
            <div className={cn('grid min-w-0 flex-1 gap-x-3 gap-y-0.5', compact ? 'grid-cols-2' : 'sm:grid-cols-[6rem_8rem_1fr]')}>
              <span className="tabular-nums text-[12.5px] text-fg">{dmy(r.work_date)}</span>
              <span className="text-[12.5px] font-medium text-fg">{type}</span>
              <span className="text-[12px] text-fg-muted">
                {present ? (
                  `${r.check_in || '—'}–${r.check_out || '—'} · ${formatHm(rowWorkMinutes(r), t)}`
                ) : r.absence_basis ? (
                  <>
                    {t('davomat.basisLabel')}: <span className="text-fg">{r.absence_basis}</span>
                  </>
                ) : (
                  '—'
                )}
              </span>
              {(r.comment || r.created_by_name) && (
                <span className={cn('truncate text-[11.5px] text-fg-subtle', compact ? 'col-span-2' : 'sm:col-span-3')}>
                  {[r.comment, r.created_by_name].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            {onRemove && (
              <IconButton size="sm" label={t('davomat.removeAction')} onClick={() => onRemove(r)}>
                <Trash2 size={14} />
              </IconButton>
            )}
          </li>
        )
      })}
    </ul>
  )
}
