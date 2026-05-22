import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { adminFetch, adminUploadInstrumentFlag, type InstrumentRow } from '@/lib/admin-api'
import { InstrumentsPanel } from '@/features/tharwa/instruments-panel'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function InstrumentsPage() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const [savingInstrumentId, setSavingInstrumentId] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'instruments', token],
    enabled: Boolean(token),
    queryFn: () =>
      adminFetch<{ items: InstrumentRow[] }>('/admin/v1/instruments', token!),
  })

  const items = data?.items ?? []
  const err = actionErr ?? (error instanceof Error ? error.message : null)

  async function patchInstrument(id: string, body: Record<string, unknown>) {
    if (!token) return
    setSavingInstrumentId(id)
    setActionErr(null)
    try {
      await adminFetch(`/admin/v1/instruments/${id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'instruments'] })
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingInstrumentId(null)
    }
  }

  async function uploadInstrumentFlag(id: string, file: File): Promise<string> {
    if (!token) throw new Error('Not signed in')
    setSavingInstrumentId(id)
    setActionErr(null)
    try {
      const { flagUrl } = await adminUploadInstrumentFlag(token, id, file)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'instruments'] })
      return flagUrl
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setSavingInstrumentId(null)
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
          <h1 className='text-2xl font-bold tracking-tight'>Instruments</h1>
          <p className='text-sm text-muted-foreground'>
            Curate equities, FX pairs, and metals shown in the consumer app.
          </p>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <InstrumentsPanel
          token={token}
          items={items}
          isLoading={isLoading}
          savingInstrumentId={savingInstrumentId}
          onPatch={patchInstrument}
          onUploadInstrumentFlag={uploadInstrumentFlag}
          onActionError={setActionErr}
        />
      </Main>
    </>
  )
}
