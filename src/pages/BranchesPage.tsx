import { textMatches } from '@/i18n/translit'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inTashkent } from '@/lib/format'
import { Building2, CheckCircle2, GitBranch, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { canWrite, canWriteGlobal, isBranchAdmin, isSiteMasterAdmin, ownBranchIds } from '@/auth/permissions'
import { useListParams } from '@/hooks/useListParams'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useDictionaryOptions, type DictionaryEntry } from '@/features/dictionaries/useDictionaries'
import { entryLabel } from '@/features/structure/usePositionAdmin'
import {
  OWNERSHIP_FORMS,
  UZ_REGIONS,
  useBranchAdmin,
  type BranchPayload,
  type BranchRow,
} from '@/features/branches/useBranchAdmin'

const FILTER_KEYS = ['ownership'] as const

/** Ma'lumotnoma yozuvlari: kod → joriy tildagi nom. */
function useCodeLabels(code: string) {
  const { options, loading } = useDictionaryOptions(code)
  const map = useMemo(() => new Map(options.map((e) => [e.code, entryLabel(e)])), [options])
  return { entries: options, map, loading }
}

/**
 * TASHKILOTLAR (FILIALLAR) — TZ 4.2.6 (v1 `FiliallarPage` + `AddFilialDrawer`).
 *
 * Ro'yxat: nomi, mulkchilik shakli, hudud (viloyat/tuman ma'lumotnomasidan),
 * xodim va bo'lim soni, sana. Qatorni bosish — sarlavhadagi filial tanlovini
 * shu filialga o'rnatadi. Yaratish va o'chirish — faqat tizim (bosh)
 * administratori; filial administratori faqat O'Z filialini ko'radi va
 * tahrirlaydi.
 */
