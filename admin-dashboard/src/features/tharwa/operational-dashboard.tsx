import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { adminFetch, type UpstreamsListResponse } from '@/lib/admin-api'
import { UpstreamsPanel } from '@/features/tharwa/upstreams-panel'
import { isSuperadmin } from '@/lib/admin-roles'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function OperationalDashboard() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const role = useAuthStore((s) => s.auth.user?.role)
  const superadmin = isSuperadmin(role)
  const queryClient = useQueryClient()

  const [savingUpstreamId, setSavingUpstreamId] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'dashboard', token],
    enabled: Boolean(token),
    queryFn: () => adminFetch<UpstreamsListResponse>('/admin/v1/upstreams', token!),
  })

  const upstreams = data?.items ?? []
  const upstreamSummary = data?.summary
  const upstreamThresholds = data?.thresholds
  const err = actionErr ?? (error instanceof Error ? error.message : null)

  async function patchUpstream(id: string, body: Record<string, unknown>) {
    if (!token) return
    setSavingUpstreamId(id)
    setActionErr(null)
    try {
      await adminFetch(`/admin/v1/upstreams/${id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingUpstreamId(null)
    }
  }

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void refetch()}
            disabled={isLoading || isFetching}
          >
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
          <p className='text-sm text-muted-foreground'>
            Monitor upstream connector health and refresh market caches.
          </p>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <UpstreamsPanel
          token={token}
          superadmin={superadmin}
          upstreams={upstreams}
          summary={upstreamSummary}
          thresholds={upstreamThresholds}
          isLoading={isLoading}
          savingUpstreamId={savingUpstreamId}
          onActionError={setActionErr}
          onPatchEnabled={async (id, enabled) => patchUpstream(id, { enabled })}
        />
      </Main>
    </>
  )
}
