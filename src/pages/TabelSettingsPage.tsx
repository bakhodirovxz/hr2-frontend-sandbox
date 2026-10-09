import { useEffect, useMemo, useRef, useState } from 'react'
import { queryClient } from '@/api/queryClient'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Download, Eye, FileSpreadsheet, FileType, Pencil, Plus, Save, Search, Stamp, Trash2, Users } from 'lucide-react'
import { apiGet } from '@/api/http'
import {
  EMPLOYEES_LIST,
  ORGANIZATION_BRANCH_TABEL_TEMPLATE,
  ORGANIZATION_BRANCH_TABEL_TEMPLATE_SAMPLE,
} from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { downloadFile, XLSX_MIME } from '@/lib/download'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/data/useConfirm'
import { BranchBlankModal } from '@/features/tabel/BranchBlankModal'
import { Select } from '@/components/ui/Select'
import { ClockSelect } from '@/components/ui/ClockSelect'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { useListParams } from '@/hooks/useListParams'
import { paginateClient } from '@/lib/paginate'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import type { Employee, OrganizationBranch, StampCoords } from '@/types'
import type { Page } from '@/features/employees/useEmployees'
import {
  DEFAULT_STAMP_COORDS,
  DEFAULT_TABEL_CONFIG,
  fetchStampPreview,
  LEADERSHIP_ROLES,
  sanitizeStampCoords,
  useBranchLeaders,
  useNextRegNumber,
  useTabelBranches,
  useTabelMutations,
  type BranchLeader,
  type LeadershipRole,
} from '@/features/tabel/useTabel'
import { Textarea } from '@/components/ui/Textarea'
import { control, POPOVER_CLS } from '@/components/ui/control'

type Toast = { kind: 'ok' | 'warn'; text: string } | null

const ROLE_KEY: Record<LeadershipRole, string> = {
  director: 'tabel.roleDirector',
  deputy: 'tabel.roleDeputy',
  chancellery: 'tabel.roleChancellery',
  accounting: 'tabel.roleAccounting',
  legal: 'tabel.roleLegal',
  trip_approver: 'tabel.roleTripApprover',
  akt: 'tabel.roleAkt',
  transport: 'tabel.roleTransport',
  transport_approver: 'tabel.roleTransportApprover',
  nurse: 'tabel.roleNurse',
  hr: 'tabel.roleHr',
  lms_manager: 'tabel.roleLmsManager',
  phone_editor: 'tabel.rolePhoneEditor',
}

