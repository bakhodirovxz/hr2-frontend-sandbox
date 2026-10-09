import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Lock, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { errorCode, errorMessage } from '@/api/errorMessage'
import type { ModuleCode, PermissionLevel } from '@/auth/permissions'
import { LevelControl, useLevelLabel, useModuleLabel } from './PermissionLevel'
import { normalizePerms, useRoleMutations, type PermissionMap, type RoleRow } from './useUserAdmin'
import {
  PermissionConflictPanel,
  compactMatrix,
  conflictFromError,
  conflictModules,
  usePermissionValidation,
  type ConflictReport,
  type PermissionFix,
} from './PermissionConflicts'

interface Draft {
  name: string
  code: string
  description: string
  permissions: PermissionMap
}

/**
 * Rol yaratish / tahrirlash (TZ A1) — modul × daraja matritsasi
 * (`none < view < edit < full`). Tizim rolining kodi o'zgarmaydi.
 */
export function RoleModal({
  state,
  modules,
  levels,
  onClose,
}: {
  /** `null` — yopiq; `{role: null}` — yangi rol. */
  state: { role: RoleRow | null } | null
  modules: ModuleCode[]
  levels: PermissionLevel[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const moduleLabel = useModuleLabel()
  const levelLabel = useLevelLabel()
  const { save } = useRoleMutations()
  const role = state?.role ?? null
  const isSystem = !!role?.is_system
  const [d, setD] = useState<Draft>({ name: '', code: '', description: '', permissions: {} })
  const [nameError, setNameError] = useState('')
  /** TZ A2 869: the 409 of the last save — the panel then offers «Baribir saqlash». */
  const [refused, setRefused] = useState<ConflictReport | null>(null)
  const live = usePermissionValidation(d.permissions, { enabled: !!state })
  const report = refused ?? live.report
  const marked = conflictModules(report)

  useEffect(() => {
    if (!state) return
    setNameError('')
    setRefused(null)
    setD({
      name: role?.name ?? '',
      code: role?.code ?? '',
      description: role?.description ?? '',
      permissions: normalizePerms(role?.permissions),
    })
  }, [state, role])

  const setLevel = (m: ModuleCode, lv: PermissionLevel) => {
    setRefused(null)
    setD((x) => {
      const permissions = { ...x.permissions }
      if (lv === 'none') delete permissions[m]
      else permissions[m] = lv
      return { ...x, permissions }
    })
  }
  const setAll = (lv: PermissionLevel) => {
    setRefused(null)
    setD((x) => ({
      ...x,
      permissions: lv === 'none' ? {} : Object.fromEntries(modules.map((m) => [m, lv])),
    }))
  }
  const applyFix = (fix: PermissionFix) => setLevel(fix.module as ModuleCode, fix.level as PermissionLevel)
  const applyAll = () => {
    if (!report) return
    setRefused(null)
    setD((x) => ({ ...x, permissions: compactMatrix(report.resolved_permissions) }))
  }

  const submit = async (e?: FormEvent, force = false) => {
    e?.preventDefault()
    if (!d.name.trim()) return setNameError(t('roleAdmin.errName'))
    const body = {
      name: d.name.trim(),
      description: d.description.trim() || null,
      permissions: d.permissions,
      ...(isSystem ? {} : { code: d.code.trim() || null }),
    }
    try {
      await save.mutateAsync({ id: role?.id, body, force })
      toast.ok(t('common.saved'))
      onClose()
    } catch (err) {
      const conflict = conflictFromError(err)
      if (conflict) {
        setRefused(conflict)
        return
      }
      const msg = errorMessage(err, t('common.actionFailed'))
      if (errorCode(err) === 'role_name_taken') setNameError(msg)
      else toast.error(msg)
    }
  }

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {role ? t('roleAdmin.editTitle') : t('roleAdmin.newRole')}
          {isSystem && (
            <Badge tone="neutral">
              <Lock size={11} aria-hidden="true" /> {t('roleAdmin.systemRole')}
            </Badge>
          )}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Save size={15} />} loading={save.isPending} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('roleAdmin.name')} required error={nameError}>
            <Input
              value={d.name}
              invalid={!!nameError}
              placeholder={t('roleAdmin.namePlaceholder')}
              onChange={(e) => {
                setNameError('')
                setD((x) => ({ ...x, name: e.target.value }))
              }}
            />
          </Field>
          <Field label={t('roleAdmin.code')}>
            <Input
              value={d.code}
              disabled={isSystem}
              className="font-mono"
              placeholder="hr_inspector"
              onChange={(e) =>
                setD((x) => ({ ...x, code: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() }))
              }
            />
          </Field>
        </div>
        <Field label={t('roleAdmin.description')}>
          <Textarea
            rows={2}
            value={d.description}
            onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))}
          />
        </Field>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-fg">{t('roleAdmin.matrixTitle')}</span>
            <div className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
              <span className="mr-1">{t('roleAdmin.setAll')}:</span>
              {levels.map((lv) => (
                <Button key={lv} type="button" size="sm" variant="ghost" onClick={() => setAll(lv)}>
                  {levelLabel(lv)}
                </Button>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <PermissionConflictPanel
              report={report}
              onFix={applyFix}
              onFixAll={applyAll}
              disabled={save.isPending}
              force={refused ? { onForce: () => void submit(undefined, true), pending: save.isPending } : null}
            />
          </div>
          <div className="divide-y divide-line rounded-inner border border-line">
            {modules.map((m) => (
              <div key={m} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-fg sm:w-52">
                  {moduleLabel(m)}
                  {marked.has(m) && (
                    <AlertTriangle size={13} className="text-warning" aria-label={t('permConflict.rowMark')} />
                  )}
                </span>
                <LevelControl
                  label={moduleLabel(m)}
                  levels={levels}
                  value={d.permissions[m] ?? 'none'}
                  onChange={(lv) => setLevel(m, lv as PermissionLevel)}
                />
              </div>
            ))}
          </div>
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}
