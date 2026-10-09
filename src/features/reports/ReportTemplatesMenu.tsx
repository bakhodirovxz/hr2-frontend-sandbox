import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import type { ReportParams, ReportPrefs, ReportTemplate } from './types'
import { useReportTemplates } from './useReportPrefs'

interface Props {
  code: string
  params: ReportParams
  prefs: ReportPrefs | null
  onLoad: (tpl: ReportTemplate) => void
}

/** Named parameter sets: load one, save the current form as a new one, delete. */
export function ReportTemplatesMenu({ code, params, prefs, onLoad }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { templates, save, remove } = useReportTemplates(code)
  const [picked, setPicked] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')

  const doSave = async () => {
    try {
      await save.mutateAsync({ name: name.trim(), params, prefs })
      toast.ok(t('reports.templateSaved'))
      setSaveOpen(false)
      setName('')
    } catch (e) {
      toast.error(errorMessage(e, t('reports.templateFailed')))
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t('reports.templates')} className="min-w-[220px]">
        <Select
          value={picked}
          placeholder={t('reports.templatePick')}
          options={templates.map((tp) => ({ value: String(tp.id), label: tp.name }))}
          onChange={(e) => {
            setPicked(e.target.value)
            const tpl = templates.find((x) => String(x.id) === e.target.value)
            if (tpl) onLoad(tpl)
          }}
        />
      </Field>
      <Button variant="outline" size="sm" leftIcon={<BookmarkPlus size={14} />} onClick={() => setSaveOpen(true)}>
        {t('reports.templateSave')}
      </Button>
      {picked && (
        <Button
          variant="ghost"
          size="sm"
          loading={remove.isPending}
          onClick={async () => {
            const name = templates.find((x) => String(x.id) === picked)?.name
            if (!(await confirm({ kind: 'delete', subject: name }))) return
            try {
              await remove.mutateAsync(Number(picked))
              setPicked('')
              toast.ok(t('reports.templateDeleted'))
            } catch (e) {
              toast.error(errorMessage(e, t('reports.templateFailed')))
            }
          }}
        >
          <Trash2 size={14} className="text-danger" />
        </Button>
      )}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        size="sm"
        title={t('reports.templateSave')}
        description={t('reports.templateHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={doSave} loading={save.isPending} disabled={!name.trim()}>{t('common.save')}</Button>
          </>
        }
      >
        <Field label={t('reports.templateName')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        </Field>
      </Modal>
    </div>
  )
}
