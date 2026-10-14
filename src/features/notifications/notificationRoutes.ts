/**
 * BILDIRISHNOMA → MANZIL va SARLAVHA.
 *
 * v2's bell listed notices and did nothing when one was clicked, so the whole
 * panel was a read-only log: a person told "Sizga vazifa biriktirildi" had to
 * go and find the task by hand. v1 resolved a target for seven families and
 * named ~40 types; this is the same map against v2's URL conventions.
 *
 * ⚠️ DEEP LINKS ARE QUERY PARAMS HERE, not router state. v1 passed
 * `state: { openLetterId }`, which dies on a page reload and cannot be pasted
 * to a colleague. v2 already addresses list rows with `?doc=`, `?entry=`,
 * `?ticket=`, `?card=` (see `features/search/searchRoutes.ts`) — reuse that so
 * a notification link and a search hit land the same way.
 */

export interface NotificationLike {
  notification_type?: string | null
  order_act_id?: number | null
  letter_id?: number | null
  news_post_id?: number | null
  workspace_id?: number | null
  card_id?: number | null
  kpi_entry_id?: number | null
  support_ticket_id?: number | null
  /** Both are on the wire now — the feed used to drop them, so these rows
   *  were clickable and went nowhere. */
  medical_checkup_id?: number | null
  work_leave_id?: number | null
  service_request_id?: number | null
  /** Read only for `background_job`: the job id is in the text («/jobs/12/download»). */
  description?: string | null
}

/** Where clicking this notification should go, or null when nowhere sensible. */
export function resolveNotificationUrl(n: NotificationLike): string | null {
  const type = n.notification_type ?? ''

  if (n.order_act_id) return `/orders?doc=${n.order_act_id}`
  // 640 of 934 `order_act_created` rows on TEST carry no id (the act was
  // deleted, FK SET NULL) — the row was drawn clickable and did nothing.
  if (type.startsWith('order_act')) return '/orders'

  // Bildirgi / ariza / xizmat safari.
  if (n.letter_id) return `/letters?doc=${n.letter_id}`
  if (type.startsWith('letter') || type.startsWith('business_trip')) return '/letters'

  // A project notice carries the workspace; a task notice carries both.
  if (n.workspace_id) {
    const card = n.card_id ? `&card=${n.card_id}` : ''
    return `/projects?workspace=${n.workspace_id}${card}`
  }

  if (n.kpi_entry_id) return `/kpi?tab=mine&entry=${n.kpi_entry_id}`
  if (type.startsWith('kpi_')) return '/kpi'

  if (n.support_ticket_id) return `/texnik-yordam?tab=queue&ticket=${n.support_ticket_id}`
  if (type.startsWith('support_ticket')) return '/texnik-yordam?tab=queue'

  // A fuel-price notice has no document of its own — send the approver to the
  // prices tab, which is what they are being asked to act on.
  if (type.startsWith('fuel_')) return '/vehicles?tab=fuel'
  if (type.startsWith('vehicle')) return '/vehicles?tab=requests'

  // Ruxsat / otgul.
  if (type.startsWith('work_leave')) return '/request-permission'

  // News lives on the dashboard in v2 — there is no separate reader.
  // The id is not always carried, so the type answers too.
  if (n.news_post_id || type.startsWith('news_post')) return '/yangiliklar'

  /*
   * The families below had NO rule at all, so their rows were drawn clickable
   * and did nothing when pressed. Ids first (they deep-link), then the type
   * prefix as the fallback landing page.
   */
  // The EMPLOYEE's own notice («ko'rik muddati keldi», «natija kiritildi»)
  // must not point at the HR screen — /tibbiy-korik is closed to them
  // («Sahifa yopilgan»). Their medical record is the profile's «Tibbiy» tab.
  // The HR variant is a distinct type (`medical_checkup_due_hr`).
  if (type === 'medical_checkup_due' || type === 'medical_result_recorded') return '/my-profile?tab=tibbiy'
  if (n.medical_checkup_id) return `/tibbiy-korik?checkup=${n.medical_checkup_id}`
  if (type.startsWith('medical')) return '/tibbiy-korik'

  if (n.work_leave_id) return `/vaqtinchalik-buyruqlar?doc=${n.work_leave_id}`
  if (type.startsWith('hr_order')) return '/vaqtinchalik-buyruqlar'

  // TZ 4.2.12 · 2296: the notice opens the request itself. The applicant's
  // notice lands on «Mening so'rovlarim», HR's «new request» on the inbox.
  if (n.service_request_id)
    return type === 'service_request_new'
      ? `/services?tab=inbox&open=${n.service_request_id}`
      : `/services?open=${n.service_request_id}`
  if (type === 'service_request_new') return '/services?tab=inbox'
  if (type.startsWith('service_request')) return '/services'

  if (type.startsWith('navbatchilik')) return '/navbatchilik'
  if (type.startsWith('learning_')) return '/oquv-markazi'
  if (type.startsWith('visitor')) return '/guests'
  if (type.startsWith('zoom')) return '/zoom'
  if (type.startsWith('vacancy')) return '/shtat'
  // «Boshqa doimiy ishga o'tkazish» buyrug'i (qabul kutilmoqda / qabul qilindi /
  // rad etildi) — Vaqtinchalik buyruqlar sahifasida hal qilinadi.
  if (type.startsWith('employee_transfer_order')) return '/vaqtinchalik-buyruqlar'
  if (type.startsWith('employee_assignment') || type.startsWith('employee_transfer')) return '/employees'
  // A deleted card or workspace comes with no id — the board itself is the
  // only honest destination.
  if (type.startsWith('card') || type.startsWith('workspace')) return '/projects'
  // The daily «Sizni kutmoqda» digest summarises the dashboard's pending
  // items — the dashboard is where they are acted on.
  if (type === 'pending_action_digest') return '/'
  // TZ A4 919: «Audit jurnali eksporti tayyor … /jobs/{id}/download» — the
  // journal opens the job's panel with the download button (the raw API path
  // in the text is not a page).
  if (type === 'background_job') {
    const id = /\/jobs\/(\d+)/.exec(n.description ?? '')?.[1]
    return id ? `/audit-logs?job=${id}` : '/audit-logs'
  }

  return null
}

