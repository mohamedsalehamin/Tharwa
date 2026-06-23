import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  adminFetch,
  type MetaPageOption,
  type SocialStatusResponse,
} from '@/lib/admin-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type SocialIntegrationsSectionProps = {
  token: string | null
  canManage: boolean
  onError?: (message: string | null) => void
}

export function SocialIntegrationsSection({
  token,
  canManage,
  onError,
}: SocialIntegrationsSectionProps) {
  const queryClient = useQueryClient()

  const [saveLoading, setSaveLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [youtubeOauthLoading, setYoutubeOauthLoading] = useState(false)
  const [youtubeSaveLoading, setYoutubeSaveLoading] = useState(false)
  const [tiktokOauthLoading, setTiktokOauthLoading] = useState(false)
  const [tiktokSaveLoading, setTiktokSaveLoading] = useState(false)
  const [detectLoading, setDetectLoading] = useState(false)
  const [pages, setPages] = useState<MetaPageOption[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)

  const [pageId, setPageId] = useState('')
  const [pageName, setPageName] = useState('')
  const [pageAccessToken, setPageAccessToken] = useState('')
  const [igUserId, setIgUserId] = useState('')
  const [igUsername, setIgUsername] = useState('')
  const [publishFacebook, setPublishFacebook] = useState(true)
  const [publishInstagram, setPublishInstagram] = useState(true)
  const [publishYoutube, setPublishYoutube] = useState(true)
  const [publishTiktok, setPublishTiktok] = useState(true)
  const [goldDailyEnabled, setGoldDailyEnabled] = useState(true)
  const [goldDailyHour, setGoldDailyHour] = useState('10')
  const [goldDailyMinute, setGoldDailyMinute] = useState('0')
  const [egxCloseEnabled, setEgxCloseEnabled] = useState(true)
  const [egxCloseHour, setEgxCloseHour] = useState('15')
  const [egxCloseMinute, setEgxCloseMinute] = useState('15')
  const [goldAlertEnabled, setGoldAlertEnabled] = useState(true)
  const [goldAlertDropPct, setGoldAlertDropPct] = useState('10')

  const { data: status } = useQuery({
    queryKey: ['admin', 'social-status', token],
    enabled: Boolean(token),
    queryFn: () =>
      adminFetch<SocialStatusResponse>('/admin/v1/social/status', token!),
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

  useEffect(() => {
    const youtube = status?.youtube?.channel
    if (youtube) setPublishYoutube(youtube.publishEnabled)
  }, [status?.youtube?.channel])

  useEffect(() => {
    const tiktok = status?.tiktok?.account
    if (tiktok) setPublishTiktok(tiktok.publishEnabled)
  }, [status?.tiktok?.account])

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
    onError?.(null)
    try {
      const res = await adminFetch<{ pages: MetaPageOption[] }>(
        '/admin/v1/social/meta/oauth/pages',
        token
      )
      setPages(res.pages)
      if (res.pages.length === 0) {
        toast.message(
          'No pages yet — complete Facebook login, then refresh again'
        )
        return
      }
      if (res.pages.length === 1) {
        await connectPage(res.pages[0]!)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
      toast.error(msg)
    }
  }

  useEffect(() => {
    if (!token || !canManage) return
    const params = new URLSearchParams(window.location.search)
    const oauth = params.get('oauth')
    const youtube = params.get('youtube')
    const tiktok = params.get('tiktok')
    if (oauth !== 'ok' && youtube !== 'ok' && tiktok !== 'ok') return
    if (oauth === 'ok') params.delete('oauth')
    if (youtube === 'ok') params.delete('youtube')
    if (tiktok === 'ok') params.delete('tiktok')
    const qs = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`
    )
    if (oauth === 'ok') void loadOAuthPages()
    if (youtube === 'ok') {
      toast.success('YouTube channel connected')
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
    }
    if (tiktok === 'ok') {
      toast.success('TikTok account connected')
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
    }
  }, [token, canManage])

  async function startOAuth() {
    if (!token || !canManage) return
    setOauthLoading(true)
    onError?.(null)
    try {
      const { url } = await adminFetch<{ url: string }>(
        '/admin/v1/social/meta/oauth/start',
        token
      )
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.message(
        'Complete Facebook login in the popup, then refresh pages below'
      )
      setTimeout(() => void loadOAuthPages(), 4000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
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
      onError?.(
        'Facebook did not return a page token. Paste a Page access token manually, then Save.'
      )
      toast.error('Missing page token from Facebook — paste it manually')
      return
    }
    if (publishInstagram && !page.igUserId) {
      toast.warning(
        'This Page has no linked Instagram account — Facebook only until you link @thrwa.co in Meta Business Suite'
      )
    }
    await saveMetaPayload(
      buildMetaPayload({
        pageId: page.pageId,
        pageName: page.pageName,
        pageAccessToken: page.pageAccessToken,
        igUserId: page.igUserId,
        igUsername: page.igUsername,
      })
    )
  }

  async function detectInstagram() {
    if (!token || !canManage) return
    setDetectLoading(true)
    onError?.(null)
    try {
      const result = await adminFetch<{
        igUserId: string | null
        igUsername: string | null
        error: string | null
        pageId?: string
        updated: boolean
        hint?: string
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
            : `Found @${result.igUsername ?? result.igUserId} — click Save to store`
        )
        await queryClient.invalidateQueries({
          queryKey: ['admin', 'social-status'],
        })
      } else {
        const pageHint =
          'pageId' in result && typeof result.pageId === 'string'
            ? ` (Page ${result.pageId})`
            : ''
        const msg = `${result.hint ?? result.error ?? 'Could not detect Instagram account'}${pageHint}`
        onError?.(msg)
        toast.error(msg)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
      toast.error(msg)
    } finally {
      setDetectLoading(false)
    }
  }

  async function saveMetaPayload(payload: ReturnType<typeof buildMetaPayload>) {
    if (!token || !canManage) return
    if (!payload.pageId.trim() || !payload.pageName.trim()) {
      const msg =
        'Select a Facebook Page from OAuth first, or fill Page ID and name.'
      onError?.(msg)
      toast.error(msg)
      return
    }
    setSaveLoading(true)
    onError?.(null)
    try {
      await adminFetch('/admin/v1/social/meta', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      toast.success('Meta connection saved')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'integrations'],
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
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
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaveLoading(false)
    }
  }

  async function startYoutubeOAuth() {
    if (!token || !canManage) return
    setYoutubeOauthLoading(true)
    onError?.(null)
    try {
      const { url } = await adminFetch<{ url: string }>(
        '/admin/v1/social/youtube/oauth/start',
        token
      )
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.message('Complete Google login in the popup, then return here')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
      toast.error(msg)
    } finally {
      setYoutubeOauthLoading(false)
    }
  }

  async function saveYoutubeSettings() {
    if (!token || !canManage || !status?.youtube?.configured) return
    setYoutubeSaveLoading(true)
    onError?.(null)
    try {
      await adminFetch('/admin/v1/social/youtube', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishEnabled: publishYoutube }),
      })
      toast.success('YouTube settings saved')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
      toast.error(msg)
    } finally {
      setYoutubeSaveLoading(false)
    }
  }

  async function disconnectYoutube() {
    if (!token || !canManage) return
    setYoutubeSaveLoading(true)
    try {
      await adminFetch('/admin/v1/social/youtube', token, { method: 'DELETE' })
      toast.success('YouTube connection removed')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setYoutubeSaveLoading(false)
    }
  }

  async function startTiktokOAuth() {
    if (!token || !canManage) return
    setTiktokOauthLoading(true)
    onError?.(null)
    try {
      const { url } = await adminFetch<{ url: string }>(
        '/admin/v1/social/tiktok/oauth/start',
        token
      )
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.message('Complete TikTok login in the popup, then return here')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
      toast.error(msg)
    } finally {
      setTiktokOauthLoading(false)
    }
  }

  async function saveTiktokSettings() {
    if (!token || !canManage || !status?.tiktok?.configured) return
    setTiktokSaveLoading(true)
    onError?.(null)
    try {
      await adminFetch('/admin/v1/social/tiktok', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishEnabled: publishTiktok }),
      })
      toast.success('TikTok settings saved')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError?.(msg)
      toast.error(msg)
    } finally {
      setTiktokSaveLoading(false)
    }
  }

  async function disconnectTiktok() {
    if (!token || !canManage) return
    setTiktokSaveLoading(true)
    try {
      await adminFetch('/admin/v1/social/tiktok', token, { method: 'DELETE' })
      toast.success('TikTok connection removed')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'social-status'],
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setTiktokSaveLoading(false)
    }
  }

  return (
    <>
      <Card className='mb-6'>
        <CardHeader>
          <CardTitle>Meta connection</CardTitle>
          <CardDescription>
            {status?.configured
              ? `Connected to ${status.meta?.pageName ?? 'Page'}`
              : 'Not connected — OAuth or paste a Page access token'}
            {status?.oauthAvailable
              ? ' · OAuth available'
              : ' · OAuth env not set (manual token only)'}
            {status?.oauthScopes ? (
              <>
                {' '}
                · Scopes:{' '}
                <span className='font-mono text-xs'>{status.oauthScopes}</span>
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {canManage ? (
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={oauthLoading || !status?.oauthAvailable}
                onClick={() => void startOAuth()}
              >
                Connect with Facebook
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => void loadOAuthPages()}
              >
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
                    variant={
                      selectedPageId === p.pageId ? 'default' : 'secondary'
                    }
                    disabled={saveLoading}
                    onClick={() => void connectPage(p)}
                  >
                    {p.pageName}
                    {p.igUsername
                      ? ` · @${p.igUsername}`
                      : ' · no Instagram linked'}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {publishInstagram && !igUserId ? (
            <Alert>
              <AlertDescription>
                Meta still cannot read @thrwa.co for Page ID{' '}
                <span className='font-mono text-xs'>{pageId || '—'}</span>.
                Verify this matches the Thrwa Page in Business Suite. Try:
                Disconnect → Connect with Facebook (approve all permissions) →
                pick the Page showing <strong>@thrwa.co</strong> → Detect
                Instagram. If detection keeps failing, paste the Instagram
                business account ID manually (from Meta Graph API Explorer:{' '}
                <span className='font-mono text-xs'>
                  {'{page-id}/instagram_accounts'}
                </span>
                ) and Save with Publish to Instagram on.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className='grid gap-3 md:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='pageName'>Page name</Label>
              <Input
                id='pageName'
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='pageId'>Page ID</Label>
              <Input
                id='pageId'
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div className='grid gap-2 md:col-span-2'>
              <Label htmlFor='pageAccessToken'>Page access token</Label>
              <Input
                id='pageAccessToken'
                type='password'
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                placeholder={
                  status?.meta?.tokenPreview
                    ? `Saved ${status.meta.tokenPreview} — paste to replace`
                    : 'EAA… paste Page access token'
                }
                disabled={!canManage}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='igUserId'>Instagram business account ID</Label>
              <Input
                id='igUserId'
                value={igUserId}
                onChange={(e) => setIgUserId(e.target.value)}
                disabled={!canManage}
                placeholder='1784… from Graph API if Detect fails'
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='igUsername'>Instagram username</Label>
              <Input
                id='igUsername'
                value={igUsername}
                onChange={(e) => setIgUsername(e.target.value)}
                disabled={!canManage}
              />
            </div>
          </div>

          <div className='flex flex-wrap gap-6'>
            <label className='flex items-center gap-2 text-sm'>
              <Switch
                checked={publishFacebook}
                onCheckedChange={setPublishFacebook}
                disabled={!canManage}
              />
              Publish to Facebook
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <Switch
                checked={publishInstagram}
                onCheckedChange={setPublishInstagram}
                disabled={!canManage}
              />
              Publish to Instagram
            </label>
          </div>

          <div className='grid gap-3 rounded-lg border p-4 md:grid-cols-3'>
            <div>
              <p className='mb-2 text-sm font-medium'>Gold daily</p>
              <label className='mb-2 flex items-center gap-2 text-sm'>
                <Switch
                  checked={goldDailyEnabled}
                  onCheckedChange={setGoldDailyEnabled}
                  disabled={!canManage}
                />
                Enabled
              </label>
              <div className='flex gap-2'>
                <Input
                  value={goldDailyHour}
                  onChange={(e) => setGoldDailyHour(e.target.value)}
                  disabled={!canManage}
                />
                <Input
                  value={goldDailyMinute}
                  onChange={(e) => setGoldDailyMinute(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div>
              <p className='mb-2 text-sm font-medium'>EGX close</p>
              <label className='mb-2 flex items-center gap-2 text-sm'>
                <Switch
                  checked={egxCloseEnabled}
                  onCheckedChange={setEgxCloseEnabled}
                  disabled={!canManage}
                />
                Enabled
              </label>
              <div className='flex gap-2'>
                <Input
                  value={egxCloseHour}
                  onChange={(e) => setEgxCloseHour(e.target.value)}
                  disabled={!canManage}
                />
                <Input
                  value={egxCloseMinute}
                  onChange={(e) => setEgxCloseMinute(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div>
              <p className='mb-2 text-sm font-medium'>Gold alert</p>
              <label className='mb-2 flex items-center gap-2 text-sm'>
                <Switch
                  checked={goldAlertEnabled}
                  onCheckedChange={setGoldAlertEnabled}
                  disabled={!canManage}
                />
                Enabled
              </label>
              <Input
                value={goldAlertDropPct}
                onChange={(e) => setGoldAlertDropPct(e.target.value)}
                disabled={!canManage}
              />
              <p className='mt-1 text-xs text-muted-foreground'>
                Drop % from Cairo-day open
              </p>
            </div>
          </div>

          {canManage ? (
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                disabled={saveLoading}
                onClick={() => void saveMeta()}
              >
                Save connection
              </Button>
              <Button
                type='button'
                variant='destructive'
                disabled={saveLoading}
                onClick={() => void disconnectMeta()}
              >
                Disconnect
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className='mb-6'>
        <CardHeader>
          <CardTitle>YouTube connection</CardTitle>
          <CardDescription>
            {status?.youtube?.configured
              ? `Connected to ${status.youtube.channel?.channelTitle ?? 'channel'} — daily Shorts use OAuth refresh token`
              : 'Not connected — link the Google account that owns the Thrwa channel'}
            {status?.youtube?.oauthAvailable
              ? ' · OAuth available'
              : ' · YouTube OAuth env not set'}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {canManage ? (
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={
                  youtubeOauthLoading || !status?.youtube?.oauthAvailable
                }
                onClick={() => void startYoutubeOAuth()}
              >
                Connect with Google
              </Button>
              {status?.youtube?.configured ? (
                <>
                  <label className='flex items-center gap-2 text-sm'>
                    <Switch
                      checked={publishYoutube}
                      onCheckedChange={setPublishYoutube}
                      disabled={youtubeSaveLoading}
                    />
                    Publish YouTube Shorts
                  </label>
                  <Button
                    type='button'
                    disabled={youtubeSaveLoading}
                    onClick={() => void saveYoutubeSettings()}
                  >
                    Save YouTube settings
                  </Button>
                  <Button
                    type='button'
                    variant='destructive'
                    disabled={youtubeSaveLoading}
                    onClick={() => void disconnectYoutube()}
                  >
                    Disconnect YouTube
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {status?.youtube?.channel ? (
            <p className='text-xs text-muted-foreground'>
              Channel ID:{' '}
              <span className='font-mono'>
                {status.youtube.channel.channelId}
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className='mb-6'>
        <CardHeader>
          <CardTitle>TikTok connection</CardTitle>
          <CardDescription>
            {status?.tiktok?.configured
              ? `Connected to @${status.tiktok.account?.username ?? 'account'} — daily videos use OAuth refresh token`
              : 'Not connected — link the TikTok account for @thrwa.co'}
            {status?.tiktok?.oauthAvailable
              ? ' · OAuth available'
              : ' · TikTok OAuth env not set'}
            {status?.tiktok?.oauthScopes ? (
              <>
                {' '}
                · Scopes:{' '}
                <span className='font-mono text-xs'>
                  {status.tiktok.oauthScopes}
                </span>
              </>
            ) : null}
            {status?.tiktok?.postMode ? (
              <>
                {' '}
                · Mode:{' '}
                <span className='font-mono text-xs'>
                  {status.tiktok.postMode}
                </span>
              </>
            ) : null}
            {status?.tiktok?.redirectUri ? (
              <>
                {' '}
                · Redirect:{' '}
                <span className='font-mono text-xs'>
                  {status.tiktok.redirectUri}
                </span>
              </>
            ) : null}
            {status?.tiktok?.pullUrlOrigin ? (
              <>
                {' '}
                · Pull URL:{' '}
                <span className='font-mono text-xs'>
                  {status.tiktok.pullUrlOrigin}
                </span>
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {canManage ? (
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={tiktokOauthLoading || !status?.tiktok?.oauthAvailable}
                onClick={() => void startTiktokOAuth()}
              >
                Connect with TikTok
              </Button>
              {status?.tiktok?.configured ? (
                <>
                  <label className='flex items-center gap-2 text-sm'>
                    <Switch
                      checked={publishTiktok}
                      onCheckedChange={setPublishTiktok}
                      disabled={tiktokSaveLoading}
                    />
                    Publish TikTok videos
                  </label>
                  <Button
                    type='button'
                    disabled={tiktokSaveLoading}
                    onClick={() => void saveTiktokSettings()}
                  >
                    Save TikTok settings
                  </Button>
                  <Button
                    type='button'
                    variant='destructive'
                    disabled={tiktokSaveLoading}
                    onClick={() => void disconnectTiktok()}
                  >
                    Disconnect TikTok
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {status?.tiktok?.account ? (
            <p className='text-xs text-muted-foreground'>
              Open ID:{' '}
              <span className='font-mono'>{status.tiktok.account.openId}</span>
              {status.tiktok.account.grantedScopes ? (
                <>
                  {' '}
                  · Granted:{' '}
                  <span className='font-mono'>{status.tiktok.account.grantedScopes}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {status?.tiktok?.configured && status.tiktok.account?.scopeReady === false ? (
            <Alert variant='destructive'>
              <AlertDescription>
                Missing TikTok scope(s) for{' '}
                <span className='font-mono text-xs'>{status.tiktok.postMode ?? 'current'}</span>{' '}
                mode:{' '}
                <span className='font-mono text-xs'>
                  {(status.tiktok.account?.missingScopes ?? []).join(', ')}
                </span>
                . In TikTok Developer Portal add{' '}
                <span className='font-mono text-xs'>video.publish</span> under Scopes,
                enable Direct Post, verify your video URL domain (e.g.{' '}
                <span className='font-mono text-xs'>api.thrwa.co</span>) under Manage URL
                properties, set API env{' '}
                <span className='font-mono text-xs'>TIKTOK_POST_MODE=direct</span> and{' '}
                <span className='font-mono text-xs'>TIKTOK_DIRECT_PRIVACY=SELF_ONLY</span> for
                Sandbox, then disconnect and reconnect here.
              </AlertDescription>
            </Alert>
          ) : null}
          {status?.tiktok?.oauthAvailable && !status?.tiktok?.configured ? (
            <Alert>
              <AlertDescription>
                Sandbox: use Sandbox credentials in API env, add your TikTok
                account under Sandbox → Target Users, then connect here. With{' '}
                <span className='font-mono text-xs'>draft</span> mode, videos go
                to TikTok inbox for manual publish. For auto-post like YouTube,
                enable Direct Post in Developer Portal, add{' '}
                <span className='font-mono text-xs'>video.publish</span> scope,
                enable Direct Post, verify{' '}
                <span className='font-mono text-xs'>api.thrwa.co</span> under Manage URL properties,
                set{' '}
                <span className='font-mono text-xs'>TIKTOK_POST_MODE=direct</span> and{' '}
                <span className='font-mono text-xs'>TIKTOK_DIRECT_PRIVACY=SELF_ONLY</span> on the
                API.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}
