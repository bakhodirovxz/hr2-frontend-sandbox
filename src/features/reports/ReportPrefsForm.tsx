import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { reportLabel } from './reportStyles'
import type { PrefDef, ReportPrefs } from './types'

interface Props {
  defs: PrefDef[]
  value: ReportPrefs
  onChange: (next: ReportPrefs) => void
  disabled?: boolean
}

/** Column / layout preferences, grouped the way the definition groups them. */
export function ReportPrefsForm({ defs, value, onChange, disabled }: Props) {
  const { t } = useTranslation()
  const groups = Array.from(new Set(defs.map((d) => d.group)))
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <section key={g} className="rounded-inner border border-line bg-surface p-4">
          <h3 className="mb-3 text-[11.5px] font-semibold text-fg-muted">
            {t(`reports.prefGroup_${g}` as never, { defaultValue: g }) as string}
          </h3>
          <div className="space-y-2.5">
            {defs.filter((d) => d.group === g).map((d) =>
              d.kind === 'bool' ? (
                <div key={d.name}>
                  <Checkbox
                    checked={!!value[d.name]}
                    onChange={(e) => onChange({ ...value, [d.name]: e.target.checked })}
                    label={reportLabel(d.label_key, d.name)}
                    disabled={disabled}
                  />
                </div>
              ) : (
                <Field key={d.name} label={reportLabel(d.label_key, d.name)}>
                  <Select
                    value={String(value[d.name] ?? d.default ?? '')}
                    onChange={(e) => onChange({ ...value, [d.name]: e.target.value })}
                    options={d.choices.map((c) => ({ value: c.value, label: reportLabel(c.label_key, c.value) }))}
                    disabled={disabled}
                  />
                </Field>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
