import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MonitorSmartphone, Navigation, Pencil, PlugZap, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { errorMessage } from '@/api/errorMessage'
import { useLocations, useTurnstiles, type Turnstile } from '@/features/system/useSystemAdmin'
import { HikSyncModal } from '@/features/system/HikSyncModal'
import { formatRoute, useRouteDistance } from '@/features/system/useRouting'
import { useBranchStore } from '@/store/branchStore'
import { IsapiDeviceModal } from '@/features/system/IsapiDeviceModal'
import { IsapiTerminalPanel } from '@/features/system/IsapiTerminalPanel'
import { TurnstileDoorsPanel } from '@/features/system/TurnstileDoorsPanel'

/*
 * TURNSTILES — the devices attendance is actually built from.
 *
 * `status` is HikCentral's own encoding, where "1" means online; everything
 * else (including a missing value) means the device is not answering.
 *
 * `event_token` and `rtsp_stream_url` are NOT shown or edited here: the list
 * endpoint is open to any authenticated employee and deliberately stops
 * returning them (AUDIT 2026-09-02), so this screen must not pretend to own
 * values it can never read back.
 */
const isOnline = (t?: string | null) => t === '1'

function TurnstilesPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const { search, setSearch, activeFilterCount, reset } = useListParams()
  // Search runs on the SERVER over the same four fields (device name, display
  // name, IP, index code) — see useTurnstiles.
  const { turnstiles: rows, loading, create, update, remove } = useTurnstiles(search)
  const { locations } = useLocations(null)
  const [editing, setEditing] = useState<Turnstile | 'new' | null>(null)
  const [removing, setRemoving] = useState<Turnstile | null>(null)
  const [addingIsapi, setAddingIsapi] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)

  // Counts describe the devices currently LISTED, which is what the rest of
  // the v2 list screens do when a filter is active — the search box sits right
  // beside this line, so "3 of 7 online" reads as a fact about the result.
  const online = rows.filter((x) => isOnline(x.status)).length

  return (
    <PageContainer>
      <PageHeader
        title={t('turnstiles.title')}
        subtitle={t('turnstiles.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-ui">
            <span className="whitespace-nowrap text-[12px] tabular-nums text-fg-muted">
              {t('turnstiles.onlineOf', { online, total: rows.length })}
            </span>
            {/* Appliance-wide sync and its privilege groups. The page itself is
                already behind the system-admin gate; who may actually RUN the
                sync is decided inside, where the rule lives. */}
            <Button size="sm" variant="ghost" leftIcon={<RefreshCw size={15} />} onClick={() => setSyncOpen(true)}>
              {t('turnstiles.syncTitle')}
            </Button>
            {/* Registering an ISAPI terminal is a BRANCH action (the server
                scopes it), unlike the sync — so it stays available to a branch
                helpdesk. */}
            <Button size="sm" variant="outline" leftIcon={<PlugZap size={15} />} onClick={() => setAddingIsapi(true)}>
              {t('turnstiles.isapiAdd')}
            </Button>
            <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
              {t('turnstiles.add')}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex max-w-xl items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder={t('turnstiles.searchPlaceholder')} className="flex-1" />
        <FilterReset count={activeFilterCount} onReset={reset} />
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<MonitorSmartphone size={22} />}
            title={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('turnstiles.empty')}
            description={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('turnstiles.emptyHint')}
            action={<FilterReset count={activeFilterCount} onReset={reset} />}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line/60">
            {rows.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${isOnline(x.status) ? 'bg-success' : 'bg-fg-subtle/40'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">
                    {x.display_name || x.acs_dev_name || `#${x.id}`}
                  </span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {[x.acs_dev_ip, (x.locations ?? []).map((l) => l.name).join(', ')].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                {/* The protocol chip is detail — on a phone it squeezed the name to «5 eta…». */}
                {x.treaty_type && <Badge tone="neutral" className="hidden sm:inline-flex">{x.treaty_type}</Badge>}
                <Badge tone={isOnline(x.status) ? 'success' : 'neutral'}>
                  {isOnline(x.status) ? t('turnstiles.online') : t('turnstiles.offline')}
                </Badge>
                <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(x)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(x)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TurnstileModal
        value={editing}
        locations={locations.map((l) => ({ value: String(l.id), label: l.name ?? `#${l.id}` }))}
        saving={create.isPending || update.isPending}
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
      />

      <IsapiDeviceModal open={addingIsapi} onClose={() => setAddingIsapi(false)} />
      <HikSyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('turnstiles.removeTitle')}
        description={t('turnstiles.removeConfirm', { name: removing?.acs_dev_name ?? '' })}
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
    </PageContainer>
  )
}

function TurnstileModal({
  value,
  locations,
  onClose,
  onSave,
  saving,
}: {
  value: Turnstile | 'new' | null
  locations: { value: string; label: string }[]
  onClose: () => void
  onSave: (body: Record<string, unknown>, id?: number) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const open = !!value
  const row = value && value !== 'new' ? value : null
  const [form, setForm] = useState<Record<string, string>>({})
  const [locIds, setLocIds] = useState<number[]>([])
  const branchId = useBranchStore((st) => st.selectedBranchId)
  const [error, setError] = useState('')
  const [seeded, setSeeded] = useState<string | null>(null)
  /*
   * Tabs exist only while EDITING. Doors and the terminal account are both
   * addressed by turnstile id, so there is nothing for them to act on until the
   * record exists — offering them during creation would be offering a dead end.
   */
  const [tab, setTab] = useState('info')
  const isIsapi = row?.treaty_type === 'ISAPI'

  const seedKey = open ? String(row?.id ?? 'new') : null
  if (open && seeded !== seedKey) {
    setSeeded(seedKey)
    setTab('info')
    setForm({
      acs_dev_index_code: row?.acs_dev_index_code ?? '',
      acs_dev_name: row?.acs_dev_name ?? '',
      acs_dev_ip: row?.acs_dev_ip ?? '',
      acs_dev_port: row?.acs_dev_port != null ? String(row.acs_dev_port) : '',
      acs_dev_code: row?.acs_dev_code ?? '',
      treaty_type: row?.treaty_type ?? '',
    })
    setLocIds((row?.locations ?? []).map((l) => l.id))
    setError('')
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.acs_dev_index_code?.trim()) return setError(t('turnstiles.codeRequired'))
    if (!form.acs_dev_name?.trim()) return setError(t('turnstiles.nameRequired'))
    onSave(
      {
        acs_dev_index_code: form.acs_dev_index_code.trim(),
        acs_dev_name: form.acs_dev_name.trim(),
        acs_dev_ip: form.acs_dev_ip?.trim() || null,
        acs_dev_port: form.acs_dev_port ? Number(form.acs_dev_port) : null,
        acs_dev_code: form.acs_dev_code?.trim() || null,
        treaty_type: form.treaty_type?.trim() || null,
        location_ids: locIds,
      },
      row?.id,
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? t('turnstiles.editTitle') : t('turnstiles.add')}
      footer={
        // Doors and terminal credentials save themselves as they are used, so a
        // Save button on those tabs would claim to do something it does not.
        tab === 'info' ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
            <Button onClick={submit} loading={saving}>{t('common.save')}</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      {row && (
        <div className="mb-4">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'info', label: t('turnstiles.infoTab') },
              { value: 'doors', label: t('turnstiles.doorsTab') },
              ...(isIsapi ? [{ value: 'isapi', label: t('turnstiles.isapiTab') }] : []),
            ]}
          />
        </div>
      )}

      {row && tab === 'doors' && (
        <TurnstileDoorsPanel turnstileId={row.id} deviceIndexCode={row.acs_dev_index_code} />
      )}

      {row && tab === 'isapi' && (
        <IsapiTerminalPanel turnstileId={row.id} ip={row.acs_dev_ip} port={row.acs_dev_port} />
      )}

      <div className={`grid gap-4 sm:grid-cols-2 ${tab === 'info' ? '' : 'hidden'}`}>
        <Field label={t('turnstiles.fieldIndexCode')} required hint={t('turnstiles.indexCodeHint')}>
          <Input value={form.acs_dev_index_code ?? ''} onChange={(e) => set('acs_dev_index_code', e.target.value)} />
        </Field>
        <Field label={t('turnstiles.fieldName')} required>
          <Input value={form.acs_dev_name ?? ''} onChange={(e) => set('acs_dev_name', e.target.value)} />
        </Field>
        <Field label={t('turnstiles.fieldIp')}>
          <Input value={form.acs_dev_ip ?? ''} onChange={(e) => set('acs_dev_ip', e.target.value)} placeholder="192.168.0.10" />
        </Field>
        <Field label={t('turnstiles.fieldPort')}>
          <Input type="number" value={form.acs_dev_port ?? ''} onChange={(e) => set('acs_dev_port', e.target.value)} />
        </Field>
        <Field label={t('turnstiles.fieldDevCode')}>
          <Input value={form.acs_dev_code ?? ''} onChange={(e) => set('acs_dev_code', e.target.value)} />
        </Field>
        <Field label={t('turnstiles.fieldTreaty')} hint={t('turnstiles.treatyHint')}>
          <Combobox
            value={form.treaty_type ?? ''}
            onChange={(v) => set('treaty_type', v)}
            options={[
              { value: 'HikCentral', label: 'HikCentral' },
              { value: 'ISAPI', label: 'ISAPI' },
            ]}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        <Field label={t('turnstiles.fieldLocations')} wide hint={t('turnstiles.locationsHint')}>
          <div className="space-y-1.5">
            <Combobox
              value=""
              onChange={(v) => {
                const id = Number(v)
                if (id) setLocIds((p) => (p.includes(id) ? p : [...p, id]))
              }}
              options={locations.filter((l) => !locIds.includes(Number(l.value)))}
              placeholder={t('t2.pick')}
              className="w-full"
            />
            {locIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {locIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLocIds((p) => p.filter((x) => x !== id))}
                    className="inline-flex items-center gap-1 rounded-pill bg-brand px-2.5 py-1 text-[11.5px] font-medium text-fg-on-brand"
                  >
                    {locations.find((l) => Number(l.value) === id)?.label ?? `#${id}`} ✕
                  </button>
                ))}
              </div>
            )}
            {/* How far the gate actually is from the branch — the same OSRM
                answer v1 shows on the live map. Absent when the routing service
                is off or a point has no coordinates; never an error. */}
            <RouteHint branchId={branchId} locationId={locIds[0] ?? null} enabled={open} />
          </div>
        </Field>
      </div>
      {error && tab === 'info' && <p className="mt-3 text-xs text-danger">{error}</p>}
    </Modal>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function TurnstilesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.canAccessSystemAdmin(user)} title={t('turnstiles.title')}>
      <TurnstilesPageInner />
    </RequireRole>
  )
}

function RouteHint({
  branchId,
  locationId,
  enabled,
}: {
  branchId: number | null
  locationId: number | null
  enabled: boolean
}) {
  const { t } = useTranslation()
  const { route } = useRouteDistance({ fromBranchId: branchId, toLocationId: locationId, enabled })
  const text = formatRoute(route, t('turnstiles.sameSite'))
  if (!text) return null
  return (
    <p className="flex items-center gap-1.5 pt-0.5 text-[11.5px] text-fg-subtle">
      <Navigation size={12} />
      {t('turnstiles.distanceFromBranch')}: {text}
    </p>
  )
}
