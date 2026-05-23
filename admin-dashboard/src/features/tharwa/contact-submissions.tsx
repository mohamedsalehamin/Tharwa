import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import { adminFetch } from '@/lib/admin-api'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
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

export type ContactSubmissionRow = {
  id: string
  name: string
  email: string
  subject: string | null
  message: string
  consumerUserId: string | null
  consumerEmail: string | null
  ip: string | null
  createdAt: string
}

type ContactSubmissionsList = {
  items: ContactSubmissionRow[]
  total: number
}

const PAGE_SIZE = 50

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString()
}

function messagePreview(message: string): string {
  return message.length > 80 ? `${message.slice(0, 77)}…` : message
}

export function ContactSubmissionsPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const [emailInput, setEmailInput] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'contact-submissions', token, emailFilter, offset],
    enabled: Boolean(token),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (emailFilter) params.set('email', emailFilter)
      return adminFetch<ContactSubmissionsList>(
        `/admin/v1/contact-submissions?${params.toString()}`,
        token!,
      )
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const err = error instanceof Error ? error.message : null

  function applyFilters() {
    setOffset(0)
    setEmailFilter(emailInput.trim())
  }

  function clearFilters() {
    setEmailInput('')
    setEmailFilter('')
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
            <h1 className='text-2xl font-bold tracking-tight'>Contact submissions</h1>
            <p className='text-sm text-muted-foreground'>
              Messages sent from the mobile app contact form.
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

        <div className='mb-6 flex flex-wrap items-end gap-3'>
          <div className='grid w-full max-w-xs gap-1.5'>
            <Label htmlFor='email-filter'>Email contains</Label>
            <Input
              id='email-filter'
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder='user@example.com'
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters()
              }}
            />
          </div>
          <Button variant='secondary' size='sm' onClick={applyFilters}>
            <Search />
            Filter
          </Button>
          <Button variant='ghost' size='sm' onClick={clearFilters}>
            Clear
          </Button>
        </div>

        {isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading…</p>
        ) : items.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No submissions yet.</p>
        ) : (
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const expanded = expandedId === row.id
                  return (
                    <TableRow
                      key={row.id}
                      className='cursor-pointer'
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                    >
                      <TableCell className='whitespace-nowrap text-muted-foreground'>
                        {formatWhen(row.createdAt)}
                      </TableCell>
                      <TableCell className='font-medium'>{row.name}</TableCell>
                      <TableCell>
                        <a
                          href={`mailto:${encodeURIComponent(row.email)}`}
                          className='text-primary hover:underline'
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.email}
                        </a>
                      </TableCell>
                      <TableCell>{row.subject ?? '—'}</TableCell>
                      <TableCell className='max-w-md'>
                        {expanded ? (
                          <pre className='whitespace-pre-wrap text-xs'>{row.message}</pre>
                        ) : (
                          <span className='text-muted-foreground'>
                            {messagePreview(row.message)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.consumerEmail ? (
                          <Badge variant='secondary'>{row.consumerEmail}</Badge>
                        ) : (
                          <span className='text-muted-foreground'>Guest</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className='mt-4 flex items-center justify-between gap-4'>
            <p className='text-sm text-muted-foreground'>
              Page {page} of {pageCount} ({total} total)
            </p>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={offset <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Main>
    </>
  )
}
