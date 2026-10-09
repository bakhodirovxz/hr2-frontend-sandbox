import { useDebounce } from '@/hooks/useDebounce'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import type { Page } from '@/features/employees/useEmployees'

/**
 * Fleet (Avtopark) — the cars lent to business trips, and the queue of
 * requests for them.
 *
 * ⚠️ EVERY CALL SENDS `organization_branch_id: null`.
 * The axios layer adds the header branch to every request, but the cars live
 * in ONE branch (the provider, id 29 by config) while the people asking for
 * them sit in another (the head office, id 1). With the injected branch the
 * list came back EMPTY and the page looked broken. Opting out is the
 * documented behaviour of the request layer, not a workaround.
 */
const VEHICLES = 'vehicles'
const NO_BRANCH = { organization_branch_id: null }

interface FleetAccess {
  can_manage: boolean
  can_approve: boolean
  can_view: boolean
  can_request: boolean
  provider_branch_id: number | null
  managed_branch_ids: number[]
  approver_branch_ids: number[]
  requester_branch_ids: number[]
}

export interface Vehicle {
  id: number
  model_name?: string | null
  plate_number?: string | null
  color?: string | null
  year?: number | null
  seats?: number | null
  fuel_type_id?: number | null
  fuel_type_name?: string | null
  fuel_unit?: string | null
  fuel_consumption?: number | null
  gps_device_id?: string | null
  driver_employee_id?: number | null
  driver?: { id?: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null } | null
  driver_available?: boolean
  driver_block_reason?: string | null
  is_active?: boolean
  is_busy?: boolean
  has_pending?: boolean
  /** Approved trips overlapping the requested range — who has it, until when. */
  busy_periods?: { letter_id: number; start_date?: string | null; end_date?: string | null; employee_name?: string | null }[]
  fuel_price?: number | null
  fuel_price_pending?: number | null
  leader?: { id?: number; legal_name?: string | null } | null
  leader_position?: string | null
  driver_position?: string | null
  driver_phone?: string | null
  driver_health?: { label?: string | null; status?: string | null; blocking?: boolean } | null
  organization_branch_id?: number | null
}

/** The profile's headline figures — how far, how much fuel, how much money. */
interface VehicleStats {
  trip_count: number
  finalized_count: number
  total_distance_km?: number | null
  total_fuel_liters?: number | null
  total_fuel_cost?: number | null
  last_trip_date?: string | null
}

/** One journey in the profile's history: where, with whom, how far. */
export interface VehicleTrip {
  request_id: number
  letter_id: number
  letter_number?: string | null
  status?: string | null
  letter_status?: string | null
  start_date?: string | null
  end_date?: string | null
  employee_name?: string | null
  employee_photo_thumb_path?: string | null
  employee_photo_path?: string | null
  driver_name?: string | null
  regions: string[]
  destination_names: string[]
  purpose?: string | null
  distance_km?: number | null
  fuel_liters?: number | null
  fuel_cost?: number | null
  actual_distance_km?: number | null
  actual_fuel_liters?: number | null
  actual_fuel_cost?: number | null
  distance_source?: string | null
}

/** An object in the tracking provider's inventory, ready to be wired to a car. */
interface GpsUnit {
  id: number
  name?: string | null
  plate?: string | null
  vehicle_id?: number | null
  vehicle_plate?: string | null
}

/** Where the car is RIGHT NOW, straight from the tracker. */
export interface VehicleLive {
  name?: string | null
  lat?: number | null
  lon?: number | null
  speed?: number | null
  course?: number | null
  at?: string | null
  age_seconds?: number | null
  sats?: number | null
  mileage?: number | null
}

/**
 * The tracking provider's object list. Fetched only while the vehicle form is
 * open: it is a call to an EXTERNAL service (Wialon), not our database.
 */
