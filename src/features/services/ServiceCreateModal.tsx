import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Button, Combobox, Field, Input, Modal, Textarea, useToast } from '@/components/ui'
import { errorMessage } from '@/api/errorMessage'
import { useBranchStore } from '@/store/branchStore'
import { useServiceMutations, type ServiceCatalogItem, type ServiceType } from './useServices'
import { serviceLabel } from './serviceLabel'

const BLANK_PAYLOAD = {
  last_name: '',
  first_name: '',
  middle_name: '',
  position: '',
  phone: '',
  note: '',
}

/**
 * Submitting a request — TZ 4.2.12 §1 («интерфейс подачи запросов и заявок»).
 *
 * Only the JOB APPLICATION carries applicant details: a certificate is asked
 * for BY an employee the system already knows, so re-typing their own name
 * would be a form asking the product a question it can answer itself.
 */
export function ServiceCreateModal({
  open,
  onClose,
  catalog,
  initialType,
}: {
  open: boolean
  onClose: () => void
  catalog: ServiceCatalogItem[]
  initialType?: ServiceType | null
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { create } = useServiceMutations()
  const branches = useBranchStore((s) => s.branches)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)

  const available = catalog.filter((c) => c.available)
  const [type, setType] = useState<string>('')
  const [purpose, setPurpose] = useState('')
  const [branchId, setBranchId] = useState('')
  const [payload, setPayload] = useState(BLANK_PAYLOAD)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setPurpose('')
    setPayload(BLANK_PAYLOAD)
    setBranchId(selectedBranchId ? String(selectedBranchId) : '')
    setType(initialType ?? available[0]?.type ?? '')
    // `available` is derived from catalog; keying on the modal opening is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialType])

  const isApplication = type === 'job_application'

  const submit = async () => {
    if (!type) {
      setError(t('services.pickService'))
      return
    }
    if (isApplication && !payload.last_name.trim()) {
      setError(t('services.lastNameRequired'))
      return
    }
    try {
      await create.mutateAsync({
        service_type: type,
        purpose: purpose.trim() || null,
        organization_branch_id: isApplication && branchId ? Number(branchId) : null,
        payload: isApplication ? payload : null,
      })
      toast.ok(t('services.submitted'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('services.submitFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('services.newRequest')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {t('services.send')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label={t('services.serviceType')} required>
          <Combobox
            value={type}
            onChange={setType}
            options={available.map((c) => ({ value: c.type, label: serviceLabel(c.type, c.label) }))}
            placeholder={t('services.pickService')}
          />
        </Field>

        {isApplication && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('services.lastName')} required>
                <Input
                  value={payload.last_name}
                  onChange={(e) => setPayload((p) => ({ ...p, last_name: e.target.value }))}
                />
              </Field>
              <Field label={t('services.firstName')}>
                <Input
                  value={payload.first_name}
                  onChange={(e) => setPayload((p) => ({ ...p, first_name: e.target.value }))}
                />
              </Field>
              <Field label={t('services.middleName')}>
                <Input
                  value={payload.middle_name}
                  onChange={(e) => setPayload((p) => ({ ...p, middle_name: e.target.value }))}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('services.desiredPosition')}>
                <Input
                  value={payload.position}
                  onChange={(e) => setPayload((p) => ({ ...p, position: e.target.value }))}
                />
              </Field>
              <Field label={t('services.phone')}>
                <Input
                  value={payload.phone}
                  onChange={(e) => setPayload((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+998 __ ___ __ __"
                />
              </Field>
            </div>
            <Field label={t('services.branch')}>
              <Combobox
                value={branchId}
                onChange={setBranchId}
                options={branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))}
                placeholder={t('header.selectBranch')}
              />
            </Field>
          </>
        )}

        <Field label={t('services.purpose')} hint={t('services.purposeHint')}>
          <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} />
        </Field>
      </div>

      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
