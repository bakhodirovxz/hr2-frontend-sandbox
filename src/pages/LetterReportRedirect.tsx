import { Navigate, useParams } from 'react-router-dom'

/**
 * `/letters/report/{id}` — the link the backend puts in a notification.
 *
 * `LetterService` mails this address as the report's `file_url`, and v2 had no
 * route for it, so recipients landed on the dashboard. v1 answered with a
 * whole read-only viewer; v2 does not need one — the report already opens in
 * the document editor as `letter-report-{id}` (see `DocumentEditorPage`), and
 * that view is the one people know, can print from and can edit if allowed.
 *
 * So: forward, do not rebuild.
 */
export function LetterReportRedirect() {
  const { id } = useParams()
  return <Navigate replace to={`/hujjatlar/edit/letter-report-${id}`} />
}
