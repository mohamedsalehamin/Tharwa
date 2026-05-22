import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import { adminFetch, type ConsumerUserRow, type ConsumerUsersList } from '@/lib/admin-api'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export function UsersList() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'users', token, search, offset],
    enabled: Boolean(token),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (search) params.set('q', search)
      return adminFetch<ConsumerUsersList>(
        `/admin/v1/users?${params.toString()}`,
        token!,
      )
    },
  })

  const items: ConsumerUserRow[] = data?.items ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const err = error instanceof Error ? error.message : null

  function applySearch() {
    setOffset(0)
    setSearch(searchInput.trim())
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
            <h1 className='text-2xl font-bold tracking-tight'>Users</h1>
            <p className='text-sm text-muted-foreground'>
              Consumer accounts registered in the app.
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
          className='mb-4 flex max-w-md gap-2'
          onSubmit={(e) => {
            e.preventDefault()
            applySearch()
          }}
        >
          <div className='relative flex-1'>
            <Search className='absolute start-2.5 top-2.5 size-4 text-muted-foreground' />
            <Input
              className='ps-8'
              placeholder='Search by email…'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type='submit'>Search</Button>
          {search ? (
            <Button
              type='button'
              variant='ghost'
              onClick={() => {
                setSearchInput('')
                setSearch('')
                setOffset(0)
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>

        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className='font-mono text-xs'>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-muted-foreground'>
                    Loading…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-muted-foreground'>
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className='font-medium'>{u.email}</TableCell>
                    <TableCell>
                      {u.emailVerifiedAt ? (
                        <Badge variant='secondary'>Yes</Badge>
                      ) : (
                        <span className='text-muted-foreground'>No</span>
                      )}
                    </TableCell>
                    <TableCell className='text-sm'>
                      {u.hasPassword ? 'Password' : null}
                      {u.hasPassword && u.hasAuthSubject ? ' · ' : null}
                      {u.hasAuthSubject ? 'OAuth' : null}
                      {!u.hasPassword && !u.hasAuthSubject ? (
                        <span className='text-muted-foreground'>—</span>
                      ) : null}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className='max-w-[12rem] truncate font-mono text-xs text-muted-foreground'>
                      {u.id}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className='mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground'>
          <span>
            {total === 0
              ? '0 users'
              : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={offset === 0 || isFetching}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span className='flex items-center px-2'>
              Page {page} of {pageCount}
            </span>
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
