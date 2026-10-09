import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2 } from 'lucide-react'
import { Button, Modal, Spinner } from '@/components/ui'
import { useServerText } from '@/features/statistics/serverText'
import { useExtraKindLabel } from './DictionaryEntryModal'
import { localizedName, useEntryUsage, type DictionaryEntry, type DictionaryType } from './useDictionaries'

/** Labels for the known `extra` keys; an unknown key shows as it is. */
const EXTRA_LABELS: Record<string, string> = {
  coefficient: 'Koeffitsient',
  value: 'Qiymat',
  article: 'Mehnat kodeksi moddasi',
  parent_ref: 'Tegishli tashkilot (ID)',
  uz_cyrl: 'O‘zbek kirill',
  measure: 'O‘lchov birligi',
  period_type: 'Davr turi',
  weight: 'Vazn',
  ownership_form: 'Mulkchilik shakli (kod)',
  ownership_form_name: 'Mulkchilik shakli',
  region_code: 'Viloyat (kod)',
  region_name: 'Viloyat',
  district_code: 'Tuman (kod)',
  district_name: 'Tuman',
}

/**
 * TZ D2 1572–1573 — the full card of one entry, READ-ONLY: code, both names,
 * parent, order, status, note, the type-specific `extra` attributes and TZ D2
 * 1583 «Просмотр связанных объектов» (`GET dictionaries/entries/{pk}/usage`).
 */
export function DictionaryEntryCard({
  entry,
  type,
  onClose,
}: {
  entry: DictionaryEntry | null
  type: DictionaryType | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const st = useServerText()
  const kindLabel = useExtraKindLabel()
  const external = !!entry?.is_external
  const usage = useEntryUsage(entry?.id ?? null, !external)
  const extra = entry?.extra && typeof entry.extra === 'object' ? (entry.extra as Record<string, unknown>) : null
  const lang = i18n.language
  // `*_ru` twins are not separate rows — the main key is shown in the current language.
  const extraKeys = extra
    ? Object.keys(extra).filter(
        (k) => !(k.endsWith('_ru') && k.slice(0, -3) in extra) && k !== 'target' && k !== 'value_type',
      )
    : []
  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? t('orgRef.yes') : t('orgRef.no')
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  const extraValue = (k: string) => {
    const ru = extra?.[`${k}_ru`]
    if (lang === 'ru' && ru) return fmt(ru)
    return typeof extra?.[k] === 'string' ? st(extra[k] as string) : fmt(extra?.[k])
  }

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      placement="right"
      size="md"
      title={entry ? localizedName(entry, lang) : ''}
      description={type ? localizedName(type, lang) : undefined}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {entry && (
        <div className="flex flex-col gap-5">
          <dl className="flex flex-col">
            <Row label={t('dictionaries.colCode')}>
              <code className="text-brand-strong">{entry.code}</code>
            </Row>
            <Row label={t('orgRef.nameUz')}>{entry.name || '—'}</Row>
            <Row label={t('orgRef.nameRu')}>{entry.name_ru || '—'}</Row>
            {(entry.parent_name || type?.parent_type_code) && (
              <Row label={t('dictionaries.colParent')}>{entry.parent_name || '—'}</Row>
            )}
            <Row label={t('orgRef.sortOrder')}>{entry.sort_order ?? 0}</Row>
            <Row label={t('dictionaries.colStatus')}>{entry.is_active ? t('dictionaries.active') : t('dictionaries.inactive')}</Row>
            <Row label={t('dictionaries.colDescription')}>{entry.description ? st(entry.description) : '—'}</Row>
            {!!extra?.target && <Row label={t('orgRef.kind')}>{kindLabel(extra)}</Row>}
            {extraKeys.map((k) => (
              <Row key={k} label={st(EXTRA_LABELS[k] ?? k)}>
                {extraValue(k)}
              </Row>
            ))}
          </dl>

          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg">
              <Link2 size={13} className="text-brand-strong" /> {t('orgRef.linkedObjects')}
            </h4>
            {external ? (
              <p className="text-[13px] text-fg-muted">{t('orgRef.externalUsage')}</p>
            ) : usage.isLoading ? (
              <Spinner />
            ) : usage.data?.used ? (
              <ul className="flex flex-col gap-1 text-[13px]">
                {usage.data.refs.map((r, i) => (
                  <li key={i} className="text-fg">
                    <span className="font-medium">{lang === 'ru' && r.label_ru ? r.label_ru : st(r.label)}</span>
                    {' — '}
                    {t('orgRef.countItems', { count: r.count })}
                    {r.sample?.length ? (
                      <span className="text-fg-subtle">{` (${r.sample.slice(0, 5).join(', ')}${r.count > 5 ? '…' : ''})`}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-muted">{t('orgRef.noLinkedObjects')}</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-3 border-b border-line/60 py-2 text-[13px]">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="break-words text-fg">{children}</dd>
    </div>
  )
}
