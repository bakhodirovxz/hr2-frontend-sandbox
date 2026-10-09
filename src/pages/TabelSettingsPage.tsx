import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
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
import { Spinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { isSiteMasterAdmin, ownBranchIds } from '@/auth/permissions'
import { useListParams } from '@/hooks/useListParams'
import { foldIncludes, searchFold } from '@/lib/searchFold'
import { paginateClient } from '@/lib/paginate'
import { useAuthStore } from '@/store/authStore'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import {
  DEFAULT_TABEL_CONFIG,
  LEADERSHIP_ROLES,
  useBranchLeaders,
  useTabelBranches,
  useTabelMutations,
  type BranchLeader,
} from '@/features/tabel/useTabel'
import type { OrganizationBranch, TabelConfig } from '@/types'

const hasConfig = (b: OrganizationBranch) => !!b.tabel_config && Object.keys(b.tabel_config).length > 0

/**
 * TABEL SOZLAMALARI (TZ I2 «Yakuniy tabel», v1 `TabelSettingsPage`): har
 * filial uchun yuklab olinadigan tabelning tasdiqlovchisi (tashkilot,
 * lavozim, F.I.Sh.), sarlavha boshi, imzo egalari, hujjat logosi va filial
 * rahbarlari (direktor / o'rinbosar — bir xodim bir necha rolda bo'lishi
 * mumkin). Kadr o'z filial(lar)ini, butun tizim kadri va bosh administrator
 * barcha filiallarni sozlaydi; filial rahbari — o'z filialini.
 */
export function TabelSettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const own = ownBranchIds(user)
  const everyBranch = isSiteMasterAdmin(user) || own == null
  const canEdit = (b: OrganizationBranch) =>
    everyBranch || (own ?? []).includes(Number(b.id)) || (user?.actor?.leadership_branch_ids ?? []).includes(Number(b.id))

  const { search, setSearch, page, setPage, size, setSize, activeFilterCount, reset } = useListParams([])
  const { branches, loading, error, refetch } = useTabelBranches()
  const visible = useMemo(() => {
    const q = searchFold(search.trim())
    return branches.filter((b) => canEdit(b) && (!q || foldIncludes(b.name ?? '', q)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, search, own, everyBranch])
  const view = paginateClient(visible, page, size)
  const [config, setConfig] = useState<OrganizationBranch | null>(null)
  const [leaders, setLeaders] = useState<OrganizationBranch | null>(null)

  const columns: Column<OrganizationBranch & { n: number }>[] = [
    { key: 'n', header: '№', headerClassName: 'w-12', className: 'tabular-nums text-fg-subtle', cell: (r) => `${r.n}.` },
    { key: 'name', header: t('davomat.tsBranch'), skeleton: 'w-56', cell: (r) => <span className="font-semibold text-fg">{r.name}</span> },
    {
      key: 'approver',
      header: t('davomat.tsApprover'),
      className: 'text-fg-muted',
      cell: (r) =>
        hasConfig(r) ? (
          r.tabel_config?.approver?.name || t('davomat.tsConfigured')
        ) : (
          <span className="italic text-fg-subtle">{t('davomat.tsDefault')}</span>
        ),
    },
    {
      key: 'signers',
      header: t('davomat.tsSignersCount'),
      className: 'tabular-nums text-fg-muted',
      cell: (r) => (hasConfig(r) ? r.tabel_config?.signers?.length ?? 0 : DEFAULT_TABEL_CONFIG.signers.length),
    },
    {
      key: 'logo',
      header: t('davomat.tsLogo'),
      cell: (r) => (r.logo_path ? <Badge tone="success">{t('davomat.tsOwnLogo')}</Badge> : <span className="text-fg-subtle">{t('davomat.tsSharedLogo')}</span>),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      className: 'pr-4 text-right',
      cell: (r) => (
        <span className="inline-flex gap-1">
          <IconButton size="sm" label={t('davomat.tsLeadersAction')} onClick={() => setLeaders(r)}>
            <Users size={15} />
          </IconButton>
          <IconButton size="sm" label={t('davomat.tsConfigAction')} onClick={() => setConfig(r)}>
            <Pencil size={15} />
          </IconButton>
        </span>
      ),
    },
  ]
  const offset = (view.page - 1) * size
  const rows = view.slice.map((b, i) => ({ ...b, n: offset + i + 1 }))

  return (
    <PageContainer>
      <PageHeader title={t('davomat.tsTitle')} subtitle={t('davomat.tsSubtitle')} />
      <Card className="flex h-[calc(100dvh-11rem)] min-h-[24rem] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('davomat.tsSearch')} className="flex-1 sm:max-w-sm" />
          <FilterReset count={activeFilterCount} onReset={reset} />
          <span className="text-xs text-fg-muted sm:ml-auto">
            {everyBranch ? t('davomat.tsAllBranches') : t('davomat.tsOwnBranches')}
          </span>
        </div>
        <DataTable
          tableId="tz-tabel-settings"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={search ? t('davomat.tsNotFound') : t('davomat.tsEmpty')}
          filtered={activeFilterCount > 0}
          minWidth={760}
        />
        <Pagination page={view.page} size={size} total={view.total} pages={view.pages} onPage={setPage} onSize={setSize} />
      </Card>

      <TabelConfigModal branch={config} onClose={() => setConfig(null)} />
      <BranchLeadersModal branch={leaders} onClose={() => setLeaders(null)} />
    </PageContainer>
  )
}

interface Signer {
  position: string
  name: string
}

function TabelConfigModal({ branch, onClose }: { branch: OrganizationBranch | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const mut = useTabelMutations()
  const open = !!branch
  const fileRef = useRef<HTMLInputElement>(null)

  const [org, setOrg] = useState('')
  const [title, setTitle] = useState('')
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [signers, setSigners] = useState<Signer[]>([])
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!branch) return
    const cfg: TabelConfig = hasConfig(branch) ? branch.tabel_config! : DEFAULT_TABEL_CONFIG
    setOrg(cfg.approver?.org ?? '')
    setTitle(cfg.approver?.title ?? '')
    setName(cfg.approver?.name ?? '')
    setPrefix(cfg.title_prefix ?? '')
    setSigners(cfg.signers?.length ? cfg.signers.map((s) => ({ ...s })) : [{ position: '', name: '' }])
    setLogoFile(null)
    setLogoPath(branch.logo_path ?? null)
    setError('')
  }, [branch])

  // Tanlangan faylning ko'rinishi; eski object URL xotirada qolmasin.
  useEffect(() => {
    if (!logoFile) return setPreview(null)
    const url = URL.createObjectURL(logoFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  const setSigner = (i: number, key: keyof Signer, v: string) =>
    setSigners((p) => p.map((s, x) => (x === i ? { ...s, [key]: v } : s)))

  const pending = mut.updateBranch.isPending || mut.uploadLogo.isPending
  const save = async () => {
    if (!branch) return
    setError('')
    try {
      await mut.updateBranch.mutateAsync({
        id: branch.id,
        body: {
          tabel_config: {
            approver: { org: org.trim(), title: title.trim(), name: name.trim() },
            title_prefix: prefix.trim(),
            signers: signers
              .map((s) => ({ position: s.position.trim(), name: s.name.trim() }))
              .filter((s) => s.position || s.name),
          },
        },
      })
      if (logoFile) await mut.uploadLogo.mutateAsync({ id: branch.id, file: logoFile })
      mut.invalidate()
      toast.ok(t('davomat.tsSaved'))
      onClose()
    } catch (e) {
      mut.invalidate()
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const removeLogo = async () => {
    if (!branch) return
    if (!(await confirm({ kind: 'delete', title: t('davomat.tsLogoRemoveTitle'), description: t('davomat.tsLogoRemoveHint') }))) return
    try {
      await mut.deleteLogo.mutateAsync(branch.id)
      setLogoPath(null)
      mut.invalidate()
      toast.ok(t('davomat.tsLogoRemoved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const shownLogo = preview ?? logoPath

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('davomat.tsConfigTitle')}
      description={branch?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={pending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-[12px] font-semibold uppercase text-brand-strong">{t('davomat.tsApproverBlock')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('davomat.tsOrgName')} wide>
              <Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t('davomat.tsOrgPlaceholder')} />
            </Field>
            <Field label={t('davomat.tsPosition')}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('davomat.tsPositionPlaceholder')} />
            </Field>
            <Field label={t('davomat.tsShortName')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('davomat.tsShortNamePlaceholder')} />
            </Field>
          </div>
        </section>

        <Field label={t('davomat.tsTitlePrefix')}>
          <Textarea value={prefix} onChange={(e) => setPrefix(e.target.value)} rows={2} placeholder={t('davomat.tsTitlePrefixPlaceholder')} />
        </Field>

        <section>
          <p className="mb-2 text-[12px] font-semibold uppercase text-brand-strong">{t('davomat.tsLogoBlock')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setLogoFile(f)
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap items-center gap-3 rounded-inner border border-dashed border-line px-4 py-3">
            {shownLogo ? (
              <img src={shownLogo} alt={t('davomat.tsLogo')} className="h-12 w-auto rounded bg-surface object-contain p-1 ring-1 ring-line" />
            ) : (
              <ImagePlus size={20} className="text-fg-subtle" />
            )}
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
              {logoFile ? logoFile.name : logoPath ? t('davomat.tsLogoPickNew') : t('davomat.tsLogoUpload')}
            </span>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              {t('davomat.tsLogoChoose')}
            </Button>
            {logoFile && (
              <IconButton size="sm" label={t('common.cancel')} onClick={() => setLogoFile(null)}>
                <Trash2 size={14} />
              </IconButton>
            )}
            {!logoFile && logoPath && (
              <IconButton size="sm" label={t('davomat.tsLogoRemoveTitle')} onClick={removeLogo}>
                <Trash2 size={14} />
              </IconButton>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-fg-subtle">{t('davomat.tsLogoHint')}</p>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase text-brand-strong">{t('davomat.tsSignersBlock')}</p>
            <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />} onClick={() => setSigners((p) => [...p, { position: '', name: '' }])}>
              {t('common.add')}
            </Button>
          </div>
          <div className="space-y-2">
            {signers.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-[2]">
                  <Input
                    value={s.position}
                    onChange={(e) => setSigner(i, 'position', e.target.value)}
                    placeholder={t('davomat.tsPosition')}
                    aria-label={t('davomat.tsPosition')}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    value={s.name}
                    onChange={(e) => setSigner(i, 'name', e.target.value)}
                    placeholder={t('davomat.tsFullName')}
                    aria-label={t('davomat.tsFullName')}
                  />
                </div>
                <IconButton size="sm" label={t('common.delete')} onClick={() => setSigners((p) => p.filter((_, x) => x !== i))}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        </section>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

const leaderKey = (l: BranchLeader) => `${l.employee_id ?? l.employee?.id}:${l.leadership_role}`
type PendingLeader = BranchLeader & { _new?: boolean }

function BranchLeadersModal({ branch, onClose }: { branch: OrganizationBranch | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const open = !!branch
  const branchId = branch?.id ?? null
  const { leaders, loading } = useBranchLeaders(branchId, open)
  const { options, employees } = useEmployeeOptions(branchId, open)
  const mut = useTabelMutations()
  const [pending, setPending] = useState<PendingLeader[]>([])
  const [pickEmp, setPickEmp] = useState('')
  const [pickRole, setPickRole] = useState<string>('director')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setPending(leaders.map((l) => ({ ...l })))
  }, [leaders])
  useEffect(() => {
    if (!open) return
    setPickEmp('')
    setPickRole('director')
    setError('')
  }, [open, branchId])

  const roleOptions = LEADERSHIP_ROLES.map((r) => ({ value: r, label: t(`davomat.role_${r}`) }))
  const roleLabel = (r: string) => ((LEADERSHIP_ROLES as readonly string[]).includes(r) ? t(`davomat.role_${r as 'director'}`) : r)

  const add = () => {
    if (!pickEmp) return
    const id = Number(pickEmp)
    // Bir xodim + bir XIL rol takrorlanmaydi; boshqa rol qo'shsa bo'ladi.
    if (pending.some((l) => (l.employee_id ?? l.employee?.id) === id && l.leadership_role === pickRole)) {
      setError(t('davomat.tsLeaderDuplicate'))
      return
    }
    const e = employees.find((x) => x.id === id)
    setPending((p) => [
      ...p,
      {
        employee_id: id,
        leadership_role: pickRole,
        _new: true,
        employee: e
          ? { id: e.id, legal_name: e.legal_name, photo_path: e.photo_path, photo_thumb_path: e.photo_thumb_path, job_position: typeof e.job_position === 'string' ? { name: e.job_position } : e.job_position ?? null }
          : null,
      },
    ])
    setPickEmp('')
    setError('')
  }

  const changeRole = (key: string, role: string) =>
    setPending((p) => {
      const row = p.find((l) => leaderKey(l) === key)
      if (!row) return p
      const id = row.employee_id ?? row.employee?.id
      if (p.some((l) => l !== row && (l.employee_id ?? l.employee?.id) === id && l.leadership_role === role)) {
        setError(t('davomat.tsLeaderDuplicate'))
        return p
      }
      return p.map((l) => (l === row ? { ...l, leadership_role: role } : l))
    })

  const origKeys = new Set(leaders.map(leaderKey))
  const pendKeys = new Set(pending.map(leaderKey))
  const changed = origKeys.size !== pendKeys.size || [...origKeys].some((k) => !pendKeys.has(k))

  const save = async () => {
    if (!branchId) return
    setSaving(true)
    setError('')
    const failures: string[] = []
    // Avval olib tashlanganlar (faqat o'sha rol), keyin yangilari.
    for (const l of leaders.filter((x) => !pendKeys.has(leaderKey(x)))) {
      try {
        await mut.removeLeader.mutateAsync({ id: branchId, employee_id: Number(l.employee_id ?? l.employee?.id), role: l.leadership_role })
      } catch (e) {
        failures.push(`${l.employee?.legal_name ?? l.employee_id}: ${errorMessage(e, t('common.actionFailed'))}`)
      }
    }
    for (const l of pending.filter((x) => !origKeys.has(leaderKey(x)))) {
      try {
        await mut.addLeader.mutateAsync({ id: branchId, employee_id: Number(l.employee_id ?? l.employee?.id), role: l.leadership_role })
      } catch (e) {
        failures.push(`${l.employee?.legal_name ?? l.employee_id}: ${errorMessage(e, t('common.actionFailed'))}`)
      }
    }
    mut.invalidate()
    setSaving(false)
    if (failures.length) {
      setError(failures.join('; '))
      return
    }
    toast.ok(t('davomat.tsLeadersSaved'))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('davomat.tsLeadersTitle')}
      description={branch?.name}
      footer={
        <>
          {changed && <span className="mr-auto text-[12px] text-warning">{t('davomat.tsUnsaved')}</span>}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={saving} disabled={!changed}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-inner border border-line bg-surface-2/60 p-3">
          <p className="mb-2 text-[12px] font-semibold uppercase text-brand-strong">{t('davomat.tsLeaderAdd')}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field label={t('davomat.colEmployee')}>
                <Combobox value={pickEmp} onChange={setPickEmp} options={options} placeholder={t('davomat.tsPickEmployee')} />
              </Field>
            </div>
            <div className="sm:w-44">
              <Field label={t('davomat.tsRole')}>
                <Select value={pickRole} onChange={(e) => setPickRole(e.target.value)} options={roleOptions} />
              </Field>
            </div>
            <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={add} disabled={!pickEmp}>
              {t('common.add')}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase text-brand-strong">{t('davomat.tsLeadersList')}</p>
          {loading ? (
            <div className="flex h-20 items-center justify-center">
              <Spinner />
            </div>
          ) : pending.length === 0 ? (
            <p className="py-4 text-center text-[13px] italic text-fg-subtle">{t('davomat.tsNoLeaders')}</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((l) => {
                const key = leaderKey(l)
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-3 rounded-inner border px-3 py-2 ${l._new ? 'border-success/30 bg-success-soft' : 'border-line'}`}
                  >
                    <Avatar src={l.employee?.photo_thumb_path} fallbackSrc={l.employee?.photo_path} name={l.employee?.legal_name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{l.employee?.legal_name ?? `#${l.employee_id}`}</p>
                      <p className="truncate text-[11.5px] text-fg-muted">{l.employee?.job_position?.name ?? ''}</p>
                    </div>
                    {l._new && <Badge tone="success">{t('davomat.tsNew')}</Badge>}
                    <div className="w-40 shrink-0">
                      <Select
                        value={l.leadership_role}
                        onChange={(e) => changeRole(key, e.target.value)}
                        options={(LEADERSHIP_ROLES as readonly string[]).includes(l.leadership_role)
                          ? roleOptions
                          : [...roleOptions, { value: l.leadership_role, label: roleLabel(l.leadership_role) }]}
                        aria-label={t('davomat.tsRole')}
                      />
                    </div>
                    <IconButton size="sm" label={t('common.delete')} onClick={() => setPending((p) => p.filter((x) => leaderKey(x) !== key))}>
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}
