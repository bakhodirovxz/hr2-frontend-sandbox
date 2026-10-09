import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { TimeInput } from '@/components/ui/TimeInput'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { apiGet } from '@/api/http'
import { SETTINGS } from '@/features/settings/useSystemSettings'
import { Combobox } from '@/components/ui/Combobox'
import { useBranchStore } from '@/store/branchStore'
import { cn } from '@/lib/cn'
import { MultiPicker } from '@/features/reports/MultiPicker'
import { MODULES, type NavModuleOverrides } from '@/components/layout/navConfig'
import type { RoleKey } from '@/auth/roles'
import { useSystemSettings, useSystemSettingsMutation, type SettingSpec } from './useSystemSettings'

/**
 * The master admin's one window over the whole system.
 *
 * Two halves, because the questions are different: WHO SEES WHAT (the module
 * matrix) and WHAT THE NUMBERS ARE (the values form). Both write to the same
 * `/system-settings` endpoint, and both render themselves from data — the
 * matrix from the module catalogue, the form from the server's own schema —
 * so a new module or a new setting shows up here with no work in this file.
 */

/** Roles shown as matrix columns, in the order the sidebar cares about. */
const ROLE_COLUMNS: RoleKey[] = [
  'masterAdmin',
  'ministr',
  'deputy',
  'hr',
  'chancellery',
  'accounting',
  'monitoring',
  'kpp',
  'employee',
  'guest',
]

/**
 * `only` lets the settings screen place each half in its own section instead of
 * stacking both behind a tab strip. Without it the module matrix — 43 rows by
 * 13 roles — was the first thing the page showed, and the ordinary values sat
 * hidden behind a tab nobody pressed.
 */

/**
 * Chrome-less stand-in for <Card>.
 *
 * ⚠️ MUST live at module scope. It used to be an arrow function created inside
 * the panel's render, which gives React a NEW component type on every render:
 * React then unmounted and remounted this whole subtree per keystroke, so the
 * focused settings input was destroyed after each character and typing "0745"
 * left a single digit behind.
 */
function Bare({ children }: { children: React.ReactNode; className?: string }) {
  return <>{children}</>
}

