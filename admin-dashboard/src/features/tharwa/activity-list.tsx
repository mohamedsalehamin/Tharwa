import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import {
  adminFetch,
  AUDIT_ACTION_PRESETS,
  type AuditLogRow,
  type AuditLogsList,
} from '@/lib/admin-api'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

const PAGE_SIZE = 50

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString()
}

function payloadPreview(payload: unknown): string {
  if (payload === null || payload === undefined) return '—'
  try {
    const s = JSON.stringify(payload)
    return s.length > 120 ? `${s.slice(0, 117)}…` : s
  } catch {
    return '—'
  }
}

function actionLabel(action: string): string {
  return action.replace(/^admin\./, '').replace(/\./g, ' › ')
}

export function ActivityList() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const [actionInput, setActionInput] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [fromInput, setFromInput] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toInput, setToInput] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [
      'admin',
      'audit-logs',
      token,
      actionFilter,
      emailFilter,
      fromFilter,
      toFilter,
      offset,
    ],
    enabled: Boolean(token),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (actionFilter) params.set('action', actionFilter)
      if (emailFilter) params.set('adminEmail', emailFilter)
      if (fromFilter) params.set('from', fromFilter)
      if (toFilter) params.set('to', toFilter)
      return adminFetch<AuditLogsList>(`/admin/v1/audit-logs?${params.toString()}`, token!)
    },
  })

  const items: AuditLogRow[] = data?.items ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const err = error instanceof Error ? error.message : null

  function applyFilters() {
    setOffset(0)
    setActionFilter(actionInput.trim())
    setEmailFilter(emailInput.trim())
    setFromFilter(fromInput.trim())
    setToFilter(toInput.trim())
  }

  function clearFilters() {
    setActionInput('')
    setActionFilter('')
    setEmailInput('')
    setEmailFilter('')
    setFromInput('')
    setFromFilter('')
    setToInput('')
    setToFilter('')
    setOffset(0)
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
        <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Activity</h1>
            <p className='text-sm text-muted-foreground'>
              Read-only audit trail for sign-ins, configuration changes, and integrations.
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <form
          className='mb-6 grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4'
          onSubmit={(e) => {
            e.preventDefault()
            applyFilters()
          }}
        >
          <div className='grid gap-2 sm:col-span-2'>
            <Label htmlFor='audit-action'>Action (contains)</Label>
            <Input
              id='audit-action'
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder='admin.instruments.patch'
              className='font-mono text-xs'
            />
            <Select
              value={actionInput === '' ? '__all__' : actionInput}
              onValueChange={(v) => setActionInput(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className='h-8 text-xs'>
                <SelectValue placeholder='Quick preset…' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='__all__'>All actions</SelectItem>
                {AUDIT_ACTION_PRESETS.filter(Boolean).map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {preset}*
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='audit-email'>Admin email</Label>
            <Input
              id='audit-email'
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder='admin@localhost.com'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='audit-from'>From (UTC date)</Label>
            <Input
              id='audit-from'
              type='date'
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='audit-to'>To (UTC date)</Label>
            <Input
              id='audit-to'
              type='date'
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
            />
          </div>
          <div className='flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4'>
            <Button type='submit' size='sm'>
              <Search className='me-1 size-4' />
              Apply filters
            </Button>
            <Button type='button' size='sm' variant='outline' onClick={clearFilters}>
              Clear
            </Button>
            <span className='text-xs text-muted-foreground'>
              {total} event{total === 1 ? '' : 's'}
              {actionFilter || emailFilter || fromFilter || toFilter ? ' (filtered)' : ''}
            </span>
          </div>
        </form>

        <div className='overflow-x-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const expanded = expandedId === row.id
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className='cursor-pointer'
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                    >
                      <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>
                        {formatWhen(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className='text-sm'>{row.adminUser.email}</div>
                        <Badge variant='outline' className='mt-0.5 text-[10px]'>
                          {row.adminUser.role}
                        </Badge>
                      </TableCell>
                      <TableCell className='font-mono text-xs'>{actionLabel(row.action)}</TableCell>
                      <TableCell className='font-mono text-xs text-muted-foreground'>
                        {row.ip ?? '—'}
                      </TableCell>
                      <TableCell className='max-w-xs truncate font-mono text-xs text-muted-foreground'>
                        {payloadPreview(row.payload)}
                      </TableCell>
                    </TableRow>
                    {expanded ? (
                      <TableRow>
                        <TableCell colSpan={5} className='bg-muted/40'>
                          <pre className='max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs'>
                            {JSON.stringify(row.payload ?? null, null, 2)}
                          </pre>
                          <p className='mt-2 font-mono text-[10px] text-muted-foreground'>
                            {row.action} · {row.id}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
              {!isLoading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center text-muted-foreground'>
                    No audit events match these filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className='mt-4 flex items-center justify-between gap-4'>
          <p className='text-sm text-muted-foreground'>
            Page {page} of {pageCount}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={offset <= 0 || isFetching}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={offset + PAGE_SIZE >= total || isFetching}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </Main>
    </>
  )
}
