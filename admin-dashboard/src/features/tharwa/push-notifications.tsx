import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminFetch, type PushAudienceStats } from '@/lib/admin-api'
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
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

const AUDIENCES = ['all', 'registered', 'ios', 'android'] as const

export function PushNotifications() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const role = useAuthStore((s) => s.auth.user?.role)
  const canConfigureFcm = isSuperadmin(role)
  const queryClient = useQueryClient()
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>('registered')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const { data: stats, error } = useQuery({
    queryKey: ['admin', 'push-audiences', token],
    enabled: Boolean(token),
    queryFn: () => adminFetch<PushAudienceStats>('/admin/v1/push/audiences', token!),
  })

  async function send() {
    if (!token) return
    setSending(true)
    setSendErr(null)
    try {
      const result = await adminFetch<{ result: { successCount: number; failureCount: number } }>(
        '/admin/v1/push/broadcast',
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience, title, body }),
        },
      )
      toast.success(
        `Sent: ${result.result.successCount} ok, ${result.result.failureCount} failed`,
      )
      setTitle('')
      setBody('')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'push-audiences'] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSendErr(msg)
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  const err = sendErr ?? (error instanceof Error ? error.message : null)

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
          <h1 className='text-2xl font-bold tracking-tight'>Push notifications</h1>
          <p className='text-sm text-muted-foreground'>Broadcast via Firebase (FCM).</p>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Audience</CardTitle>
            <CardDescription>
              FCM configured:{' '}
              {stats?.fcmConfigured ? (
                'yes'
              ) : canConfigureFcm ? (
                <>
                  no —{' '}
                  <Link
                    to='/settings/integrations'
                    className='font-medium text-primary underline underline-offset-4'
                  >
                    upload credentials in Integrations
                  </Link>
                </>
              ) : (
                'no — ask a superadmin to upload credentials in Integrations'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='grid gap-1 text-sm'>
              {(stats?.audiences ?? []).map(({ audience, deviceCount }) => (
                <li key={audience}>
                  <span className='font-medium'>{audience}</span>: {deviceCount} devices
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Broadcast</CardTitle>
          </CardHeader>
          <CardContent className='grid max-w-lg gap-4'>
            <div className='grid gap-2'>
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='title'>Title</Label>
              <Input id='title' value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='body'>Body</Label>
              <Textarea id='body' value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
            </div>
            <Button disabled={sending || !title.trim() || !body.trim()} onClick={() => void send()}>
              {sending ? 'Sending…' : 'Send broadcast'}
            </Button>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
