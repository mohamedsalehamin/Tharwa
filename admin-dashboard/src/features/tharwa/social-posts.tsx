import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminFetch,
  type SocialPostRunRow,
  type SocialPreviewResult,
  type SocialPublishResponse,
  type SocialStatusResponse,
} from '@/lib/admin-api'
import { isSuperadmin } from '@/lib/admin-roles'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

const TEMPLATES = [
  { id: 'gold_daily', label: 'Gold daily (video bundle)' },
  { id: 'gold_alert', label: 'Gold drop alert' },
  { id: 'egx_close', label: 'EGX close summary' },
] as const

type TemplateId = (typeof TEMPLATES)[number]['id']

const TEMPLATE_HINTS: Record<TemplateId, string> = {
  gold_daily:
    'Generates voice (Gemini TTS) + 9:16 video, then publishes IG/FB Reels, alternating Stories, and YouTube Short with platform-specific captions.',
  gold_alert: 'Photo post to Meta when Cairo-day gold drop exceeds threshold.',
  egx_close: 'Photo post to Meta after EGX session close.',
}

function formatChannelLabel(channel: string, format: string): string {
  const channelLabel =
    channel === 'instagram'
      ? 'Instagram'
      : channel === 'facebook'
        ? 'Facebook'
        : channel === 'youtube'
          ? 'YouTube'
          : channel
  const formatLabel =
    format === 'reel' ? 'Reel' : format === 'story' ? 'Story' : format === 'photo' ? 'Photo' : format
  return `${channelLabel} · ${formatLabel}`
}

function summarizePublishResult(result: SocialPublishResponse): {
  tone: 'success' | 'warning' | 'error'
  message: string
} {
  if (!result.published || !result.results?.length) {
    return { tone: 'warning', message: 'Skipped — already posted today or market data unavailable' }
  }
  const published = result.results.filter((r) => r.status === 'published').length
  const failed = result.results.filter((r) => r.status === 'failed')
  const skipped = result.results.filter((r) => r.status === 'skipped').length
  const lines = result.results.map(
    (r) =>
      `${formatChannelLabel(r.channel, r.format)}: ${r.status}${r.errorMessage ? ` (${r.errorMessage})` : ''}`,
  )
  if (failed.length > 0) {
    return {
      tone: 'error',
      message: `${published} published, ${failed.length} failed, ${skipped} skipped\n${lines.join('\n')}`,
    }
  }
  if (published === 0) {
    return { tone: 'warning', message: `Nothing new published (${skipped} skipped)\n${lines.join('\n')}` }
  }
  return {
    tone: 'success',
    message: `${published} published${skipped ? `, ${skipped} skipped` : ''}\n${lines.join('\n')}`,
  }
}