export function BranchesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const setSelectedBranchId = useBranchStore((s) => s.setSelectedBranchId)
  const { query, branches, create, update, remove } = useBranchAdmin()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter } = useListParams(FILTER_KEYS)
  const ownership = filters.ownership || ''

  // TZ 4.2.6 2024–2026: the head-office structure editor («Кадры ЦА») keeps
  // the organisations too — create, list and delete like the administrator.
  const master = isSiteMasterAdmin(user) || canWriteGlobal(user, 'structure')
  const regions = useCodeLabels('regions')
  const districts = useCodeLabels('districts')
  const ownershipDict = useCodeLabels('ownership_forms')
  const ownershipLabel = (code?: string | null) => (code ? ownershipDict.map.get(code) ?? t(`branchAdmin.own_${code}` as never) : '')

  const [editing, setEditing] = useState<BranchRow | 'new' | null>(null)

  /** Filial administratori — faqat o'z filiali (v1 `getSystemAdminBranchIds`). */
  const allowed = useMemo(() => {
    if (master) return null
    const own = isBranchAdmin(user) && user?.admin?.organization_branch_id ? [user.admin.organization_branch_id] : ownBranchIds(user)
    return own
  }, [master, user])

  const filtered = useMemo(() => {
    let rows = allowed ? branches.filter((b) => allowed.includes(Number(b.id))) : branches
    if (ownership) rows = rows.filter((b) => b.ownership_form === ownership)
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter((b) => textMatches(b.name, q))
    return rows
  }, [branches, allowed, ownership, search])
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const rows = filtered.slice((page - 1) * size, page * size)

  const onDelete = async (b: BranchRow) => {
    if (!(await confirm({ kind: 'delete', subject: b.name, description: t('branchAdmin.deleteConfirm', { name: b.name }) }))) return
    try {
      await remove.mutateAsync(b.id)
      toast.ok(t('branchAdmin.deleted'))
      if (selectedBranchId === b.id) setSelectedBranchId(null)
    } catch (e) {
      toast.error(errorMessage(e, t('branchAdmin.actionFailed')))
    }
  }

  const columns: Column<BranchRow>[] = [
    { key: 'n', header: t('branchAdmin.colNo'), className: 'w-14 text-fg-muted', cell: (_r, i) => `${(page - 1) * size + i + 1}.` },
    {
      key: 'name',
      header: t('branchAdmin.colName'),
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-inner bg-brand-soft text-brand-strong">
            <GitBranch size={15} aria-hidden />
          </span>
          <span className="truncate font-semibold text-fg">{r.name}</span>
          {selectedBranchId === r.id && (
            <Badge tone="brand" className="shrink-0">
              <CheckCircle2 size={12} aria-hidden /> {t('branchAdmin.selected')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'ownership',
      header: t('branchAdmin.colOwnership'),
      sortValue: (r) => ownershipLabel(r.ownership_form),
      cell: (r) => <span className="text-fg-muted">{ownershipLabel(r.ownership_form) || '—'}</span>,
    },
    {
      key: 'region',
      header: t('branchAdmin.colRegion'),
      cell: (r) => {
        const parts = [
          r.region_code ? regions.map.get(r.region_code) ?? r.region_code : r.region || '',
          r.district_code ? districts.map.get(r.district_code) ?? r.district_code : '',
        ].filter(Boolean)
        return <span className="text-fg-muted">{parts.length ? parts.join(', ') : '—'}</span>
      },
    },
    {
      key: 'employees',
      header: t('branchAdmin.colEmployees'),
      sortValue: (r) => r.employee_count ?? 0,
      cell: (r) => (
        <Badge tone="success">
          <Users size={12} aria-hidden /> {r.employee_count ?? 0}
        </Badge>
      ),
    },
    {
      key: 'departments',
      header: t('branchAdmin.colDepartments'),
      sortValue: (r) => r.department_count ?? 0,
      cell: (r) => (
        <Badge tone="warning">
          <Building2 size={12} aria-hidden /> {r.department_count ?? 0}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: t('branchAdmin.colDate'),
      sortValue: (r) => r.created_at ?? '',
      cell: (r) => <span className="tabnum text-fg-muted">{r.created_at ? inTashkent(r.created_at).format('DD.MM.YYYY') : '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}>
            <Pencil size={14} />
          </IconButton>
          {master && (
            <IconButton size="sm" label={t('common.delete')} onClick={() => onDelete(r)} disabled={remove.isPending}>
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>
      ),
    },
  ]

  const activeFilters = (search ? 1 : 0) + (ownership ? 1 : 0)
  const reset = () => {
    setSearch('')
    setFilter('ownership', '')
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('branchAdmin.title')}
        subtitle={t('branchAdmin.subtitle')}
        actions={
          master && (
            <Button leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
              {t('branchAdmin.create')}
            </Button>
          )
        }
      />

      {master && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder={t('branchAdmin.search')} className="w-full max-w-[280px]" />
          <Select
            value={ownership}
            onChange={(e) => setFilter('ownership', e.target.value)}
            options={OWNERSHIP_FORMS.map((o) => ({ value: o, label: ownershipLabel(o) }))}
            placeholder={t('branchAdmin.allForms')}
            aria-label={t('branchAdmin.colOwnership')}
            wrapperClassName="w-full max-w-[260px]"
          />
          <FilterReset count={activeFilters} onReset={reset} />
          <span className="tabnum text-xs text-fg-subtle">{t('branchAdmin.count', { count: filtered.length })}</span>
        </div>
      )}

      <Card>
        <DataTable
          tableId="branches"
          rows={rows}
          columns={columns}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(r) => setSelectedBranchId(r.id)}
          filtered={activeFilters > 0}
          emptyAction={<FilterReset count={activeFilters} onReset={reset} />}
          emptyTitle={t('branchAdmin.empty')}
          minWidth={980}
        />
        <Pagination page={page} size={size} total={filtered.length} pages={pages} onPage={setPage} onSize={setSize} />
      </Card>
      <p className="mt-2 text-xs text-fg-subtle">{t('branchAdmin.rowClickHint')}</p>

      <BranchDrawer
        value={editing}
        regions={regions.entries}
        districts={districts.entries}
        ownershipLabel={ownershipLabel}
        canEditStructure={canWrite(user, 'structure')}
        saving={create.isPending || update.isPending}
        onClose={() => setEditing(null)}
        onSave={async (body, id) => {
          try {
            if (id) await update.mutateAsync({ id, body })
            else await create.mutateAsync(body)
            toast.ok(id ? t('branchAdmin.updated') : t('branchAdmin.created'))
            setEditing(null)
          } catch (e) {
            toast.error(errorMessage(e, t('branchAdmin.actionFailed')))
          }
        }}
      />
    </PageContainer>
  )
}

/** Yaratish / tahrirlash paneli (v1 `AddFilialDrawer`). */
function BranchDrawer({
  value,
  regions,
  districts,
  ownershipLabel,
  canEditStructure,
  saving,
  onClose,
  onSave,
}: {
  value: BranchRow | 'new' | null
  regions: DictionaryEntry[]
  districts: DictionaryEntry[]
  ownershipLabel: (code?: string | null) => string
  /** Mulkchilik shakli va hudud kodlari — `structure: edit` (server 403 aks holda). */
  canEditStructure: boolean
  saving: boolean
  onClose: () => void
  onSave: (body: BranchPayload, id?: number) => void
}) {
  const { t } = useTranslation()
  const open = !!value
  const row = value && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [address, setAddress] = useState('')
  const [ownership, setOwnership] = useState('')
  const [regionCode, setRegionCode] = useState('')
  const [districtCode, setDistrictCode] = useState('')
  const [error, setError] = useState('')
  const [seeded, setSeeded] = useState<string | null>(null)

  const seedKey = open ? String(row?.id ?? 'new') : null
  if (seeded !== seedKey) {
    setSeeded(seedKey)
    setName(row?.name ?? '')
    setRegion(row?.region ?? '')
    setAddress(row?.address ?? '')
    setOwnership(row?.ownership_form ?? '')
    setRegionCode(row?.region_code ?? '')
    setDistrictCode(row?.district_code ?? '')
    setError('')
  }

  /** Saqlangan kod ma'lumotnomada bo'lmasa ham tanlagichda ko'rinib tursin. */
  const keep = (opts: { value: string; label: string }[], code: string) =>
    code && !opts.some((o) => o.value === code) ? [...opts, { value: code, label: code }] : opts
  const regionEntry = regions.find((r) => r.code === regionCode)
  const regionOptions = keep(regions.map((r) => ({ value: r.code, label: entryLabel(r) })), regionCode)
  const districtOptions = keep(
    districts.filter((d) => regionEntry && d.parent_id === regionEntry.id).map((d) => ({ value: d.code, label: entryLabel(d) })),
    districtCode,
  )
  const docRegions = (UZ_REGIONS as readonly string[]).includes(region) || !region ? [...UZ_REGIONS] : [...UZ_REGIONS, region]

  const pickRegion = (code: string) => {
    setRegionCode(code)
    setDistrictCode('')
    // Hujjatlar uchun matnli viloyat bo'sh bo'lsa — ma'lumotnoma nomi bilan.
    const entry = regions.find((r) => r.code === code)
    if (entry && !region && (UZ_REGIONS as readonly string[]).includes(entry.name)) setRegion(entry.name)
  }

  const submit = () => {
    if (!name.trim()) return setError(t('branchAdmin.nameRequired'))
    setError('')
    const body: BranchPayload = {
      name: name.trim(),
      region: region || null,
      address: address.trim() || null,
    }
    const structural: BranchPayload = {
      ownership_form: ownership || null,
      region_code: regionCode || null,
      district_code: districtCode || null,
    }
    // Faqat O'ZGARGAN tuzilmaviy maydonlar yuboriladi — ularni yuborish
    // `structure: edit` talab qiladi (filial administratori nomini/manzilini
    // o'zgartirganda 403 olmasin).
    for (const [k, v] of Object.entries(structural) as [keyof BranchPayload, string | null][]) {
      const before = (row?.[k as keyof BranchRow] as string | null | undefined) ?? null
      if (!row || v !== before) (body as Record<string, unknown>)[k] = v
    }
    onSave(body, row?.id)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      title={row ? t('branchAdmin.editTitle') : t('branchAdmin.createTitle')}
      description={row ? t('branchAdmin.editHint') : t('branchAdmin.createHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('branchAdmin.fieldName')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('branchAdmin.namePlaceholder')} autoFocus />
        </Field>
        <Field label={t('branchAdmin.colOwnership')} hint={canEditStructure ? undefined : t('branchAdmin.structureOnly')}>
          <Select
            value={ownership}
            onChange={(e) => setOwnership(e.target.value)}
            options={OWNERSHIP_FORMS.map((o) => ({ value: o, label: ownershipLabel(o) }))}
            placeholder={t('branchAdmin.notSelected')}
            disabled={!canEditStructure}
            aria-label={t('branchAdmin.colOwnership')}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('branchAdmin.fieldRegionCode')}>
            <Combobox
              value={regionCode}
              onChange={pickRegion}
              options={regionOptions}
              placeholder={t('branchAdmin.pickRegion')}
              disabled={!canEditStructure}
              clearable
            />
          </Field>
          <Field label={t('branchAdmin.fieldDistrict')}>
            <Combobox
              value={districtCode}
              onChange={setDistrictCode}
              options={districtOptions}
              placeholder={regionCode ? t('branchAdmin.pickDistrict') : t('branchAdmin.pickRegionFirst')}
              disabled={!canEditStructure || !regionCode}
              clearable
            />
          </Field>
        </div>
        <Field label={t('branchAdmin.fieldDocRegion')}>
          <Combobox
            value={region}
            onChange={setRegion}
            options={docRegions.map((r) => ({ value: r, label: r }))}
            placeholder={t('branchAdmin.pickRegion')}
            clearable
          />
        </Field>
        <Field label={t('branchAdmin.fieldAddress')}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('branchAdmin.addressPlaceholder')} />
        </Field>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}