export function TabelSettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  // ⚠️ `isSiteMasterAdmin`, not `isMasterAdmin`: the wider one also matches a ministr, whom the server denies here (measured 2026-09-11: 403).
  const isAdmin = roles.isSiteMasterAdmin(user)
  const { search, setSearch, page, setPage, size, setSize } = useListParams()

  const { branches, loading, error, refetch } = useTabelBranches()

  /* `canAdministerBranch` mirrors the server's `assert_branch_admin`. The
     old rule was `organization_branches` membership, i.e. every employee of
     a branch saw its edit buttons (404 on save) while a director appointed
     over another branch could not see that branch at all. */
  const execBranchId = useMemo(() => branches.find((b) => b.is_head_office)?.id ?? null, [branches])
  const isGlobal = isAdmin || roles.isBranchAdmin(user) || (roles.isHR(user) && roles.canSwitchBranchScope(user, execBranchId))
  const canEdit = (b: OrganizationBranch) => roles.canAdministerBranch(user, b.id, { execBranchId })
  const canEditLeaders = (b: OrganizationBranch) =>
    roles.canAdministerBranch(user, b.id, { execBranchId, leadersOnly: true })

  const visible = useMemo(
    () => (isGlobal ? branches : branches.filter((b) => roles.canAdministerBranch(user, b.id, { execBranchId }))),
    [branches, isGlobal, user, execBranchId],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? visible.filter((b) => (b.name || '').toLowerCase().includes(q)) : visible
  }, [visible, search])

  const { slice: rows, total, pages } = paginateClient(filtered, page, size)

  const [configBranch, setConfigBranch] = useState<OrganizationBranch | null>(null)
  // The id, not a snapshot: the modal must read the branch from the live list,
  // or an upload/removal (which refetches `tabel-branches`) never reached it
  // and it kept saying "no file" until closed and reopened.
  const [blankBranchId, setBlankBranchId] = useState<number | null>(null)
  const blankBranch = useMemo(
    () => (blankBranchId == null ? null : visible.find((b) => b.id === blankBranchId) ?? null),
    [blankBranchId, visible],
  )
  const [leadersBranch, setLeadersBranch] = useState<OrganizationBranch | null>(null)
  const [toast, setToast] = useState<Toast>(null)

  /** Exactly one branch in scope → show its settings instead of a one-row table. */
  const soleBranch = !isGlobal && visible.length === 1 ? visible[0] : null

  const columns: Column<OrganizationBranch>[] = [
    {
      key: 'name',
      header: t('tabel.colBranch'),
      skeleton: 'w-[360px]',
      cell: (b) => <span className="font-semibold text-fg">{b.name}</span>,
    },
    {
      key: 'approver',
      header: t('tabel.colApprover'),
      skeleton: 'w-40',
      cell: (b) => {
        const name = b.tabel_config?.approver?.name
        return name ? (
          <span className="text-fg-muted">{name}</span>
        ) : (
          <span className="italic text-fg-subtle">{t('tabel.approverDefault')}</span>
        )
      },
    },
    {
      key: 'signers',
      header: t('tabel.colSigners'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-10',
      cell: (b) => b.tabel_config?.signers?.length ?? 3,
    },
    {
      key: 'stamp',
      header: t('tabel.colStamp'),
      skeleton: 'w-16',
      cell: (b) =>
        b.stamp_path ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Stamp size={13} /> {t('tabel.stampSet')}
          </span>
        ) : (
          <span className="text-fg-subtle">{t('tabel.stampNone')}</span>
        ),
    },
    {
      key: 'actions',
      skeleton: 'w-40',
      header: t('tabel.colActions'),
      className: 'text-right',
      cell: (b) =>
        canEdit(b) ? (
          <div className="flex items-center justify-end gap-1.5">
            {canEditLeaders(b) && (
              <Button
                size="icon"
                variant="ghost"
                title={t('tabel.editLeaders')}
                onClick={() => setLeadersBranch(b)}
              >
                <Users size={15} />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              title={t('tabel.editConfig')}
              onClick={() => setConfigBranch(b)}
            >
              <Pencil size={15} />
            </Button>
            {/* Blank: logo + sarlavha + hujjat nomi, har hujjat turiga alohida. */}
            <Button
              size="icon"
              variant="ghost"
              title={t('blank.title')}
              onClick={() => setBlankBranchId(b.id)}
            >
              <FileType size={15} />
            </Button>
          </div>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('tabel.title')} subtitle={t('tabel.subtitle')} />

      {toast && (
        <div
          className={cn(
            'mb-3 rounded-lg border px-3 py-2 text-sm',
            toast.kind === 'ok'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-warning/30 bg-warning/10 text-warning',
          )}
          role="status"
        >
          {toast.text}
        </div>
      )}

      {/*
        ⚠️ BITTA FILIALLI FOYDALANUVCHIGA JADVAL KERAK EMAS.
        Ekran ko'p filialli bosh administrator uchun qurilgan: qatorni topib,
        so'ng ikkita alohida oyna ochish kerak. Filial kadrida esa filial
        BITTA — u har safar o'sha bitta qatorni qidirib, ikki marta oyna
        ochardi. Endi bitta filial bo'lsa sozlamalar TO'G'RIDAN-TO'G'RI
        ko'rinadi; ko'p filialli foydalanuvchida jadval avvalgidek qoladi.
      */}
      {soleBranch ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <span className="text-[15px] font-semibold text-fg">{soleBranch.name}</span>
            <span className="ml-auto text-xs text-fg-subtle">{t('tabel.scopeOwn')}</span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setConfigBranch(soleBranch)}
              className="flex flex-col items-start gap-1 rounded-inner border border-line p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
            >
              <span className="text-[14px] font-semibold text-fg">{t('tabel.colConfig')}</span>
              <span className="text-xs text-fg-muted">{t('tabel.configHint')}</span>
            </button>
            {canEditLeaders(soleBranch) && (
              <button
                type="button"
                onClick={() => setLeadersBranch(soleBranch)}
                className="flex flex-col items-start gap-1 rounded-inner border border-line p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
              >
                <span className="text-[14px] font-semibold text-fg">{t('tabel.leadersTitle')}</span>
                <span className="text-xs text-fg-muted">{t('tabel.leadersHint')}</span>
              </button>
            )}
          </div>
        </Card>
      ) : (
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative w-72 max-w-full">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tabel.search')}
              className="pl-9"
            />
          </div>
          <span className="ml-auto text-xs text-fg-subtle">
            {isGlobal ? t('tabel.scopeAll') : t('tabel.scopeOwn')}
          </span>
        </div>

        <DataTable
        tableId="tabel-settings"
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={search ? t('tabel.emptySearch') : t('tabel.empty')}
        />

        <div className="flex items-center justify-between gap-3 border-t border-line p-3">
          <span className="text-sm text-fg-muted">{t('tabel.total', { count: filtered.length })}</span>
          <Pagination page={page} pages={pages} size={size} total={total} onPage={setPage} onSize={setSize} />
        </div>
      </Card>
      )}

      <BranchBlankModal branch={blankBranch} onClose={() => setBlankBranchId(null)} />

      {configBranch && (
        <TabelConfigModal
          branch={configBranch}
          onClose={() => setConfigBranch(null)}
          onSaved={() => {
            setToast({ kind: 'ok', text: t('tabel.saved') })
            setConfigBranch(null)
          }}
          onError={(text) => setToast({ kind: 'warn', text })}
        />
      )}
      {leadersBranch && (
        <BranchLeadersModal
          branch={leadersBranch}
          onClose={() => setLeadersBranch(null)}
          onSaved={() => {
            setToast({ kind: 'ok', text: t('tabel.leaderSaved') })
            setLeadersBranch(null)
          }}
          onError={(text) => setToast({ kind: 'warn', text })}
        />
      )}
    </PageContainer>
  )
}

