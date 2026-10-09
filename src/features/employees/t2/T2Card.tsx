import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Award, GraduationCap, IdCard, Landmark, Lock, Paperclip, Save, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { Button, Card, Combobox, DateInput, Field, Input, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { DocumentsSection } from './DocumentsSection'
import { RowsEditor, type EditorColumn, type EditorRow } from './RowsEditor'
import {
  T2_DICTIONARIES as D,
  canEditT2,
  useCodeOptions,
  useDistrictOptions,
  useT2Card,
  useT2Mutations,
  type T2Scalars,
  type T2Section,
} from './useT2'

const SCALAR_KEYS: (keyof T2Scalars)[] = [
  'nationality_code',
  'military_obligation_code',
  'military_rank_code',
  'political_party_code',
  'education_level_code',
  'education_specialty_code',
  'education_institution',
  'education_graduation_year',
  'academic_degree_code',
  'academic_title_code',
  'birth_country_code',
  'birth_region_code',
  'birth_district_code',
  'residence_region_code',
  'residence_district_code',
  'pasport_issue_date',
  'pasport_expiry_date',
  'previous_experience_months',
]

type Draft = Record<string, string>

/** '' must reach the API as null, or the column ends up holding a blank string. */
function toPayload(draft: Draft): T2Scalars {
  const out: Record<string, unknown> = {}
  for (const k of SCALAR_KEYS) {
    const v = draft[k] ?? ''
    if (k === 'education_graduation_year' || k === 'previous_experience_months') {
      out[k] = v.trim() === '' ? null : Number(v)
    } else {
      out[k] = v.trim() === '' ? null : v
    }
  }
  return out as T2Scalars
}

/**
 * T-2 SHAXSIY KARTOCHKASI — TZ 4.2.7.
 *
 * The form the personnel office actually keeps: identity and documents at the
 * top, then the repeating sections (languages, awards, elective bodies,
 * incentives, penalties, family). Each section saves independently, because a
 * single "save the whole card" button would make one bad row block six good
 * ones — and because the API replaces sections, not fields.
 *
 * SERVICE LENGTH IS COMPUTED, never typed: current months come from the hire
 * date, and only the PREVIOUS employer's months are an input.
 */
export function T2Card({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const canEdit = canEditT2(user)

  const { card, loading, denied } = useT2Card(employeeId)
  const { saveScalars, saveSection } = useT2Mutations(employeeId)

  const [draft, setDraft] = useState<Draft>({})
  const [rows, setRows] = useState<Record<string, EditorRow[]>>({
    languages: [],
    awards: [],
    elective: [],
    incentives: [],
    penalties: [],
    relatives: [],
  })

  useEffect(() => {
    if (!card) return
    const v = card.values ?? {}
    const next: Draft = {}
    for (const k of SCALAR_KEYS) next[k] = v[k] == null ? '' : String(v[k])
    setDraft(next)
    setRows({
      languages: card.languages.map((r) => ({
        language_code: r.language_code ?? '',
        level: r.level ?? '',
      })),
      awards: card.awards.map((r) => ({
        award_code: r.award_code ?? '',
        award_name: r.award_name ?? '',
        awarded_year: r.awarded_year == null ? '' : String(r.awarded_year),
        document_number: r.document_number ?? '',
      })),
      elective: card.elective_bodies.map((r) => ({
        body_code: r.body_code ?? '',
        position: r.position ?? '',
        period_from: r.period_from ?? '',
        period_to: r.period_to ?? '',
      })),
      incentives: card.incentives.map((r) => ({
        title: r.title ?? '',
        order_number: r.order_number ?? '',
        order_date: r.order_date ?? '',
        issued_by: r.issued_by ?? '',
      })),
      penalties: card.penalties.map((r) => ({
        title: r.title ?? '',
        order_number: r.order_number ?? '',
        order_date: r.order_date ?? '',
        issued_by: r.issued_by ?? '',
        lifted_at: r.lifted_at ?? '',
      })),
      relatives: (card.relatives ?? []).map((r) => ({
        relation_code: r.relation_code ?? '',
        full_name: r.full_name ?? '',
        birth_date: r.birth_date ?? '',
        birth_place: r.birth_place ?? '',
        workplace: r.workplace ?? '',
        position: r.position ?? '',
        address: r.address ?? '',
      })),
    })
  }, [card])

  const nationalities = useCodeOptions(D.nationalities)
  const militaryObligation = useCodeOptions(D.militaryObligation)
  const militaryRanks = useCodeOptions(D.militaryRanks)
  const parties = useCodeOptions(D.parties)
  const eduLevels = useCodeOptions(D.educationLevels)
  const eduSpecialties = useCodeOptions(D.educationSpecialties)
  const degrees = useCodeOptions(D.academicDegrees)
  const titles = useCodeOptions(D.academicTitles)
  const countries = useCodeOptions(D.countries)
  const regions = useCodeOptions(D.regions)
  const languages = useCodeOptions(D.languages)
  const languageLevels = useCodeOptions(D.languageLevels)
  const stateAwards = useCodeOptions(D.stateAwards)
  const bodies = useCodeOptions(D.electiveBodies)
  const relationTypes = useCodeOptions(D.relationTypes)

  const birthDistricts = useDistrictOptions(draft.birth_region_code)
  const residenceDistricts = useDistrictOptions(draft.residence_region_code)

  const set = (k: string, v: string) =>
    setDraft((d) => {
      const next = { ...d, [k]: v }
      // A district only means anything inside its region.
      if (k === 'birth_region_code') next.birth_district_code = ''
      if (k === 'residence_region_code') next.residence_district_code = ''
      return next
    })

  const [saving, setSaving] = useState<string | null>(null)

  const doSaveScalars = async () => {
    setSaving('scalars')
    try {
      await saveScalars.mutateAsync(toPayload(draft))
      toast.ok(t('t2.saved'))
    } catch (e) {
      toast.error(errorMessage(e, t('t2.saveFailed')))
    } finally {
      setSaving(null)
    }
  }

  /** Blank cells go out as null; the API replaces the section wholesale. */
  const clean = (list: EditorRow[], keys: string[], extra?: Record<string, unknown>) =>
    list.map((r) => {
      const out: Record<string, unknown> = { ...extra }
      for (const k of keys) {
        const v = (r[k] ?? '').trim()
        out[k] = v === '' ? null : k === 'awarded_year' ? Number(v) : v
      }
      return out
    })

  const doSaveSection = async (
    key: string,
    section: T2Section,
    body: Record<string, unknown>,
  ) => {
    setSaving(key)
    try {
      await saveSection.mutateAsync({ section, body })
      toast.ok(t('t2.saved'))
    } catch (e) {
      toast.error(errorMessage(e, t('t2.saveFailed')))
    } finally {
      setSaving(null)
    }
  }

  const exp = card?.experience

  const langColumns: EditorColumn[] = useMemo(
    () => [
      { key: 'language_code', label: t('t2.language'), type: 'select', options: languages, span: 5 },
      { key: 'level', label: t('t2.level'), type: 'select', options: languageLevels, span: 6 },
    ],
    [languages, languageLevels, t],
  )

  if (loading) return <CenteredSpinner />
  if (denied || !card)
    return (
      <EmptyState icon={<Lock size={20} />} title={t('t2.denied')} description={t('t2.deniedHint')} />
    )

  return (
    <div className="flex flex-col gap-4">
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-inner border border-line bg-surface-2 px-3 py-2 text-xs text-fg-muted">
          <Lock size={13} /> {t('t2.readOnly')}
        </p>
      )}

      {/* ── Shaxsiy va hujjat ma'lumotlari ─────────────────────────────── */}
      <Section
        icon={<IdCard size={15} />}
        title={t('t2.identity')}
        hint={
          exp
            ? t('t2.totalExperience', { years: exp.total_years, months: exp.total_rest_months })
            : undefined
        }
        onSave={canEdit ? doSaveScalars : undefined}
        saving={saving === 'scalars'}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('t2.nationality')}>
            <Combobox
              value={draft.nationality_code ?? ''}
              onChange={(v) => set('nationality_code', v)}
              options={nationalities}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.militaryObligation')}>
            <Combobox
              value={draft.military_obligation_code ?? ''}
              onChange={(v) => set('military_obligation_code', v)}
              options={militaryObligation}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.militaryRank')}>
            <Combobox
              value={draft.military_rank_code ?? ''}
              onChange={(v) => set('military_rank_code', v)}
              options={militaryRanks}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.party')}>
            <Combobox
              value={draft.political_party_code ?? ''}
              onChange={(v) => set('political_party_code', v)}
              options={parties}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.passportIssued')}>
            <DateInput
              value={draft.pasport_issue_date ?? ''}
              onChange={(v) => set('pasport_issue_date', v)}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.passportExpires')}>
            <DateInput
              value={draft.pasport_expiry_date ?? ''}
              onChange={(v) => set('pasport_expiry_date', v)}
              disabled={!canEdit}
            />
          </Field>

          <Field label={t('t2.birthCountry')}>
            <Combobox
              value={draft.birth_country_code ?? ''}
              onChange={(v) => set('birth_country_code', v)}
              options={countries}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.birthRegion')}>
            <Combobox
              value={draft.birth_region_code ?? ''}
              onChange={(v) => set('birth_region_code', v)}
              options={regions}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.birthDistrict')}>
            <Combobox
              value={draft.birth_district_code ?? ''}
              onChange={(v) => set('birth_district_code', v)}
              options={birthDistricts}
              placeholder={draft.birth_region_code ? t('t2.pick') : t('t2.pickRegionFirst')}
              disabled={!canEdit || !draft.birth_region_code}
            />
          </Field>
          <Field label={t('t2.residenceRegion')}>
            <Combobox
              value={draft.residence_region_code ?? ''}
              onChange={(v) => set('residence_region_code', v)}
              options={regions}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.residenceDistrict')}>
            <Combobox
              value={draft.residence_district_code ?? ''}
              onChange={(v) => set('residence_district_code', v)}
              options={residenceDistricts}
              placeholder={draft.residence_region_code ? t('t2.pick') : t('t2.pickRegionFirst')}
              disabled={!canEdit || !draft.residence_region_code}
            />
          </Field>
          <Field
            label={t('t2.previousExperience')}
            hint={
              exp
                ? t('t2.currentExperience', {
                    months: exp.current_months,
                  })
                : undefined
            }
          >
            <Input
              type="number"
              min="0"
              value={draft.previous_experience_months ?? ''}
              onChange={(e) => set('previous_experience_months', e.target.value)}
              disabled={!canEdit}
            />
          </Field>
        </div>
      </Section>

      {/* ── Ta'lim ─────────────────────────────────────────────────────── */}
      <Section
        icon={<GraduationCap size={15} />}
        title={t('t2.education')}
        onSave={canEdit ? doSaveScalars : undefined}
        saving={saving === 'scalars'}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('t2.educationLevel')}>
            <Combobox
              value={draft.education_level_code ?? ''}
              onChange={(v) => set('education_level_code', v)}
              options={eduLevels}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.specialty')}>
            <Combobox
              value={draft.education_specialty_code ?? ''}
              onChange={(v) => set('education_specialty_code', v)}
              options={eduSpecialties}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.graduationYear')}>
            <Input
              type="number"
              min="1900"
              max="2100"
              value={draft.education_graduation_year ?? ''}
              onChange={(e) => set('education_graduation_year', e.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.institution')} wide>
            <Input
              value={draft.education_institution ?? ''}
              onChange={(e) => set('education_institution', e.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.degree')}>
            <Combobox
              value={draft.academic_degree_code ?? ''}
              onChange={(v) => set('academic_degree_code', v)}
              options={degrees}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('t2.title')}>
            <Combobox
              value={draft.academic_title_code ?? ''}
              onChange={(v) => set('academic_title_code', v)}
              options={titles}
              placeholder={t('t2.pick')}
              disabled={!canEdit}
            />
          </Field>
        </div>
      </Section>

      {/* ── Chet tillari ───────────────────────────────────────────────── */}
      <Section
        icon={<GraduationCap size={15} />}
        title={t('t2.languages')}
        onSave={
          canEdit
            ? () =>
                doSaveSection('languages', 'languages', {
                  rows: clean(rows.languages, ['language_code', 'level']),
                })
            : undefined
        }
        saving={saving === 'languages'}
      >
        <RowsEditor
          columns={langColumns}
          rows={rows.languages}
          onChange={(r) => setRows((s) => ({ ...s, languages: r }))}
          disabled={!canEdit}
        />
      </Section>

      {/* ── Davlat mukofotlari ─────────────────────────────────────────── */}
      <Section
        icon={<Award size={15} />}
        title={t('t2.awards')}
        onSave={
          canEdit
            ? () =>
                doSaveSection('awards', 'awards', {
                  rows: clean(rows.awards, [
                    'award_code',
                    'award_name',
                    'awarded_year',
                    'document_number',
                  ]),
                })
            : undefined
        }
        saving={saving === 'awards'}
      >
        <RowsEditor
          columns={[
            { key: 'award_code', label: t('t2.awardKind'), type: 'select', options: stateAwards, span: 3 },
            { key: 'award_name', label: t('t2.awardName'), span: 4 },
            { key: 'awarded_year', label: t('t2.year'), type: 'number', span: 2 },
            { key: 'document_number', label: t('t2.docNumber'), span: 2 },
          ]}
          rows={rows.awards}
          onChange={(r) => setRows((s) => ({ ...s, awards: r }))}
          disabled={!canEdit}
        />
      </Section>

      {/* ── Saylanma organlar ──────────────────────────────────────────── */}
      <Section
        icon={<Landmark size={15} />}
        title={t('t2.electiveBodies')}
        onSave={
          canEdit
            ? () =>
                doSaveSection('elective', 'elective-bodies', {
                  rows: clean(rows.elective, [
                    'body_code',
                    'position',
                    'period_from',
                    'period_to',
                  ]),
                })
            : undefined
        }
        saving={saving === 'elective'}
      >
        <RowsEditor
          columns={[
            { key: 'body_code', label: t('t2.body'), type: 'select', options: bodies, span: 4 },
            { key: 'position', label: t('t2.bodyPosition'), span: 3 },
            { key: 'period_from', label: t('t2.from'), type: 'date', span: 2 },
            { key: 'period_to', label: t('t2.to'), type: 'date', span: 2 },
          ]}
          rows={rows.elective}
          onChange={(r) => setRows((s) => ({ ...s, elective: r }))}
          disabled={!canEdit}
        />
      </Section>

      {/* ── Rag'batlantirish ───────────────────────────────────────────── */}
      <Section
        icon={<ThumbsUp size={15} />}
        title={t('t2.incentives')}
        onSave={
          canEdit
            ? () =>
                doSaveSection('incentives', 'merits', {
                  kind: 'incentive',
                  rows: clean(rows.incentives, [
                    'title',
                    'order_number',
                    'order_date',
                    'issued_by',
                  ]),
                })
            : undefined
        }
        saving={saving === 'incentives'}
      >
        <RowsEditor
          columns={[
            { key: 'title', label: t('t2.meritTitle'), span: 4 },
            { key: 'order_number', label: t('t2.orderNumber'), span: 2 },
            { key: 'order_date', label: t('t2.orderDate'), type: 'date', span: 2 },
            { key: 'issued_by', label: t('t2.issuedBy'), span: 3 },
          ]}
          rows={rows.incentives}
          onChange={(r) => setRows((s) => ({ ...s, incentives: r }))}
          disabled={!canEdit}
        />
      </Section>

      {/* ── Intizomiy jazolar ──────────────────────────────────────────── */}
      <Section
        icon={<ThumbsDown size={15} />}
        title={t('t2.penalties')}
        onSave={
          canEdit
            ? () =>
                doSaveSection('penalties', 'merits', {
                  kind: 'penalty',
                  rows: clean(rows.penalties, [
                    'title',
                    'order_number',
                    'order_date',
                    'issued_by',
                    'lifted_at',
                  ]),
                })
            : undefined
        }
        saving={saving === 'penalties'}
      >
        <RowsEditor
          columns={[
            { key: 'title', label: t('t2.penaltyTitle'), span: 3 },
            { key: 'order_number', label: t('t2.orderNumber'), span: 2 },
            { key: 'order_date', label: t('t2.orderDate'), type: 'date', span: 2 },
            { key: 'issued_by', label: t('t2.issuedBy'), span: 2 },
            { key: 'lifted_at', label: t('t2.liftedAt'), type: 'date', span: 2 },
          ]}
          rows={rows.penalties}
          onChange={(r) => setRows((s) => ({ ...s, penalties: r }))}
          disabled={!canEdit}
        />
      </Section>

      {/* ── Oila a'zolari ──────────────────────────────────────────────── */}
      {card.relatives_visible ? (
        <Section
          icon={<Users size={15} />}
          title={t('t2.relatives')}
          onSave={
            canEdit
              ? () =>
                  doSaveSection('relatives', 'relatives', {
                    rows: clean(rows.relatives, [
                      'relation_code',
                      'full_name',
                      'birth_date',
                      'birth_place',
                      'workplace',
                      'position',
                      'address',
                    ]),
                  })
              : undefined
          }
          saving={saving === 'relatives'}
        >
          <RowsEditor
            columns={[
              { key: 'relation_code', label: t('t2.relation'), type: 'select', options: relationTypes, span: 2 },
              { key: 'full_name', label: t('t2.fullName'), span: 4 },
              { key: 'birth_date', label: t('t2.birthDate'), type: 'date', span: 2 },
              { key: 'birth_place', label: t('t2.birthPlace'), span: 4 },
              { key: 'workplace', label: t('t2.workplace'), span: 4 },
              { key: 'position', label: t('t2.relativePosition'), span: 3 },
              { key: 'address', label: t('t2.address'), span: 4 },
            ]}
            rows={rows.relatives}
            onChange={(r) => setRows((s) => ({ ...s, relatives: r }))}
            disabled={!canEdit}
          />
        </Section>
      ) : (
        <Section icon={<Users size={15} />} title={t('t2.relatives')}>
          <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
            <Lock size={13} /> {t('t2.relativesHidden')}
          </p>
        </Section>
      )}

      {/* ── Hujjat skanlari (TZ 4.2.7) ─────────────────────────────────── */}
      <Section icon={<Paperclip size={15} />} title={t('t2.documents')}>
        {/* Scans sit behind the same full-PII gate as the relatives
            (services/employee_document.py) — the server's `relatives_visible`
            says which side of it the viewer is on, so a manager's view does
            not fire a request that can only answer 403. */}
        {card.relatives_visible ? (
          <DocumentsSection employeeId={employeeId} canEdit={canEdit} />
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
            <Lock size={13} /> {t('t2.documentsHidden')}
          </p>
        )}
      </Section>
    </div>
  )
}

function Section({
  icon,
  title,
  hint,
  children,
  onSave,
  saving,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  children: React.ReactNode
  onSave?: () => void
  saving?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-brand-strong">{icon}</span>
        <h3 className="text-[14px] font-bold text-fg">{title}</h3>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
        {onSave && (
          <Button
            size="sm"
            onClick={onSave}
            loading={saving}
            leftIcon={<Save size={13} />}
            className="ml-auto"
          >
            {t('common.save')}
          </Button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  )
}
