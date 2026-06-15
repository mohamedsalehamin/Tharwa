import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListOrdered, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { toast } from 'sonner'

export type EquityListKind = 'sector' | 'thematic' | 'market_rule'
export type EquityListMemberSource = 'import' | 'admin' | 'sync'

export type EquityListItem = {
  id: string
  code: string
  titleAr: string
  titleEn: string
  descriptionAr: string | null
  descriptionEn: string | null
  kind: EquityListKind
  sortOrder: number
  memberCount: number
  isPublished: boolean
  tvAliases: string[]
}

type EquityListMember = {
  symbol: string
  source: EquityListMemberSource
  displayNameAr: string | null
  displayNameEn: string | null
}

type ListForm = {
  code: string
  titleAr: string
  titleEn: string
  descriptionAr: string
  descriptionEn: string
  kind: EquityListKind
  sortOrder: string
  isPublished: boolean
  tvAliases: string
}

const EMPTY_FORM: ListForm = {
  code: '',
  titleAr: '',
  titleEn: '',
  descriptionAr: '',
  descriptionEn: '',
  kind: 'thematic',
  sortOrder: '0',
  isPublished: false,
  tvAliases: '',
}

const KIND_LABELS: Record<EquityListKind, string> = {
  sector: 'Sector',
  thematic: 'Thematic',
  market_rule: 'Market rule',
}

function parseSymbols(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0),
    ),
  ]
}