/**
 * i18n key for a notification type. The server sends a machine token; without
 * this every row read "Bildirishnoma" and the reader could not tell a car
 * request from a rejected trip.
 */
const TITLE_KEYS: Record<string, string> = {
  // Ruxsat / otgul
  work_leave_requested: 'notif.workLeaveRequested',
  work_leave_signed: 'notif.workLeaveSigned',
  work_leave_rejected: 'notif.workLeaveRejected',
  // Avtopark
  vehicle_requested: 'notif.vehicleRequested',
  vehicle_request_answered: 'notif.vehicleRequestAnswered',
  vehicle_approval_needed: 'notif.vehicleApprovalNeeded',
  vehicle_approval_answered: 'notif.vehicleApprovalAnswered',
  fuel_price_pending: 'notif.fuelPricePending',
  // KPI
  kpi_task_submitted: 'notif.kpiTaskSubmitted',
  kpi_task_confirmed: 'notif.kpiTaskConfirmed',
  kpi_task_rejected: 'notif.kpiTaskRejected',
  kpi_performance_created: 'notif.kpiPerformanceCreated',
  kpi_performance_status: 'notif.kpiPerformanceStatus',
  // Texnik yordam
  support_ticket_created: 'notif.supportCreated',
  support_ticket_taken: 'notif.supportTaken',
  support_ticket_done: 'notif.supportDone',
  support_ticket_rated: 'notif.supportRated',
  support_ticket_reopened: 'notif.supportReopened',
  // Loyihalar
  workspace_created: 'notif.workspaceCreated',
  workspace_updated: 'notif.workspaceUpdated',
  workspace_deleted: 'notif.workspaceDeleted',
  workspace_member_added: 'notif.workspaceMemberAdded',
  workspace_member_removed: 'notif.workspaceMemberRemoved',
  card_created: 'notif.cardCreated',
  card_updated: 'notif.cardUpdated',
  card_deleted: 'notif.cardDeleted',
  card_member_added: 'notif.cardMemberAdded',
  card_member_removed: 'notif.cardMemberRemoved',
  card_attachment_added: 'notif.cardAttachmentAdded',
  card_completed: 'notif.cardCompleted',
  card_uncompleted: 'notif.cardUncompleted',
  card_rejected: 'notif.cardRejected',
  card_comment_created: 'notif.cardCommentCreated',
  card_comment_mention: 'notif.cardCommentMention',
  card_deadline_approaching: 'notif.cardDeadline',
  // O'quv markazi
  learning_course_assigned: 'notif.learningCourseAssigned',
  // Xatlar va safar
  letter_agreement_requested: 'notif.letterAgreementRequested',
  letter_agreement_acted: 'notif.letterAgreementActed',
  letter_sent_to_registry: 'notif.letterSentToRegistry',
  letter_registered: 'notif.letterRegistered',
  business_trip_created: 'notif.tripCreated',
  business_trip_signed: 'notif.tripSigned',
  business_trip_registered: 'notif.tripRegistered',
  business_trip_stamped: 'notif.tripStamped',
  business_trip_rejected: 'notif.tripRejected',
  business_trip_report_submitted: 'notif.tripReportSubmitted',
  business_trip_guvohnoma_pending: 'notif.tripGuvohnomaPending',
  business_trip_report_approved: 'notif.tripReportApproved',
  business_trip_report_stamped: 'notif.tripReportStamped',
  business_trip_report_returned: 'notif.tripReportReturned',
  business_trip_extension_requested: 'notif.tripExtensionRequested',
  business_trip_extension_approved: 'notif.tripExtensionApproved',
  business_trip_extension_rejected: 'notif.tripExtensionRejected',
  trip_return_confirm_prompt: 'notif.tripReturnPrompt',
  hr_order_expiring: 'notif.hrOrderExpiring',
  hr_order_expired: 'notif.hrOrderExpired',
  // Buyruqlar
  order_act_signed: 'notif.orderSigned',
  order_act_changes_requested: 'notif.orderChangesRequested',
  order_act_reapproval: 'notif.orderReapproval',
  order_act_text_edited: 'notif.orderTextEdited',
  order_act_created: 'notif.orderCreated',
  order_act_commented: 'notif.orderCommented',
  // Types the live base carries that had no entry: every one of them read
  // «Bildirishnoma» (measured on TEST 2026-09-22 — 8 911 rows, the medical
  // reminders alone 8 341).
  medical_checkup_due: 'notif.medicalDue',
  medical_checkup_due_hr: 'notif.medicalDueHr',
  medical_result_recorded: 'notif.medicalResult',
  service_request: 'notif.serviceRequest',
  driver_trip_created: 'notif.driverTrip',
  news_post_created: 'notif.newsPost',
  employee_transfer_created: 'notif.transferCreated',
  employee_transfer_rejected: 'notif.transferRejected',
  employee_transfer_order_pending: 'notif.transferOrderPending',
  employee_transfer_order_approved: 'notif.transferOrderApproved',
  employee_transfer_order_rejected: 'notif.transferRejected',
  employee_assignment_added: 'notif.assignmentAdded',
  trip_self_finished: 'notif.tripSelfFinished',
  vacancy_application: 'notif.vacancyApplication',
  vacancy: 'notif.vacancy',
  navbatchilik_assigned: 'notif.dutyAssigned',
  zoom_decision: 'notif.zoomDecision',
  zoom_organizer_changed: 'notif.zoomOrganizer',
  pending_action_digest: 'notif.digest',
  background_job: 'notif.backgroundJob',
}

/** Prefix fallbacks, so an unknown type still names its module. */
const PREFIX_KEYS: [string, string][] = [
  ['order_act', 'notif.groupOrder'],
  ['vehicle', 'notif.groupFleet'],
  ['fuel_', 'notif.groupFleet'],
  ['business_trip', 'notif.groupTrip'],
  ['letter', 'notif.groupLetter'],
  ['work_leave', 'notif.groupLeave'],
  ['kpi_', 'notif.groupKpi'],
  ['support_ticket', 'notif.groupSupport'],
  ['workspace', 'notif.groupProject'],
  ['card_', 'notif.groupProject'],
  ['medical', 'notif.medicalDue'],
  ['zoom', 'notif.groupZoom'],
]

export function notificationTitleKey(type?: string | null): string {
  const t = type ?? ''
  if (TITLE_KEYS[t]) return TITLE_KEYS[t]
  for (const [prefix, key] of PREFIX_KEYS) if (t.startsWith(prefix)) return key
  return 'notif.generic'
}
