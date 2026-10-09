import { useEffect, useMemo, useRef, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ComboRows, RowList } from '@/components/ui/RowList'
import { Segmented } from '@/components/ui/Segmented'
import { useFleetAccess } from '@/features/vehicles/useVehicles'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { useLeadershipOptions } from '@/features/employees/useLeadershipOptions'
import { cn } from '@/lib/cn'
import { normalizeLetterType, useLetterMutations, type LetterFull } from './useLetters'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { isInvalidRange } from '@/lib/dateRange'

/** Backend letter_type values. `bildirgi`/`ariza` are LABELS only — sending
 *  them creates a letter the agreement flow does not recognise (no addressee
 *  check, no draft status, an immediately burned number). */
type LetterType = 'explanatory' | 'application' | 'business_trip'

/** Bildirgi/ariza body = short summary, blank line, then the text (v1 parity). */
function buildDescription(shortSummary: string, text: string): string {
  const s = shortSummary.trim()
  const b = text.trim()
  if (s && b) return `${s}\n\n${b}`
  return s || b || ''
}


export function CreateLetterModal({
  open,
  onClose,
  onCreated,
  editLetter = null,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
  /** Present → edit an existing DRAFT instead of creating (v1 parity: the
   *  author fixes the text before it ever reaches an agreer). */
  editLetter?: LetterFull | null
}) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  // A site admin has no employee row, so for a trip they must SAY who travels.
  const needsTraveller = !user?.employee?.id
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const branches = useBranchStore((s) => s.branches)
  const branchId = selectedBranchId ?? user?.employee?.department?.organization_branch_id ?? null
  const mut = useLetterMutations()

  const [type, setType] = useState<LetterType>('explanatory')
  const [shortSummary, setShortSummary] = useState('')
  const [text, setText] = useState('')
  /** Row-addressed like v1 — a row may be empty while the user picks. */
  const [agreerIds, setAgreerIds] = useState<string[]>([])
  const [addresseeId, setAddresseeId] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // Trip
  const [regions, setRegions] = useState<string[]>([])
  const [destinationIds, setDestinationIds] = useState<string[]>([])
  const [departureDate, setDepartureDate] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [workPlan, setWorkPlan] = useState('')
  const [submitterId, setSubmitterId] = useState('')
  const [leadershipId, setLeadershipId] = useState('')
  // Transport: does this trip need a car from the fleet? The traveller does NOT
  // choose WHICH car — BFD assigns one after the approver signs off.
  const [vehicleNeeded, setVehicleNeeded] = useState(false)
  const [vehicleNote, setVehicleNote] = useState('')

  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isTrip = type === 'business_trip'
  /** Business trips run a SINGLE flow (sign -> chancellery -> report). The
   *  second flow (head branch + manual bildirgi number) was removed on
   *  2026-08-20, so every trip uses the submitter/leadership form. */
  // Only a branch on the fleet's requester list may ask for a car; the server
  // applies the same rule, so offering it elsewhere would only produce a 400.
  const { access: fleetAccess } = useFleetAccess()
  const canRequestVehicle =
    isTrip && !!branchId && (fleetAccess?.requester_branch_ids ?? []).map(Number).includes(Number(branchId))

  const isOldTripFlow = isTrip

  const { options: employeeOptions, error: employeeOptionsError } = useEmployeeOptions(branchId, open)
  const { options: agreerOptions } = useEmployeeOptions(branchId, open && !isTrip, {
    requirePosition: true,
  })
  const { options: leadershipOptions, error: leadershipOptionsError } = useLeadershipOptions(branchId, open)

  useEffect(() => {
    if (!open) return
    setError('')
    if (fileRef.current) fileRef.current.value = ''
    setFile(null)

    if (editLetter) {
      const lt = normalizeLetterType(editLetter.letter_type) as LetterType
      setType(lt === 'business_trip' ? 'business_trip' : lt === 'application' ? 'application' : 'explanatory')
      // Stored as "short summary\n\nbody" for bildirgi/ariza (buildDescription).
      const desc = editLetter.description ?? ''
      if (lt === 'business_trip') {
        setShortSummary('')
        setText(desc)
      } else {
        const [head, ...rest] = desc.split('\n\n')
        setShortSummary(rest.length ? head : '')
        setText(rest.length ? rest.join('\n\n') : desc)
      }
      const signers = editLetter.assigned_signers ?? []
      setAddresseeId(String(signers.find((a) => a.signer_type === 'addressee')?.employee_id ?? ''))
      setAgreerIds(
        signers.filter((a) => a.signer_type === 'agreement').map((a) => String(a.employee_id ?? '')),
      )
      setAuthorId(String(editLetter.creator_employee_id ?? editLetter.creator_employee?.id ?? ''))
      setRegions(editLetter.destination_regions ?? [])
      setDestinationIds((editLetter.destination_branches ?? []).map((b) => String(b.id)))
      setDepartureDate(editLetter.departure_date ?? '')
      // An existing request opens the form in "car needed" mode — the request
      // can be withdrawn here, which is why it must be visible here.
      setVehicleNeeded(!!editLetter.vehicle_request)
      setVehicleNote(editLetter.vehicle_request?.request_note ?? '')
      setArrivalDate(editLetter.arrival_date ?? '')
      setWorkPlan(editLetter.work_plan ?? '')
      setSubmitterId(String(editLetter.submitter_id ?? ''))
      setLeadershipId(
        String(signers.find((a) => a.signer_type === 'management')?.employee_id ?? ''),
      )
      return
    }

    setType('explanatory')
    setShortSummary('')
    setText('')
    setAgreerIds([])
    setAddresseeId('')
    setAuthorId('')
    setRegions([])
    setDestinationIds([])
    setDepartureDate('')
    setArrivalDate('')
    setWorkPlan('')
    setSubmitterId('')
    setLeadershipId('')
  }, [open, editLetter])

  /** A branch may serve several regions; fall back to the legacy single field. */
  const branchRegions = (b: { regions?: string[] | null; region?: string | null }) =>
    (b.regions?.length ? b.regions : b.region ? [b.region] : []).filter(Boolean) as string[]

  const regionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const b of branches) branchRegions(b).forEach((r) => set.add(r))
    return Array.from(set)
      .sort()
      .map((r) => ({ value: r, label: r }))
  }, [branches])

  /** Only branches inside the chosen regions can be trip destinations. */
  const destinationOptions = useMemo(() => {
    const picked = regions.filter(Boolean)
    if (picked.length === 0) return []
    return branches
      .filter((b) => branchRegions(b).some((r) => picked.includes(r)))
      .map((b) => ({ value: String(b.id), label: b.name }))
  }, [branches, regions])

  /** Dropping a region must drop its branches too. */
  const changeRegions = (next: string[]) => {
    setRegions(next)
    const allowed = new Set(
      branches
        .filter((b) => branchRegions(b).some((r) => next.includes(r)))
        .map((b) => String(b.id)),
    )
    setDestinationIds((ids) => ids.filter((id) => !id || allowed.has(id)))
  }

  const submit = async () => {
    setError('')
    const agreers = agreerIds.filter(Boolean)
    const destinations = destinationIds.filter(Boolean)
    const pickedRegions = regions.filter(Boolean)

    if (isTrip) {
      if (pickedRegions.length === 0) return setError(t('letters.regionsRequired'))
      if (destinations.length === 0) return setError(t('letters.destinationsRequired'))
      if (!departureDate || !arrivalDate) return setError(t('letters.datesRequired'))
      if (isInvalidRange(departureDate, arrivalDate)) return setError(t('list.invalidRange'))
      // Old flow signs through the leadership, so it must be named up front.
      if (isOldTripFlow && !leadershipId) return setError(t('letters.leadershipRequired'))
    } else {
      // The backend requires exactly one addressee for explanatory/application.
      if (!addresseeId) return setError(t('letters.addresseeRequired'))
      if (!shortSummary.trim() && !text.trim()) return setError(t('letters.descRequired'))
      if (type === 'application' && agreers.length === 0) return setError(t('letters.agreerRequired'))
    }

    // letter_number / letter_date are NOT sent — the chancellery assigns them on
    // registration (v1 does the same).
    const payload: Record<string, unknown> = {
      letter_type: type,
      organization_branch_id: branchId,
      description: isTrip ? text.trim() || null : buildDescription(shortSummary, text),
    }

    if (isTrip && needsTraveller && !authorId) return setError(t('letters.travellerRequired'))
    if (isTrip) {
      Object.assign(payload, {
        destination_branch_ids: destinations.map(Number),
        destination_regions: pickedRegions,
        // The traveller. Only a caller with NO employee record (site admins)
        // can name one — an employee is always their own traveller and the
        // server ignores the field for them. Without this the master-admin
        // got 400 `letter_author_required` with nothing to fill in
        // (measured 2026-09-11; PROD carried 8 such trips).
        ...(needsTraveller ? { creator_employee_id: authorId ? Number(authorId) : null } : {}),
        departure_date: departureDate || null,
        arrival_date: arrivalDate || null,
        // Old-flow fields are always sent; the backend uses them only when the
        // branch actually runs the old flow.
        work_plan: workPlan.trim() || null,
        submitter_id: submitterId ? Number(submitterId) : null,
        rahbariyat_ids: leadershipId ? [Number(leadershipId)] : [],
        // Sent only from a branch entitled to ask (the server enforces the same
        // rule); `false` on edit cancels a request that already exists.
        ...(canRequestVehicle
          ? { vehicle_needed: vehicleNeeded, vehicle_note: vehicleNeeded ? vehicleNote.trim() || null : null }
          : {}),
      })
    } else {
      // The addressee never signs — it is the "Rahbariyat" the letter is
      // addressed to. Agreers sign one by one. Same employee in both roles
      // would be written twice, so the addressee is filtered out.
      Object.assign(payload, {
        assigned_signers: [
          { employee_id: Number(addresseeId), signer_type: 'addressee' },
          ...Array.from(new Set(agreers.filter((id) => id !== addresseeId))).map((id) => ({
            employee_id: Number(id),
            signer_type: 'agreement',
          })),
        ],
        creator_employee_id: authorId ? Number(authorId) : null,
      })
    }

    try {
      const res = editLetter
        ? ((await mut.update.mutateAsync({ id: editLetter.id, body: payload })) as LetterFull)
        : ((await mut.create.mutateAsync(payload)) as LetterFull)
      const savedId = res?.id ?? editLetter?.id
      if (savedId && file) {
        await mut.uploadAttachment.mutateAsync({ id: savedId, file })
      }
      mut.invalidate()
      onCreated(savedId as number)
    } catch (err) {
      setError(errorMessage(err, t('letters.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editLetter ? t('letters.editTitle') : t('letters.createTitle')}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={mut.create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.create.isPending || mut.update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={type}
          // Changing the type of an existing letter would move it to a
          // different flow (different signers, numbering, document template).
          onChange={(v) => !editLetter && setType(v)}
          options={[
            { value: 'explanatory', label: t('letters.typeBildirgi') },
            { value: 'application', label: t('letters.typeAriza') },
            { value: 'business_trip', label: t('letters.typeTrip') },
          ]}
        />

        <p className="text-xs text-fg-subtle">{t('letters.numberAutoHint')}</p>

        {!isTrip && (
          <>
            <Field label={t('letters.fieldShortSummary')}>
              <Input value={shortSummary} onChange={(e) => setShortSummary(e.target.value)} />
            </Field>
            <Field label={t('letters.fieldText')}>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
       />
            </Field>
            <Field label={t('letters.fieldAuthor')} hint={t('letters.authorHint')}>
              <Combobox
                className="w-full"
                value={authorId}
                onChange={setAuthorId}
                placeholder={t('letters.authorSelf')}
                options={employeeOptions}
                error={employeeOptionsError}
              />
            </Field>
            <Field label={t('letters.fieldAddressee')} required hint={t('letters.addresseeHint')}>
              <Combobox
                className="w-full"
                value={addresseeId}
                onChange={setAddresseeId}
                placeholder={t('letters.addresseePick')}
                options={leadershipOptions}
                error={leadershipOptionsError}
              />
            </Field>
            <Field
              label={t('letters.fieldAgreers')}
              required={type === 'application'}
              hint={t('letters.agreersHint')}
            >
              <RowList
                count={agreerIds.length}
                addLabel={t('letters.addAgreer')}
                emptyHint={t('letters.agreersEmpty')}
                onAdd={() => setAgreerIds((prev) => [...prev, ''])}
                onRemove={(i) => setAgreerIds((prev) => prev.filter((_, idx) => idx !== i))}
                renderRow={(i) => (
                  <Combobox
                    className="w-full"
                    value={agreerIds[i] ?? ''}
                    onChange={(v) =>
                      setAgreerIds((prev) => prev.map((x, idx) => (idx === i ? v : x)))
                    }
                    placeholder={t('letters.agreerPick')}
                    options={agreerOptions.filter(
                      (o) =>
                        o.value === agreerIds[i] ||
                        (o.value !== addresseeId && !agreerIds.includes(o.value)),
                    )}
                  />
                )}
              />
            </Field>
          </>
        )}

        {isTrip && (
          <>
            {needsTraveller && (
              <Field label={t('letters.fieldTraveller')} required hint={t('letters.travellerHint')}>
                <Combobox
                  className="w-full"
                  value={authorId}
                  onChange={setAuthorId}
                  placeholder={t('letters.travellerPick')}
                  options={employeeOptions}
                  error={employeeOptionsError}
                />
              </Field>
            )}
            <Field label={t('letters.fieldRegions')} required>
              <ComboRows
                value={regions}
                onChange={changeRegions}
                options={regionOptions}
                addLabel={t('letters.addRegion')}
                placeholder={t('letters.regionPick')}
                emptyHint={t('letters.regionsEmpty')}
              />
            </Field>

            <Field label={t('letters.fieldDestinations')} required>
              <ComboRows
                value={destinationIds}
                onChange={setDestinationIds}
                options={destinationOptions}
                addLabel={t('letters.addDestination')}
                placeholder={t('letters.destinationPick')}
                emptyHint={t('letters.regionsRequired')}
              />
            </Field>

            {canRequestVehicle && (
              <Field label={t('letters.fieldTransport')}>
                <div className="space-y-2">
                  <Segmented
                    value={vehicleNeeded ? 'car' : 'none'}
                    onChange={(v) => {
                      setVehicleNeeded(v === 'car')
                      if (v !== 'car') setVehicleNote('')
                    }}
                    options={[
                      { value: 'none', label: t('letters.noVehicle') },
                      { value: 'car', label: t('letters.needVehicle') },
                    ]}
                  />
                  {vehicleNeeded && (
                    <>
                      <Input
                        value={vehicleNote}
                        onChange={(e) => setVehicleNote(e.target.value)}
                        placeholder={t('letters.vehicleNotePlaceholder')}
                        aria-label={t('letters.vehicleNote')}
                      />
                      <p className="text-[11px] text-fg-subtle">{t('letters.vehicleFlowHint')}</p>
                    </>
                  )}
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('letters.fieldDeparture')} required>
                <DateInput value={departureDate} onChange={setDepartureDate} invalid={isInvalidRange(departureDate, arrivalDate)} />
              </Field>
              <Field label={t('letters.fieldArrival')} required>
                <DateInput value={arrivalDate} onChange={setArrivalDate} invalid={isInvalidRange(departureDate, arrivalDate)} />
              </Field>
            </div>

            {/* Old flow only: purpose, work plan, leadership and submitter. The
                new flow derives all of this from the attached bildirgi. */}
            {isOldTripFlow && (
              <>
                <Field label={t('letters.fieldPurpose')}>
                  <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
       />
                </Field>
                <Field label={t('letters.fieldWorkPlan')}>
                  <Textarea rows={3} value={workPlan} onChange={(e) => setWorkPlan(e.target.value)}
       />
                </Field>
                <Field label={t('letters.fieldLeadership')} required>
                  <Combobox
                    className="w-full"
                    value={leadershipId}
                    onChange={setLeadershipId}
                    placeholder={t('letters.leadershipPick')}
                    options={leadershipOptions}
                    error={leadershipOptionsError}
                  />
                </Field>
                <Field label={t('letters.fieldSubmitter')} hint={t('letters.submitterHint')}>
                  <Combobox
                    className="w-full"
                    value={submitterId}
                    onChange={setSubmitterId}
                    placeholder={t('letters.submitterSelf')}
                    // A pinned leader must not also be selectable as the sender
                    // — one employee in both roles tangles the signing order.
                    options={employeeOptions.filter(
                      (o) => !leadershipOptions.some((l) => l.value === o.value),
                    )}
                  />
                </Field>
              </>
            )}
          </>
        )}

        <Field label={t('letters.fieldAttachment')}>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex min-h-[44px] w-full items-center gap-2 rounded-lg border-2 border-dashed px-3 text-left transition-colors',
              file ? 'border-brand/30 bg-brand-soft' : 'border-line bg-surface-2 hover:border-brand/40',
            )}
          >
            <Paperclip size={15} className="shrink-0 text-fg-subtle" />
            <span className="truncate text-sm text-fg-muted">
              {file ? file.name : t('letters.attachmentPick')}
            </span>
            {file && (
              <span
                role="button"
                tabIndex={0}
                aria-label={t('common.clearValue')}
                className="ml-auto rounded p-1 text-danger"
                onClick={(e) => {
                  e.stopPropagation()
                  setFile(null)
                  if (fileRef.current) fileRef.current.value = ''
                }}
              >
                <X size={14} />
              </span>
            )}
          </button>
        </Field>

        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}
