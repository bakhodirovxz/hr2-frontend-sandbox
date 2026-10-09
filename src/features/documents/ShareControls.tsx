import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { POPOVER_CLS } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { useEmployeeSearch, type GuestEmployeeOption } from '@/features/employees/useEmployeeSearch'

export type ShareScope = 'private' | 'branch' | 'public'

export interface ShareState {
  scope: ShareScope
  groupCanEdit: boolean
  editorIds: number[]
  viewerIds: number[]
  /** Names/photos for ids that came from the server (an existing share), so
   *  the chips read «Ism Familiya» and not «#81077». */
  people?: Record<number, GuestEmployeeOption>
}

export const EMPTY_SHARE: ShareState = {
  scope: 'private',
  groupCanEdit: false,
  editorIds: [],
  viewerIds: [],
}

/**
 * ULASHISH BOSHQARUVI — folders and files share one control because they share
 * one contract (`FolderCreate` / `FolderUpdate` / `FileUpdate` all take
 * `scope`, `group_can_edit`, `editor_ids`, `viewer_ids`).
 *
 * v2 sent none of it: `createFolder` posted `{name}`, `renameFolder` and
 * `renameFile` patched `{name}` alone, and the upload hard-coded
 * `scope: 'private'`. Everything anybody put in the document library was
 * therefore private to whoever uploaded it, with no way to change that
 * afterwards — the module's whole point, sharing, was missing.
 *
 * Two mutually exclusive halves, as in v1:
 *   · private → invite NAMED people, as editors or as viewers;
 *   · branch/public → one status for the whole group (view, or edit+view).
 *
 * ⚠️ Candidates come from `/employees/options`, NOT `/employees`. The roster is
 * deliberately branch-scoped for PII reasons, and a private document must be
 * shareable with anyone in the organisation.
 */
export function ShareControls({
  value,
  onChange,
  disabled,
}: {
  value: ShareState
  onChange: (next: ShareState) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const isPrivate = value.scope === 'private'

  // Switching scope clears whatever the other half held, so the payload never
  // carries members for a branch folder or a group flag for a private one.
  useEffect(() => {
    if (!isPrivate && (value.editorIds.length || value.viewerIds.length)) {
      onChange({ ...value, editorIds: [], viewerIds: [] })
    }
    if (isPrivate && value.groupCanEdit) onChange({ ...value, groupCanEdit: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.scope])

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('documents.shareScope')}>
        <Segmented
          value={value.scope}
          onChange={(v) => onChange({ ...value, scope: v as ShareScope })}
          options={[
            { value: 'private', label: t('documents.scopePrivate') },
            { value: 'branch', label: t('documents.scopeBranch') },
            { value: 'public', label: t('documents.scopePublic') },
          ]}
        />
      </Field>

      {isPrivate ? (
        <>
          <PeoplePicker
            label={t('documents.shareEditors')}
            hint={t('documents.shareEditorsHint')}
            ids={value.editorIds}
            people={value.people}
            onChange={(ids) =>
              onChange({
                ...value,
                editorIds: ids,
                // Nobody is both; the last role picked wins.
                viewerIds: value.viewerIds.filter((x) => !ids.includes(x)),
              })
            }
            disabled={disabled}
          />
          <PeoplePicker
            label={t('documents.shareViewers')}
            hint={t('documents.shareViewersHint')}
            ids={value.viewerIds}
            people={value.people}
            onChange={(ids) =>
              onChange({
                ...value,
                viewerIds: ids,
                editorIds: value.editorIds.filter((x) => !ids.includes(x)),
              })
            }
            disabled={disabled}
          />
        </>
      ) : (
        <Checkbox
          checked={value.groupCanEdit}
          onChange={(e) => onChange({ ...value, groupCanEdit: e.target.checked })}
          label={t('documents.groupCanEdit')}
          disabled={disabled}
        />
      )}
    </div>
  )
}

/** Search-and-add list of employees, kept as bare ids. */
function PeoplePicker({
  label,
  hint,
  ids,
  people,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  ids: number[]
  people?: Record<number, GuestEmployeeOption>
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const { employees } = useEmployeeSearch(null, !disabled && q.trim().length > 0, q)

  // Names for already-picked ids: the search only knows what it just fetched,
  // so remember each pick rather than re-querying id by id. Ids that arrived
  // with the row (an existing share) come with their names in `people`.
  const [known, setKnown] = useState<Record<number, GuestEmployeeOption>>(() => ({ ...(people ?? {}) }))
  const add = (emp: GuestEmployeeOption) => {
    setKnown((k) => ({ ...k, [emp.id]: emp }))
    if (!ids.includes(emp.id)) onChange([...ids, emp.id])
    setQ('')
  }

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {ids.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {ids.map((id) => (
              <li
                key={id}
                className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 py-1 pl-1 pr-2 text-[12.5px] text-fg"
              >
                <Avatar src={known[id]?.photo_path} name={known[id]?.legal_name ?? ''} size={20} />
                <span className="max-w-[14rem] truncate">
                  {known[id]?.legal_name ?? `#${id}`}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    onClick={() => onChange(ids.filter((x) => x !== id))}
                    className="text-fg-subtle hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="relative">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('common.search')}
            disabled={disabled}
          />
          {q.trim() && employees.length > 0 && (
            <div className={cn(POPOVER_CLS, 'absolute z-30 mt-1 max-h-52 w-full overflow-auto')}>
              {employees
                .filter((emp) => !ids.includes(emp.id))
                .map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => add(emp)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <Avatar src={emp.photo_path} name={emp.legal_name ?? ''} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fg">{emp.legal_name}</span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {[emp.job_position_name, emp.organization_name].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </Field>
  )
}
