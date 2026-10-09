import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Wand2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useBranchStore } from '@/store/branchStore'
import { useNamingRule, useNamingRuleMutations, type RenamePreview } from './useNamingRule'
import { Checkbox } from '@/components/ui/Checkbox'

/**
 * «Массовое переформирование наименований должностей» (TZ 4.2.6).
 *
 * Two separate things live here on purpose, exactly as in v1:
 *  1. the RULE — templates for the full and short name, plus whether it is
 *     applied automatically to positions created or edited later;
 *  2. the BULK RENAME — applying that rule to the positions that already exist.
 *
 * The rename is always PREVIEWED first. It rewrites every position name in the
 * branch in one step and there is no undo in the UI, so the TZ requires the
 * result to be shown before anything is written; the apply button stays
 * disabled until a preview has actually returned rows.
 */
export function NamingRuleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { data: rule, isLoading } = useNamingRule(branchId, open)
  const { save, preview, apply } = useNamingRuleMutations()

  const [full, setFull] = useState('')
  const [short, setShort] = useState('')
  const [auto, setAuto] = useState(false)
  const [result, setResult] = useState<RenamePreview | null>(null)

  // Seed once per opened dialog so a background refetch cannot overwrite an
  // edit in progress.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (!open) { setSeeded(false); setResult(null); return }
    if (seeded || !rule) return
    setFull(rule.full_template ?? '')
    setShort(rule.short_template ?? '')
    setAuto(!!rule.auto_apply)
    setSeeded(true)
  }, [open, rule, seeded])

  const doSave = async () => {
    try {
      await save.mutateAsync({ full_template: full, short_template: short, auto_apply: auto })
      toast.ok(t('structure.namingSaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('structure.namingSaveError')))
    }
  }

  const doPreview = async () => {
    try {
      // Save first: the preview is computed from the STORED rule, so previewing
      // an unsaved template would show the old result and look like a bug.
      await save.mutateAsync({ full_template: full, short_template: short, auto_apply: auto })
      setResult(await preview.mutateAsync(null))
    } catch (e) {
      toast.error(errorMessage(e, t('structure.namingSaveError')))
    }
  }

  const doApply = async () => {
    if (!(await confirm({ kind: 'action', description: t('structure.namingApplyConfirm') }))) return
    try {
      const res = await apply.mutateAsync(null)
      toast.ok(t('structure.namingApplied', { count: res?.total ?? 0 }))
      setResult(null)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, t('structure.namingApplyError')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('structure.namingTitle')}
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            variant="ghost"
            leftIcon={<Eye size={14} />}
            loading={preview.isPending || save.isPending}
            onClick={doPreview}
          >
            {t('structure.namingPreview')}
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="secondary" onClick={doSave} disabled={save.isPending}>
            {t('common.save')}
          </Button>
          <Button
            leftIcon={<Wand2 size={14} />}
            disabled={!result?.total || apply.isPending}
            onClick={doApply}
          >
            {t('structure.namingApply')}
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <p className="text-sm text-fg-muted">{t('common.loading')}</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">{t('structure.namingHint')}</p>

          <Field label={t('structure.namingFull')}>
            <Input value={full} onChange={(e) => setFull(e.target.value)} />
          </Field>
          <Field label={t('structure.namingShort')}>
            <Input value={short} onChange={(e) => setShort(e.target.value)} />
          </Field>

          <Field label={t('structure.namingTokens')}>
            <div className="flex flex-wrap gap-1.5">
              {(rule?.tokens ?? []).map((tok) => (
                <button
                  key={tok.token}
                  type="button"
                  title={tok.label}
                  className="rounded-tag bg-surface-2 px-2 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
                  onClick={() => setFull((p) => `${p}${tok.token}`)}
                >
                  {tok.token}
                </button>
              ))}
            </div>
          </Field>

          <Checkbox className="mt-2" label={t('structure.namingAuto')} checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <p className="mb-3 ml-6 text-xs text-fg-subtle">
            {auto ? t('structure.namingAutoOn') : t('structure.namingAutoOff')}
          </p>

          {result && (
            <div className="rounded-md border border-warning/35 bg-warning/10 p-3">
              <p className="mb-2 text-xs font-semibold text-warning">
                {result.total > 0
                  ? t('structure.namingWillChange', { count: result.total })
                  : t('structure.namingPreviewEmpty')}
              </p>
              <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
                {(result.changes ?? []).map((c) => (
                  <div key={c.id} className="text-xs text-fg-muted">
                    <span className="text-fg-subtle">{c.old_name}</span>
                    {' → '}
                    <span className="text-fg">{c.new_name}</span>
                    {!!c.new_short_name && <span className="text-accent"> ({c.new_short_name})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
