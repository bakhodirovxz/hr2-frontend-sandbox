import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { FileText, Plus, Trash2, Upload } from 'lucide-react'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { SearchInput } from '@/components/data/SearchInput'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { formatAppDate } from '@/lib/format'
import { useListParams } from '@/hooks/useListParams'
import { useBranches } from '@/hooks/useBranches'
import {
  useDecreeTemplateMutations,
  useDecreeTemplates,
  type DecreeTemplate,
} from './useDecreeTemplates'

/**
 * DECREE .docx TEMPLATES.
 *
 * ⚠️ THE SERVER HAS OFFERED FULL CRUD HERE ALL ALONG WITH NO SCREEN ANYWHERE —
 * v1 never even declared the URL. A category's template could only be uploaded
 * or replaced by calling the API directly, which in practice meant a developer
 * did it, and nobody could see which templates existed.
 */
export function DecreeTemplatesTab({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { search, setSearch, page, setPage, size, setSize } = useListParams()
  const list = useDecreeTemplates(search, page, size)
  const mut = useDecreeTemplateMutations()
  const [editing, setEditing] = useState<DecreeTemplate | 'new' | null>(null)
  const [removing, setRemoving] = useState<DecreeTemplate | null>(null)
  const { branches } = useBranches()

  const columns: Column<DecreeTemplate>[] = [
    {
      key: 'name',
      header: t('decreeTemplates.colName'),
      cell: (r) => (
        <span className="flex items-center gap-2">
          <FileText size={15} className="shrink-0 text-fg-subtle" />
          <span className="truncate text-fg">{r.name || `#${r.id}`}</span>
        </span>
      ),
    },
    {
      key: 'branch',
      header: t('decreeTemplates.colBranch'),
      cell: (r) =>
        r.organization_branch_id
          ? (branches.find((b) => b.id === r.organization_branch_id)?.name ??
            `#${r.organization_branch_id}`)
          : t('decreeTemplates.allBranches'),
    },
    {
      key: 'updated',
      header: t('decreeTemplates.colUpdated'),
      cell: (r) => (r.updated_at ? formatAppDate(r.updated_at) : '—'),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) =>
        canWrite ? (
          <span className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
              {t('common.edit')}
            </Button>
            <Button
              size="sm"
              variant="danger-ghost"
              leftIcon={<Trash2 size={14} />}
              onClick={() => setRemoving(r)}
            >
              {t('common.delete')}
            </Button>
          </span>
        ) : null,
    },
  ]

  return (
    <Card>
      <CardHeader
        title={t('decreeTemplates.title')}
        subtitle={t('decreeTemplates.subtitle')}
        action={
          canWrite ? (
            <Button leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
              {t('decreeTemplates.add')}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3">
        <SearchInput value={search} onChange={setSearch} />
      </div>

      <DataTable
        tableId="decree-templates"
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        onRetry={list.refetch}
        filtered={!!search}
        emptyTitle={t('decreeTemplates.empty')}
        emptyDescription={t('decreeTemplates.emptyHint')}
        minWidth={760}
      />

      <Pagination
        page={page}
        size={size}
        total={list.total}
        pages={list.pages}
        onPage={setPage}
        onSize={setSize}
        loading={list.fetching}
      />

      <TemplateModal
        value={editing}
        onClose={() => setEditing(null)}
        onDone={(msg) => {
          toast.ok(msg)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={t('decreeTemplates.deleteTitle')}
        description={removing?.name ?? undefined}
        confirmLabel={t('common.delete')}
        loading={mut.remove.isPending}
        onConfirm={async () => {
          if (!removing) return
          try {
            await mut.remove.mutateAsync(removing.id)
            toast.ok(t('decreeTemplates.deleted'))
            setRemoving(null)
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />
    </Card>
  )
}

function TemplateModal({
  value,
  onClose,
  onDone,
}: {
  value: DecreeTemplate | 'new' | null
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const mut = useDecreeTemplateMutations()
  const { branches } = useBranches()
  const isEdit = !!value && value !== 'new'
  const row = isEdit ? (value as DecreeTemplate) : null

  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [variables, setVariables] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    setError('')
    setFile(null)
    setName(row?.name ?? '')
    setBranchId(row?.organization_branch_id ? String(row.organization_branch_id) : '')
    setVariables(row?.template_variables ? JSON.stringify(row.template_variables, null, 2) : '')
  }, [value, row])

  if (!value) return null

  const submit = async () => {
    if (!name.trim()) return setError(t('decreeTemplates.nameRequired'))
    // On create the file IS the template — there is nothing to render without
    // it. On edit an empty picker means "keep the current document".
    if (!isEdit && !file) return setError(t('decreeTemplates.fileRequired'))

    let vars: string | null = null
    if (variables.trim()) {
      try {
        JSON.parse(variables)
        vars = variables.trim()
      } catch {
        return setError(t('decreeTemplates.variablesInvalid'))
      }
    }

    /*
     * MULTIPART, NOT JSON: every field on these routes is `Form(...)` and the
     * document is `File(...)`. A JSON body comes back as a 422 that does not
     * name the offending field, which is exactly how the learning module's
     * lesson upload was lost for a while.
     */
    const fd = new FormData()
    fd.append('name', name.trim())
    if (file) fd.append('template_file', file)
    if (branchId) fd.append('organization_branch_id', branchId)
    if (vars) fd.append('template_variables', vars)

    try {
      if (isEdit && row) {
        await mut.update.mutateAsync({ id: row.id, fd })
        onDone(t('decreeTemplates.updated'))
      } else {
        await mut.create.mutateAsync(fd)
        onDone(t('decreeTemplates.created'))
      }
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? t('decreeTemplates.editTitle') : t('decreeTemplates.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.create.isPending || mut.update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('decreeTemplates.colName')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label={t('decreeTemplates.colBranch')} hint={t('decreeTemplates.branchHint')}>
          <Select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            placeholder={t('decreeTemplates.allBranches')}
            options={branches.map((b) => ({ value: String(b.id), label: b.name ?? String(b.id) }))}
          />
        </Field>

        <Field
          label={t('decreeTemplates.file')}
          required={!isEdit}
          hint={isEdit ? t('decreeTemplates.fileEditHint') : t('decreeTemplates.fileHint')}
        >
          <label className="flex cursor-pointer items-center gap-2 rounded-inner border border-line bg-surface px-3 py-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-2">
            <Upload size={15} />
            <span className="min-w-0 flex-1 truncate">
              {file ? file.name : t('decreeTemplates.pickFile')}
            </span>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
          </label>
        </Field>

        <Field label={t('decreeTemplates.variables')} hint={t('decreeTemplates.variablesHint')}>
          <textarea
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            rows={5}
            spellCheck={false}
            className="w-full rounded-inner border border-line bg-surface px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-brand"
          />
        </Field>
      </div>

      <FormError className="mt-3 text-[13px] text-[13px]">{error}</FormError>
    </Modal>
  )
}
