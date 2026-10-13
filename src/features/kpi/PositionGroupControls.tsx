import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { FormError } from '@/components/ui/FormError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { MultiPicker } from '@/features/reports/MultiPicker'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { ADMIN_SUPPORT, useKpiSettings, usePositionGroups } from './extApi'

/** The dictionary names of the position categories (Russian when the UI is). */
function useCategoryOptions(enabled = true) {
  const { i18n } = useTranslation()
  const { options } = useDictionaryOptions(enabled ? 'position_categories' : null)
  return options.map((c) => ({ value: c.code, label: i18n.language === 'ru' && c.name_ru ? c.name_ru : c.name }))
}

/**
 * TZ 4.2.8 · 426 «Модуль административного/вспомогательного персонала»:
 * the `position_group` filter of the KPI lists, exports and reports. The
 * only group is `admin_support`; its tooltip names the position categories
 * behind it (the master admin's setting).
 */
export function PositionGroupFilter({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { t } = useTranslation()
  const groups = usePositionGroups()
  const cats = useCategoryOptions(groups.length > 0)
  const options = (groups.length ? groups : [{ code: ADMIN_SUPPORT, label: '', categories: [] as string[] }]).map((g) => {
    const names = g.categories.map((c) => cats.find((o) => o.value === c)?.label ?? c)
    return {
      value: g.code,
      label: g.code === ADMIN_SUPPORT ? t('kpiExt.adminSupport') : g.label,
      subLabel: names.length ? names.join(', ') : undefined,
    }
  })
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={t('kpiExt.allStaff')}
      className={cn('w-full lg:w-60', className)}
    />
  )
}

/**
 * The master admin's setting `kpi.admin_support_categories` — which
 * position categories (`position_categories` dictionary) make the admin /
 * support staff group.
 */
export function AdminSupportSettingsCard() {
  const { t } = useTranslation()
  const toast = useToast()
  const { settings, loading, error, save } = useKpiSettings(true)
  const options = useCategoryOptions()
  const [value, setValue] = useState<string[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (settings) setValue(settings.admin_support_categories ?? [])
  }, [settings])

  const dirty = !!settings && [...value].sort().join('|') !== [...(settings.admin_support_categories ?? [])].sort().join('|')

  const submit = async () => {
    setErr('')
    try {
      await save.mutateAsync({ admin_support_categories: value })
      toast.ok(t('kpiExt.settingsSaved'))
    } catch (e) {
      setErr(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <UsersRound size={17} className="text-brand" aria-hidden />
        <h3 className="text-[14px] font-semibold text-fg">{t('kpiExt.adminSupportSettings')}</h3>
      </div>
      <p className="text-[12.5px] text-fg-muted">{t('kpiExt.adminSupportSettingsHint')}</p>
      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : error ? (
        <FormError className="text-xs">{errorMessage(error, t('list.loadFailed'))}</FormError>
      ) : (
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <MultiPicker
              value={value}
              onChange={(v) => setValue(v.map(String))}
              options={options}
              placeholder={options.length ? t('kpi.pickCategories') : t('kpi.dictionaryEmpty')}
            />
          </div>
          <Button leftIcon={<Save size={14} />} loading={save.isPending} disabled={!dirty} onClick={submit}>
            {t('common.save')}
          </Button>
        </div>
      )}
      <FormError className="text-xs">{err}</FormError>
    </Card>
  )
}
