import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminFetch, type IntegrationItem } from '@/lib/admin-api'
import { isSuperadmin } from '@/lib/admin-roles'
import { useAuthStore } from '@/stores/auth-store'
import { SocialIntegrationsSection } from '@/features/tharwa/social-integrations'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

export function IntegrationsSettings() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const role = useAuthStore((s) => s.auth.user?.role)
  const canManage = isSuperadmin(role)
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [clearing, setClearing] = useState(false)

  const { data, error } = useQuery({
    queryKey: ['admin', 'integrations', token],
    enabled: Boolean(token),
    queryFn: () =>
      adminFetch<{ items: IntegrationItem[] }>('/admin/v1/settings/integrations', token!),
  })

  const items = data?.items ?? []
  const fcm = items.find((i) => i.slug === 'fcm')
  const err = actionErr ?? (error instanceof Error ? error.message : null)

  async function onFile(file: File) {
    if (!token || !canManage) return
    setUploading(true)
    setActionErr(null)
    try {
      const text = await file.text()
      const serviceAccount = JSON.parse(text) as unknown
      await adminFetch('/admin/v1/settings/integrations/fcm', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceAccount }),
      })
      toast.success('FCM service account uploaded')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'push-audiences'] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActionErr(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  async function clearFcm() {
    if (!token || !canManage) return
    setClearing(true)
    try {
      await adminFetch('/admin/v1/settings/integrations/fcm', token, { method: 'DELETE' })
      toast.success('FCM credentials cleared')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'push-audiences'] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActionErr(msg)
      toast.error(msg)
    } finally {
      setClearing(false)
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
          <h1 className='text-2xl font-bold tracking-tight'>Integrations</h1>
          <p className='text-sm text-muted-foreground'>
            {canManage
              ? 'Platform credentials for push notifications and social publishing.'
              : 'View-only — only superadmins can change credentials.'}
          </p>
        </div>

        {!canManage ? (
          <Alert className='mb-4'>
            <AlertDescription>
              Your account is an <strong>operator</strong>. Ask a superadmin to upload the Firebase
              service account, or sign in with a superadmin account.
            </AlertDescription>
          </Alert>
        ) : null}

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Firebase Cloud Messaging</CardTitle>
            <CardDescription>
              {fcm?.configured
                ? `Configured via ${fcm.source ?? 'unknown'}`
                : 'Not configured — upload a Firebase service account JSON file.'}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-3'>
            {fcm?.fcm ? (
              <p className='w-full text-sm text-muted-foreground'>
                Project: {fcm.fcm.projectId} · {fcm.fcm.clientEmail}
              </p>
            ) : null}
            {canManage ? (
              <>
                <input
                  ref={fileRef}
                  type='file'
                  accept='application/json,.json'
                  className='hidden'
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void onFile(f)
                  }}
                />
                <Button
                  variant='secondary'
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? 'Uploading…' : 'Upload service account JSON'}
                </Button>
                <Button
                  variant='destructive'
                  disabled={clearing || !fcm?.configured}
                  onClick={() => void clearFcm()}
                >
                  {clearing ? 'Clearing…' : 'Clear FCM credentials'}
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        <SocialIntegrationsSection token={token} canManage={canManage} onError={setActionErr} />
      </Main>
    </>
  )
}