export function SystemSettingsPanel({
  only,
  group,
  chrome = true,
}: {
  only?: 'modules' | 'values'
  /** Render just one value group (`attendance`, `security`, `modules`). */
  group?: string
  /** false → no card/heading; the section around it provides them. */
  chrome?: boolean
} = {}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { values, schema, loading } = useSystemSettings()
  const mut = useSystemSettingsMutation()
  const [tab, setTab] = useState(only ?? 'modules')

  /* ── Module matrix ─────────────────────────────────────────────────── */
  const saved = (values['nav.modules'] ?? {}) as NavModuleOverrides
  const [draft, setDraft] = useState<NavModuleOverrides>({})
  /* "Reset" is an INTENT to write an empty matrix, not merely a cleared
   * draft. Measured (2026-09-11 audit): `resetModules` only did `setDraft({})`
   * while `saveModules` merged the draft onto the freshly re-read server
   * matrix — so Reset + Save persisted the server matrix untouched, and the
   * only way to REMOVE a module override was gone. */
  const [resetRequested, setResetRequested] = useState(false)
  useEffect(() => setDraft(saved as NavModuleOverrides), [values])

  const effective = (key: string) => {
    const def = MODULES.find((m) => m.key === key)!
    const cfg = draft[key]
    return {
      enabled: cfg?.enabled ?? true,
      roles: (cfg?.roles ?? def.defaultRoles) as string[],
      // Empty = every branch. Stored that way so a fresh install carries no
      // branch list at all and behaves exactly as the built-in defaults do.
      branches: (cfg?.branches ?? []) as number[],
    }
  }

  const toggleRole = (key: string, role: RoleKey) => {
    const cur = effective(key)
    const roles = cur.roles.includes(role)
      ? cur.roles.filter((r) => r !== role)
      : [...cur.roles, role]
    setDraft((d) => ({ ...d, [key]: { ...cur, roles } }))
  }

  const toggleModule = (key: string) => {
    const cur = effective(key)
    setDraft((d) => ({ ...d, [key]: { ...cur, enabled: !cur.enabled } }))
  }

  const toggleBranch = (key: string, branchId: number) => {
    const cur = effective(key)
    const list = cur.branches.includes(branchId)
      ? cur.branches.filter((b) => b !== branchId)
      : [...cur.branches, branchId]
    setDraft((d) => ({ ...d, [key]: { ...cur, branches: list } }))
  }

  const resetModules = () => {
    setDraft({})
    setResetRequested(true)
  }

  /*
   * ⚠️ THIS IS A WHOLE-OBJECT WRITE, and `nav.modules` is a single setting: the
   * PATCH replaces the entire module × role × branch matrix. Two administrators
   * with this screen open therefore clobber each other silently — the second
   * save discards not one row but EVERY change the first made, with no
   * conflict and no diff. Nothing else in the app writes this way; employee
   * cards and documents send only the fields they changed.
   *
   * So: re-read the stored matrix immediately before writing and merge this
   * draft onto it, module by module. Concurrent edits to DIFFERENT modules now
   * both survive; two people editing the SAME module still last-write-wins,
   * which is the same granularity the rest of the product has.
   */
  const saveModules = async () => {
    let base = saved
    try {
      const fresh = await apiGet<{ values?: Record<string, unknown> }>(SETTINGS)
      const v = fresh?.values?.['nav.modules']
      if (v && typeof v === 'object') base = v as NavModuleOverrides
    } catch {
      // Could not re-read — fall back to what this screen loaded rather than
      // refusing to save at all.
    }
    // A requested reset writes the EMPTY matrix (every module back to its
    // default reach); the merge below is for ordinary edits only.
    const next = resetRequested ? { ...draft } : { ...base, ...draft }
    mut.mutate(
      { 'nav.modules': next },
      {
        onSuccess: () => {
          setResetRequested(false)
          toast.ok(t('sysSettings.saved'))
        },
        onError: (e) => toast.error(errorMessage(e, t('common.actionFailed'))),
      },
    )
  }

  /* ── Values form ───────────────────────────────────────────────────── */
  const groups = useMemo(() => {
    const byGroup = new Map<string, SettingSpec[]>()
    for (const s of schema) {
      if (s.kind === 'object') continue // module matrix has its own tab
      const list = byGroup.get(s.group) ?? []
      list.push(s)
      byGroup.set(s.group, list)
    }
    const all = [...byGroup.entries()]
    // One group per section when the page asks for it.
    return group ? all.filter(([g]) => g === group) : all
  }, [schema, group])

  const branches = useBranchStore((st) => st.branches)
  const [nums, setNums] = useState<Record<string, string>>({})
  /** `branches` settings hold a LIST of branch ids, so they get their own state. */
  const [branchSets, setBranchSets] = useState<Record<string, number[]>>({})
  useEffect(() => {
    const seed: Record<string, string> = {}
    const seedB: Record<string, number[]> = {}
    for (const s of schema) {
      if (s.kind === 'object') continue
      if (s.kind === 'branches') seedB[s.key] = Array.isArray(values[s.key]) ? (values[s.key] as number[]) : []
      else seed[s.key] = String(values[s.key] ?? '')
    }
    setNums(seed)
    setBranchSets(seedB)
  }, [values, schema])

  const saveValues = () => {
    const patch: Record<string, unknown> = {}
    for (const s of schema) {
      if (s.kind === 'object') continue
      if (s.kind === 'branches') {
        patch[s.key] = branchSets[s.key] ?? []
        continue
      }
      const raw = nums[s.key]
      if (raw === undefined || raw === '') continue
      // Bool settings are kept as the strings 'true'/'false' in the same
      // text map — the server's `coerce` wants a real boolean back.
      patch[s.key] = s.kind === 'int' ? Number(raw) : s.kind === 'bool' ? raw === 'true' : raw
    }
    mut.mutate(patch, {
      onSuccess: () => toast.ok(t('sysSettings.saved')),
      onError: (e) => toast.error(errorMessage(e, t('common.actionFailed'))),
    })
  }

  if (loading) return null

  // Without chrome the section supplies the frame, so the card border would
  // just draw a box inside a box. `Bare` is defined at MODULE scope on purpose
  // — see the note there.
  const Frame = chrome ? Card : Bare
  return (
    <Frame className="lg:col-span-2">
      {chrome && <CardHeader title={t('sysSettings.title')} icon={<SlidersHorizontal size={16} />} />}
      <CardBody className="flex flex-col gap-4">
        {chrome && <p className="text-[13px] text-fg-muted">{t('sysSettings.hint')}</p>}

        {!only && (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'modules', label: t('sysSettings.tabModules') },
              { value: 'values', label: t('sysSettings.tabValues') },
            ]}
          />
        )}

        {tab === 'modules' ? (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full border-collapse text-left" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="border-b border-line text-[11.5px] text-fg-muted">
                    <th className="py-2.5 pr-3">{t('sysSettings.colModule')}</th>
                    <th className="w-16 py-2.5 text-center">{t('sysSettings.colOn')}</th>
                    <th className="w-[150px] py-2.5">{t('sysSettings.colBranches')}</th>
                    {ROLE_COLUMNS.map((r) => (
                      <th key={r} className="w-[74px] py-2.5 text-center font-semibold">
                        {t(`roles.${r}` as never)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => {
                    const cur = effective(m.key)
                    return (
                      <tr key={m.key} className="border-b border-line last:border-0">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-2 text-[13px] text-fg">
                            <m.icon size={14} className="shrink-0 text-fg-subtle" />
                            {t(`nav.${m.labelKey}` as never)}
                          </span>
                          <span className="text-[11px] text-fg-subtle">{m.path}</span>
                        </td>
                        <td className="py-2 text-center">
                          <Checkbox
                            checked={cur.enabled}
                            onChange={() => toggleModule(m.key)}
                            srLabel={t('sysSettings.colOn')}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <BranchPicker
                            selected={cur.branches}
                            disabled={!cur.enabled}
                            label={t(`nav.${m.labelKey}` as never)}
                            onToggle={(b) => toggleBranch(m.key, b)}
                          />
                        </td>
                        {ROLE_COLUMNS.map((r) => (
                          <td key={r} className="py-2 text-center">
                            <Checkbox
                              checked={cur.roles.includes(r)}
                              disabled={!cur.enabled}
                              onChange={() => toggleRole(m.key, r)}
                              srLabel={`${t(`nav.${m.labelKey}` as never)} — ${t(`roles.${r}` as never)}`}
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveModules} loading={mut.isPending} leftIcon={<LayoutGrid size={15} />}>
                {t('common.save')}
              </Button>
              <Button variant="ghost" onClick={resetModules} disabled={mut.isPending}>
                {t('sysSettings.reset')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map(([group, list]) => (
                <div key={group} className="rounded-inner border border-line p-3">
                  <p className="mb-2 text-[11.5px] font-semibold text-fg-subtle">
                    {t(`sysSettings.group_${group}` as never)}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {list.map((s) =>
                      s.kind === 'enum' ? (
                        <label key={s.key} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 flex-1 text-[13px] text-fg">
                            {t(`sysSettings.key_${s.key.replace(/\./g, '_')}` as never)}
                          </span>
                          <span className="w-44 shrink-0">
                            <Combobox
                              value={nums[s.key] ?? ''}
                              onChange={(v) => setNums((n) => ({ ...n, [s.key]: v }))}
                              clearable={false}
                              options={(s.options ?? []).map((o) => ({
                                value: o,
                                label: t(`sysSettings.opt_${s.key.replace(/\./g, '_')}_${o}` as never),
                              }))}
                            />
                          </span>
                        </label>
                      ) : s.kind === 'bool' ? (
                        // A switch, not a number box. The Checkbox draws its
                        // own <label>, so it must not sit inside the generic
                        // <label> row below (nested labels are invalid HTML).
                        <div key={s.key} className="flex items-center justify-between gap-3">
                          <Checkbox
                            label={t(`sysSettings.key_${s.key.replace(/\./g, '_')}` as never)}
                            checked={nums[s.key] === 'true'}
                            onChange={(e) => setNums((n) => ({ ...n, [s.key]: e.target.checked ? 'true' : 'false' }))}
                          />
                        </div>
                      ) : s.kind === 'branches' ? (
                        <div key={s.key} className="flex flex-col gap-1.5">
                          <span className="text-[13px] text-fg">
                            {t(`sysSettings.key_${s.key.replace(/\./g, '_')}` as never)}
                          </span>
                          <span className="text-[11px] text-fg-subtle">{t('sysSettings.branchesHint')}</span>
                          {/* A searchable multi-picker, not a cloud of 30 chips
                              in a 160px scroll box that cut the third row in
                              half and hid which branches were already on. */}
                          <MultiPicker
                            value={branchSets[s.key] ?? []}
                            onChange={(next) => setBranchSets((prev) => ({ ...prev, [s.key]: next.map(Number) }))}
                            options={branches.map((b) => ({ value: b.id, label: b.name ?? `#${b.id}` }))}
                            placeholder={t('sysSettings.allBranchesOpen')}
                          />
                        </div>
                      ) : (
                      <label key={s.key} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-fg">
                            {t(`sysSettings.key_${s.key.replace(/\./g, '_')}` as never)}
                          </span>
                          {s.min != null && s.max != null && (
                            <span className="text-[11px] text-fg-subtle">
                              {s.min}–{s.max}
                            </span>
                          )}
                        </span>
                        {s.kind === 'time' ? (
                          // ⚠️ NOT <input type="time">. That control renders in
                          // the BROWSER's locale, so a machine set to en-US drew
                          // "09:00 AM" here — and neither `lang` nor `step` on
                          // the input changes it; it was tried and it did not
                          // take. TimeInput is a masked text field, so these
                          // settings read 24h on every machine.
                          <TimeInput
                            value={nums[s.key] ?? ''}
                            onChange={(v) => setNums((n) => ({ ...n, [s.key]: v }))}
                            className="w-24 shrink-0"
                          />
                        ) : (
                          <Input
                            type="number"
                            value={nums[s.key] ?? ''}
                            onChange={(e) => setNums((n) => ({ ...n, [s.key]: e.target.value }))}
                            min={s.min ?? undefined}
                            max={s.max ?? undefined}
                            wrapperClassName="w-24 shrink-0"
                          />
                        )}
                      </label>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Button onClick={saveValues} loading={mut.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Frame>
  )
}


/**
 * WHICH BRANCHES a module is switched on for.
 *
 * Nothing selected means "everywhere", which is what an untouched install has —
 * so the control says «Barcha filiallar» rather than showing an empty list that
 * reads like "nowhere". Kept as a small popover instead of a column per branch:
 * there are dozens of branches and 47 modules, and that grid would be unusable.
 */
function BranchPicker({
  selected,
  disabled,
  label,
  onToggle,
}: {
  selected: number[]
  disabled?: boolean
  label: string
  onToggle: (branchId: number) => void
}) {
  const { t } = useTranslation()
  const branches = useBranchStore((st) => st.branches)
  const [open, setOpen] = useState(false)

  const summary =
    selected.length === 0
      ? t('sysSettings.allBranches')
      : t('sysSettings.someBranches', { count: selected.length })

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'w-full truncate rounded-control border border-line bg-surface px-2 py-1 text-left text-[12px] transition-colors',
          disabled ? 'opacity-45' : 'hover:border-brand/50',
          selected.length > 0 ? 'text-brand-strong' : 'text-fg-muted',
        )}
      >
        {summary}
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="scroll-thin absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-card border border-line bg-surface p-2 shadow-lg">
            <button
              type="button"
              onClick={() => selected.forEach(onToggle)}
              className="mb-1 w-full rounded-inner px-2 py-1 text-left text-[12px] font-medium text-fg-muted hover:bg-surface-2"
            >
              {t('sysSettings.allBranches')}
            </button>
            {branches.map((b) => (
              <label
                key={b.id}
                className="flex cursor-pointer items-center gap-2 rounded-inner px-2 py-1 text-[12.5px] hover:bg-surface-2"
              >
                <Checkbox
                  checked={selected.includes(b.id)}
                  onChange={() => onToggle(b.id)}
                  srLabel={`${label} — ${b.name ?? b.id}`}
                />
                <span className="truncate text-fg">{b.name ?? `#${b.id}`}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