// ─── Config modal ─────────────────────────────────────────────────────────────

function TabelConfigModal({
  branch,
  onClose,
  onSaved,
  onError,
}: {
  branch: OrganizationBranch
  onClose: () => void
  onSaved: () => void
  onError: (text: string) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const mut = useTabelMutations()
  // The preview endpoint answers 403 to anyone outside the branch except the
  // site master admin (`peek_next_registered_number`); an executive HR editing
  // another branch's settings used to fire one silent 403 per branch.
  const previewUser = useAuthStore((st) => st.user)
  const canPreviewNumber = roles.isSiteMasterAdmin(previewUser) || roles.employeeBranchIds(previewUser).includes(Number(branch.id))
  const { info: nextNum, refetch: reloadNextNum } = useNextRegNumber(branch.id, canPreviewNumber)

  const cfg: import('@/types').TabelConfig =
    branch.tabel_config && Object.keys(branch.tabel_config).length > 0
      ? branch.tabel_config
      : DEFAULT_TABEL_CONFIG

  const [approverOrg, setApproverOrg] = useState(cfg.approver?.org ?? '')
  const [approverTitle, setApproverTitle] = useState(cfg.approver?.title ?? '')
  const [approverName, setApproverName] = useState(cfg.approver?.name ?? '')
  const [titlePrefix, setTitlePrefix] = useState(cfg.title_prefix ?? '')
  const [bildirgiPrefix, setBildirgiPrefix] = useState(branch.bildirgi_number_prefix ?? '')
  const [registrationStart, setRegistrationStart] = useState(
    cfg.registration_start != null ? String(cfg.registration_start) : '',
  )
  const [guvohnomaPrefix, setGuvohnomaPrefix] = useState(cfg.guvohnoma_number_prefix ?? '')
  const [guvohnomaStart, setGuvohnomaStart] = useState(
    cfg.guvohnoma_number_start != null ? String(cfg.guvohnoma_number_start) : '',
  )
  // This branch's own lateness tolerance. EMPTY means "use the system-wide
  // value", which is what an untouched branch must keep doing — a branch that
  // starts earlier or works shifts should not be forced onto the head office's
  // number, but neither should every branch have to restate it.
  const [lateGrace, setLateGrace] = useState(
    cfg.late_grace_minutes != null ? String(cfg.late_grace_minutes) : '',
  )
  // This branch's WORKING DAY. Same "empty = inherit" rule as the tolerance
  // above: these are the fallback for employees whose own card carries no
  // hours, so a station that opens at 08:00 sets it once here instead of
  // editing every card — and its own HR can do it, not only a master admin.
  const [workStart, setWorkStart] = useState(cfg.default_work_start ?? '')
  const [workEnd, setWorkEnd] = useState(cfg.default_work_end ?? '')
  const [lunchStart, setLunchStart] = useState(cfg.default_lunch_start ?? '')
  const [lunchEnd, setLunchEnd] = useState(cfg.default_lunch_end ?? '')
  // «Avtomatik to'liq ish kuni»: the branch's GENERAL tabel shows every
  // working day as a full day (the day's norm, 8 h on a full card). Personal
  // tabels keep showing facts — the server decides that, not this screen.
  const [autoFullDay, setAutoFullDay] = useState(cfg.auto_full_day === true)
  const [signers, setSigners] = useState<{ position: string; name: string }[]>(
    cfg.signers && cfg.signers.length > 0 ? cfg.signers.map((s) => ({ ...s })) : [{ position: '', name: '' }],
  )
  const [stampFile, setStampFile] = useState<File | null>(null)
  const stampInputRef = useRef<HTMLInputElement>(null)
  // The branch's own Excel tabel form. Kept locally because `branch` is the
  // list's snapshot: the upload response carries the fresh record, so the
  // new file name shows at once instead of after the next refetch.
  const tplInputRef = useRef<HTMLInputElement>(null)
  const readTplMeta = (b: OrganizationBranch) => {
    const entry = (b.document_templates as Record<string, { file?: { original?: string; name?: string } }> | null)?.tabel
    return entry?.file?.name ? { original: entry.file.original || entry.file.name } : null
  }
  const [tplMeta, setTplMeta] = useState<{ original: string } | null>(() => readTplMeta(branch))
  const [tplBusy, setTplBusy] = useState(false)
  const [tplError, setTplError] = useState<string | null>(null)

  const uploadTemplate = async (file: File) => {
    setTplBusy(true)
    setTplError(null)
    try {
      const updated = await mut.uploadTabelTemplate.mutateAsync({ id: branch.id, file })
      setTplMeta(readTplMeta(updated))
      mut.invalidate()
    } catch (err) {
      setTplError(errorMessage(err, t('tabel.tplUploadFail')))
    } finally {
      setTplBusy(false)
    }
  }
  const removeTemplate = async () => {
    if (!(await confirm({ kind: 'delete', title: t('tabel.tplRemove') }))) return
    setTplBusy(true)
    setTplError(null)
    try {
      const updated = await mut.deleteTabelTemplate.mutateAsync({ id: branch.id })
      setTplMeta(readTplMeta(updated))
      mut.invalidate()
    } catch (err) {
      setTplError(errorMessage(err, t('tabel.tplUploadFail')))
    } finally {
      setTplBusy(false)
    }
  }
  const downloadTemplate = async (sample: boolean) => {
    try {
      await downloadFile({
        url: sample ? ORGANIZATION_BRANCH_TABEL_TEMPLATE_SAMPLE : ORGANIZATION_BRANCH_TABEL_TEMPLATE(branch.id),
        params: sample ? { organization_branch_id: branch.id } : undefined,
        filename: sample ? 'tabel-shablon-namuna.xlsx' : `${tplMeta?.original?.replace(/\.xlsx?$/i, '') || 'tabel-shablon'}.xlsx`,
        mime: XLSX_MIME,
      })
    } catch (err) {
      setTplError(errorMessage(err, t('tabel.tplUploadFail')))
    }
  }

  const initCoords: StampCoords = {
    number: (cfg.stamp_coords?.number as [number, number]) ?? DEFAULT_STAMP_COORDS.number,
    day: (cfg.stamp_coords?.day as [number, number]) ?? DEFAULT_STAMP_COORDS.day,
    month: (cfg.stamp_coords?.month as [number, number]) ?? DEFAULT_STAMP_COORDS.month,
    year: (cfg.stamp_coords?.year as [number, number]) ?? DEFAULT_STAMP_COORDS.year,
    font_pct: cfg.stamp_coords?.font_pct ?? DEFAULT_STAMP_COORDS.font_pct,
  }
  // Coords held as strings so the fields can be cleared while typing.
  const [coords, setCoords] = useState<Record<string, [string, string]>>({
    number: [String(initCoords.number[0]), String(initCoords.number[1])],
    day: [String(initCoords.day[0]), String(initCoords.day[1])],
    month: [String(initCoords.month[0]), String(initCoords.month[1])],
    year: [String(initCoords.year[0]), String(initCoords.year[1])],
  })
  const [fontPct, setFontPct] = useState(String(initCoords.font_pct))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewRef = useRef<string | null>(null)

  const numericCoords = (): Partial<StampCoords> => ({
    number: [Number(coords.number[0]), Number(coords.number[1])],
    day: [Number(coords.day[0]), Number(coords.day[1])],
    month: [Number(coords.month[0]), Number(coords.month[1])],
    year: [Number(coords.year[0]), Number(coords.year[1])],
    font_pct: Number(fontPct),
  })

  const loadPreview = async () => {
    setPreviewLoading(true)
    const url = await fetchStampPreview(branch.id, numericCoords())
    setPreviewLoading(false)
    if (!url) {
      onError(t('tabel.previewFail'))
      return
    }
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
  }

  // Debounced auto-preview when coords change. Skipped while no stamp exists —
  // otherwise opening the modal for a stamp-less branch immediately warns.
  const coordsKey = JSON.stringify([coords, fontPct])
  useEffect(() => {
    if (!branch.stamp_path && !stampFile) return undefined
    const id = setTimeout(() => {
      void loadPreview()
    }, 500)
    return () => clearTimeout(id)
  }, [coordsKey, branch.stamp_path, stampFile])

  useEffect(() => {
    previewRef.current = previewUrl
  }, [previewUrl])
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  const setCoord = (key: string, axis: 0 | 1, value: string) =>
    setCoords((prev) => {
      const next = [...prev[key]] as [string, string]
      next[axis] = value
      return { ...prev, [key]: next }
    })

  const updateSigner = (i: number, field: 'position' | 'name', value: string) =>
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))

  const save = async () => {
    const sanitized = sanitizeStampCoords(numericCoords())
    const payload = {
      tabel_config: {
        approver: { org: approverOrg, title: approverTitle, name: approverName },
        title_prefix: titlePrefix,
        signers: signers.filter((s) => s.position.trim() || s.name.trim()),
        stamp_coords: sanitized,
        registration_start:
          registrationStart.trim() === '' ? null : Math.max(0, parseInt(registrationStart, 10) || 0),
        guvohnoma_number_prefix: guvohnomaPrefix.trim() || null,
        guvohnoma_number_start:
          guvohnomaStart.trim() === '' ? null : Math.max(0, parseInt(guvohnomaStart, 10) || 0),
        late_grace_minutes:
          lateGrace.trim() === '' ? null : Math.min(180, Math.max(0, parseInt(lateGrace, 10) || 0)),
        default_work_start: workStart || null,
        default_work_end: workEnd || null,
        default_lunch_start: lunchStart || null,
        default_lunch_end: lunchEnd || null,
        // `false`, not null: the server stores the config without nulls, and
        // switching it off must actually remove the old `true`.
        auto_full_day: autoFullDay,
      },
      bildirgi_number_prefix: bildirgiPrefix.trim(),
    }
    try {
      await mut.updateBranch.mutateAsync({ id: branch.id, body: payload })
    } catch {
      onError(t('tabel.saveFail'))
      return
    }
    if (stampFile) {
      try {
        await mut.uploadStamp.mutateAsync({ id: branch.id, file: stampFile })
      } catch {
        onError(t('tabel.stampUploadFail'))
        return
      }
    }
    void reloadNextNum()
    mut.invalidate()
    onSaved()
  }

  const COORD_ROWS: { key: string; labelKey: string }[] = [
    { key: 'number', labelKey: 'tabel.coordNumber' },
    { key: 'day', labelKey: 'tabel.coordDay' },
    { key: 'month', labelKey: 'tabel.coordMonth' },
    { key: 'year', labelKey: 'tabel.coordYear' },
  ]

  // Raw <input>s in this modal share the app's one control definition.
  const field = control({ className: 'w-full px-3' })
  const sectionTitle = 'mb-2.5 text-[13px] font-bold text-brand-strong'

  return (
    <Modal
      open
      onClose={onClose}
      title={t('tabel.cfgTitle')}
      description={branch.name}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={mut.updateBranch.isPending || mut.uploadStamp.isPending}>
            <Save size={15} /> {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Approver */}
        <section>
          <p className={sectionTitle}>{t('tabel.secApprover')}</p>
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldOrg')}</span>
              <input className={field} value={approverOrg} onChange={(e) => setApproverOrg(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-fg-muted">{t('tabel.fieldPosition')}</span>
                <input className={field} value={approverTitle} onChange={(e) => setApproverTitle(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-fg-muted">{t('tabel.fieldShortName')}</span>
                <input className={field} value={approverName} onChange={(e) => setApproverName(e.target.value)} />
              </label>
            </div>
          </div>
        </section>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-fg-muted">{t('tabel.fieldTitlePrefix')}</span>
          <Textarea
            rows={2}
      
            value={titlePrefix}
            onChange={(e) => setTitlePrefix(e.target.value)}
          />
        </label>

        {/* Registration number */}
        <section>
          <p className={sectionTitle}>{t('tabel.secRegNum')}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldPrefix')}</span>
              <input className={field} value={bildirgiPrefix} onChange={(e) => setBildirgiPrefix(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldStart')}</span>
              <input
                type="number"
                min={0}
                className={field}
                value={registrationStart}
                onChange={(e) => setRegistrationStart(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg border border-brand/25 bg-brand-soft px-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-xs text-fg-subtle">{t('tabel.nextNumLabel')}</span>
              <span className="mt-0.5 text-base font-bold tabular-nums text-brand-strong">
                {nextNum?.next_number || '—'}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-xs text-fg-subtle">{t('tabel.lastNumLabel')}</span>
              <span className="block text-sm tabular-nums text-fg-muted">{nextNum?.last_number || '—'}</span>
            </div>
          </div>
          {nextNum?.detail && <p className="mt-1.5 text-xs text-warning">{nextNum.detail}</p>}
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('tabel.regNumHint')}</p>
        </section>

        {/* Guvohnoma number */}
        <section>
          <p className={sectionTitle}>{t('tabel.secGuvohnoma')}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldPrefix')}</span>
              <input className={field} value={guvohnomaPrefix} onChange={(e) => setGuvohnomaPrefix(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldStart')}</span>
              <input
                type="number"
                min={0}
                className={field}
                value={guvohnomaStart}
                onChange={(e) => setGuvohnomaStart(e.target.value)}
              />
            </label>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('tabel.guvohnomaHint')}</p>
        </section>

        {/* Automatic full working day for the whole branch */}
        <section>
          <p className={sectionTitle}>{t('tabel.secAutoFullDay')}</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-2/40 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
              checked={autoFullDay}
              onChange={(e) => setAutoFullDay(e.target.checked)}
            />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-fg">{t('tabel.fieldAutoFullDay')}</span>
              <span className="text-xs leading-relaxed text-fg-subtle">{t('tabel.autoFullDayHint')}</span>
            </span>
          </label>
        </section>

        {/* This branch's lateness tolerance */}
        <section>
          <p className={sectionTitle}>{t('tabel.secLate')}</p>
          <label className="flex max-w-[220px] flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('tabel.fieldLateGrace')}</span>
            <input
              type="number"
              min={0}
              max={180}
              className={field}
              value={lateGrace}
              onChange={(e) => setLateGrace(e.target.value)}
              placeholder={t('tabel.lateGracePlaceholder')}
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('tabel.lateGraceHint')}</p>
        </section>

        {/* This branch's working day — the fallback for cards with no hours */}
        <section>
          <p className={sectionTitle}>{t('tabel.secWorkDay')}</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldWorkStart')}</span>
              <ClockSelect value={workStart} onChange={setWorkStart} emptyLabel={t('tabel.lateGracePlaceholder')} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldWorkEnd')}</span>
              <ClockSelect value={workEnd} onChange={setWorkEnd} emptyLabel={t('tabel.lateGracePlaceholder')} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldLunchStart')}</span>
              <ClockSelect value={lunchStart} onChange={setLunchStart} emptyLabel={t('tabel.lateGracePlaceholder')} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('tabel.fieldLunchEnd')}</span>
              <ClockSelect value={lunchEnd} onChange={setLunchEnd} emptyLabel={t('tabel.lateGracePlaceholder')} />
            </label>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('tabel.workDayHint')}</p>
        </section>

        {/* Own Excel tabel form */}
        <section>
          <p className={sectionTitle}>{t('tabel.secTemplate')}</p>
          <input
            ref={tplInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadTemplate(f)
              e.target.value = ''
            }}
          />
          <div
            className={cn(
              'flex min-h-[72px] w-full items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3',
              tplMeta ? 'border-brand/30 bg-brand-soft' : 'border-line bg-surface-2',
            )}
          >
            <FileSpreadsheet size={20} className="shrink-0 text-fg-subtle" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {tplMeta ? (
                <>
                  <span className="truncate text-sm font-medium text-fg">{tplMeta.original}</span>
                  <span className="text-xs text-fg-subtle">{t('tabel.tplActive')}</span>
                </>
              ) : (
                <>
                  <span className="text-sm text-fg">{t('tabel.tplNone')}</span>
                  <span className="text-xs text-fg-subtle">{t('tabel.tplNoneHint')}</span>
                </>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {tplMeta && (
                <Button variant="secondary" size="sm" onClick={() => void downloadTemplate(false)} disabled={tplBusy}>
                  <Download size={14} /> {t('tabel.tplDownload')}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => tplInputRef.current?.click()} disabled={tplBusy}>
                {tplMeta ? t('tabel.tplReplace') : t('tabel.tplUpload')}
              </Button>
              {tplMeta && (
                <Button variant="danger-ghost" size="sm" onClick={() => void removeTemplate()} disabled={tplBusy}>
                  <Trash2 size={14} /> {t('tabel.tplRemove')}
                </Button>
              )}
            </div>
          </div>
          {tplError && <p className="mt-1.5 text-xs text-danger">{tplError}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline"
              onClick={() => void downloadTemplate(true)}
            >
              <Download size={12} /> {t('tabel.tplSample')}
            </button>
            <span className="text-xs text-fg-subtle">{t('tabel.tplSampleHint')}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('tabel.tplHint')}</p>
        </section>

        {/* Stamp upload */}
        <section>
          <p className={sectionTitle}>{t('tabel.secStamp')}</p>
          <input
            ref={stampInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setStampFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => stampInputRef.current?.click()}
            className={cn(
              'flex min-h-[72px] w-full items-center gap-3 rounded-lg border-2 border-dashed px-4 text-left transition-colors',
              stampFile || branch.stamp_path
                ? 'border-brand/30 bg-brand-soft'
                : 'border-line bg-surface-2 hover:border-brand/40',
            )}
          >
            <Stamp size={20} className="shrink-0 text-fg-subtle" />
            {stampFile ? (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate text-sm text-fg">{stampFile.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded p-1 text-danger hover:bg-danger/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    setStampFile(null)
                    if (stampInputRef.current) stampInputRef.current.value = ''
                  }}
                >
                  <Trash2 size={14} />
                </span>
              </div>
            ) : branch.stamp_path ? (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <img loading="lazy" decoding="async"
                  src={branch.stamp_path}
                  alt="stamp"
                  crossOrigin="anonymous"
                  className="h-12 w-auto rounded bg-white/90 object-contain p-1"
                />
                <span className="shrink-0 text-xs text-fg-subtle">{t('tabel.stampChange')}</span>
              </div>
            ) : (
              <span className="text-sm text-fg-subtle">{t('tabel.stampUpload')}</span>
            )}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('tabel.stampHint')}</p>
        </section>

        {/* Stamp text coordinates + live preview */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <p className={cn(sectionTitle, 'mb-0')}>{t('tabel.secCoords')}</p>
            <Button size="sm" variant="ghost" onClick={() => loadPreview()} disabled={previewLoading}>
              <Eye size={14} /> {t('tabel.coordPreview')}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {COORD_ROWS.map(({ key, labelKey }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-sm text-fg-muted">{t(labelKey as never)}</span>
                <div className="flex flex-1 items-center gap-1.5">
                  <span className="shrink-0 text-xs text-fg-subtle">X</span>
                  <input
                    type="number"
                    step="0.1"
                    className={cn(field, 'h-9')}
                    value={coords[key][0]}
                    onChange={(e) => setCoord(key, 0, e.target.value)}
                  />
                  <span className="shrink-0 text-xs text-fg-subtle">Y</span>
                  <input
                    type="number"
                    step="0.1"
                    className={cn(field, 'h-9')}
                    value={coords[key][1]}
                    onChange={(e) => setCoord(key, 1, e.target.value)}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-sm text-fg-muted">{t('tabel.coordFont')}</span>
              <input
                type="number"
                step="0.1"
                className={cn(field, 'h-9 flex-1')}
                value={fontPct}
                onChange={(e) => setFontPct(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex min-h-[120px] items-center justify-center overflow-hidden rounded-lg border border-line bg-white/90 p-2">
            {previewLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
            ) : previewUrl ? (
              <img loading="lazy" decoding="async" src={previewUrl} alt="shtamp" className="max-h-[220px] w-auto object-contain" />
            ) : (
              <span className="text-xs text-black/40">{t('tabel.previewEmpty')}</span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t('tabel.previewHint')}</p>
        </section>

        {/* Signers */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <p className={cn(sectionTitle, 'mb-0')}>{t('tabel.secSigners')}</p>
            <Button size="sm" variant="ghost" onClick={() => setSigners((p) => [...p, { position: '', name: '' }])}>
              <Plus size={14} /> {t('tabel.addSigner')}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {signers.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={cn(field, 'h-9 flex-[2]')}
                  placeholder={t('tabel.signerPosition')}
                  value={s.position}
                  onChange={(e) => updateSigner(i, 'position', e.target.value)}
                />
                <input
                  className={cn(field, 'h-9 flex-1')}
                  placeholder={t('tabel.signerName')}
                  value={s.name}
                  onChange={(e) => updateSigner(i, 'name', e.target.value)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-danger"
                  onClick={() => setSigners((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  )
}

// ─── Leaders modal ────────────────────────────────────────────────────────────

type PendingLeader = BranchLeader & { _new?: boolean }
const leaderKey = (l: BranchLeader) => `${l.employee_id ?? l.employee?.id}:${l.leadership_role}`

function BranchLeadersModal({
  branch,
  onClose,
  onSaved,
  onError,
}: {
  branch: OrganizationBranch
  onClose: () => void
  onSaved: () => void
  onError: (text: string) => void
}) {
  const { t } = useTranslation()
  const mut = useTabelMutations()
  const { leaders, loading, refetch } = useBranchLeaders(branch.id, true)

  const [pending, setPending] = useState<PendingLeader[]>([])
  const [original, setOriginal] = useState<BranchLeader[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null)
  const [role, setRole] = useState<LeadershipRole>('director')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setOriginal(leaders)
    setPending(leaders.map((l) => ({ ...l })))
  }, [leaders])

  /*
   * AKT (technical support) may be appointed ACROSS branches by the master
   * admin — v1 does this deliberately (`TabelSettingsPage.jsx:124`): BFD and
   * Gidro share a building, so their engineers cover for each other. v2 always
   * pinned the search to this branch, which made that appointment impossible.
   *
   * ⚠️ `_no_branch_inject` rather than `organization_branch_id: null` — the
   * axios interceptor re-adds the header branch when only the latter is used,
   * so the widening would be silently undone (the same note is in v1).
   */
  const leaderPickerUser = useAuthStore((st) => st.user)
  const crossBranchPicker = roles.isSiteMasterAdmin(leaderPickerUser) && role === 'akt'
  const { data: empData } = useQuery({
    queryKey: ['tabel-emp-search', branch.id, empSearch, crossBranchPicker],
    queryFn: () =>
      apiGet<Page<Employee>>(EMPLOYEES_LIST, {
        ...(crossBranchPicker
          ? { _no_branch_inject: true }
          : { organization_branch_id: branch.id }),
        search: empSearch || undefined,
        size: 20,
      }),
    enabled: empSearch.trim().length > 0,
  })
  const candidates = empData?.items ?? []

  const roleOptions = LEADERSHIP_ROLES.map((r) => ({ value: r, label: t(ROLE_KEY[r] as never) }))

  const addLeader = () => {
    if (!selectedEmp) return
    if (pending.some((l) => (l.employee_id ?? l.employee?.id) === selectedEmp.id && l.leadership_role === role)) {
      onError(t('tabel.leaderDup'))
      return
    }
    const jp = selectedEmp.job_position
    setPending((prev) => [
      ...prev,
      {
        employee_id: selectedEmp.id,
        leadership_role: role,
        employee: {
          id: selectedEmp.id,
          legal_name: selectedEmp.legal_name,
          job_position: jp && typeof jp === 'object' ? { name: jp.name } : null,
        },
        _new: true,
      },
    ])
    setSelectedEmp(null)
    setEmpSearch('')
  }

  const changeRole = (key: string, newRole: string) =>
    setPending((prev) => {
      const row = prev.find((l) => leaderKey(l) === key)
      if (!row) return prev
      const empId = row.employee_id ?? row.employee?.id
      if (prev.some((l) => l !== row && (l.employee_id ?? l.employee?.id) === empId && l.leadership_role === newRole)) {
        onError(t('tabel.leaderDup'))
        return prev
      }
      return prev.map((l) => (l === row ? { ...l, leadership_role: newRole } : l))
    })

  const hasChanges = useMemo(() => {
    const o = new Set(original.map(leaderKey))
    const p = new Set(pending.map(leaderKey))
    if (o.size !== p.size) return true
    for (const k of o) if (!p.has(k)) return true
    return false
  }, [original, pending])

  const save = async () => {
    setSaving(true)
    const oKeys = new Set(original.map(leaderKey))
    const pKeys = new Set(pending.map(leaderKey))
    let failed = false
    try {
      for (const l of original.filter((l) => !pKeys.has(leaderKey(l)))) {
        const empId = l.employee_id ?? l.employee?.id
        if (!empId) continue
        try {
          await mut.removeLeader.mutateAsync({ id: branch.id, employee_id: empId, role: l.leadership_role })
        } catch {
          failed = true
        }
      }
      for (const l of pending.filter((l) => !oKeys.has(leaderKey(l)))) {
        const empId = l.employee_id ?? l.employee?.id
        if (!empId) continue
        try {
          await mut.addLeader.mutateAsync({ id: branch.id, employee_id: empId, role: l.leadership_role })
        } catch {
          failed = true
        }
      }
      await refetch()
      mut.invalidate()
      // `auth/me` carries every `*_branch_ids` role list the menu and buttons
      // gate on; appointing yourself (nurse, chancellery, phone editor…)
      // changed nothing on screen until a reload.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      if (failed) onError(t('tabel.leaderSaveFail'))
      else onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('tabel.leadersTitle')}
      description={branch.name}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {hasChanges ? (
            <span className="text-xs text-warning">{t('tabel.unsaved')}</span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={saving || !hasChanges}>
              <Save size={15} /> {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Add leader */}
        <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-[13px] font-bold text-brand-strong">{t('tabel.leaderAdd')}</p>
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              value={selectedEmp ? selectedEmp.legal_name ?? '' : empSearch}
              onChange={(e) => {
                setSelectedEmp(null)
                setEmpSearch(e.target.value)
              }}
              placeholder={t('tabel.leaderSelectEmp')}
              className="pl-9"
            />
            {!selectedEmp && empSearch.trim() && candidates.length > 0 && (
              <div className={cn(POPOVER_CLS, 'absolute z-10 mt-1 max-h-56 w-full overflow-auto')}>
                {candidates.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      setSelectedEmp(emp)
                      setEmpSearch('')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <Avatar src={emp.photo_thumb_path} name={emp.legal_name} size={28} />
                    <span className="truncate text-fg">{emp.legal_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select options={roleOptions} value={role} onChange={(e) => setRole(e.target.value as LeadershipRole)} />
            </div>
            <Button onClick={addLeader} disabled={!selectedEmp}>
              <Plus size={15} /> {t('tabel.addSigner')}
            </Button>
          </div>
        </div>

        {/* Assigned leaders */}
        <div>
          <p className="mb-2 text-[13px] font-bold text-brand-strong">{t('tabel.leaderList')}</p>
          {loading ? (
            <div className="py-6 text-center text-sm text-fg-subtle">…</div>
          ) : pending.length === 0 ? (
            <p className="py-6 text-center text-sm italic text-fg-subtle">{t('tabel.leaderEmpty')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((l) => {
                const key = leaderKey(l)
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-2.5',
                      l._new ? 'border-success/30 bg-success/5' : 'border-line bg-surface-2',
                    )}
                  >
                    <Avatar src={l.employee?.photo_thumb_path} fallbackSrc={l.employee?.photo_path} name={l.employee?.legal_name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">
                        {l.employee?.legal_name ?? `#${l.employee_id}`}
                      </p>
                      {l.employee?.job_position?.name && (
                        <p className="truncate text-xs text-fg-subtle">{l.employee.job_position.name}</p>
                      )}
                    </div>
                    {l._new && (
                      <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
                        {t('tabel.leaderNew')}
                      </span>
                    )}
                    {/* Xom `<select>` EMAS — `ui/Select` yagona manba. */}
                    <Select
                      value={l.leadership_role}
                      onChange={(e) => changeRole(key, e.target.value)}
                      options={roleOptions}
                      aria-label={t('tabel.leaderRole')}
                      className="h-control-sm !py-1 text-xs"
                      wrapperClassName="shrink-0"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-danger"
                      onClick={() => setPending((p) => p.filter((x) => leaderKey(x) !== key))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
