import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, List as ListIcon, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { DateTimeInput } from '@/components/ui/DateTimeInput'
import { TimeInput } from '@/components/ui/TimeInput'
import { Textarea } from '@/components/ui/Textarea'
import { Checkbox } from '@/components/ui/Checkbox'
import { Segmented } from '@/components/ui/Segmented'
import { Field } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/data/SearchInput'
import { filterChip, filterTile, tabPill } from '@/components/ui/control'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'

/** The tokens in theme.css «FORM CONTROLS: THE ONE PLACE», read live. */
const TOKENS = [
  '--ctl-h-sm', '--ctl-h', '--ctl-h-lg', '--ctl-radius', '--ctl-px', '--ctl-font', '--ctl-border-w', '--ctl-ring-w',
  '--ctl-bg', '--ctl-border', '--ctl-focus', '--pop-radius',
  '--btn-h-sm', '--btn-h', '--btn-h-lg', '--btn-icon', '--btn-radius', '--btn-font',
  '--seg-radius', '--seg-h-sm', '--seg-h', '--icon-btn',
]

/**
 * DIZAYN TIZIMI — every control the app is built from, on one page.
 *
 * All of them draw their look from theme.css (tokens) through
 * components/ui/control.ts, so changing a token there changes every screen;
 * this page is where that change can be seen at once, in both themes.
 * Master admin only (a working tool, not a module).
 */
