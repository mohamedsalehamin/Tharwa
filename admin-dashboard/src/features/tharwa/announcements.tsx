import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
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

export type AnnouncementVariant = 'info' | 'warning' | 'maintenance'

export type AdminAnnouncement = {
  id: string
  titleAr: string
  titleEn: string
  bodyAr: string
  bodyEn: string
  variant: AnnouncementVariant
  sortOrder: number
  isEnabled: boolean
  dismissible: boolean
  linkUrl: string | null
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
}

type AnnouncementForm = {
  titleAr: string
  titleEn: string
  bodyAr: string
  bodyEn: string
  variant: AnnouncementVariant
  sortOrder: string
  isEnabled: boolean
  dismissible: boolean
  linkUrl: string
  startsAt: string
  endsAt: string
}

const EMPTY_FORM: AnnouncementForm = {
  titleAr: '',
  titleEn: '',
  bodyAr: '',
  bodyEn: '',
  variant: 'info',
  sortOrder: '0',
  isEnabled: true,
  dismissible: true,
  linkUrl: '',
  startsAt: '',
  endsAt: '',
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(value: string): string | null {
  const t = value.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function rowToForm(row: AdminAnnouncement): AnnouncementForm {
  return {
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    bodyAr: row.bodyAr,
    bodyEn: row.bodyEn,
    variant: row.variant,
    sortOrder: String(row.sortOrder),
    isEnabled: row.isEnabled,
    dismissible: row.dismissible,
    linkUrl: row.linkUrl ?? '',
    startsAt: toDatetimeLocal(row.startsAt),
    endsAt: toDatetimeLocal(row.endsAt),
  }
}

function formToBody(form: AnnouncementForm): Record<string, unknown> {
  return {
    titleAr: form.titleAr.trim(),
    titleEn: form.titleEn.trim(),
    bodyAr: form.bodyAr.trim(),
    bodyEn: form.bodyEn.trim(),
    variant: form.variant,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
    isEnabled: form.isEnabled,
    dismissible: form.dismissible,
    linkUrl: form.linkUrl.trim() || null,
    startsAt: fromDatetimeLocal(form.startsAt),
    endsAt: fromDatetimeLocal(form.endsAt),
  }
}

function scheduleLabel(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return 'Always'
  const parts: string[] = []
  if (startsAt) parts.push(`from ${new Date(startsAt).toLocaleString()}`)
  if (endsAt) parts.push(`until ${new Date(endsAt).toLocaleString()}`)
  return parts.join(' ')
}

function variantBadge(variant: AnnouncementVariant) {
  if (variant === 'warning') return <Badge variant='destructive'>warning</Badge>
  if (variant === 'maintenance') return <Badge variant='secondary'>maintenance</Badge>
  return <Badge variant='outline'>info</Badge>
}

export function AnnouncementsPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'announcements', token],
    enabled: Boolean(token),
    queryFn: () =>
      adminFetch<{ items: AdminAnnouncement[] }>('/admin/v1/announcements', token!),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Not signed in')
      const body = formToBody(form)
      if (!body.titleAr || !body.titleEn || !body.bodyAr || !body.bodyEn) {
        throw new Error('All title and body fields are required')
      }
      if (editingId) {
        return adminFetch<{ item: AdminAnnouncement }>(
          `/admin/v1/announcements/${editingId}`,
          token,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        )
      }
      return adminFetch<{ item: AdminAnnouncement }>('/admin/v1/announcements', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      toast.success(editingId ? 'Announcement updated' : 'Announcement created')
      setForm(EMPTY_FORM)
      setEditingId(null)
      setFormErr(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] })
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      setFormErr(msg)
      toast.error(msg)
    },
  })

  const items = data?.items ?? []
  const err = formErr ?? (error instanceof Error ? error.message : null)
  const formTitle = editingId ? 'Edit announcement' : 'New announcement'

  const previewActive = useMemo(() => {
    const now = Date.now()
    const starts = form.startsAt ? new Date(form.startsAt).getTime() : null
    const ends = form.endsAt ? new Date(form.endsAt).getTime() : null
    if (!form.isEnabled) return false
    if (starts !== null && !Number.isNaN(starts) && starts > now) return false
    if (ends !== null && !Number.isNaN(ends) && ends < now) return false
    return true
  }, [form])

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormErr(null)
  }

  function startEdit(row: AdminAnnouncement) {
    setEditingId(row.id)
    setForm(rowToForm(row))
    setFormErr(null)
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    try {
      await adminFetch<void>(`/admin/v1/announcements/${deleteTarget.id}`, token, {
        method: 'DELETE',
      })
      toast.success('Announcement deleted')
      setDeleteTarget(null)
      if (editingId === deleteTarget.id) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
      await queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={isLoading || isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
          <div>
            <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
              <Megaphone className='size-7' />
              Announcements
            </h1>
            <p className='text-sm text-muted-foreground'>
              In-app banners for Eid greetings, EGX closure, maintenance, and other notices.
            </p>
          </div>
          <Button size='sm' onClick={startCreate}>
            <Plus />
            New
          </Button>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <div className='grid gap-6 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>{formTitle}</CardTitle>
              <CardDescription>
                Bilingual copy is shown in the app based on the user&apos;s language. Lower sort
                order appears first.
                {previewActive ? (
                  <span className='mt-1 block text-emerald-600 dark:text-emerald-400'>
                    Would be visible to consumers now.
                  </span>
                ) : (
                  <span className='mt-1 block text-amber-600 dark:text-amber-400'>
                    Not visible to consumers with current settings.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-2'>
                  <Label htmlFor='titleEn'>Title (English)</Label>
                  <Input
                    id='titleEn'
                    value={form.titleEn}
                    onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='titleAr'>Title (Arabic)</Label>
                  <Input
                    id='titleAr'
                    dir='rtl'
                    value={form.titleAr}
                    onChange={(e) => setForm((f) => ({ ...f, titleAr: e.target.value }))}
                  />
                </div>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-2'>
                  <Label htmlFor='bodyEn'>Body (English)</Label>
                  <Textarea
                    id='bodyEn'
                    rows={3}
                    value={form.bodyEn}
                    onChange={(e) => setForm((f) => ({ ...f, bodyEn: e.target.value }))}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='bodyAr'>Body (Arabic)</Label>
                  <Textarea
                    id='bodyAr'
                    dir='rtl'
                    rows={3}
                    value={form.bodyAr}
                    onChange={(e) => setForm((f) => ({ ...f, bodyAr: e.target.value }))}
                  />
                </div>
              </div>
              <div className='grid gap-4 sm:grid-cols-3'>
                <div className='grid gap-2'>
                  <Label>Variant</Label>
                  <Select
                    value={form.variant}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, variant: v as AnnouncementVariant }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='info'>Info</SelectItem>
                      <SelectItem value='warning'>Warning</SelectItem>
                      <SelectItem value='maintenance'>Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='sortOrder'>Sort order</Label>
                  <Input
                    id='sortOrder'
                    type='number'
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='linkUrl'>Link URL (optional)</Label>
                  <Input
                    id='linkUrl'
                    value={form.linkUrl}
                    placeholder='https://'
                    onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                  />
                </div>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-2'>
                  <Label htmlFor='startsAt'>Starts at (optional)</Label>
                  <Input
                    id='startsAt'
                    type='datetime-local'
                    value={form.startsAt}
                    onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='endsAt'>Ends at (optional)</Label>
                  <Input
                    id='endsAt'
                    type='datetime-local'
                    value={form.endsAt}
                    onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className='flex flex-wrap gap-6'>
                <div className='flex items-center gap-2'>
                  <Switch
                    id='isEnabled'
                    checked={form.isEnabled}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, isEnabled: c }))}
                  />
                  <Label htmlFor='isEnabled'>Enabled</Label>
                </div>
                <div className='flex items-center gap-2'>
                  <Switch
                    id='dismissible'
                    checked={form.dismissible}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, dismissible: c }))}
                  />
                  <Label htmlFor='dismissible'>Dismissible in app</Label>
                </div>
              </div>
              <div className='flex gap-2'>
                <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  {editingId ? 'Save changes' : 'Create'}
                </Button>
                {editingId ? (
                  <Button
                    variant='outline'
                    onClick={() => {
                      setEditingId(null)
                      setForm(EMPTY_FORM)
                      setFormErr(null)
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All announcements</CardTitle>
              <CardDescription>{items.length} total</CardDescription>
            </CardHeader>
            <CardContent className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>On</TableHead>
                    <TableHead className='text-end'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5}>Loading…</TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className='text-muted-foreground'>
                        No announcements yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className='font-medium'>{row.titleEn}</div>
                          <div className='text-xs text-muted-foreground' dir='rtl'>
                            {row.titleAr}
                          </div>
                        </TableCell>
                        <TableCell>{variantBadge(row.variant)}</TableCell>
                        <TableCell className='max-w-[200px] text-xs text-muted-foreground'>
                          {scheduleLabel(row.startsAt, row.endsAt)}
                        </TableCell>
                        <TableCell>
                          {row.isEnabled ? (
                            <Badge variant='default'>yes</Badge>
                          ) : (
                            <Badge variant='secondary'>no</Badge>
                          )}
                        </TableCell>
                        <TableCell className='text-end'>
                          <Button
                            variant='ghost'
                            size='icon'
                            aria-label={`Edit ${row.titleEn}`}
                            onClick={() => startEdit(row)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            aria-label={`Delete ${row.titleEn}`}
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className='text-destructive' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          title='Delete announcement?'
          desc={
            deleteTarget
              ? `"${deleteTarget.titleEn}" will be removed from the app immediately.`
              : ''
          }
          confirmText='Delete'
          destructive
          handleConfirm={() => void confirmDelete()}
        />
      </Main>
    </>
  )
}
