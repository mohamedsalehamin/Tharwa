import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminFetch,
  type MetaPageOption,
  type SocialPostRunRow,
  type SocialPreviewResult,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

const TEMPLATES = [
  { id: 'gold_daily', label: 'Gold daily' },
  { id: 'gold_alert', label: 'Gold drop alert' },
  { id: 'egx_close', label: 'EGX close summary' },
] as const

type TemplateId = (typeof TEMPLATES)[number]['id']

export function SocialPostsPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const role = useAuthStore((s) => s.auth.user?.role)
  const canManage = isSuperadmin(role)
  const queryClient = useQueryClient()

  const [template, setTemplate] = useState<TemplateId>('gold_daily')
  const [preview, setPreview] = useState<SocialPreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [detectLoading, setDetectLoading] = useState(false)
  const [pages, setPages] = useState<MetaPageOption[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const [pageId, setPageId] = useState('')
  const [pageName, setPageName] = useState('')
  const [pageAccessToken, setPageAccessToken] = useState('')
  const [igUserId, setIgUserId] = useState('')
  const [igUsername, setIgUsername] = useState('')
  const [publishFacebook, setPublishFacebook] = useState(true)
  const [publishInstagram, setPublishInstagram] = useState(true)
  const [goldDailyEnabled, setGoldDailyEnabled] = useState(true)
  const [goldDailyHour, setGoldDailyHour] = useState('10')
  const [goldDailyMinute, setGoldDailyMinute] = useState('0')
  const [egxCloseEnabled, setEgxCloseEnabled] = useState(true)
  const [egxCloseHour, setEgxCloseHour] = useState('15')
  const [egxCloseMinute, setEgxCloseMinute] = useState('15')
  const [goldAlertEnabled, setGoldAlertEnabled] = useState(true)
  const [goldAlertDropPct, setGoldAlertDropPct] = useState('10')

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

  useEffect(() => {
    const meta = status?.meta
    if (!meta) return
    setPageId(meta.pageId)
    setPageName(meta.pageName)
    setSelectedPageId(meta.pageId)
    setIgUserId(meta.igUserId ?? '')
    setIgUsername(meta.igUsername ?? '')
    setPublishFacebook(meta.publishFacebook)
    setPublishInstagram(meta.publishInstagram)
    setGoldDailyEnabled(meta.schedules.goldDaily.enabled)
    setGoldDailyHour(String(meta.schedules.goldDaily.hour))
    setGoldDailyMinute(String(meta.schedules.goldDaily.minute))
    setEgxCloseEnabled(meta.schedules.egxClose.enabled)
    setEgxCloseHour(String(meta.schedules.egxClose.hour))
    setEgxCloseMinute(String(meta.schedules.egxClose.minute))
    setGoldAlertEnabled(meta.schedules.goldAlert.enabled)
    setGoldAlertDropPct(String(meta.schedules.goldAlert.dropPct))
  }, [status?.meta])

  const err = actionErr ?? (statusErr instanceof Error ? statusErr.message : null)

  function buildMetaPayload(overrides?: {
    pageId?: string
    pageName?: string
    pageAccessToken?: string
    igUserId?: string | null
    igUsername?: string | null
  }) {
    return {
      pageId: overrides?.pageId ?? pageId,
      pageName: overrides?.pageName ?? pageName,
      pageAccessToken: overrides?.pageAccessToken ?? pageAccessToken,
      igUserId: (overrides?.igUserId ?? igUserId) || null,
      igUsername: (overrides?.igUsername ?? igUsername) || null,
      publishFacebook,
      publishInstagram,
      schedules: {
        goldDaily: {
          enabled: goldDailyEnabled,
          hour: Number(goldDailyHour),
          minute: Number(goldDailyMinute),
        },
        egxClose: {
          enabled: egxCloseEnabled,
          hour: Number(egxCloseHour),
          minute: Number(egxCloseMinute),
        },
        goldAlert: {
          enabled: goldAlertEnabled,
          dropPct: Number(goldAlertDropPct),
        },
      },
    }
  }

  async function loadOAuthPages() {
    if (!token) return
    setActionErr(null)
    try {
      const res = await adminFetch<{ pages: MetaPageOption[] }>(
        '/admin/v1/social/meta/oauth/pages',
        token,
      )
      setPages(res.pages)
      if (res.pages.length === 0) {
        toast.message('No pages yet — complete Facebook login, then refresh again')
        return
      }
      if (res.pages.length === 1) {
        await connectPage(res.pages[0]!)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActionErr(msg)
      toast.error(msg)
    }
  }

  useEffect(() => {
    if (!token || !canManage) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth') !== 'ok') return
    params.delete('oauth')
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    void loadOAuthPages()
  }, [token, canManage])

  async function startOAuth() {
    if (!token || !canManage) return
    setOauthLoading(true)
    setActionErr(null)
    try {
      const { url } = await adminFetch<{ url: string }>(
        '/admin/v1/social/meta/oauth/start',
        token,
      )
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.message('Complete Facebook login in the popup, then refresh pages below')
      setTimeout(() => void loadOAuthPages(), 4000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActionErr(msg)
      toast.error(msg)
    } finally {
      setOauthLoading(false)
    }
  }

  function applyPage(page: MetaPageOption) {
    setPageId(page.pageId)
    setPageName(page.pageName)
    setPageAccessToken(page.pageAccessToken)
    setSelectedPageId(page.pageId)
    setIgUserId(page.igUserId ?? '')
    setIgUsername(page.igUsername ?? '')
  }

  async function connectPage(page: MetaPageOption) {
    if (!token || !canManage) return
    applyPage(page)
    if (!page.pageAccessToken || page.pageAccessToken.length < 20) {
      setActionErr('Facebook did not return a page token. Paste a Page access token manually, then Save.')
      toast.error('Missing page token from Facebook — paste it manually')
      return
    }
    if (publishInstagram && !page.igUserId) {
      toast.warning('This Page has no linked Instagram account — Facebook only until you link @thrwa.co in Meta Business Suite')
    }
    await saveMetaPayload(buildMetaPayload({
      pageId: page.pageId,
      pageName: page.pageName,
      pageAccessToken: page.pageAccessToken,
      igUserId: page.igUserId,
      igUsername: page.igUsername,
    }))
  }

  async function detectInstagram() {
    if (!token || !canManage) return
    setDetectLoading(true)
    setActionErr(null)
    try {
      const result = await adminFetch<{
        igUserId: string | null
        igUsername: string | null
        error: string | null
        pageId?: string
        updated: boolean
        hint?: string
        meta?: SocialStatusResponse['meta']
      }>('/admin/v1/social/meta/detect-instagram', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (result.igUserId) {
        setIgUserId(result.igUserId)
        setIgUsername(result.igUsername ?? '')
        toast.success(
          result.updated
            ? `Instagram linked: @${result.igUsername ?? result.igUserId}`
            : `Found @${result.igUsername ?? result.igUserId} — click Save to store`,
        )
        await queryClient.invalidateQueries({ queryKey: ['admin', 'social-status'] })
      } else {
        const pageHint =
          'pageId' in result && typeof result.pageId === 'string' ? ` (Page ${result.pageId})` : ''
        const msg = `${result.hint ?? result.error ?? 'Could not detect Instagram account'}${pageHint}`
        setActionErr(msg)
        toast.error(msg)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActionErr(msg)
      toast.error(msg)
    } finally {
      setDetectLoading(false)
    }
  }

  async function saveMetaPayload(payload: ReturnType<typeof buildMetaPayload>) {
    if (!token || !canManage) return
    if (!payload.pageId.trim() || !payload.pageName.trim()) {
      const msg = 'Select a Facebook Page from OAuth first, or fill Page ID and name.'
      setActionErr(msg)
      toast.error(msg)
      return
    }
    setSaveLoading(true)
    setActionErr(null)
    try {
      await adminFetch('/admin/v1/social/meta', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      toast.success('Meta connection saved')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'social-status'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActionErr(msg)
      toast.error(msg)
    } finally {
      setSaveLoading(false)
    }
  }

  async function saveMeta() {
    await saveMetaPayload(buildMetaPayload())
  }

  async function disconnectMeta() {
    if (!token || !canManage) return
    setSaveLoading(true)
    try {
      await adminFetch('/admin/v1/social/meta', token, { method: 'DELETE' })
      toast.success('Meta connection removed')
      setPageAccessToken('')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'social-status'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaveLoading(false)
    }
  }

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

  async function runPublish(force = false) {
    if (!token || !canManage) return
    setPublishLoading(true)
    try {
      const result = await adminFetch<{ published: boolean; results?: unknown }>(
        '/admin/v1/social/publish',
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template, force }),
        },
      )
      if (result.published) toast.success('Post published')
      else toast.message('Skipped — already posted today or data unavailable')
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
            Connect Facebook / Instagram and publish gold + EGX templates to @thrwa.co
          </p>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Meta connection</CardTitle>
            <CardDescription>
              {status?.configured
                ? `Connected to ${status.meta?.pageName ?? 'Page'}`
                : 'Not connected — OAuth or paste a Page access token'}
              {status?.oauthAvailable ? ' · OAuth available' : ' · OAuth env not set (manual token only)'}
              {status?.oauthScopes ? (
                <>
                  {' '}
                  · Scopes: <span className='font-mono text-xs'>{status.oauthScopes}</span>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4'>
            {canManage ? (
              <div className='flex flex-wrap gap-2'>
                <Button type='button' variant='outline' disabled={oauthLoading || !status?.oauthAvailable} onClick={() => void startOAuth()}>
                  Connect with Facebook
                </Button>
                <Button type='button' variant='outline' onClick={() => void loadOAuthPages()}>
                  Refresh pages
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  disabled={detectLoading || !status?.configured}
                  onClick={() => void detectInstagram()}
                >
                  Detect Instagram
                </Button>
              </div>
            ) : null}

            {pages.length > 0 ? (
              <div className='grid gap-2'>
                <Label>Pages from OAuth — click to connect</Label>
                <div className='flex flex-wrap gap-2'>
                  {pages.map((p) => (
                    <Button
                      key={p.pageId}
                      type='button'
                      size='sm'
                      variant={selectedPageId === p.pageId ? 'default' : 'secondary'}
                      disabled={saveLoading}
                      onClick={() => void connectPage(p)}
                    >
                      {p.pageName}
                      {p.igUsername ? ` · @${p.igUsername}` : ' · no Instagram linked'}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {publishInstagram && !igUserId ? (
              <Alert>
                <AlertDescription>
                  Meta still cannot read @thrwa.co for Page ID <span className='font-mono text-xs'>{pageId || '—'}</span>.
                  Verify this matches the Thrwa Page in Business Suite. Try: Disconnect → Connect with Facebook
                  (approve all permissions) → pick the Page showing <strong>@thrwa.co</strong> → Detect Instagram.
                  If detection keeps failing, paste the Instagram business account ID manually (from Meta Graph API
                  Explorer: <span className='font-mono text-xs'>{'{page-id}/instagram_accounts'}</span>) and Save with
                  Publish to Instagram on.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className='grid gap-3 md:grid-cols-2'>
              <div className='grid gap-2'>
                <Label htmlFor='pageName'>Page name</Label>
                <Input id='pageName' value={pageName} onChange={(e) => setPageName(e.target.value)} disabled={!canManage} />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='pageId'>Page ID</Label>
                <Input id='pageId' value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={!canManage} />
              </div>
              <div className='grid gap-2 md:col-span-2'>
                <Label htmlFor='pageAccessToken'>Page access token</Label>
                <Input
                  id='pageAccessToken'
                  type='password'
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  placeholder={status?.meta?.tokenPreview ? `Saved ${status.meta.tokenPreview} — paste to replace` : 'EAA… paste Page access token'}
                  disabled={!canManage}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='igUserId'>Instagram business account ID</Label>
                <Input id='igUserId' value={igUserId} onChange={(e) => setIgUserId(e.target.value)} disabled={!canManage} placeholder='1784… from Graph API if Detect fails' />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='igUsername'>Instagram username</Label>
                <Input id='igUsername' value={igUsername} onChange={(e) => setIgUsername(e.target.value)} disabled={!canManage} />
              </div>
            </div>

            <div className='flex flex-wrap gap-6'>
              <label className='flex items-center gap-2 text-sm'>
                <Switch checked={publishFacebook} onCheckedChange={setPublishFacebook} disabled={!canManage} />
                Publish to Facebook
              </label>
              <label className='flex items-center gap-2 text-sm'>
                <Switch checked={publishInstagram} onCheckedChange={setPublishInstagram} disabled={!canManage} />
                Publish to Instagram
              </label>
            </div>

            <div className='grid gap-3 rounded-lg border p-4 md:grid-cols-3'>
              <div>
                <p className='mb-2 text-sm font-medium'>Gold daily</p>
                <label className='mb-2 flex items-center gap-2 text-sm'>
                  <Switch checked={goldDailyEnabled} onCheckedChange={setGoldDailyEnabled} disabled={!canManage} />
                  Enabled
                </label>
                <div className='flex gap-2'>
                  <Input value={goldDailyHour} onChange={(e) => setGoldDailyHour(e.target.value)} disabled={!canManage} />
                  <Input value={goldDailyMinute} onChange={(e) => setGoldDailyMinute(e.target.value)} disabled={!canManage} />
                </div>
              </div>
              <div>
                <p className='mb-2 text-sm font-medium'>EGX close</p>
                <label className='mb-2 flex items-center gap-2 text-sm'>
                  <Switch checked={egxCloseEnabled} onCheckedChange={setEgxCloseEnabled} disabled={!canManage} />
                  Enabled
                </label>
                <div className='flex gap-2'>
                  <Input value={egxCloseHour} onChange={(e) => setEgxCloseHour(e.target.value)} disabled={!canManage} />
                  <Input value={egxCloseMinute} onChange={(e) => setEgxCloseMinute(e.target.value)} disabled={!canManage} />
                </div>
              </div>
              <div>
                <p className='mb-2 text-sm font-medium'>Gold alert</p>
                <label className='mb-2 flex items-center gap-2 text-sm'>
                  <Switch checked={goldAlertEnabled} onCheckedChange={setGoldAlertEnabled} disabled={!canManage} />
                  Enabled
                </label>
                <Input value={goldAlertDropPct} onChange={(e) => setGoldAlertDropPct(e.target.value)} disabled={!canManage} />
                <p className='mt-1 text-xs text-muted-foreground'>Drop % from Cairo-day open</p>
              </div>
            </div>

            {canManage ? (
              <div className='flex flex-wrap gap-2'>
                <Button type='button' disabled={saveLoading} onClick={() => void saveMeta()}>
                  Save connection
                </Button>
                <Button type='button' variant='destructive' disabled={saveLoading} onClick={() => void disconnectMeta()}>
                  Disconnect
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Preview & publish</CardTitle>
            <CardDescription>Generate image + caption from live market data</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4'>
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
                  <Button type='button' disabled={publishLoading || !status?.configured} onClick={() => void runPublish(false)}>
                    Publish now
                  </Button>
                  <Button type='button' variant='secondary' disabled={publishLoading || !status?.configured} onClick={() => void runPublish(true)}>
                    Force publish
                  </Button>
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
                      {row.template} · {row.channel}
                    </span>
                    <span className={row.status === 'published' ? 'text-emerald-600' : 'text-destructive'}>
                      {row.status}
                    </span>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {new Date(row.createdAt).toLocaleString()} · {row.triggeredBy}
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
