import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Save, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { LoadError } from '@/components/data/LoadError'
import { TD_COMPACT as TD, TH } from '@/components/data/tableStyles'
import { errorMessage } from '@/api/errorMessage'
import type { ModuleCode, PermissionLevel } from '@/auth/permissions'
import { LevelChip, LevelControl, useModuleLabel, type LevelChoice } from './PermissionLevel'
import {
  normalizePerms,
  useUserDetail,
  useUserMutations,
  useUserSearch,
  type PermissionMap,
  type RoleRow,
} from './useUserAdmin'

/**
 * «Foydalanuvchi ruxsatlari» (TZ A2): tanlangan foydalanuvchining roldan
 * meros darajalari va unga ALOHIDA belgilangan shaxsiy darajalar
 * (`PATCH /users/{id} {permissions}`). Shaxsiy daraja rol darajasi o'rnini
 * bosadi — oshiradi ham, pasaytiradi ham. Tanlangan foydalanuvchi URL'da
 * (`?user=`) turadi.
 */
export function UserPermissionsPanel({
  userId,
  onPick,
  roles,
  modules,
  levels,
  canEdit,
  meId,
}: {
  userId: number | null
  onPick: (id: string) => void
  roles: RoleRow[]
  modules: ModuleCode[]
  levels: PermissionLevel[]
  canEdit: boolean
  meId?: number
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const moduleLabel = useModuleLabel()
  const [term, setTerm] = useState('')
  const found = useUserSearch(term)
  const detail = useUserDetail(userId)
  const user = detail.data ?? null
  const { setPermissions } = useUserMutations()

  const original = useMemo(() => normalizePerms(user?.permissions), [user])
  const [extra, setExtra] = useState<PermissionMap>({})
  useEffect(() => setExtra(original), [original])

  /*
   * «Roldan» ustuni — shaxsiy darajasiz nima olishi: rol + backend qo'shadigan
   * bo'lim boshlig'i / filial rahbari grantlari (`effective_permissions`
   * dan shaxsiy darajalar chiqarilgan holda).
   */
  const inherited = useMemo(() => {
    const role = user?.role?.id ? roles.find((r) => r.id === user.role?.id) : undefined
    const base = normalizePerms(role?.permissions)
    const eff = normalizePerms(user?.effective_permissions)
    for (const m of Object.keys(eff) as ModuleCode[]) if (!(m in original)) base[m] = eff[m]
    return base
  }, [user, roles, original])

  const dirty = JSON.stringify(sortKeys(original)) !== JSON.stringify(sortKeys(extra))
  const isSelf = !!user && user.id === meId
  const editable = canEdit && !isSelf

  const options = useMemo(() => {
    const rows = found.data?.items ?? []
    const opts = rows.map((u) => ({
      value: String(u.id),
      label: u.full_name || u.username,
      subLabel: [u.username, u.role?.name].filter(Boolean).join(' · '),
    }))
    if (user && !opts.some((o) => o.value === String(user.id))) {
      opts.unshift({
        value: String(user.id),
        label: user.full_name || user.username,
        subLabel: [user.username, user.role?.name].filter(Boolean).join(' · '),
      })
    }
    return opts
  }, [found.data, user])

  const save = async () => {
    if (!user) return
    try {
      await setPermissions.mutateAsync({ id: user.id, permissions: extra })
      toast.ok(t('common.saved'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  const choices: LevelChoice[] = ['inherit', ...levels]

  return (
    <div className="grid gap-4">
      <Field label={t('roleAdmin.pickUser')} className="max-w-md">
        <Combobox
          value={userId ? String(userId) : ''}
          onChange={onPick}
          options={options}
          onSearchChange={setTerm}
          loading={found.isFetching}
          placeholder={t('roleAdmin.pickUserSearch')}
          searchPlaceholder={t('roleAdmin.pickUserSearch')}
        />
      </Field>

      {!userId ? (
        <Card className="p-10">
          <EmptyState icon={<UserCog size={24} />} title={t('roleAdmin.pickUserEmpty')} />
        </Card>
      ) : detail.error ? (
        <Card className="p-6">
          <LoadError error={detail.error} onRetry={detail.refetch} />
        </Card>
      ) : !user ? (
        <Card className="p-10 text-center text-sm text-fg-muted">{t('common.loading')}</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <UserCog size={18} className="text-brand" aria-hidden="true" />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold text-fg">{user.full_name || user.username}</p>
              <p className="m-0 truncate text-xs text-fg-muted">
                {user.username} · {t('userAdmin.role')}: {user.role?.name || t('userAdmin.noRole')}
              </p>
            </div>
            {editable && (
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<RotateCcw size={14} />}
                  disabled={!Object.keys(extra).length}
                  onClick={() => setExtra({})}
                >
                  {t('roleAdmin.clearOverrides')}
                </Button>
                <Button
                  size="sm"
                  leftIcon={<Save size={14} />}
                  disabled={!dirty}
                  loading={setPermissions.isPending}
                  onClick={() => void save()}
                >
                  {t('common.save')}
                </Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">{t('roleAdmin.tabUsers')}</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} text-left`}>{t('roleAdmin.module')}</th>
                  <th scope="col" className={`${TH} text-left`}>{t('roleAdmin.lv_inherit')}</th>
                  <th scope="col" className={`${TH} text-left`}>{t('roleAdmin.ownLevel')}</th>
                  <th scope="col" className={`${TH} text-left`}>{t('roleAdmin.effective')}</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const inh = inherited[m] ?? 'none'
                  const own: LevelChoice = extra[m] ?? 'inherit'
                  return (
                    <tr key={m} className="border-t border-line">
                      <td className={TD}>{moduleLabel(m)}</td>
                      <td className={TD}>
                        <LevelChip level={inh} />
                      </td>
                      <td className={TD}>
                        <LevelControl
                          label={moduleLabel(m)}
                          levels={choices}
                          value={own}
                          disabled={!editable}
                          onChange={(lv) =>
                            setExtra((x) => {
                              const next = { ...x }
                              if (lv === 'inherit') delete next[m]
                              else next[m] = lv
                              return next
                            })
                          }
                        />
                      </td>
                      <td className={TD}>
                        <LevelChip level={own === 'inherit' ? inh : own} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="m-0 border-t border-line px-4 py-2.5 text-xs text-fg-muted">
            {isSelf ? t('roleAdmin.selfHint') : t('roleAdmin.overrideHint')}
          </p>
        </Card>
      )}
    </div>
  )
}

function sortKeys(p: PermissionMap): [string, string | undefined][] {
  return Object.entries(p).sort(([a], [b]) => a.localeCompare(b))
}
