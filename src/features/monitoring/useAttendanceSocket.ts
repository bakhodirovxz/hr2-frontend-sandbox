import { useCallback, useEffect, useRef, useState } from 'react'
import { domain, ensureFreshAccessToken } from '@/api/client'

export const WS_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
} as const
type WsStatus = (typeof WS_STATUS)[keyof typeof WS_STATUS]

/** Live turnstile event as delivered over the socket (fields are best-effort). */
export interface LiveEvent {
  id?: number
  event_id?: number | string
  employee_id?: number
  visitor_id?: number
  happen_time?: string
  direction_type?: string
  check_in_out_type?: number
  is_first_entrance?: boolean
  /** Never sent by the server (TurnstileAttendanceEventReadFull has no such
   *  field) — read the branch with `liveEventBranchIds`. */
  organization_branch_id?: number
  employee_branch_id?: number | null
  terminal_branch_id?: number | null
  is_cross_branch?: boolean
  visible_branch_ids?: number[]
  employee?: Record<string, unknown> | null
  visitor?: Record<string, unknown> | null
  turnstile?: Record<string, unknown> | null
  is_live?: boolean
}

/**
 * Branches whose boards show this pass — the socket twin of the server's
 * `day_board` / `list_events` branch check (`_belongs`).
 *
 * An employee pass carries `visible_branch_ids`: the employee's own
 * (department) branch, plus the host branch when they badged in at a foreign
 * building. Empty = no department branch, which the REST board drops too.
 * A guest pass has no employee: the visitor's branch and the gate's branch.
 *
 * The dashboard used to test `organization_branch_id`, which the payload never
 * has, so every live pass of every branch landed on the board and vanished on
 * reload (user report 2026-09-26).
 */
export function liveEventBranchIds(m: LiveEvent): number[] {
  if (Array.isArray(m.visible_branch_ids) && m.visible_branch_ids.length) return m.visible_branch_ids.map(Number)
  if (m.employee_id) return m.employee_branch_id != null ? [Number(m.employee_branch_id)] : []
  const visitorBranch = (m.visitor as { organization_branch_id?: number | null } | null | undefined)?.organization_branch_id
  return [visitorBranch, m.terminal_branch_id].filter((id): id is number => id != null).map(Number)
}

/** Does `branchId`'s board show this pass? No branch picked = every branch. */
export function liveEventInBranch(m: LiveEvent, branchId: number | null | undefined): boolean {
  if (branchId == null) return true
  return liveEventBranchIds(m).includes(Number(branchId))
}

/** ws(s):// URL for the attendance stream, derived from the API base. */
function socketUrl(): string {
  const base = domain.startsWith('http')
    ? domain
    : `${window.location.protocol}//${window.location.host}${domain}`
  return `${base.replace(/^http/, 'ws')}/ws/attendance`
}

/** Full-jitter exponential backoff (never hammers a struggling server). */
function backoffDelay(attempt: number, base = 1000, cap = 30_000) {
  return Math.random() * Math.min(cap, base * 2 ** attempt)
}

/**
 * Live attendance socket.
 *
 * The handshake carries the JWT as a `bearer` subprotocol rather than a query
 * string, so the token never lands in proxy access logs. The token is refreshed
 * BEFORE every attempt: a tab watching the wall may make no HTTP requests for
 * an hour, and an expired token is rejected pre-accept (onopen never fires).
 */
export function useAttendanceSocket(enabled: boolean) {
  const [status, setStatus] = useState<WsStatus>(WS_STATUS.IDLE)
  const [lastMessage, setLastMessage] = useState<LiveEvent | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const attemptRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const closedByUs = useRef(false)

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    timerRef.current = null
    heartbeatRef.current = null
  }, [])

  const connect = useCallback(async () => {
    if (!enabled || closedByUs.current) return
    setStatus(attemptRef.current === 0 ? WS_STATUS.CONNECTING : WS_STATUS.RECONNECTING)

    const token = await ensureFreshAccessToken()
    if (!token || closedByUs.current) {
      setStatus(WS_STATUS.DISCONNECTED)
      return
    }

    let socket: WebSocket
    try {
      socket = new WebSocket(socketUrl(), ['bearer', token])
    } catch {
      setStatus(WS_STATUS.DISCONNECTED)
      return
    }
    socketRef.current = socket

    socket.onopen = () => {
      // The attempt counter is reset on the first *message*, not here: a stale
      // token is accepted and then closed, and resetting on open would turn the
      // backoff into a per-second reconnect loop.
      setStatus(WS_STATUS.CONNECTED)
      heartbeatRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping')
      }, 25_000)
    }

    socket.onmessage = (ev) => {
      attemptRef.current = 0
      if (typeof ev.data === 'string' && (ev.data === 'pong' || ev.data === 'ping')) return
      try {
        const parsed = JSON.parse(ev.data as string)
        if (parsed && typeof parsed === 'object') setLastMessage(parsed as LiveEvent)
      } catch {
        /* non-JSON frame — ignore */
      }
    }

    const scheduleReconnect = () => {
      if (closedByUs.current || !enabled) return
      const delay = backoffDelay(attemptRef.current)
      attemptRef.current = Math.min(attemptRef.current + 1, 10)
      setStatus(WS_STATUS.RECONNECTING)
      timerRef.current = setTimeout(() => void connect(), delay)
    }

    socket.onclose = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
      scheduleReconnect()
    }
    socket.onerror = () => {
      /* close always follows — reconnect is scheduled there */
    }
  }, [enabled])

  useEffect(() => {
    closedByUs.current = false
    if (enabled) void connect()
    return () => {
      closedByUs.current = true
      cleanup()
      socketRef.current?.close()
      socketRef.current = null
      setStatus(WS_STATUS.IDLE)
    }
  }, [enabled, connect, cleanup])

  return { status, lastMessage }
}