export function DesignSystemPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [text, setText] = useState('')
  const [sel, setSel] = useState('a')
  const [combo, setCombo] = useState('')
  const [date, setDate] = useState('')
  const [dt, setDt] = useState('')
  const [time, setTime] = useState('')
  const [area, setArea] = useState('')
  const [check, setCheck] = useState(true)
  const [seg, setSeg] = useState('one')
  const [view, setView] = useState('list')
  const [chip, setChip] = useState('all')
  const [search, setSearch] = useState('')
  const [tokens, setTokens] = useState<[string, string][]>([])

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    setTokens(TOKENS.map((k) => [k, cs.getPropertyValue(k).trim()]))
  }, [])

  const opts = [
    { value: 'a', label: t('designSystem.optionA') },
    { value: 'b', label: t('designSystem.optionB') },
    { value: 'c', label: t('designSystem.optionC') },
  ]

  return (
    <RequireRole allowed={roles.isMasterAdmin(user) || roles.isSiteMasterAdmin(user)}>
      <PageContainer>
        <PageHeader title={t('designSystem.title')} subtitle={t('designSystem.subtitle')} />

        <div className="grid gap-ui xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-ui">
            <Card className="p-card">
              <h2 className="mb-3 text-[15px] font-semibold text-fg">{t('designSystem.buttons')}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button leftIcon={<Plus size={16} />}>{t('designSystem.primary')}</Button>
                <Button variant="secondary">{t('designSystem.secondary')}</Button>
                <Button variant="outline">{t('designSystem.outline')}</Button>
                <Button variant="ghost">{t('designSystem.ghost')}</Button>
                <Button variant="danger">{t('designSystem.danger')}</Button>
                <Button variant="danger-ghost">{t('designSystem.dangerGhost')}</Button>
                <Button disabled>{t('designSystem.disabled')}</Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm">{t('designSystem.small')}</Button>
                <Button>{t('designSystem.medium')}</Button>
                <Button size="lg">{t('designSystem.large')}</Button>
                <Button size="icon" variant="outline" aria-label={t('common.edit')}><Pencil size={16} /></Button>
                <IconButton label={t('common.edit')}><Pencil size={16} /></IconButton>
                <IconButton size="sm" label={t('common.delete')}><Trash2 size={14} /></IconButton>
              </div>
            </Card>

            <Card className="p-card">
              <h2 className="mb-3 text-[15px] font-semibold text-fg">{t('designSystem.fields')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('designSystem.input')}>
                  <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('designSystem.placeholder')} />
                </Field>
                <Field label={t('designSystem.inputIcon')}>
                  <Input value={text} onChange={(e) => setText(e.target.value)} leftIcon={<Search size={15} />} placeholder={t('designSystem.placeholder')} />
                </Field>
                <Field label={t('designSystem.invalid')} error={t('designSystem.errorText')}>
                  <Input value="" onChange={() => {}} invalid />
                </Field>
                <Field label={t('designSystem.disabled')}>
                  <Input value={t('designSystem.optionA')} onChange={() => {}} disabled />
                </Field>
                <Field label={t('designSystem.select')}>
                  <Select value={sel} onChange={(e) => setSel(e.target.value)} options={opts} />
                </Field>
                <Field label={t('designSystem.combobox')}>
                  <Combobox value={combo} onChange={setCombo} options={opts} placeholder={t('designSystem.pick')} className="w-full" />
                </Field>
                <Field label={t('designSystem.date')}>
                  <DateInput value={date} onChange={setDate} />
                </Field>
                <Field label={t('designSystem.time')}>
                  <TimeInput value={time} onChange={setTime} />
                </Field>
                <Field label={t('designSystem.dateTime')}>
                  <DateTimeInput value={dt} onChange={setDt} aria-label={t('designSystem.dateTime')} />
                </Field>
                <Field label={t('designSystem.search')}>
                  <SearchInput value={search} onChange={setSearch} />
                </Field>
                <Field label={t('designSystem.textarea')} className="sm:col-span-2">
                  <Textarea rows={3} value={area} onChange={(e) => setArea(e.target.value)} />
                </Field>
                <Checkbox label={t('designSystem.checkbox')} checked={check} onChange={(e) => setCheck(e.target.checked)} />
              </div>
            </Card>

            <Card className="p-card">
              <h2 className="mb-3 text-[15px] font-semibold text-fg">{t('designSystem.switchers')}</h2>
              <div className="flex flex-col gap-3">
                <Segmented value={seg} onChange={setSeg} options={[
                  { value: 'one', label: t('designSystem.optionA'), count: 12 },
                  { value: 'two', label: t('designSystem.optionB'), count: 3 },
                  { value: 'three', label: t('designSystem.optionC') },
                ]} />
                <Segmented size="sm" value={seg} onChange={setSeg} options={[
                  { value: 'one', label: t('designSystem.optionA') },
                  { value: 'two', label: t('designSystem.optionB') },
                ]} />
                <Segmented variant="brand" value={view} onChange={setView} options={[
                  { value: 'list', icon: <ListIcon size={14} />, label: t('designSystem.list') },
                  { value: 'people', icon: <Users size={14} />, label: t('designSystem.people') },
                  { value: 'cal', icon: <CalendarDays size={14} />, label: t('designSystem.calendar') },
                ]} />
                <div className="flex flex-wrap gap-2">
                  {['all', 'a', 'b'].map((k) => (
                    <button key={k} type="button" aria-pressed={chip === k} className={filterChip(chip === k)} onClick={() => setChip(k)}>
                      {k === 'all' ? t('designSystem.all') : k === 'a' ? t('designSystem.optionA') : t('designSystem.optionB')}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {['one', 'two'].map((k) => (
                    <button key={k} type="button" className={tabPill(seg === k)} onClick={() => setSeg(k)}>
                      {k === 'one' ? t('designSystem.optionA') : t('designSystem.optionB')}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['a', 'b', 'c'] as const).map((k, i) => (
                    <button key={k} type="button" aria-pressed={chip === k} className={filterTile(chip === k, 'hover:-translate-y-0.5')} onClick={() => setChip(k)}>
                      <span className="text-[22px] font-bold tabular-nums text-fg">{[24, 7, 3][i]}</span>
                      <span className="text-[12.5px] text-fg-muted">{opts[i].label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['neutral', 'brand', 'success', 'warning', 'danger', 'info'] as const).map((tone) => (
                    <Badge key={tone} tone={tone}>{tone}</Badge>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <Card className="h-fit p-card">
            <h2 className="mb-1 text-[15px] font-semibold text-fg">{t('designSystem.tokens')}</h2>
            <p className="mb-3 text-[12px] text-fg-subtle">{t('designSystem.tokensHint')}</p>
            <dl className="divide-y divide-line/60 font-mono text-[12px]">
              {tokens.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="shrink-0 whitespace-nowrap text-fg-muted">{k}</dt>
                  <dd className="min-w-0 truncate text-right text-fg" title={v}>{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </PageContainer>
    </RequireRole>
  )
}