export function useGpsUnits(enabled: boolean) {
  const q = useQuery({
    enabled,
    queryKey: [VEHICLES, 'gps-units'],
    queryFn: () => apiGet<GpsUnit[]>(`${VEHICLES}/gps-units`, NO_BRANCH),
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { units: q.data ?? [], loading: q.isLoading, failed: q.isError }
}

/**
 * Live position, polled while the profile is open.
 *
 * 20s matches v1: the provider updates about that often, and a tighter loop
 * only spends someone's traffic. `retry: false` — a tracker that is offline is
 * an ANSWER, not a failure to retry against an external service.
 */
export function useVehicleLive(id: number | null, enabled: boolean) {
  const q = useQuery({
    enabled: enabled && !!id,
    queryKey: [VEHICLES, 'live', id],
    queryFn: () => apiGet<VehicleLive | null>(`${VEHICLES}/${id}/live`, NO_BRANCH),
    refetchInterval: 20_000,
    retry: false,
  })
  return { live: q.data ?? null, loading: q.isLoading, failed: q.isError }
}

/** One breadcrumb of a recorded route. */
export interface VehicleTrackPoint {
  lat: number
  lon: number
  at?: string | null
  speed?: number | null
  course?: number | null
}

/**
 * The route the car actually drove between two dates.
 *
 * A track is HISTORY: it only changes when the car moves, so it is fetched per
 * date range and left alone (no polling) — unlike the live position.
 */
export function useVehicleTrack(id: number | null, from: string, to: string, enabled: boolean) {
  const q = useQuery({
    enabled: enabled && !!id && !!from,
    queryKey: [VEHICLES, 'track', id, from, to],
    queryFn: () =>
      apiGet<VehicleTrackPoint[]>(`${VEHICLES}/${id}/track`, {
        ...NO_BRANCH,
        date_from: from,
        date_to: to || from,
      }),
    retry: false,
  })
  return { points: q.data ?? [], loading: q.isFetching, failed: q.isError, reload: q.refetch }
}

/** One drive of a day: from where to where, when, how far. */
export interface VehicleGpsTrip {
  start_at?: string | null
  end_at?: string | null
  start_lat?: number | null
  start_lon?: number | null
  end_lat?: number | null
  end_lon?: number | null
  distance_km?: number | null
}

export type PlaceCategory = 'food' | 'hotel' | 'entertainment' | 'attraction' | 'own'

/**
 * One stop of a day. `place_*` is what stands NEXT TO the parked car — an
 * OpenStreetMap place (café, hotel…) or one of our own objects
 * (`place_category: 'own'`, a branch or a registered location); all null when
 * nothing is mapped there. `is_habitual` — the car stands here most days (the
 * driver's own parking spot), so a café beside it is not a visit.
 */
export interface VehicleGpsStop {
  id: number
  start_at: string
  end_at: string
  duration_s: number
  lat: number
  lon: number
  place_name?: string | null
  place_kind?: string | null
  place_category?: PlaceCategory | null
  place_distance_m?: number | null
  habitual_days: number
  is_habitual: boolean
}

export interface VehicleGpsDay {
  day: string
  synced: boolean
  is_final: boolean
  distance_km?: number | null
  trips: VehicleGpsTrip[]
  stops: VehicleGpsStop[]
}

/**
 * Day-by-day GPS history: distance, drives and stops with the place beside
 * each stop. Finished days come from our database; today (and any day not yet
 * stored) is fetched from the provider on the way, so the first open of a
 * long range is slower than the second. Fleet-operator data (403 otherwise).
 */
export function useVehicleHistory(id: number | null, from: string, to: string, enabled: boolean) {
  const q = useQuery({
    enabled: enabled && !!id && !!from,
    queryKey: [VEHICLES, 'history', id, from, to],
    queryFn: () =>
      apiGet<VehicleGpsDay[]>(`${VEHICLES}/${id}/history`, {
        ...NO_BRANCH,
        date_from: from,
        date_to: to || from,
      }),
    placeholderData: (prev) => prev,
    retry: false,
  })
  return { days: q.data ?? [], loading: q.isFetching, failed: q.isError, reload: q.refetch }
}

/** A row of the visits report: a stop beside a place, plus car and driver. */
export interface VehicleVisit extends VehicleGpsStop {
  day: string
  vehicle_id: number
  vehicle_name?: string | null
  plate_number?: string | null
  driver_employee_id?: number | null
  driver_name?: string | null
  letter_id?: number | null
  on_trip: boolean
}

export interface VisitFilters {
  from: string
  to: string
  vehicleId?: string
  category?: string
  minMinutes?: number
  includeHabitual?: boolean
}

/**
 * The visits report — which car stood beside which café/restaurant/hotel and
 * for how long. Works over STORED days only (the nightly sync writes
 * yesterday; opening a car's history writes today), see the server docstring.
 */
export function useVehicleVisits(page: number, size: number, f: VisitFilters, enabled: boolean) {
  const q = useQuery({
    enabled: enabled && !!f.from,
    queryKey: [VEHICLES, 'visits', { page, size, ...f }],
    queryFn: () =>
      apiGet<Page<VehicleVisit>>(`${VEHICLES}/visits`, {
        ...NO_BRANCH,
        page,
        size,
        date_from: f.from,
        date_to: f.to || f.from,
        vehicle_id: f.vehicleId || undefined,
        category: f.category || undefined,
        min_minutes: f.minMinutes ?? 10,
        include_habitual: f.includeHabitual || undefined,
      }),
    placeholderData: (prev) => prev,
    retry: false,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
    failed: q.isError,
    error: q.error,
  }
}

/**
 * One vehicle's own page: specification, driver, totals and journey history.
 * `organization_branch_id: null` as everywhere in this module — the cars sit in
 * BFD while the people asking for them sit in the head office.
 */
export function useVehicleProfile(id: number | null) {
  const detail = useQuery({
    enabled: !!id,
    queryKey: [VEHICLES, 'detail', id],
    queryFn: () => apiGet<Vehicle & { stats?: VehicleStats | null }>(`${VEHICLES}/${id}`, NO_BRANCH),
  })
  const trips = useQuery({
    enabled: !!id,
    queryKey: [VEHICLES, 'trips', id],
    queryFn: () => apiGet<VehicleTrip[]>(`${VEHICLES}/${id}/trips`, NO_BRANCH),
  })
  return {
    vehicle: detail.data ?? null,
    stats: detail.data?.stats ?? null,
    trips: trips.data ?? [],
    loading: detail.isLoading,
    error: detail.error,
    refetch: detail.refetch,
    tripsLoading: trips.isLoading,
  }
}

export interface VehicleRequest {
  id: number
  /**
   * Requests the server has ALREADY verified as companions for this one: the
   * same destination AND the same dates (`VehicleService._same_trip`). v2 used
   * to rebuild this list locally from the dates alone, which offered people
   * travelling somewhere else that day; ticking one made `respond` fail with
   * 400 `not_same_trip` and, because the assignment is atomic, the main car
   * was not attached either (measured 2026-09-22 on two live requests going to
   * branches 6 and 20 on the same days).
   */
  shared_candidates?: {
    request_id: number
    letter_id?: number | null
    status?: string | null
    employee_name?: string | null
    employee_position?: string | null
    department_name?: string | null
  }[]
  status?: string | null
  /**
   * PER-ROW action flags from the server (`VehicleService`, 2162-2201) —
   * bound to the request's own branch (`can_respond`), the letter's branch
   * (`can_approve`) and the state machine. v2 used the LIST-level
   * `access.can_manage/can_approve` instead, so a fleet manager of one branch
   * saw Attach/Decide on other branches' rows and got 403 (2026-09-11 audit).
   * `can_approve` also allows re-deciding a request THIS approver rejected.
   */
  can_respond?: boolean
  can_approve?: boolean
  can_finalize?: boolean
  letter_id?: number | null
  letter_number?: string | null
  employee_name?: string | null
  employee_photo_thumb_path?: string | null
  employee_photo_path?: string | null
  employee_position?: string | null
  department_name?: string | null
  purpose?: string | null
  regions?: string[]
  destination_names?: string[]
  /* ⚠️ `start_date` / `end_date`, not `date_from` / `date_to`: the card read
     the latter pair, which the API never sends, so every request showed "—"
     where the travel dates belong. */
  start_date?: string | null
  end_date?: string | null
  vehicle_id?: number | null
  vehicle?: Vehicle | null
  assigned_driver_employee_id?: number | null
  assigned_driver?: { id?: number; legal_name?: string | null } | null
  request_note?: string | null
  /* Why it was refused. The approver's verdict is `approval_note`; the fleet's
     own answer to the requester is `response_text`. */
  approval_note?: string | null
  response_text?: string | null
  approval_status?: string | null
  finalized_at?: string | null
  actual_distance_km?: number | null
  distance_km?: number | null
  fuel_cost?: number | null
  actual_fuel_cost?: number | null
}

export interface FuelType {
  id: number
  name?: string | null
  unit?: string | null
  price?: number | null
  /**
   * ⚠️ 'pending' | 'approved' | 'rejected' — NOT a boolean.
   * The screen used to read `is_approved`, a field the API never sends: it is
   * `undefined` for every row, so `!is_approved` was always true and EVERY
   * fuel type wore a "Tasdiqlanmagan" badge with an Approve button beside it,
   * including the ones already approved. A pending price is simply `price`
   * while this is 'pending' — it is not carried in a second field.
   */
  approval_status?: string | null
  approval_note?: string | null
  approved_by_name?: string | null
  vehicle_count?: number | null
}

/** The price counts only once the approver has signed it off. */
export function isFuelApproved(f: FuelType): boolean {
  return (f.approval_status ?? '') === 'approved'
}

/**
 * "Haydovchi doirasi" — WHO counts as a driver, as departments, job positions
 * or named employees.
 *
 * The same setting feeds TWO screens: the driver picker when a car is assigned,
 * and the nurse's daily health roster. Empty means "everyone in the fleet
 * branch", which is why an unconfigured scope must never be read as "nobody".
 * Only the site master-admin may change it.
 */
export interface DriverScope {
  id: number
  /** department | job_position | employee */
  scope_type?: string | null
  scope_id?: number | null
  label?: string | null
  sub_label?: string | null
}

export function useDriverScopes(enabled: boolean) {
  const q = useQuery({
    enabled,
    queryKey: [VEHICLES, 'driver-scopes'],
    queryFn: () => apiGet<DriverScope[]>(`${VEHICLES}/driver-scopes`, NO_BRANCH),
  })
  return { scopes: q.data ?? [], loading: q.isLoading }
}

export function useDriverScopeMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [VEHICLES, 'driver-scopes'] })
  return {
    addScope: useMutation({
      mutationFn: (body: { scope_type: string; scope_id: number }) =>
        apiPost<DriverScope[]>(`${VEHICLES}/driver-scopes`, body, { params: NO_BRANCH }),
      onSuccess: done,
    }),
    removeScope: useMutation({
      mutationFn: (id: number) => apiDelete(`${VEHICLES}/driver-scopes/${id}`, { params: NO_BRANCH }),
      onSuccess: done,
    }),
  }
}

