import { useRef, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useFileDrop } from '@/hooks/useFileDrop'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useBranchStore } from '@/store/branchStore'
import { cn } from '@/lib/cn'
import {
  useAllVideoGuides,
  useVideoGuideCatalog,
  useVideoGuideMutations,
  type VideoGuide,
} from './useVideoGuides'
import { TH, TD, TD_MESSAGE } from '@/components/data/tableStyles'

type Notice = (kind: 'ok' | 'warn', text: string) => void

/** Admin-only upload/edit/delete surface for video guides. */
export function VideoGuideManager({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  const { all, loading } = useAllVideoGuides(true)
  const { catalog } = useVideoGuideCatalog(true)
  const branches = useBranchStore((s) => s.branches)
  const mut = useVideoGuideMutations()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<VideoGuide | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pageKey, setPageKey] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [branchId, setBranchId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  /**
   * DAVOMIYLIK — kartochkada ko'rsatiladi (`VideoGuidePage`), lekin v2 uni
   * hech qachon yubormasdi, ya'ni belgisi doim bo'sh edi.
   *
   * Foydalanuvchidan SO'RAMAYMIZ: brauzer faylning o'zidan o'qiy oladi va bu
   * har doim to'g'ri bo'ladi (v1 uni qo'lda kiritishni talab qilardi).
   */
  const [duration, setDuration] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<VideoGuide | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  /* Only a VIDEO here — the shared hook defaults to images too, and a pasted
     screenshot in a video-guide form would silently become the clip. Paste is
     not offered for the same reason: nobody has a video on the clipboard. */
  const { dragging, dropProps } = useFileDrop({
    enabled: false,
    onFiles: (files) => pickFile(files[0] ?? null),
    accept: (f) => f.type.startsWith('video/'),
  })

  const openForm = (v?: VideoGuide) => {
    setEditing(v ?? null)
    setTitle(v?.title ?? '')
    setDescription(v?.description ?? '')
    setPageKey(v?.page_key ?? '')
    setRoles(v?.roles ?? [])
    setBranchId(v?.organization_branch_id != null ? String(v.organization_branch_id) : '')
    setSortOrder(String(v?.sort_order ?? 0))
    setIsActive(v?.is_active !== false)
    setFile(null)
    setDuration(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
    setOpen(true)
  }

  /** Faylni olib, uzunligini metama'lumotdan o'qiydi. */
  const pickFile = (f: File | null) => {
    setFile(f)
    setDuration(null)
    if (!f) return
    const url = URL.createObjectURL(f)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      // Oqim uzunligi noma'lum bo'lsa `Infinity` keladi — uni yubormaymiz.
      if (Number.isFinite(probe.duration)) setDuration(Math.round(probe.duration))
      URL.revokeObjectURL(url)
    }
    probe.onerror = () => URL.revokeObjectURL(url)
    probe.src = url
  }

  const toggleRole = (key: string) =>
    setRoles((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]))

  const save = async () => {
    if (!title.trim()) return setError(t('videoGuide.titleRequired'))
    if (!pageKey) return setError(t('videoGuide.pageRequired'))
    if (!editing && !file) return setError(t('videoGuide.fileRequired'))

    const fd = new FormData()
    fd.append('title', title.trim())
    fd.append('page_key', pageKey)
    fd.append('description', description.trim())
    // Empty string is meaningful: it CLEARS the branch ("all branches"). The
    // backend reads these as strings for exactly that reason.
    fd.append('organization_branch_id', branchId)
    fd.append('roles', JSON.stringify(roles))
    fd.append('sort_order', String(Number(sortOrder) || 0))
    fd.append('is_active', String(isActive))
    if (file) fd.append('file', file)
    if (duration != null) fd.append('duration_seconds', String(duration))

    setSaving(true)
    try {
      if (editing) await mut.update.mutateAsync({ id: editing.id, fd })
      else await mut.create.mutateAsync(fd)
      mut.invalidate()
      setOpen(false)
      onNotice('ok', t('videoGuide.uploaded'))
    } catch {
      onNotice('warn', t('videoGuide.uploadFailed'))
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target) return
    try {
      await mut.remove.mutateAsync(target.id)
      mut.invalidate()
      onNotice('ok', t('videoGuide.deleted'))
    } catch {
      onNotice('warn', t('videoGuide.uploadFailed'))
    }
  }

  const pageLabel = (key: string) => catalog.pages.find((p) => p.key === key)?.label ?? key

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">{t('videoGuide.tabManage')}</h2>
        <Button size="sm" className="ml-auto" onClick={() => openForm()}>
          <Plus size={14} /> {t('videoGuide.upload')}
        </Button>
      </div>

      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 720 }}>
          <thead>
            <tr className="border-b border-line text-[11.5px] font-semibold text-fg-muted">
              <th className={TH}>{t('videoGuide.colTitle')}</th>
              <th className={TH}>{t('videoGuide.colPage')}</th>
              <th className={cn(TH, "text-right")}>{t('videoGuide.colViews')}</th>
              <th className={TH}>{t('videoGuide.colStatus')}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className={TD_MESSAGE}>
                  …
                </td>
              </tr>
            ) : all.length === 0 ? (
              <tr>
                <td colSpan={5} className={TD_MESSAGE}>
                  {t('videoGuide.manageEmpty')}
                </td>
              </tr>
            ) : (
              all.map((v) => (
                <tr key={v.id} className="border-b border-line text-sm last:border-0">
                  <td className={cn(TD, ".5")}>
                    <span
                      className={cn(
                        'font-medium',
                        v.is_active === false ? 'text-fg-subtle line-through' : 'text-fg',
                      )}
                    >
                      {v.title}
                    </span>
                  </td>
                  <td className={cn(TD, ".5 text-fg-muted")}>{pageLabel(v.page_key)}</td>
                  <td className={cn(TD, ".5 text-right tabular-nums text-fg-muted")}>{v.view_count}</td>
                  <td className={cn(TD, ".5")}>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        v.is_active === false
                          ? 'bg-surface-2 text-fg-muted'
                          : 'bg-success-soft text-success',
                      )}
                    >
                      {v.is_active === false ? t('videoGuide.statusInactive') : t('videoGuide.statusActive')}
                    </span>
                  </td>
                  <td className={cn(TD, ".5")}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('common.edit')}
                        onClick={() => openForm(v)}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-danger"
                        aria-label={t('common.delete')}
                        onClick={() => setConfirmDelete(v)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('videoGuide.editVideo') : t('videoGuide.upload')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={saving}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('videoGuide.fieldTitle')}</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('videoGuide.fieldDescription')}</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('videoGuide.fieldPage')}</span>
            <Select
              value={pageKey}
              onChange={(e) => setPageKey(e.target.value)}
              placeholder={t('videoGuide.fieldPage')}
              options={catalog.pages.map((p) => ({ value: p.key, label: `${p.group} · ${p.label}` }))}
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm text-fg-muted">{t('videoGuide.fieldRoles')}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {catalog.roles.map((r) => (
                <Checkbox
                  key={r.key}
                  checked={roles.includes(r.key)}
                  onChange={() => toggleRole(r.key)}
                  label={r.label}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-fg-subtle">{t('videoGuide.rolesHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('videoGuide.fieldBranch')}</span>
              <Select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder={t('videoGuide.branchAll')}
                options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('videoGuide.fieldSortOrder')}</span>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-sm text-fg-muted">{t('videoGuide.fieldFile')}</span>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) pickFile(f)
                e.target.value = ''
              }}
            />
            {/* Drag the clip straight in — v1 accepts a drop here and picking
                a video through a dialog is the slower path for a file that is
                usually already sitting in a folder on screen. */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              {...dropProps}
              className={cn(
                'flex min-h-[56px] w-full items-center gap-3 rounded-lg border-2 border-dashed px-4 text-left transition-colors',
                dragging
                  ? 'border-brand bg-brand-soft'
                  : file
                    ? 'border-brand/30 bg-brand-soft'
                    : 'border-line bg-surface-2 hover:border-brand/40',
              )}
            >
              <Upload size={18} className="shrink-0 text-fg-subtle" />
              <span className="truncate text-sm text-fg-muted">
                {dragging
                  ? t('videoGuide.fileDrop')
                  : file
                    ? file.name
                    : editing
                      ? t('videoGuide.fileKeep')
                      : t('videoGuide.filePick')}
              </span>
            </button>
          </div>

          <Checkbox
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            label={t('videoGuide.fieldActive')}
          />

          <FormError className="text-xs">{error}</FormError>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('videoGuide.deleteTitle')}
        description={t('videoGuide.deleteConfirm')}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}