function parseAliases(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function formToBody(form: ListForm) {
  const aliases = parseAliases(form.tvAliases)
  return {
    code: form.code.trim().toLowerCase(),
    titleAr: form.titleAr.trim(),
    titleEn: form.titleEn.trim(),
    descriptionAr: form.descriptionAr.trim() || null,
    descriptionEn: form.descriptionEn.trim() || null,
    kind: form.kind,
    sortOrder: Number(form.sortOrder) || 0,
    isPublished: form.isPublished,
    tvAliases: aliases.length > 0 ? aliases : null,
  }
}

function itemToForm(item: EquityListItem): ListForm {
  return {
    code: item.code,
    titleAr: item.titleAr,
    titleEn: item.titleEn,
    descriptionAr: item.descriptionAr ?? '',
    descriptionEn: item.descriptionEn ?? '',
    kind: item.kind,
    sortOrder: String(item.sortOrder),
    isPublished: item.isPublished,
    tvAliases: item.tvAliases.join(', '),
  }
}

export function EquityListsPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ListForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [membersInput, setMembersInput] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EquityListItem | null>(null)

  const listsQuery = useQuery({
    queryKey: ['admin', 'equity-lists'],
    queryFn: () => adminFetch<{ items: EquityListItem[] }>('/admin/v1/equity-lists', token!),
    enabled: Boolean(token),
  })

  const membersQuery = useQuery({
    queryKey: ['admin', 'equity-lists', selectedId, 'members'],
    queryFn: () =>
      adminFetch<{ items: EquityListMember[] }>(
        `/admin/v1/equity-lists/${selectedId}/members`,
        token!,
      ),
    enabled: Boolean(token) && Boolean(selectedId),
  })

  const lists = listsQuery.data?.items ?? []

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedId) ?? null,
    [lists, selectedId],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'equity-lists'] })
  }

  const createList = useMutation({
    mutationFn: () =>
      adminFetch<{ item: EquityListItem }>('/admin/v1/equity-lists', token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(form)),
      }),
    onSuccess: (res) => {
      toast.success('List created')
      setForm(EMPTY_FORM)
      setSelectedId(res.item.id)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateList = useMutation({
    mutationFn: () =>
      adminFetch<{ item: EquityListItem }>(`/admin/v1/equity-lists/${editingId}`, token!, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(form)),
      }),
    onSuccess: () => {
      toast.success('List updated')
      setEditingId(null)
      setForm(EMPTY_FORM)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteList = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/admin/v1/equity-lists/${id}`, token!, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      toast.success('List deleted')
      if (selectedId === id) setSelectedId(null)
      if (editingId === id) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
      setDeleteTarget(null)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const addMembers = useMutation({
    mutationFn: () => {
      const symbols = parseSymbols(membersInput)
      if (symbols.length === 0) throw new Error('Enter at least one ticker symbol')
      return adminFetch<{ added: number }>(`/admin/v1/equity-lists/${selectedId}/members`, token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      })
    },
    onSuccess: (res) => {
      toast.success(`Added ${res.added} symbol(s)`)
      setMembersInput('')
      invalidate()
      void membersQuery.refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const removeMember = useMutation({
    mutationFn: (symbol: string) =>
      adminFetch(`/admin/v1/equity-lists/${selectedId}/members/${encodeURIComponent(symbol)}`, token!, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Symbol removed')
      invalidate()
      void membersQuery.refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const importSectors = useMutation({
    mutationFn: () =>
      adminFetch<{
        scanned: number
        assigned: number
        skippedAdmin: number
        unmatched: number
      }>('/admin/v1/equity-lists/import-sectors', token!, { method: 'POST' }),
    onSuccess: (res) => {
      toast.success(
        `Import done: ${res.assigned} assigned, ${res.skippedAdmin} admin-kept, ${res.unmatched} unmatched`,
      )
      invalidate()
      if (selectedId) void membersQuery.refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const formValid = form.code.trim().length > 0 && form.titleAr.trim() && form.titleEn.trim()

  const startEdit = (item: EquityListItem) => {
    setEditingId(item.id)
    setForm(itemToForm(item))
    setSelectedId(item.id)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
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
        <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Equity lists</h1>
            <p className='text-muted-foreground text-sm'>
              Curated EGX stock screens shown in the mobile app (sectors, thematic lists, market rules).
            </p>
          </div>
          <Button
            variant='outline'
            onClick={() => importSectors.mutate()}
            disabled={importSectors.isPending}
          >
            <Upload className='me-2 size-4' />
            Import sectors from TradingView
          </Button>
        </div>

        {listsQuery.error ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{(listsQuery.error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <div className='grid gap-6 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? 'Edit list' : 'New list'}</CardTitle>
              <CardDescription>
                Code uses lowercase snake_case (e.g. sharia, dividend_payers). Published lists appear in the app.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label>Code</Label>
                  <Input
                    value={form.code}
                    disabled={Boolean(editingId)}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder='banks'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Kind</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as EquityListKind })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABELS) as EquityListKind[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <Label>Title (AR)</Label>
                  <Input value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
                </div>
                <div className='space-y-2'>
                  <Label>Title (EN)</Label>
                  <Input value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <Label>Description (AR)</Label>
                  <Textarea
                    rows={2}
                    value={form.descriptionAr}
                    onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
                  />
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <Label>Description (EN)</Label>
                  <Textarea
                    rows={2}
                    value={form.descriptionEn}
                    onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Sort order</Label>
                  <Input
                    type='number'
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  />
                </div>
                <div className='flex items-center gap-2 pt-6'>
                  <Switch
                    checked={form.isPublished}
                    onCheckedChange={(v) => setForm({ ...form, isPublished: v })}
                  />
                  <Label>Published</Label>
                </div>
                {form.kind === 'sector' ? (
                  <div className='space-y-2 sm:col-span-2'>
                    <Label>TradingView sector aliases (comma-separated)</Label>
                    <Input
                      value={form.tvAliases}
                      onChange={(e) => setForm({ ...form, tvAliases: e.target.value })}
                      placeholder='Financial Services, Banks'
                    />
                  </div>
                ) : null}
              </div>
              <div className='flex flex-wrap gap-2'>
                {editingId ? (
                  <>
                    <Button onClick={() => updateList.mutate()} disabled={!formValid || updateList.isPending}>
                      Save changes
                    </Button>
                    <Button variant='outline' onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => createList.mutate()} disabled={!formValid || createList.isPending}>
                    <Plus className='me-2 size-4' />
                    Create list
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between'>
              <div>
                <CardTitle>All lists</CardTitle>
                <CardDescription>Select a list to manage its symbols.</CardDescription>
              </div>
              <Button variant='ghost' size='icon' onClick={() => void listsQuery.refetch()} disabled={listsQuery.isFetching}>
                <RefreshCw className={`size-4 ${listsQuery.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {listsQuery.isLoading ? (
                <p className='text-muted-foreground text-sm'>Loading…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Stocks</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lists.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={selectedId === row.id ? 'selected' : undefined}
                        className='cursor-pointer'
                        onClick={() => setSelectedId(row.id)}
                      >
                        <TableCell className='font-mono text-xs'>{row.code}</TableCell>
                        <TableCell>{row.titleEn}</TableCell>
                        <TableCell>
                          <Badge variant='secondary'>{KIND_LABELS[row.kind]}</Badge>
                        </TableCell>
                        <TableCell>{row.memberCount}</TableCell>
                        <TableCell className='text-end'>
                          <div className='flex justify-end gap-1' onClick={(e) => e.stopPropagation()}>
                            {row.isPublished ? (
                              <Badge>Live</Badge>
                            ) : (
                              <Badge variant='outline'>Draft</Badge>
                            )}
                            <Button variant='ghost' size='icon' onClick={() => startEdit(row)}>
                              <Pencil className='size-4' />
                            </Button>
                            <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(row)}>
                              <Trash2 className='size-4 text-destructive' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {lists.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className='text-muted-foreground text-center'>
                          No lists yet. Run sector import or create one manually.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedList ? (
          <Card className='mt-6'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <ListOrdered className='size-5' />
                Members — {selectedList.titleEn}
              </CardTitle>
              <CardDescription>
                Add EGX tickers (comma or newline separated). Admin assignments are kept when re-importing sectors.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <Label>Add symbols</Label>
                <Textarea
                  rows={3}
                  value={membersInput}
                  onChange={(e) => setMembersInput(e.target.value)}
                  placeholder='COMI, HRHO, TMGH'
                />
                <Button onClick={() => addMembers.mutate()} disabled={addMembers.isPending}>
                  Add to list
                </Button>
              </div>

              {membersQuery.isLoading ? (
                <p className='text-muted-foreground text-sm'>Loading members…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name (AR)</TableHead>
                      <TableHead>Name (EN)</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(membersQuery.data?.items ?? []).map((m) => (
                      <TableRow key={m.symbol}>
                        <TableCell className='font-mono font-medium'>{m.symbol}</TableCell>
                        <TableCell>{m.displayNameAr ?? '—'}</TableCell>
                        <TableCell>{m.displayNameEn ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant='outline'>{m.source}</Badge>
                        </TableCell>
                        <TableCell className='text-end'>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => removeMember.mutate(m.symbol)}
                            disabled={removeMember.isPending}
                          >
                            <Trash2 className='size-4 text-destructive' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(membersQuery.data?.items ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className='text-muted-foreground text-center'>
                          No symbols in this list yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}
      </Main>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title='Delete list?'
        desc={
          deleteTarget
            ? `Permanently delete "${deleteTarget.titleEn}" and all ${deleteTarget.memberCount} member(s)?`
            : ''
        }
        confirmText='Delete'
        destructive
        isLoading={deleteList.isPending}
        handleConfirm={() => deleteTarget && deleteList.mutate(deleteTarget.id)}
      />
    </>
  )
}