export function SocialPostsPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const role = useAuthStore((s) => s.auth.user?.role)
  const canManage = isSuperadmin(role)
  const queryClient = useQueryClient()

  const [template, setTemplate] = useState<TemplateId>('gold_daily')
  const [preview, setPreview] = useState<SocialPreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)

  const { data: status, error: statusErr } = useQuery({
    queryKey: ['admin', 'social-status', token],
    enabled: Boolean(token),
    queryFn: () => adminFetch<SocialStatusResponse>('/admin/v1/social/status', token!),
  })

  const { data: history } = useQuery({
    queryKey: ['admin', 'social-posts', token],
    enabled: Boolean(token),
    queryFn: () =>
      adminFetch<{ items: SocialPostRunRow[]; total: number }>('/admin/v1/social/posts', token!),
  })

  const metaReady = Boolean(status?.configured)
  const youtubeReady = Boolean(status?.youtube?.configured)
  const canPublish = template === 'gold_daily' ? metaReady || youtubeReady : metaReady
  const failedTodayCount = (history?.items ?? []).filter(
    (row) => row.template === template && row.status === 'failed',
  ).length

  const err = statusErr instanceof Error ? statusErr.message : null

  async function runPreview() {
    if (!token) return
    setPreviewLoading(true)
    setPreview(null)
    try {
      const result = await adminFetch<SocialPreviewResult>('/admin/v1/social/preview', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      })
      setPreview(result)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function runPublish(options: { force?: boolean; retryFailed?: boolean } = {}) {
    if (!token || !canManage) return
    setPublishLoading(true)
    try {
      const result = await adminFetch<SocialPublishResponse>(
        '/admin/v1/social/publish',
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template,
            force: options.force ?? false,
            retryFailed: options.retryFailed ?? false,
          }),
        },
      )
      const summary = summarizePublishResult(result)
      if (summary.tone === 'success') toast.success(summary.message)
      else if (summary.tone === 'error') toast.error(summary.message)
      else toast.message(summary.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'social-posts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPublishLoading(false)
    }
  }

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center gap-2'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight'>Social posts</h1>
          <p className='text-sm text-muted-foreground'>
            Preview and publish gold video shorts and EGX photo templates to @thrwa.co
          </p>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {!canPublish ? (
          <Alert className='mb-4'>
            <AlertDescription>
              {template === 'gold_daily'
                ? 'Connect Meta and/or YouTube in '
                : 'Connect Meta in '}
              <Link to='/settings/integrations' className='font-medium underline underline-offset-4'>
                Integrations
              </Link>{' '}
              before publishing.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className='mb-4'>
            <AlertDescription>
              Meta: {metaReady ? `connected (${status?.meta?.pageName})` : 'not connected'} · YouTube:{' '}
              {youtubeReady ? `connected (${status?.youtube?.channel?.channelTitle})` : 'not connected'} —{' '}
              <Link to='/settings/integrations' className='font-medium underline underline-offset-4'>
                Manage in Integrations
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Preview & publish</CardTitle>
            <CardDescription>
              Preview shows the static image caption; gold daily publish also generates voice + video at send time
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4'>
            <p className='text-sm text-muted-foreground'>{TEMPLATE_HINTS[template]}</p>
            <div className='flex flex-wrap items-end gap-3'>
              <div className='grid gap-2'>
                <Label>Template</Label>
                <Select value={template} onValueChange={(v) => setTemplate(v as TemplateId)}>
                  <SelectTrigger className='w-[220px]'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type='button' variant='outline' disabled={previewLoading} onClick={() => void runPreview()}>
                Preview
              </Button>
              {canManage ? (
                <>
                  <Button
                    type='button'
                    disabled={publishLoading || !canPublish}
                    onClick={() => void runPublish()}
                  >
                    Publish now
                  </Button>
                  <Button
                    type='button'
                    variant='secondary'
                    disabled={publishLoading || !canPublish}
                    onClick={() => void runPublish({ force: true })}
                  >
                    Force publish
                  </Button>
                  {template === 'gold_daily' && failedTodayCount > 0 ? (
                    <Button
                      type='button'
                      variant='outline'
                      disabled={publishLoading || !canPublish}
                      onClick={() => void runPublish({ retryFailed: true })}
                    >
                      Retry failed ({failedTodayCount})
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>

            {preview?.pngBase64 ? (
              <img
                src={`data:image/png;base64,${preview.pngBase64}`}
                alt='Social preview'
                className='max-w-md rounded-lg border'
              />
            ) : null}
            {preview?.pngError ? (
              <Alert variant='destructive'>
                <AlertDescription>PNG render failed: {preview.pngError}</AlertDescription>
              </Alert>
            ) : null}
            {preview?.caption ? (
              <pre className='whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm' dir='rtl'>
                {preview.caption}
              </pre>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent posts</CardTitle>
            <CardDescription>{history?.total ?? 0} total attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='grid gap-2 text-sm'>
              {(history?.items ?? []).map((row) => (
                <li key={row.id} className='rounded-md border px-3 py-2'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <span className='font-medium'>
                      {row.template} · {formatChannelLabel(row.channel, row.format ?? 'photo')}
                    </span>
                    <span
                      className={
                        row.status === 'published'
                          ? 'text-emerald-600'
                          : row.status === 'skipped'
                            ? 'text-muted-foreground'
                            : 'text-destructive'
                      }
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {new Date(row.createdAt).toLocaleString()} · {row.cairoDateKey} · {row.triggeredBy}
                    {row.externalPostId ? ` · ${row.externalPostId}` : ''}
                  </p>
                  {row.errorMessage ? <p className='text-xs text-destructive'>{row.errorMessage}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
