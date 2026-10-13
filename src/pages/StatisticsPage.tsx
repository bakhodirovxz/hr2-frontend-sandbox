import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, BookOpen, FileSpreadsheet, LayoutDashboard, ShieldQuestion } from 'lucide-react'
import { canSeeStatisticsDashboard } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/data/LoadError'
import { useStatisticsMeta } from '@/features/statistics/useStatistics'

/*
 * Har tab o'z chunki: konstruktor va panel recharts ni tortadi (~420 KB), katalog
 * esa uni faqat natija diagrammasi chizilganda yuklaydi.
 */
const ReportCatalog = lazy(() => import('@/features/statistics/ReportCatalog').then((m) => ({ default: m.ReportCatalog })))
const StatisticsConstructor = lazy(() =>
  import('@/features/statistics/StatisticsConstructor').then((m) => ({ default: m.StatisticsConstructor })),
)
const StatsDashboard = lazy(() => import('@/features/statistics/StatsDashboard').then((m) => ({ default: m.StatsDashboard })))
// TZ 4.2.7 · 2139 — davlat / idoraviy hisobot shakllari (.docx shablonlar).
const StatisticsForms = lazy(() => import('@/features/statistics/StatisticsForms').then((m) => ({ default: m.StatisticsForms })))

type Tab = 'catalog' | 'builder' | 'forms' | 'dashboard'

/**
 * STATISTIK HISOBOT — TZ 4.2.11, R1 «Формирование отчётов», R2 «Просмотр
 * статистики» (v1 `StatistikHisobotPage`). Uch bo'lim:
 *
 *   • «Hisobotlar katalogi» (R1) — kadrlar, shtat, buyruqlar, ta'tillar va
 *     murojaatlar bo'yicha tayyor hisobotlar, parametr formasi, jadval +
 *     diagramma, shablonlar va Excel / PDF / Word eksporti;
 *   • «Murojaatlar statistikasi» — murojaatlar konstruktori (filtrlar, kesim,
 *     kartochkalar, ikki diagramma, shablonlar, eksport);
 *   • «Ko'rsatkichlar paneli» (R2) — faqat `statistics = full` (rahbariyat).
 *
 * Marshrut darvozasi navConfig da (`can('statistics') && readsOrg`); bu yerda
 * faqat R2 tabining darvozasi.
 */
export function StatisticsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [params, setParams] = useSearchParams()
  const meta = useStatisticsMeta()
  const catalog = meta.data?.report_catalog ?? []
  const dashboardAllowed = canSeeStatisticsDashboard(user)

  const tabs: Tab[] = [
    ...(catalog.length || meta.isLoading ? (['catalog'] as Tab[]) : []),
    'builder',
    'forms',
    ...(dashboardAllowed ? (['dashboard'] as Tab[]) : []),
  ]
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && tabs.includes(requested) ? requested : tabs[0]

  const switchTab = (v: Tab) => {
    const next = new URLSearchParams(params)
    if (v === tabs[0]) next.delete('tab')
    else next.set('tab', v)
    setParams(next, { replace: true })
  }

  const status = (meta.error as { response?: { status?: number } } | null)?.response?.status
  const fallback = <Skeleton className="h-96 w-full" />

  return (
    <PageContainer>
      <PageHeader
        title={t('statistics.title')}
        subtitle={tab === 'builder' ? t('statReports.subtitleBuilder') : tab === 'forms' ? t('hrExt.forms.subtitle') : t('statReports.subtitle')}
      />

      {status === 403 ? (
        <Card className="p-10">
          <EmptyState icon={<ShieldQuestion size={26} />} title={t('common.noAccess')} description={t('statistics.noAccessHint')} />
        </Card>
      ) : meta.error ? (
        <Card className="p-6">
          <LoadError error={meta.error} onRetry={() => void meta.refetch()} />
        </Card>
      ) : (
        <>
          <Segmented
            className="mb-4"
            aria-label={t('statReports.sections')}
            value={tab}
            onChange={switchTab}
            options={tabs.map((k) => ({
              value: k,
              label: k === 'forms' ? t('hrExt.forms.tab') : t(`statReports.tab_${k}` as 'statReports.tab_catalog'),
              icon:
                k === 'catalog' ? (
                  <BookOpen size={14} />
                ) : k === 'builder' ? (
                  <BarChart3 size={14} />
                ) : k === 'forms' ? (
                  <FileSpreadsheet size={14} />
                ) : (
                  <LayoutDashboard size={14} />
                ),
            }))}
          />
          <Suspense fallback={fallback}>
            {tab === 'catalog' ? (
              meta.isLoading ? fallback : <ReportCatalog catalog={catalog} />
            ) : tab === 'builder' ? (
              <StatisticsConstructor />
            ) : tab === 'forms' ? (
              <StatisticsForms />
            ) : (
              <StatsDashboard />
            )}
          </Suspense>
        </>
      )}
    </PageContainer>
  )
}
