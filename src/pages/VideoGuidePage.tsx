import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Eye, PlayCircle, Video } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { formatDuration } from '@/lib/format'
import { Segmented } from '@/components/ui/Segmented'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import { cn } from '@/lib/cn'
import { VideoGuideManager } from '@/features/videoGuide/VideoGuideManager'
import { useVideoGuides, useTrackVideoView, type VideoGuide } from '@/features/videoGuide/useVideoGuides'

export function VideoGuidePage() {
  const { t } = useTranslation()
  const { search, setSearch, activeFilterCount, reset } = useListParams()
  const { all, loading } = useVideoGuides()
  const track = useTrackVideoView()
  const [playing, setPlaying] = useState<VideoGuide | null>(null)
  const user = useAuthStore((s) => s.user)
  // Upload/edit/delete is admin-only — the backend guards it with
  // require_roles("admin", "master-admin"), so mirror exactly that.
  const canManage = roles.isSiteMasterAdmin(user) || !!user?.admin
  const [tab, setTab] = useState<'gallery' | 'manage'>('gallery')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const videos = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? all.filter((v) => v.title?.toLowerCase().includes(q)) : all
  }, [all, search])

  const open = (v: VideoGuide) => {
    setPlaying(v)
    track.mutate(v.id)
  }

  return (
    <PageContainer>
      <PageHeader title={t('videoGuide.title')} subtitle={t('videoGuide.subtitle')} />

      {canManage && (
        <div className="mb-4">
          <Segmented
            value={tab}
            onChange={(v) => setTab(v)}
            options={[
              { value: 'gallery', label: t('videoGuide.tabGallery') },
              { value: 'manage', label: t('videoGuide.tabManage') },
            ]}
          />
        </div>
      )}

      {notice && (
        <div
          className={cn(
            'mb-3 rounded-lg border px-3 py-2 text-sm',
            notice.kind === 'ok'
              ? 'border-success/30 bg-success-soft text-success'
              : 'border-warning/30 bg-warning-soft text-warning',
          )}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {tab === 'manage' && canManage ? (
        <VideoGuideManager onNotice={(kind, text) => setNotice({ kind, text })} />
      ) : (
      <>
      <div className="mb-4 flex max-w-xl items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder={t('videoGuide.searchPlaceholder')} className="flex-1" />
        <FilterReset count={activeFilterCount} onReset={reset} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Video size={22} />}
            title={t('videoGuide.empty')}
            description={t('videoGuide.emptyHint')}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((v) => (
            <Card key={v.id} className="group flex flex-col overflow-hidden">
              <button
                type="button"
                onClick={() => open(v)}
                aria-label={`${t('videoGuide.watch')}: ${v.title}`}
                className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-brand/15 to-accent/10 transition-colors hover:from-brand/25"
              >
                <PlayCircle size={44} className="text-brand transition-transform group-hover:scale-110" />
                {v.duration_seconds != null && (
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                    <Clock size={11} />
                    {formatDuration(v.duration_seconds)}
                  </span>
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col p-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-fg">{v.title}</h3>
                {v.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{v.description}</p>
                )}
                <div className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] text-fg-subtle">
                  <Eye size={12} />
                  <span className="tabular-nums">{v.view_count}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!playing}
        onClose={() => setPlaying(null)}
        title={playing?.title ?? ''}
        description={playing?.description ?? undefined}
        size="lg"
      >
        {playing?.video_url ? (
          <video
            src={playing.video_url}
            controls
            autoPlay
            className="aspect-video w-full rounded-lg bg-black"
          />
        ) : (
          <EmptyState title={t('videoGuide.empty')} />
        )}
      </Modal>
      </>
      )}
    </PageContainer>
  )
}
