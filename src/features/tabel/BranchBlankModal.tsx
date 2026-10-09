import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileUp, ImageUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import type { OrganizationBranch } from '@/types'
import {
  useBranchBlankMutations,
  type BlankDocType,
  type BranchBlank,
  type BranchBlanks,
} from './useBranchBlank'

/** What the generator prints when the branch has not overridden the title. */
const DEFAULT_TITLE: Record<BlankDocType, string> = {
  explanatory: 'Bildirgi',
  application: 'Ariza',
  decree: 'BUYRUG‘I',
}

const num = (v: string): number | undefined => {
  const n = Number(v.replace(',', '.'))
  return v.trim() === '' || Number.isNaN(n) ? undefined : n
}

/**
 * THE BRANCH'S OWN BLANK.
 *
 * Each branch prints on its own letterhead, so the logo, the lines under it,
 * the document's title wording and the page margins are all per branch and per
 * document type. Everything left empty falls back to what the generator does
 * today — that is what keeps a branch which never opens this screen unchanged.
 */
export function BranchBlankModal({
  branch,
  onClose,
}: {
  branch: OrganizationBranch | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const mut = useBranchBlankMutations()
  const fileRef = useRef<HTMLInputElement>(null)
  const docxRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<BlankDocType>('explanatory')
  const [draft, setDraft] = useState<BranchBlank>({})

  const saved = useMemo(
    () => ((branch?.document_templates ?? {}) as BranchBlanks)[docType] ?? {},
    [branch, docType],
  )
  useEffect(() => setDraft(saved), [saved])

  if (!branch) return null

  const set = <K extends keyof BranchBlank>(k: K, v: BranchBlank[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const blocks = draft.blocks ?? {}
  /** `undefined` means untouched, which the server reads as "on". */
  const blockOn = (k: keyof typeof blocks) => blocks[k] !== false
  const toggleBlock = (k: 'number_date' | 'addressee' | 'sign_qr' | 'sign_position' | 'city' | 'signature_section') =>
    set('blocks', { ...blocks, [k]: !blockOn(k) })

  /** A stored file wins over the form — see the note above the upload block. */
  const uploaded = saved.file?.name ? saved.file : null

  const pickDocx = async (file: File) => {
    try {
      await mut.uploadTemplate.mutateAsync({ branchId: branch.id, docType, file })
      toast.ok(t('blank.fileUploaded'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const lines = draft.header_lines ?? []
  const setLine = (i: number, v: string) =>
    set('header_lines', lines.map((x, idx) => (idx === i ? v : x)))

  const submit = async () => {
    try {
      await mut.save.mutateAsync({
        branchId: branch.id,
        docType,
        // Drop the empty lines here rather than storing them: the server
        // strips them too, and keeping them would make the form drift from
        // what actually gets printed.
        // `file` is managed by its own endpoints; sending it back here would
        // let a stale copy overwrite a freshly uploaded one.
        blank: {
          ...draft,
          file: undefined,
          header_lines: lines.map((l) => l.trim()).filter(Boolean),
        },
      })
      toast.ok(t('common.saved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const pickLogo = async (file: File) => {
    try {
      await mut.uploadLogo.mutateAsync({ branchId: branch.id, file })
      toast.ok(t('blank.logoUploaded'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('blank.title')}
      description={branch.name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={mut.save.isPending} onClick={() => submit()}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={docType}
          onChange={(v) => setDocType(v as BlankDocType)}
          options={[
            { value: 'explanatory', label: t('letters.typeBildirgi') },
            { value: 'application', label: t('letters.typeAriza') },
            { value: 'decree', label: t('blank.decree') },
          ]}
        />

        {/* ── Tayyor blank ──────────────────────────────────────────
            Yuklangan .docx BLANKNING O'ZI: generator matnni uning ichiga
            yozadi, ya'ni Word'dagi kolontitul, logo va chekkalar saqlanadi.
            Shu sabab fayl turganda quyidagi forma amal qilmaydi. */}
        <div className="rounded-card border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-fg">{t('blank.readyFile')}</span>
            {uploaded ? (
              <span className="truncate rounded-tag bg-success-soft px-2 py-0.5 text-[12px] text-success">
                {uploaded.original || t('blank.fileLoaded')}
              </span>
            ) : (
              <span className="text-[12px] text-fg-subtle">{t('blank.noFile')}</span>
            )}
            <input
              ref={docxRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void pickDocx(f)
                e.target.value = ''
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              leftIcon={<FileUp size={14} />}
              loading={mut.uploadTemplate.isPending}
              onClick={() => docxRef.current?.click()}
            >
              {t('blank.uploadFile')}
            </Button>
            {uploaded && (
              <IconButton
                size="sm"
                label={t('blank.removeFile')}
                onClick={async () => {
                  if (!(await confirm({ kind: 'delete', title: t('blank.removeFile') }))) return
                  void mut.removeTemplate.mutateAsync({ branchId: branch.id, docType })
                }}
              >
                <Trash2 size={14} className="text-danger" />
              </IconButton>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-fg-subtle">
            {uploaded ? t('blank.fileWinsHint') : t('blank.uploadHint')}
          </p>
        </div>

        <div className={cn('grid gap-4 lg:grid-cols-[1fr_260px]', uploaded && 'opacity-45')}>
          <div className="space-y-3.5">
            {/* ── Logo ───────────────────────────────────────────────── */}
            <div className="rounded-card border border-line p-3">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={!!draft.logo}
                  onChange={(e) => set('logo', e.target.checked)}
                  label={t('blank.showLogo')}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void pickLogo(f)
                    e.target.value = ''
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  leftIcon={<ImageUp size={14} />}
                  loading={mut.uploadLogo.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('blank.uploadLogo')}
                </Button>
                {branch.logo_path && (
                  <IconButton
                    size="sm"
                    label={t('blank.removeLogo')}
                    onClick={async () => {
                      if (!(await confirm({ kind: 'delete', title: t('blank.removeLogo') }))) return
                      void mut.removeLogo.mutateAsync(branch.id)
                    }}
                  >
                    <Trash2 size={14} className="text-danger" />
                  </IconButton>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('blank.logoWidth')} hint={t('blank.logoWidthHint')}>
                  <Input
                    value={draft.logo_width_cm != null ? String(draft.logo_width_cm) : ''}
                    inputMode="decimal"
                    onChange={(e) => set('logo_width_cm', num(e.target.value))}
                  />
                </Field>
                <Field label={t('blank.logoAlign')}>
                  <Select
                    value={draft.logo_align ?? 'center'}
                    onChange={(e) => set('logo_align', e.target.value as BranchBlank['logo_align'])}
                    options={[
                      { value: 'left', label: t('blank.alignLeft') },
                      { value: 'center', label: t('blank.alignCenter') },
                      { value: 'right', label: t('blank.alignRight') },
                    ]}
                  />
                </Field>
              </div>
              {!branch.logo_path && (
                <p className="mt-2 text-[11.5px] text-fg-subtle">{t('blank.noLogoHint')}</p>
              )}
            </div>

            {/* ── Header lines ───────────────────────────────────────── */}
            <Field label={t('blank.headerLines')} hint={t('blank.headerLinesHint')}>
              <div className="space-y-1.5">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input value={l} onChange={(e) => setLine(i, e.target.value)} />
                    <IconButton
                      size="sm"
                      label={t('common.delete')}
                      onClick={() => set('header_lines', lines.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                ))}
                {lines.length < 8 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Plus size={14} />}
                    onClick={() => set('header_lines', [...lines, ''])}
                  >
                    {t('blank.addLine')}
                  </Button>
                )}
              </div>
            </Field>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label={t('blank.docTitle')} hint={DEFAULT_TITLE[docType]}>
                <Input
                  value={draft.title ?? ''}
                  placeholder={DEFAULT_TITLE[docType]}
                  onChange={(e) => set('title', e.target.value)}
                />
              </Field>
              <Field label={t('blank.footer')}>
                <Input value={draft.footer ?? ''} onChange={(e) => set('footer', e.target.value)} />
              </Field>
            </div>

            {/* ── Standart shablon bloklari ─────────────────────────────
                Hujjatda chiqadigan ma'lumot bo'laklari. Sukut bo'yicha
                hammasi yoqilgan — belgini olib tashlagandagina yo'qoladi. */}
            <Field label={t('blank.blocks')} hint={t('blank.blocksHint')}>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {docType !== 'decree' && (
                  <>
                    {docType === 'explanatory' && (
                      <Checkbox
                        checked={blockOn('number_date')}
                        onChange={() => toggleBlock('number_date')}
                        label={t('blank.blkNumberDate')}
                      />
                    )}
                    <Checkbox
                      checked={blockOn('addressee')}
                      onChange={() => toggleBlock('addressee')}
                      label={t('blank.blkAddressee')}
                    />
                    <Checkbox
                      checked={blockOn('sign_position')}
                      onChange={() => toggleBlock('sign_position')}
                      label={t('blank.blkSignPosition')}
                    />
                  </>
                )}
                {docType === 'decree' && (
                  <>
                    <Checkbox
                      checked={blockOn('city')}
                      onChange={() => toggleBlock('city')}
                      label={t('blank.blkCity')}
                    />
                    <Checkbox
                      checked={blockOn('signature_section')}
                      onChange={() => toggleBlock('signature_section')}
                      label={t('blank.blkSignSection')}
                    />
                  </>
                )}
                <Checkbox
                  checked={blockOn('sign_qr')}
                  onChange={() => toggleBlock('sign_qr')}
                  label={t('blank.blkSignQr')}
                />
              </div>
              {docType === 'decree' && blockOn('city') && (
                <div className="mt-2">
                  <Input
                    value={blocks.city_text ?? ''}
                    placeholder={t('blank.cityFromRegion')}
                    aria-label={t('blank.blkCity')}
                    onChange={(e) => set('blocks', { ...blocks, city_text: e.target.value })}
                  />
                </div>
              )}
            </Field>

            <Field label={t('blank.margins')} hint={t('blank.marginsHint')}>
              <div className="grid grid-cols-4 gap-2">
                {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                  <Input
                    key={side}
                    value={draft.margins?.[side] != null ? String(draft.margins[side]) : ''}
                    inputMode="decimal"
                    aria-label={t(`blank.margin_${side}` as never)}
                    placeholder={t(`blank.margin_${side}` as never)}
                    onChange={(e) =>
                      set('margins', { ...(draft.margins ?? {}), [side]: num(e.target.value) })
                    }
                  />
                ))}
              </div>
            </Field>
          </div>

          {/* ── Preview: the top of the sheet, roughly to scale ───────── */}
          <div>
            <p className="mb-1.5 text-[11.5px] text-fg-subtle">
              {t('blank.preview')}
            </p>
            <div className="rounded-card border border-line bg-white p-4 text-black shadow-sm">
              <div
                className={cn(
                  'flex flex-col gap-1',
                  draft.logo_align === 'left'
                    ? 'items-start text-left'
                    : draft.logo_align === 'right'
                      ? 'items-end text-right'
                      : 'items-center text-center',
                )}
              >
                {draft.logo && (
                  <img loading="lazy" decoding="async"
                    src={branch.logo_path ?? '/logo.png'}
                    alt=""
                    style={{ width: `${(draft.logo_width_cm ?? 2.5) * 14}px` }}
                    className="object-contain"
                  />
                )}
                {lines.filter(Boolean).map((l, i) => (
                  <p key={i} className="text-[10.5px] font-bold leading-tight">{l}</p>
                ))}
              </div>
              <p className="mt-3 text-center text-[12px] font-bold uppercase">
                {draft.title?.trim() || DEFAULT_TITLE[docType]}
              </p>
              <div className="mt-2 space-y-1">
                {[92, 100, 84, 96].map((w, i) => (
                  <div key={i} className="h-1 rounded bg-black/10" style={{ width: `${w}%` }} />
                ))}
              </div>
              {draft.footer?.trim() && (
                <p className="mt-3 border-t border-black/10 pt-1.5 text-center text-[9.5px] text-black/60">
                  {draft.footer}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