export function useFleetAccess() {
  const q = useQuery({
    queryKey: [VEHICLES, 'access'],
    queryFn: () => apiGet<FleetAccess>(`${VEHICLES}/access`, NO_BRANCH),
    staleTime: 5 * 60_000,
  })
  return { access: q.data ?? null, loading: q.isLoading }
}

/**
 * The fleet list.
 *
 * `range` matters when a car is being ASSIGNED to a trip: given the travel
 * dates the server computes `is_busy` per vehicle, and `excludeLetterId` stops
 * the trip's OWN booking from counting against it. Without them every car looks
 * free and the fleet manager only learns otherwise from a 400 after submitting.
 */
export function useVehicles(
  search: string,
  onlyActive: boolean,
  range?: { from?: string | null; to?: string | null; excludeLetterId?: number | null },
) {
  const from = range?.from || undefined
  const to = range?.to || undefined
  const excludeLetterId = range?.excludeLetterId || undefined
  const q = useQuery({
    queryKey: [VEHICLES, 'list', { search, onlyActive, from, to, excludeLetterId }],
    queryFn: () =>
      apiGet<Vehicle[]>(VEHICLES, {
        ...NO_BRANCH,
        search: search || undefined,
        only_active: onlyActive || undefined,
        date_from: from,
        date_to: to,
        exclude_letter_id: excludeLetterId,
      }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data ?? [],
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

export interface RequestFilters {
  vehicleId?: string
  from?: string
  to?: string
  search?: string
}

/**
 * The queue screen: search and paging on the SERVER (2026-09-25). The
 * approved/rejected tabs keep every past trip, and the page used to download
 * all of them to match a name in the browser. Pages of 30, «Yana» for more.
 */
export function useVehicleRequestsPaged(status: string, f: RequestFilters = {}) {
  const term = useDebounce((f.search ?? '').trim(), 300)
  const q = useInfiniteQuery({
    queryKey: [VEHICLES, 'requests', 'paged', status, f.vehicleId ?? null, f.from ?? null, f.to ?? null, term],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiGet<{ items: VehicleRequest[]; page: number; pages: number; total: number }>(`${VEHICLES}/requests`, {
        ...NO_BRANCH,
        status,
        vehicle_id: f.vehicleId || undefined,
        date_from: f.from || undefined,
        date_to: f.to || undefined,
        search: term || undefined,
        page: pageParam,
        size: 30,
      }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data?.pages.flatMap((p) => p.items ?? []) ?? [],
    total: q.data?.pages[0]?.total ?? 0,
    loading: q.isLoading,
    hasMore: !!q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage()
    },
  }
}

export function useVehicleRequests(status: string, f: RequestFilters = {}) {
  const vehicle_id = f.vehicleId || undefined
  const date_from = f.from || undefined
  const date_to = f.to || undefined
  const q = useQuery({
    queryKey: [VEHICLES, 'requests', status, vehicle_id ?? null, date_from ?? null, date_to ?? null],
    queryFn: () => apiGet<VehicleRequest[]>(`${VEHICLES}/requests`, { ...NO_BRANCH, status, vehicle_id, date_from, date_to }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data ?? [],
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

/**
 * THE FUEL-PRICE LOG — every change to a fuel type and what became of it.
 *
 * A price change is approved, not just typed: the old and new price, who asked
 * and who decided all matter later, because vehicle costs are recalculated
 * from whatever price was in force. v2 could set a price but never show that
 * history, so a disputed figure had no paper trail on screen.
 */
export function useFuelLogs(enabled = true) {
  const q = useQuery({
    queryKey: [VEHICLES, 'fuel-logs'],
    queryFn: () =>
      apiGet<{
        id: number
        fuel_name?: string | null
        action?: string | null
        action_label?: string | null
        old_price?: number | null
        new_price?: number | null
        note?: string | null
        created_at?: string | null
        actor_name?: string | null
      }[]>(`${VEHICLES}/fuel-logs`, NO_BRANCH),
    enabled,
    staleTime: 60_000,
  })
  return {
    rows: Array.isArray(q.data) ? q.data : [],
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useFuelTypes(enabled = true) {
  const q = useQuery({
    queryKey: [VEHICLES, 'fuel-types'],
    queryFn: () => apiGet<FuelType[]>(`${VEHICLES}/fuel-types`, NO_BRANCH),
    enabled,
  })
  return {
    rows: q.data ?? [],
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

interface DriverOption {
  id: number
  legal_name?: string | null
  position?: string | null
  photo_path?: string | null
  /** The server's verdict for THESE dates: on a trip, sick, or no check today. */
  available?: boolean
  block_reason?: string | null
  health?: { status?: string | null; label?: string | null } | null
}

/**
 * Drivers, with the server's own availability verdict.
 *
 * `/vehicles/drivers` answers `available: false` plus a `block_reason` for a
 * driver who is on another trip, off sick, or has not passed today's medical
 * check — the whole point of the route. v2 read only the name and position, so
 * every driver looked selectable and the refusal arrived as a 400/409 after
 * the form was submitted.
 */
export function useDriverOptions(
  enabled = true,
  range?: { from?: string | null; to?: string | null; excludeLetterId?: number | null },
) {
  const from = range?.from || undefined
  const to = range?.to || undefined
  const excludeLetterId = range?.excludeLetterId || undefined
  const q = useQuery({
    queryKey: [VEHICLES, 'drivers', { from, to, excludeLetterId }],
    queryFn: () =>
      apiGet<DriverOption[]>(`${VEHICLES}/drivers`, {
        ...NO_BRANCH,
        date_from: from,
        date_to: to,
        exclude_letter_id: excludeLetterId,
      }),
    enabled,
  })
  return (q.data ?? []).map((d) => {
    const blocked = d.available === false
    const warn = d.health?.status && d.health.status !== 'good' ? `⚠ ${d.health.label}` : null
    return {
      value: String(d.id),
      label: d.legal_name ?? '—',
      photo: d.photo_path ?? null,
      disabled: blocked,
      subLabel: blocked
        ? `⛔ ${d.block_reason ?? ''}`.trim()
        : [d.position, warn].filter(Boolean).join(' · ') || undefined,
    }
  })
}

export function useFleetMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [VEHICLES] })
  return {
    invalidate,
    createVehicle: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<Vehicle>(VEHICLES, body),
    }),
    updateVehicle: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<Vehicle>(`${VEHICLES}/${id}`, body),
    }),
    removeVehicle: useMutation({ mutationFn: (id: number) => apiDelete(`${VEHICLES}/${id}`) }),
    /** Head-office approver passes the request on to the fleet, or rejects it. */
    /**
     * CLOSING a trip's fleet request with the REAL cost.
     *
     * Approval records what was asked for; this records what it actually cost
     * once the car came back — read from GPS when the vehicle has a tracker,
     * typed in as kilometres when it does not. Without it every trip stayed
     * costed at its estimate, which is the number nobody wants in a fuel
     * report.
     */
    finalizeRequest: useMutation({
      mutationFn: ({ id, actual_distance_km, note }: { id: number; actual_distance_km?: number; note?: string }) =>
        apiPost(`${VEHICLES}/requests/${id}/finalize`, {
          actual_distance_km: actual_distance_km ?? null,
          note: note || null,
        }),
    }),
    approveRequest: useMutation({
      // ⚠️ `note` MAJBURIY ikkalasida ham — server bo'sh izohni 400 qiladi
      // (tasdiq izohi avtoparkka, rad izohi safar egasiga ko'rinadi).
      mutationFn: ({ id, approved, note }: { id: number; approved: boolean; note: string }) =>
        apiPost(`${VEHICLES}/requests/${id}/approve`, { approved, note }),
    }),
    /** Fleet answers: attaches a car and a driver, or refuses. */
    respondRequest: useMutation({
      mutationFn: (body: {
        id: number
        approved: boolean
        vehicle_id?: number | null
        assigned_driver_employee_id?: number | null
        response_text?: string
        /** BIRGA KETADIGANLAR: aynan bir manzil va bir sanaga ketayotgan
         *  navbatdagi so'rovlarga SHU mashina biriktiriladi. Server ularni
         *  yozishdan OLDIN tekshiradi (yo hammasi, yo hech nimasi). */
        also_request_ids?: number[]
      }) => {
        const { id, ...rest } = body
        return apiPost(`${VEHICLES}/requests/${id}/respond`, rest)
      },
    }),
    saveFuelType: useMutation({
      mutationFn: ({ id, body }: { id?: number; body: Record<string, unknown> }) =>
        id ? apiPatch(`${VEHICLES}/fuel-types/${id}`, body) : apiPost(`${VEHICLES}/fuel-types`, body),
    }),
    /**
     * `FuelTypeApprove` requires `approved`; an empty body answered 422 on every
     * click, so the price could never be confirmed. `note` is mandatory on a
     * rejection and `price` lets the approver correct the figure while
     * confirming it.
     */
    approveFuelType: useMutation({
      mutationFn: ({ id, approved, note, price }: { id: number; approved: boolean; note?: string; price?: number | null }) =>
        apiPost(`${VEHICLES}/fuel-types/${id}/approve`, {
          approved,
          note: note?.trim() || null,
          price: price ?? null,
        }),
    }),
    removeFuelType: useMutation({ mutationFn: (id: number) => apiDelete(`${VEHICLES}/fuel-types/${id}`) }),
  }
}
