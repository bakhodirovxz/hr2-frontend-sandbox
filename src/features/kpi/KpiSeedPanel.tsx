import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RotateCcw, ShieldAlert } from 'lucide-react'
import { Badge, Button, Card, useToast } from '@/components/ui'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import { useKpiSeedMutations, type KpiSeedResult } from './useKpiSeeds'

/** One seeder as the panel renders it. */
interface SeedAction {
  key: string
  label: string
  hint: string
  /** The reset variant is destructive and says so — its own colour and text. */
  danger?: boolean
  confirmTitle: string
  confirmText: string
  run: () => Promise<KpiSeedResult>
  pending: boolean
}

/**
 * STANDART MA'LUMOTLAR — the one-off reference-data seeders, in one place.
 *
 * Web v1 scatters these three buttons across the screens whose catalogue they
 * fill (`KeyResultTypeManager.jsx`, `DoneBonusesPanel.jsx`, `RoleManager.jsx`).
 * That made sense there because each screen was itself administrator-only; here
 * the settings tab is open to HR and KPI admins, so the seeders are collected
 * behind ONE clearly-labelled block instead — a person who may edit indicators
 * should not find a button that rewrites the permission matrix sitting next to
 * the ones they use daily.
 *
 * ⚠️ MASTER-ADMIN ONLY, and deliberately stricter than two of the three
 * routes. The server gates the permission seeder on `_assert_kpi_role_admin`
 * (master admin, nothing else) but the key-result and bonus seeders only on
 * `KpiService._assert_can_manage`, which also lets HR through. The project rule
 * is that KPI role and reference setup belongs to the head admin alone
 * ([[project_kpi_verifix_hpm_full_parity]]), so the whole block follows the
 * strictest of the three gates. Narrowing here is safe: the server still
 * decides, and anyone this hides the block from would have been refused by at
 * least one of the buttons anyway.
 */
export function KpiSeedPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const isMasterAdmin = roles.isSiteMasterAdmin(user)
  const mut = useKpiSeedMutations()
  const [confirm, setConfirm] = useState<SeedAction | null>(null)
  const [running, setRunning] = useState(false)

  // Defence in depth: the settings tab already hides the section, but the
  // component must not be usable if someone mounts it somewhere else.
  if (!isMasterAdmin) return null

  const actions: SeedAction[] = [
    {
      key: 'kr-types',
      label: t('kpi.seedKrTypes'),
      hint: t('kpi.seedKrTypesHint'),
      confirmTitle: t('kpi.seedConfirmTitle'),
      confirmText: t('kpi.seedConfirmText'),
      run: () => mut.seedKrTypes.mutateAsync(),
      pending: mut.seedKrTypes.isPending,
    },
    {
      key: 'bonus-oper-types',
      label: t('kpi.seedBonusOperTypes'),
      hint: t('kpi.seedBonusOperTypesHint'),
      confirmTitle: t('kpi.seedConfirmTitle'),
      confirmText: t('kpi.seedConfirmText'),
      run: () => mut.seedBonusOperTypes.mutateAsync(),
      pending: mut.seedBonusOperTypes.isPending,
    },
    {
      key: 'role-permissions',
      label: t('kpi.seedRolePermissions'),
      hint: t('kpi.seedRolePermissionsHint'),
      confirmTitle: t('kpi.seedConfirmTitle'),
      confirmText: t('kpi.seedConfirmText'),
      run: () => mut.seedRolePermissions.mutateAsync(false),
      pending: mut.seedRolePermissions.isPending,
    },
    {
      key: 'role-permissions-reset',
      label: t('kpi.seedRolePermissionsReset'),
      hint: t('kpi.seedRolePermissionsResetHint'),
      danger: true,
      confirmTitle: t('kpi.seedResetConfirmTitle'),
      confirmText: t('kpi.seedResetConfirmText'),
      run: () => mut.seedRolePermissions.mutateAsync(true),
      pending: mut.seedRolePermissions.isPending,
    },
  ]

  const fire = async (action: SeedAction) => {
    setRunning(true)
    try {
      const res = await action.run()
      // The count comes from the SERVER — it is the only thing that knows how
      // many rows were actually missing. Never guess it from the catalogue
      // length on screen, which is a cache and predates the write.
      const created = Number(res?.created ?? 0)
      if (res?.reset) toast.ok(t('kpi.seedReset'))
      else if (created > 0) toast.ok(t('kpi.seedCreated', { count: created }))
      else toast.ok(t('kpi.seedNothingNew'))
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.saveFailed')))
    } finally {
      setRunning(false)
      setConfirm(null)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <ShieldAlert size={16} className="text-warning" />
        <h3 className="text-sm font-semibold text-fg">{t('kpi.seedsTitle')}</h3>
        <Badge tone="warning">{t('kpi.seedsAdminOnly')}</Badge>
      </div>

      <p className="border-b border-line px-4 py-3 text-[12.5px] leading-relaxed text-fg-muted">
        {t('kpi.seedsHint')}
      </p>

      <ul>
        {actions.map((a) => (
          <li
            key={a.key}
            className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg">{a.label}</span>
              <span className="block text-[12px] leading-relaxed text-fg-subtle">{a.hint}</span>
            </span>
            <Button
              size="sm"
              variant={a.danger ? 'danger' : 'secondary'}
              onClick={() => setConfirm(a)}
              disabled={running || a.pending}
              leftIcon={a.danger ? <RotateCcw size={14} /> : <Download size={14} />}
            >
              {a.label}
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && fire(confirm)}
        title={confirm?.confirmTitle ?? ''}
        description={confirm?.confirmText ?? ''}
        danger={confirm?.danger}
        confirmLabel={confirm?.label}
        loading={running}
      />
    </Card>
  )
}
