import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiGet, apiPatch, apiPut } from '@/api/http'
import { useDictionaryOptions, type DictionaryEntry } from '@/features/dictionaries/useDictionaries'
import type { SelectOption } from '@/components/ui/Select'
import { cleanBasis, type EditBasis, type T2Card, type T2Section, type T2Values } from '../types'

/**
 * T-2 SHAXSIY KARTOCHKASI — TZ 4.2.7. One `GET /employees/{pk}/t2` feeds every
 * tab; scalars are written with `PATCH /employees/{pk}/t2`, repeating sections
 * are replaced whole with `PUT /employees/{pk}/t2/{section}`. Every write on an
 * existing card carries the basis document (TZ C3).
 */
export function useT2Card(employeeId: number | null) {
  return useQuery({
    queryKey: ['employee-t2', employeeId],
    queryFn: () => apiGet<T2Card>(`employees/${employeeId}/t2`, { _no_branch_inject: true }),
    enabled: !!employeeId,
    retry: false,
  })
}

export function useT2Mutations(employeeId: number) {
  const qc = useQueryClient()
  const write = (data: T2Card) => {
    qc.setQueryData(['employee-t2', employeeId], data)
    void qc.invalidateQueries({ queryKey: ['employee', employeeId] })
    void qc.invalidateQueries({ queryKey: ['employee-quality'] })
  }
  const opts = { params: { _no_branch_inject: true } }
  return {
    saveScalars: useMutation({
      mutationFn: ({ values, basis }: { values: T2Values & Record<string, unknown>; basis: EditBasis }) =>
        apiPatch<T2Card>(`employees/${employeeId}/t2`, { ...values, basis: cleanBasis(basis) }, opts),
      onSuccess: write,
    }),
    saveSection: useMutation({
      mutationFn: ({ section, body, basis }: { section: T2Section; body: Record<string, unknown>; basis: EditBasis }) =>
        apiPut<T2Card>(`employees/${employeeId}/t2/${section}`, { ...body, basis: cleanBasis(basis) }, opts),
      onSuccess: write,
    }),
    saveAttestation: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<T2Card>(`employees/${employeeId}/t2/attestations/${id}`, body, opts),
      onSuccess: write,
    }),
  }
}

/** Dictionary entry name in the UI language (RU → `name_ru`). */
export function useEntryLabel() {
  const { i18n } = useTranslation()
  const ru = i18n.language?.startsWith('ru')
  return (e: DictionaryEntry) => (ru && e.name_ru ? e.name_ru : e.name)
}

/** `{value: code, label: name}` for a dictionary — the shape every picker wants. */
export function useCodeOptions(code: string | null, enabled = true): SelectOption[] {
  const { options } = useDictionaryOptions(enabled ? code : null)
  const label = useEntryLabel()
  return useMemo(() => options.map((o) => ({ value: o.code, label: label(o) })), [options, label])
}

/** Districts of ONE region (hierarchical dictionary, parent = region entry). */
export function useDistrictOptions(regionCode: string | null | undefined): SelectOption[] {
  const { options: regions } = useDictionaryOptions('regions')
  const region = regions.find((r) => r.code === regionCode)
  const { options } = useDictionaryOptions(region ? 'districts' : null)
  const label = useEntryLabel()
  return useMemo(
    () => options.filter((d) => !region || d.parent_id === region.id).map((d) => ({ value: d.code, label: label(d) })),
    [options, region, label],
  )
}

/** Server-named dictionary value in the UI language (`card.names_ru`). */
export function useCardName(card: T2Card | null | undefined) {
  const { i18n } = useTranslation()
  const ru = i18n.language?.startsWith('ru')
  return (field: keyof T2Card): string => {
    const v = card?.[field]
    if (typeof v !== 'string' || !v) return ''
    return (ru && card?.names_ru?.[field as string]) || v
  }
}

/** Label of a code from a loaded option list (fallback: the raw code). */
export function labelOf(options: SelectOption[], code?: string | null): string {
  if (!code) return ''
  return options.find((o) => o.value === code)?.label ?? code
}
