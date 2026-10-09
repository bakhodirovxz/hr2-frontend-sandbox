import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { apiGet } from '@/api/http'

/**
 * A document opened by its SHARE LINK (`/hujjat/<slug>`).
 *
 * The slug is the whole handle — the recipient is not in the folder and has no
 * document id. Login is still required (the backend checks the session as well
 * as the slug), so this is "shared with colleagues", never "public".
 *
 * Once the slug resolves, the editor takes over: it is the same OnlyOffice
 * screen the library uses, addressed as `slug-<slug>`.
 */
export function SharedDocumentPage() {
  const { t } = useTranslation()
  const { slug } = useParams()

  const q = useQuery({
    enabled: !!slug,
    queryKey: ['file-by-slug', slug],
    queryFn: () => apiGet<{ id: number; name?: string | null }>(`files/by-slug/${slug}`),
    retry: false,
  })

  if (q.isLoading) return <CenteredSpinner />

  if (q.isError || !q.data) {
    return (
      <PageContainer>
        <PageHeader title={t('sharedDoc.title')} />
        <Card className="p-6">
          <EmptyState icon={<ShieldAlert size={22} />} title={t('sharedDoc.notFound')} description={t('sharedDoc.notFoundHint')} />
        </Card>
      </PageContainer>
    )
  }

  return <Navigate to={`/hujjatlar/edit/slug-${slug}`} replace state={{ title: q.data.name }} />
}

