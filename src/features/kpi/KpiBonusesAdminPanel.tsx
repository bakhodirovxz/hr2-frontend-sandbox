import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Gift, Plus, RotateCcw, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import { Button, EmptyState, Input, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { errorMessage } from '@/api/errorMessage'
import { Combobox } from '@/components/ui/Combobox'
import { useConfirm } from '@/components/data/useConfirm'
import { cn } from '@/lib/cn'
import { useBonusAdminMutations, useBonusOperTypes, useDoneBonuses } from './useKpiRoles'

/**
 * BERILGAN BONUSLAR — every bonus the module has awarded, and whether it has
 * actually been paid out.
 *
 * The "used" flag is the whole point: a bonus computed by the engine and a
 * bonus a person received are two different facts, and payroll needs the
 * second one. Marking is one-way on purpose — an award that was paid cannot
 * quietly become unpaid.
 */
export function KpiBonusesAdminPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [isUsed, setIsUsed] = useState('')
  const [operTypeId, setOperTypeId] = useState('')
  const { rows, loading, denied } = useDoneBonuses(true, { isUsed, operTypeId })
  const { types } = useBonusOperTypes()
  const mut = useBonusAdminMutations()
  const confirm = useConfirm()
  const [newType, setNewType] = useState('')

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.ok(ok)
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.bonusFailed')))
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded-inner border border-line">
        <p className="engrave border-b border-line px-4 py-2.5 text-fg">{t('kpi.doneBonuses')}</p>
        {/* Narrowing the award list — "not paid out yet" is what payroll opens
            this screen for. Server-side, so it covers every row, not this page. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <Combobox
            value={isUsed}
            onChange={setIsUsed}
            options={[
              { value: 'false', label: t('kpi.bonusNotPaid') },
              { value: 'true', label: t('kpi.bonusPaid') },
            ]}
            placeholder={t('kpi.bonusAllPayment')}
            className="w-44"
          />
          <Combobox
            value={operTypeId}
            onChange={setOperTypeId}
            options={types.map((x) => ({ value: String(x.id), label: x.name ?? `#${x.id}` }))}
            placeholder={t('kpi.bonusAllTypes')}
            className="w-52"
          />
        </div>
        {loading ? (
          <CenteredSpinner />
        ) : denied ? (
          <EmptyState icon={<Gift size={20} />} title={t('kpi.rolesDenied')} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('kpi.doneBonusesEmpty')} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((b, i) => (
              <li key={b.id ?? i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">
                    {b.employee_name ?? '—'}
                  </span>
                  <span className="block truncate text-[11px] text-fg-subtle">
                    {b.indicator_name ?? '—'}
                    {b.oper_type_name ? ` · ${b.oper_type_name}` : ''}
                  </span>
                </span>
                <span className="tabnum shrink-0 text-[11px] text-fg-subtle">
                  {b.period_start ? dayjs(b.period_start).format('DD.MM.YYYY') : '—'}
                </span>
                <span className="tabnum w-20 shrink-0 text-right text-[13px] font-semibold text-fg">
                  {b.bonus_percent != null ? `${b.bonus_percent}%` : (b.amount ?? '—')}
                </span>
                {b.is_used ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="rounded-pill bg-success/[0.12] px-2.5 py-1 text-[11px] font-semibold text-success"
                      title={b.used_note ?? undefined}
                    >
                      {t('kpi.bonusUsed')}
                    </span>
                    {/* Marking a bonus issued used to be irreversible — a
                        mis-click cost a real payment record. */}
                    {canManage && b.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<RotateCcw size={14} />}
                        onClick={async () => {
                          const ok = await confirm({
                            kind: 'status',
                            subject: b.employee_name,
                            confirmLabel: t('kpi.bonusUnmarkUsed'),
                          })
                          if (!ok) return
                          await run(
                            () => mut.markUsed.mutateAsync({ id: b.id as number, isUsed: false }),
                            t('kpi.bonusUnmarked'),
                          )
                        }}
                      >
                        {t('kpi.bonusUnmarkUsed')}
                      </Button>
                    ) : null}
                  </span>
                ) : canManage && b.id ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<BadgeCheck size={14} />}
                    onClick={async () => {
                      const ok = await confirm({
                        kind: 'status',
                        subject: b.employee_name,
                        confirmLabel: t('kpi.bonusMarkUsed'),
                      })
                      if (ok) await run(() => mut.markUsed.mutateAsync({ id: b.id as number }), t('kpi.bonusMarked'))
                    }}
                  >
                    {t('kpi.bonusMarkUsed')}
                  </Button>
                ) : (
                  <span className="w-20 shrink-0" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-inner border border-line">
        <p className="engrave border-b border-line px-3 py-2.5 text-fg">
          {t('kpi.bonusOperTypes')}
        </p>
        {canManage && (
          <div className="flex gap-2 border-b border-line p-3">
            <Input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder={t('kpi.bonusOperTypeNew')}
            />
            <Button
              size="sm"
              disabled={!newType.trim()}
              loading={mut.createOperType.isPending}
              onClick={async () => {
                await run(
                  () => mut.createOperType.mutateAsync({ name: newType.trim() }),
                  t('kpi.roleSaved'),
                )
                setNewType('')
              }}
            >
              <Plus size={15} />
            </Button>
          </div>
        )}
        {types.length === 0 ? (
          <p className="p-4 text-sm text-fg-subtle">{t('kpi.bonusOperTypesEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {types.map((x) => (
              <li key={x.id} className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px]',
                    x.is_active === false ? 'text-fg-subtle line-through' : 'text-fg',
                  )}
                >
                  {x.name ?? `#${x.id}`}
                </span>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('common.delete')}
                    onClick={async () => {
                      if (!(await confirm({ kind: 'delete', subject: x.name ?? `#${x.id}` }))) return
                      await run(() => mut.removeOperType.mutateAsync(x.id), t('kpi.roleSaved'))
                    }}
                  >
                    <Trash2 size={13} className="text-danger" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
