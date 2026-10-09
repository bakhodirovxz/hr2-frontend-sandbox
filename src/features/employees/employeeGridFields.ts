import type { TFunction } from 'i18next'
import type { GridField } from '@/components/data/BulkEditGrid'
import type { SelectOption } from '@/components/ui/Select'
import type { Employee } from '@/types'

/**
 * Columns of the employee bulk-edit grid.
 *
 * Identity fields (passport, JSHSHIR, phone) are included because the grid
 * gives every employee its own row — they are simply NOT marked `fillable`, so
 * there is no way to write one value across the selection. JSHSHIR is
 * `unique=True` in the database, which would reject that anyway.
 *
 * The column list mirrors the single-employee form section by section, because
 * the grid used to carry 14 of its fields and nothing said which ones were
 * missing: the direct manager, the hire date, the lunch window and every
 * attendance flag could only be set one person at a time. What is deliberately
 * NOT here is the multi-value part of the form — branches, multi-org role and
 * the working-days picker — which needs the form's own controls; those stay in
 * the drawer.
 */
export function employeeGridFields(
  t: TFunction,
  departmentOptions: SelectOption[],
  jobPositionOptions: SelectOption[],
  supervisorOptions: SelectOption[] = [],
  /**
   * Flags this account may actually write. The server rejects the whole PATCH
   * when a forbidden flag is present (`_ADMIN_ONLY_EMPLOYEE_FIELDS`), which in
   * a grid would lose every OTHER edit in that row — so a flag nobody may set
   * is not drawn, exactly as the form does it.
   */
  allowedFlagKeys: readonly string[] = [],
): GridField<Employee>[] {
  const flags = (entries: [string, string][]): GridField<Employee>[] =>
    entries
      .filter(([key]) => allowedFlagKeys.includes(key))
      .map(([key, label]) => ({ key, label, type: 'bool' as const, width: 116, fillable: true }))

  return [
    { key: 'legal_name', label: t('employees.fieldName'), type: 'text', width: 220 },
    { key: 'tabel_number', label: t('employees.fieldTabelNumber'), type: 'text', width: 110 },
    {
      key: 'department_id',
      label: t('employees.colDepartment'),
      type: 'select',
      width: 170,
      options: departmentOptions,
      fillable: true,
      get: (e) => (e.department?.id != null ? String(e.department.id) : ''),
    },
    {
      key: 'job_position_id',
      label: t('employees.colPosition'),
      type: 'select',
      width: 170,
      options: jobPositionOptions,
      fillable: true,
      get: (e) => {
        const jp = e.job_position
        return jp && typeof jp === 'object' && 'id' in jp && jp.id != null ? String(jp.id) : ''
      },
    },
    {
      // The gap the user hit: a whole department can be pointed at its new head
      // in one pass instead of opening 40 drawers.
      key: 'supervisor_id',
      label: t('employees.fieldSupervisor'),
      type: 'select',
      width: 200,
      options: supervisorOptions,
      fillable: true,
      // `supervisor_id` is on the full record; older payloads only nest the
      // person, so both shapes are read.
      get: (e) =>
        e.supervisor_id != null
          ? String(e.supervisor_id)
          : e.supervisor?.id != null
            ? String(e.supervisor.id)
            : '',
    },
    { key: 'job_acceptance_date', label: t('employees.fieldHireDate'), type: 'date', width: 158, fillable: true },
    { key: 'phone_number', label: t('employees.fieldPhone'), type: 'text', width: 150, maxLength: 13 },
    { key: 'internal_phone_number', label: t('employees.fieldInternalPhone'), type: 'text', width: 110, maxLength: 6, fillable: true },
    { key: 'email', label: t('employees.fieldEmail'), type: 'text', width: 190 },
    {
      key: 'gender',
      label: t('employees.fieldGender'),
      type: 'select',
      width: 110,
      options: [
        { value: '1', label: t('employees.male') },
        { value: '2', label: t('employees.female') },
      ],
    },
    {
      key: 'maritial_status',
      label: t('employees.fieldMarital'),
      type: 'select',
      width: 150,
      // Stored as the Uzbek word itself, not an id — see `numeric`.
      numeric: false,
      options: [
        { value: 'Oilali', label: t('employees.marital_married') },
        { value: "Bo'ydoq", label: t('employees.marital_single') },
        { value: 'Ajrashgan', label: t('employees.marital_divorced') },
        { value: 'Turmushga chiqmagan', label: t('employees.marital_unmarried') },
      ],
    },
    { key: 'nationality', label: t('employees.fieldNationality'), type: 'text', width: 140 },
    { key: 'pasport_series', label: t('employees.fieldPassportSeries'), type: 'text', width: 90, maxLength: 2 },
    { key: 'pasport_number', label: t('employees.fieldPassportNumber'), type: 'text', width: 120, maxLength: 7 },
    { key: 'pasport_issue_by', label: t('employees.fieldPassportIssuedBy'), type: 'text', width: 200 },
    { key: 'personal_identification_number', label: t('employees.fieldPinfl'), type: 'text', width: 160, maxLength: 14 },
    { key: 'taxpayer_identification_number', label: t('employees.fieldInn'), type: 'text', width: 130, maxLength: 9 },
    { key: 'individual_accumulative_pension_account_number', label: t('employees.fieldInps'), type: 'text', width: 160, maxLength: 14 },
    // 158, not 140: the themed picker adds a calendar button inside the cell and
    // at 140 the year was clipped ("17.10.198…").
    { key: 'birth_date', label: t('employees.fieldBirthDate'), type: 'date', width: 158 },
    { key: 'working_hours_start', label: t('employees.fieldWorkStart'), type: 'time', width: 110, fillable: true },
    { key: 'working_hours_end', label: t('employees.fieldWorkEnd'), type: 'time', width: 110, fillable: true },
    { key: 'lunch_start_time', label: t('employees.fieldLunchStart'), type: 'time', width: 110, fillable: true },
    { key: 'lunch_end_time', label: t('employees.fieldLunchEnd'), type: 'time', width: 110, fillable: true },
    { key: 'stavka', label: t('employees.fieldStavka'), type: 'number', width: 90, fillable: true },
    ...flags([
      ['ignore_lateness', t('employees.flag_ignore_lateness')],
      ['is_remote_worker', t('employees.flag_is_remote_worker')],
      ['is_gpx_worker', t('employees.flag_is_gpx_worker')],
      ['hidden_from_regular', t('employees.flag_hidden_from_regular')],
      ['simple_trip_enabled', t('employees.flag_simple_trip_enabled')],
    ]),
    { key: 'address', label: t('employees.fieldAddress'), type: 'text', width: 240 },
  ]
}
