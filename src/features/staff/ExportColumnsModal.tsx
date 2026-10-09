import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { useServerText } from '@/features/statistics/serverText'
import { useStaffExportColumns } from './useStaffPositions'

/**
 * «Настройки экспорта» (TZ 4.2.10) — which columns the Excel export carries.
 *
 * WHY the list is fetched instead of hard-coded: it must stay identical to
 * `StaffPositionService.EXPORT_COLUMNS`. A column renamed on the server would
 * otherwise leave the picker offering a key the export no longer understands,
 * and the resulting file would quietly lose that column with no error anywhere.
 *
 * WHY an empty selection means "all": that is exactly how the endpoint reads a
 * missing `columns` parameter, so the dialog does not have to enumerate every
 * key just to express the default — and a user who unticks everything gets the
 * full export rather than an empty one.
 */
export function ExportColumnsModal({
  open, onClose, selected, onApply,
}: {
  open: boolean
  onClose: () => void
  selected: string[]
  onApply: (keys: string[]) => void
}) {
  const { t } = useTranslation()
  const st = useServerText()
  const { data: columns = [], isLoading } = useStaffExportColumns(open)
  const [draft, setDraft] = useState<string[]>(selected)

  // Re-seed each time the dialog opens so a cancelled edit does not linger.
  useEffect(() => {
    if (open) setDraft(selected)
  }, [open, selected])

  const toggle = (key: string) =>
    setDraft((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('staff.exportColumns')}
      size="sm"
      footer={
        <div className="flex w-full items-center gap-2">
          <Button variant="ghost" onClick={() => setDraft([])}>{t('staff.exportColumnsAll')}</Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button onClick={() => { onApply(draft); onClose() }}>{t('common.save')}</Button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-fg-muted">{t('staff.exportColumnsHint')}</p>
      {isLoading ? (
        <p className="text-sm text-fg-muted">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {columns.map((c) => (
            <Checkbox
              key={c.key}
              checked={draft.includes(c.key)}
              onChange={() => toggle(c.key)}
              label={st(c.label)}
            />
          ))}
        </div>
      )}
    </Modal>
  )
}
