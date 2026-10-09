import type { Employee } from '@/types'
import type { SelectOption } from '@/components/ui/Select'

/**
 * Secondary line under an employee's name in pickers — the position, prefixed
 * with "head of department" when applicable. Ported from v1's
 * getEmployeeSelectSubLabel so pickers read the same in both apps.
 */
export function employeeSubLabel(emp?: Employee | null, fallback = ''): string {
  if (!emp) return fallback
  const jobPos =
    (typeof emp.job_position === 'object' ? emp.job_position?.name : emp.job_position) || ''
  if (emp.is_head_department) {
    return jobPos ? `Bo‘lim boshlig‘i | ${jobPos}` : 'Bo‘lim boshlig‘i'
  }
  return jobPos || fallback
}

/**
 * An employee as a picker option — the ONE mapping every employee dropdown
 * uses, so a person looks the same in every list: portrait, name, position.
 *
 * `photo` is always set (null when there is none) because <Combobox> keys the
 * avatar off the field being present: an employee without a picture must still
 * get the initials circle, or rows jump left and right as the list scrolls.
 */
export function employeeOption(emp: Employee): SelectOption {
  return {
    value: String(emp.id),
    label: emp.legal_name ?? `#${emp.id}`,
    subLabel: employeeSubLabel(emp) || undefined,
    photo: emp.photo_thumb_path ?? null,
    photoFallback: emp.photo_path ?? null,
  }
}
