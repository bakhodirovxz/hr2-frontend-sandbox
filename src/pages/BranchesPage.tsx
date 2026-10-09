import { useMemo, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Building2, MapPin, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { errorMessage } from '@/api/errorMessage'
import type { OrganizationBranch } from '@/types'
import { useBranchAdmin, useLocations, type Location } from '@/features/system/useSystemAdmin'

/*
 * BRANCHES and the PLACES inside them.
 *
 * One screen, two tabs, because they are one hierarchy: a location without a
 * branch is unreachable and a branch with no location has no turnstile to
 * stand at. v1 kept them on separate pages and they drifted.
 */
function BranchesPageInner() {
  const { t } = useTranslation()
  const { filters, setFilter, search, setSearch } = useListParams(['tab'])
  const tab = filters.tab || 'branches'

  return (
    <PageContainer>
      <PageHeader title={t('branches.title')} subtitle={t('branches.subtitle')} />
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={(v) => setFilter('tab', v === 'branches' ? '' : v)}
          options={[
            { value: 'branches', label: t('branches.tabBranches') },
            { value: 'locations', label: t('branches.tabLocations') },
          ]}
        />
      </div>
      {tab === 'branches' ? <BranchesTab search={search} setSearch={setSearch} /> : <LocationsTab />}
    </PageContainer>
  )
}

function BranchesTab({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const { branches, loading, create, update, remove, syncEmployees } = useBranchAdmin()
  const [editing, setEditing] = useState<OrganizationBranch | 'new' | null>(null)
  const [removing, setRemoving] = useState<OrganizationBranch | null>(null)

  /**
   * Creating and deleting a BRANCH is `require_roles("admin","master-admin")`
   * on the server, but this page is reachable by anyone `canAccessSystemAdmin`
   * lets in — which includes an employee holding an AKT branch assignment.
   * Verified live: an AKT account was offered "Yangi filial" and got 403 from
   * `POST /organization-branches`. v1 gated the same two controls on
   * `user.type === 'master-admin'` (FiliallarPage.jsx:255,266).
   *
   * The LOCATION controls further down stay open: `require_system_admin`
   * genuinely admits AKT, so those are the reason this page is theirs at all.
   */
  const canManageBranches = roles.isSiteMasterAdmin(user) || roles.isBranchAdmin(user)
  // A queued job gives no visible feedback, so the button is held down for a
  // while — otherwise the same sync is enqueued three times.
  const [queued, setQueued] = useState<number[]>([])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? branches.filter((b) => (b.name ?? '').toLowerCase().includes(q)) : branches
  }, [branches, search])

  const sync = async (b: OrganizationBranch) => {
    // Re-pushes every employee of the branch to its turnstiles.
    if (!(await confirm({ kind: 'action', subject: b.name, confirmLabel: t('branches.sync') }))) return
    try {
      await syncEmployees.mutateAsync(b.id)
      setQueued((p) => [...p, b.id])
      setTimeout(() => setQueued((p) => p.filter((x) => x !== b.id)), 60_000)
      toast.ok(t('branches.syncQueued'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-ui">
        <div className="max-w-branch min-w-[14rem] flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={t('branches.searchPlaceholder')} />
        </div>
        <FilterReset count={search ? 1 : 0} onReset={() => setSearch('')} />
        <span className="text-[12.5px] tabular-nums text-fg-subtle">{t('branches.count', { count: rows.length })}</span>
        {canManageBranches && (
          <Button size="sm" className="ml-auto" leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
            {t('branches.add')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Building2 size={22} />}
            title={search ? t('list.noResultsFiltered') : t('branches.empty')}
            description={search ? t('list.noResultsFilteredHint') : undefined}
            action={<FilterReset count={search ? 1 : 0} onReset={() => setSearch('')} />}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line/60">
            {rows.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{b.name}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {[b.region, b.address].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<RefreshCw size={13} />}
                  disabled={queued.includes(b.id) || syncEmployees.isPending}
                  onClick={() => sync(b)}
                >
                  {t('branches.sync')}
                </Button>
                <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(b)}>
                  <Pencil size={14} />
                </IconButton>
                {canManageBranches && (
                  <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(b)}>
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <BranchModal
        value={editing}
        onClose={() => setEditing(null)}
        onSave={async (body, id) => {
          try {
            if (id) await update.mutateAsync({ id, body })
            else await create.mutateAsync(body)
            toast.ok(t('common.saved'))
            setEditing(null)
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
        saving={create.isPending || update.isPending}
      />

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('branches.removeTitle')}
        description={t('branches.removeConfirm', { name: removing?.name ?? '' })}
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await remove.mutateAsync(removing.id)
            toast.ok(t('common.deleted'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </>
  )
}

function BranchModal({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: OrganizationBranch | 'new' | null
  onClose: () => void
  onSave: (body: Record<string, unknown>, id?: number) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const open = !!value
  const row = value && value !== 'new' ? value : null
  // The regions come from the branches themselves — that list IS the set of
  // regions the organisation works in, and a separate catalogue would drift.
  const { branches } = useBranchAdmin()
  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const b of branches) {
      ;(b.regions?.length ? b.regions : b.region ? [b.region] : []).forEach((r) => r && set.add(r))
    }
    return Array.from(set).sort().map((r) => ({ value: r, label: r }))
  }, [branches])
  const [name, setName] = useState('')
  const [regionList, setRegionList] = useState<string[]>([])
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [isHeadOffice, setIsHeadOffice] = useState(false)
  const [isMedicalCenter, setIsMedicalCenter] = useState(false)
  const [terminalGroup, setTerminalGroup] = useState('')
  const [error, setError] = useState('')
  const [seeded, setSeeded] = useState<string | null>(null)

  const seedKey = open ? String(row?.id ?? 'new') : null
  if (open && seeded !== seedKey) {
    setSeeded(seedKey)
    setName(row?.name ?? '')
    // A branch may answer for several regions; `region` is only the primary one
    // the documents print, so the list is the source of truth here.
    setRegionList(row?.regions ?? (row?.region ? [row.region] : []))
    setAddress(row?.address ?? '')
    setLat(row?.latitude != null ? String(row.latitude) : '')
    setLon(row?.longitude != null ? String(row.longitude) : '')
    setIsHeadOffice(!!row?.is_head_office)
    setIsMedicalCenter(!!row?.is_medical_center)
    setTerminalGroup(row?.terminal_group ?? '')
    setError('')
  }

  const submit = () => {
    if (!name.trim()) return setError(t('branches.nameRequired'))
    onSave(
      {
        name: name.trim(),
        regions: regionList,
        region: regionList[0] ?? null,
        address: address.trim() || null,
        latitude: lat ? Number(lat) : null,
        longitude: lon ? Number(lon) : null,
        is_head_office: isHeadOffice,
        is_medical_center: isMedicalCenter,
        terminal_group: terminalGroup.trim(),
      },
      row?.id,
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? t('branches.editTitle') : t('branches.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={saving}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('branches.fieldName')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('branches.fieldRegions')} hint={t('branches.regionsHint')}>
          <div className="space-y-1.5">
            <Combobox
              value=""
              onChange={(v) => v && setRegionList((p) => (p.includes(v) ? p : [...p, v]))}
              options={regions.filter((r) => !regionList.includes(String(r.value)))}
              placeholder={t('t2.pick')}
              className="w-full"
            />
            {regionList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {regionList.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRegionList((p) => p.filter((x) => x !== r))}
                    className="inline-flex items-center gap-1 rounded-pill bg-brand px-2.5 py-1 text-[11.5px] font-medium text-fg-on-brand"
                  >
                    {r} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
        <Field label={t('branches.fieldAddress')}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('branches.fieldLat')}>
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.29950" />
          </Field>
          <Field label={t('branches.fieldLon')}>
            <Input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="69.24010" />
          </Field>
        </div>

        {/* TOPOLOGIYA. Bu qoidalar ilgari kodga RAQAM bilan yozilgan edi
          * (bosh filial = 1, sihatgoh = 30, umumiy turniket = {1,29,31}) —
          * ya'ni ular AYNI shu bazaga bog'langan edi. Endi filialning o'zida
          * turadi va shu yerdan boshqariladi. Hech qaysi filial belgilanmasa
          * tizim eski raqamlarga qaytadi, ya'ni hech nima buzilmaydi. */}
        <div className="rounded-inner border border-line bg-surface-2/50 p-3">
          <p className="mb-2 text-[11.5px] font-semibold text-fg-muted">
            {t('branches.topologyTitle')}
          </p>
          <div className="space-y-2">
            <Checkbox
              checked={isHeadOffice}
              onChange={(e) => setIsHeadOffice(e.target.checked)}
              label={t('branches.isHeadOffice')}
            />
            <p className="pl-7 text-[11.5px] text-fg-subtle">{t('branches.isHeadOfficeHint')}</p>
            <Checkbox
              checked={isMedicalCenter}
              onChange={(e) => setIsMedicalCenter(e.target.checked)}
              label={t('branches.isMedicalCenter')}
            />
            <p className="pl-7 text-[11.5px] text-fg-subtle">{t('branches.isMedicalCenterHint')}</p>
          </div>
          <Field
            label={t('branches.terminalGroup')}
            hint={t('branches.terminalGroupHint')}
            className="mt-3"
          >
            <Input
              value={terminalGroup}
              onChange={(e) => setTerminalGroup(e.target.value)}
              placeholder="bosh-bino"
            />
          </Field>
        </div>

        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

function LocationsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const { branches } = useBranchAdmin()
  const { locations, loading, create, update, remove } = useLocations(null)
  const [editing, setEditing] = useState<Location | 'new' | null>(null)
  const [removing, setRemoving] = useState<Location | null>(null)

  const branchName = (id?: number | null) => branches.find((b) => b.id === id)?.name ?? '—'

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
          {t('branches.addLocation')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : locations.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<MapPin size={22} />} title={t('branches.locationsEmpty')} description={t('branches.locationsEmptyHint')} /></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line/60">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{l.name}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {[branchName(l.organization_branch_id ?? l.organization_branch?.id), l.address].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(l)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(l)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <LocationModal
        value={editing}
        branches={branches}
        onClose={() => setEditing(null)}
        saving={create.isPending || update.isPending}
        onSave={async (body, id) => {
          try {
            if (id) await update.mutateAsync({ id, body })
            else await create.mutateAsync(body)
            toast.ok(t('common.saved'))
            setEditing(null)
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('branches.removeLocationTitle')}
        description={t('branches.removeConfirm', { name: removing?.name ?? '' })}
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await remove.mutateAsync(removing.id)
            toast.ok(t('common.deleted'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </>
  )
}

function LocationModal({
  value,
  branches,
  onClose,
  onSave,
  saving,
}: {
  value: Location | 'new' | null
  branches: OrganizationBranch[]
  onClose: () => void
  onSave: (body: Record<string, unknown>, id?: number) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const open = !!value
  const row = value && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [address, setAddress] = useState('')
  /** Koordinatalar — geofencing shu yerdan oziqlanadi. `LocationCreate`/
   *  `LocationUpdate` ikkalasi ham oladi, v2 esa hech qachon yubormasdi,
   *  ya'ni manzil xaritada joyi bo'lmagan matn bo'lib qolardi. */
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [error, setError] = useState('')
  const [seeded, setSeeded] = useState<string | null>(null)

  const seedKey = open ? String(row?.id ?? 'new') : null
  if (open && seeded !== seedKey) {
    setSeeded(seedKey)
    setName(row?.name ?? '')
    setBranchId(String(row?.organization_branch_id ?? row?.organization_branch?.id ?? ''))
    setAddress(row?.address ?? '')
    setLat(row?.latitude != null ? String(row.latitude) : '')
    setLon(row?.longitude != null ? String(row.longitude) : '')
    setError('')
  }

  const submit = () => {
    if (!name.trim()) return setError(t('branches.nameRequired'))
    onSave(
      {
        name: name.trim(),
        organization_branch_id: branchId ? Number(branchId) : null,
        address: address.trim() || null,
        latitude: lat.trim() === '' ? null : Number(lat),
        longitude: lon.trim() === '' ? null : Number(lon),
      },
      row?.id,
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? t('branches.editLocation') : t('branches.addLocation')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={saving}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('branches.fieldName')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('branches.fieldBranch')} hint={t('branches.locationBranchHint')}>
          <Combobox
            value={branchId}
            onChange={setBranchId}
            options={branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        <Field label={t('branches.fieldAddress')}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('branches.fieldLat')}>
            <Input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} />
          </Field>
          <Field label={t('branches.fieldLon')}>
            <Input type="number" step="0.000001" value={lon} onChange={(e) => setLon(e.target.value)} />
          </Field>
        </div>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function BranchesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.canAccessSystemAdmin(user)} title={t('branches.title')}>
      <BranchesPageInner />
    </RequireRole>
  )
}

