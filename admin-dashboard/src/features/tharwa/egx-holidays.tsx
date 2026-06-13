import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { adminFetch } from '@/lib/admin-api'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { toast } from 'sonner'

export type EgxHolidaySource = 'calendarlabs' | 'admin'

export type AdminEgxHoliday = {
  id: string
  holidayDate: string
  nameEn: string
  nameAr: string | null
  source: EgxHolidaySource
  createdAt: string
  updatedAt: string
}

type EgxHolidaySyncRun = {
  id: string
  success: boolean
  years: number[]
  holidaysUpserted: number
  errorMessage: string | null
  finishedAt: string
}

type EgxHolidaysResponse = {
  items: AdminEgxHoliday[]
  lastSync: EgxHolidaySyncRun | null
  defaultSyncYears: number[]
}

type SyncResponse = EgxHolidaysResponse & {
  result: {
    success: boolean
    years: number[]
    holidaysUpserted: number
  }
}

type EmergencyForm = {
  holidayDate: string
  nameEn: string
  nameAr: string
}

const EMPTY_FORM: EmergencyForm = {
  holidayDate: '',
  nameEn: '',
  nameAr: '',
}

function sourceLabel(source: EgxHolidaySource): string {
  return source === 'admin' ? 'Emergency' : 'CalendarLabs'
}

export function EgxHolidaysPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [yearFilter, setYearFilter] = useState(String(currentYear))
  const [form, setForm] = useState<EmergencyForm>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<AdminEgxHoliday | null>(null)

  const year = Number(yearFilter) || undefined

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'egx-holidays', year],
    queryFn: () =>
      adminFetch<EgxHolidaysResponse>(
        `/admin/v1/egx-holidays${year ? `?year=${year}` : ''}`,
        token!,
      ),
    enabled: Boolean(token),
  })

  const syncYears = data?.defaultSyncYears ?? [currentYear, currentYear + 1]

  const createMutation = useMutation({
    mutationFn: (body: EmergencyForm) =>
      adminFetch<{ item: AdminEgxHoliday }>('/admin/v1/egx-holidays', token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holidayDate: body.holidayDate,
          nameEn: body.nameEn,
          nameAr: body.nameAr.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast.success('Emergency holiday added')
      setForm(EMPTY_FORM)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'egx-holidays'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch<void>(`/admin/v1/egx-holidays/${id}`, token!, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Holiday removed')
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'egx-holidays'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const syncMutation = useMutation({
    mutationFn: () =>
      adminFetch<SyncResponse>('/admin/v1/egx-holidays/sync', token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ years: syncYears }),
      }),
    onSuccess: (res) => {
      toast.success(`Synced ${res.result.holidaysUpserted} holidays from CalendarLabs`)
      void queryClient.setQueryData(['admin', 'egx-holidays', year], {
        items: res.items,
        lastSync: res.lastSync,
        defaultSyncYears: res.defaultSyncYears ?? syncYears,
      })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'egx-holidays'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const adminCount = useMemo(() => items.filter((i) => i.source === 'admin').length, [items])

  return (
    <>
      <Header>
        <div className='flex flex-1 items-center justify-between gap-4'>
          <div>
            <h1 className='text-lg font-semibold'>EGX holidays</h1>
            <p className='text-sm text-muted-foreground'>
              Market closure dates for daily brief push notifications
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </div>
      </Header>

      <Main>
        {error ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <div className='mb-6 grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <RefreshCw className='size-4' />
                Sync official holidays
              </CardTitle>
              <CardDescription>
                Pull EGX full-day closures from CalendarLabs for {syncYears.join(' and ')}.
                Admin emergency dates are kept.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {data?.lastSync ? (
                <p className='text-sm text-muted-foreground'>
                  Last sync:{' '}
                  {new Date(data.lastSync.finishedAt).toLocaleString()} —{' '}
                  {data.lastSync.success ? (
                    <span className='text-foreground'>
                      {data.lastSync.holidaysUpserted} rows ({data.lastSync.years.join(', ')})
                    </span>
                  ) : (
                    <span className='text-destructive'>{data.lastSync.errorMessage}</span>
                  )}
                </p>
              ) : (
                <p className='text-sm text-muted-foreground'>No sync run recorded yet.</p>
              )}
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || !token}
              >
                {syncMutation.isPending ? 'Syncing…' : 'Sync from CalendarLabs'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Plus className='size-4' />
                Emergency closure
              </CardTitle>
              <CardDescription>
                Ad-hoc EGX closure (e.g. exceptional holiday). Not overwritten by sync.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label htmlFor='holidayDate'>Date</Label>
                  <Input
                    id='holidayDate'
                    type='date'
                    value={form.holidayDate}
                    onChange={(e) => setForm((f) => ({ ...f, holidayDate: e.target.value }))}
                  />
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='nameEn'>Name (English)</Label>
                  <Input
                    id='nameEn'
                    value={form.nameEn}
                    onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                    placeholder='Exceptional market closure'
                  />
                </div>
                <div className='space-y-1 sm:col-span-2'>
                  <Label htmlFor='nameAr'>Name (Arabic, optional)</Label>
                  <Input
                    id='nameAr'
                    value={form.nameAr}
                    onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                    placeholder='إغلاق استثنائي للبورصة'
                    dir='rtl'
                  />
                </div>
              </div>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={
                  createMutation.isPending ||
                  !form.holidayDate ||
                  !form.nameEn.trim() ||
                  !token
                }
              >
                Add emergency holiday
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 space-y-0'>
            <div>
              <CardTitle className='flex items-center gap-2 text-base'>
                <CalendarDays className='size-4' />
                Holiday calendar
              </CardTitle>
              <CardDescription>
                {items.length} dates shown
                {adminCount > 0 ? ` · ${adminCount} emergency` : ''}
              </CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Label htmlFor='yearFilter' className='sr-only'>
                Year
              </Label>
              <Input
                id='yearFilter'
                type='number'
                className='w-28'
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                min={2000}
                max={2100}
              />
              <Button variant='outline' size='sm' onClick={() => void refetch()} disabled={isFetching}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className='text-sm text-muted-foreground'>Loading…</p>
            ) : items.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No holidays for this year.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className='w-16' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className='font-mono text-sm'>{row.holidayDate}</TableCell>
                      <TableCell>
                        <div>{row.nameEn}</div>
                        {row.nameAr ? (
                          <div className='text-sm text-muted-foreground' dir='rtl'>
                            {row.nameAr}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.source === 'admin' ? 'destructive' : 'secondary'}>
                          {sourceLabel(row.source)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label='Delete holiday'
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className='size-4' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Main>

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title='Remove holiday?'
        desc={
          deleteTarget
            ? `Remove ${deleteTarget.holidayDate} (${deleteTarget.nameEn})? Daily briefs may send on this date after removal.`
            : ''
        }
        confirmText='Remove'
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </>
  )
}
