import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Globe, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
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

export type SitePageKind = 'standard' | 'contact'

export type AdminSitePage = {
  id: string
  slug: string
  titleAr: string
  titleEn: string
  contentAr: string
  contentEn: string
  kind: SitePageKind
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

type AdminSiteMenuItem = {
  id: string
  placement: 'header' | 'footer'
  labelAr: string
  labelEn: string
  linkType: 'page' | 'external'
  pageId: string | null
  pageSlug: string | null
  externalUrl: string | null
  sortOrder: number
  isEnabled: boolean
}

type PageForm = {
  slug: string
  titleAr: string
  titleEn: string
  contentAr: string
  contentEn: string
  kind: SitePageKind
  isPublished: boolean
}

const EMPTY_PAGE_FORM: PageForm = {
  slug: '',
  titleAr: '',
  titleEn: '',
  contentAr: '',
  contentEn: '',
  kind: 'standard',
  isPublished: false,
}

function rowToPageForm(row: AdminSitePage): PageForm {
  return {
    slug: row.slug,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    contentAr: row.contentAr,
    contentEn: row.contentEn,
    kind: row.kind,
    isPublished: row.isPublished,
  }
}

function AdminToolbar({
  isLoading,
  isFetching,
  onRefresh,
}: {
  isLoading: boolean
  isFetching: boolean
  onRefresh: () => void
}) {
  return (
    <Header>
      <div className='ms-auto flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={isLoading || isFetching}
          onClick={onRefresh}
        >
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </Button>
        <ThemeSwitch />
        <ProfileDropdown />
      </div>
    </Header>
  )
}

export function SitePagesPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PageForm>(EMPTY_PAGE_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminSitePage | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'site-pages', token],
    enabled: Boolean(token),
    queryFn: () => adminFetch<{ items: AdminSitePage[] }>('/admin/v1/site/pages', token!),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Not signed in')
      if (!form.slug.trim() || !form.titleAr.trim() || !form.titleEn.trim()) {
        throw new Error('Slug and titles are required')
      }
      const body = {
        slug: form.slug.trim().toLowerCase(),
        titleAr: form.titleAr.trim(),
        titleEn: form.titleEn.trim(),
        contentAr: form.contentAr,
        contentEn: form.contentEn,
        kind: form.kind,
        isPublished: form.isPublished,
      }
      if (editingId) {
        return adminFetch<{ item: AdminSitePage }>(`/admin/v1/site/pages/${editingId}`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      return adminFetch<{ item: AdminSitePage }>('/admin/v1/site/pages', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      toast.success(editingId ? 'Page updated' : 'Page created')
      setForm(EMPTY_PAGE_FORM)
      setEditingId(null)
      setFormErr(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'site-pages'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'site-menu'] })
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      setFormErr(msg)
      toast.error(msg)
    },
  })

  const items = data?.items ?? []
  const err = formErr ?? (error instanceof Error ? error.message : null)

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    try {
      await adminFetch<void>(`/admin/v1/site/pages/${deleteTarget.id}`, token, {
        method: 'DELETE',
      })
      toast.success('Page deleted')
      setDeleteTarget(null)
      if (editingId === deleteTarget.id) {
        setEditingId(null)
        setForm(EMPTY_PAGE_FORM)
      }
      await queryClient.invalidateQueries({ queryKey: ['admin', 'site-pages'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'site-menu'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <AdminToolbar
        isLoading={isLoading}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
      />
      <Main>
        <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
          <div>
            <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
              <FileText className='size-7' />
              Website pages
            </h1>
            <p className='text-sm text-muted-foreground'>
              Manage public pages such as Privacy Policy and Contact Us for the marketing website.
            </p>
          </div>
          <Button
            size='sm'
            onClick={() => {
              setEditingId(null)
              setForm(EMPTY_PAGE_FORM)
              setFormErr(null)
            }}
          >
            <Plus />
            New page
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
              <CardTitle>{editingId ? 'Edit page' : 'New page'}</CardTitle>
              <CardDescription>
                Slug becomes the URL path (e.g. <code className='text-xs'>/privacy</code>). Contact
                pages show a message form on the website.
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-2'>
                  <Label htmlFor='slug'>Slug</Label>
                  <Input
                    id='slug'
                    placeholder='privacy'
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label>Page type</Label>
                  <Select
                    value={form.kind}
                    onValueChange={(v) => setForm((f) => ({ ...f, kind: v as SitePageKind }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='standard'>Standard content</SelectItem>
                      <SelectItem value='contact'>Contact (with form)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                  <Label htmlFor='contentEn'>Content (English)</Label>
                  <Textarea
                    id='contentEn'
                    rows={6}
                    value={form.contentEn}
                    onChange={(e) => setForm((f) => ({ ...f, contentEn: e.target.value }))}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='contentAr'>Content (Arabic)</Label>
                  <Textarea
                    id='contentAr'
                    dir='rtl'
                    rows={6}
                    value={form.contentAr}
                    onChange={(e) => setForm((f) => ({ ...f, contentAr: e.target.value }))}
                  />
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <Switch
                  id='published'
                  checked={form.isPublished}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isPublished: v }))}
                />
                <Label htmlFor='published'>Published on website</Label>
              </div>
              <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create page'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All pages</CardTitle>
              <CardDescription>{items.length} page(s)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slug</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='w-24' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className='font-mono text-xs'>{row.slug}</TableCell>
                      <TableCell>{row.titleEn}</TableCell>
                      <TableCell>
                        <Badge variant='outline'>{row.kind}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.isPublished ? (
                          <Badge>Published</Badge>
                        ) : (
                          <Badge variant='secondary'>Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className='flex gap-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => {
                              setEditingId(row.id)
                              setForm(rowToPageForm(row))
                              setFormErr(null)
                            }}
                          >
                            <Pencil className='size-4' />
                          </Button>
                          <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(row)}>
                            <Trash2 className='size-4 text-destructive' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center text-muted-foreground'>
                        No pages yet
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Main>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title='Delete page?'
        desc={`This will remove "${deleteTarget?.titleEn ?? ''}" and unlink any menu items pointing to it.`}
        confirmText='Delete'
        destructive
        handleConfirm={() => void confirmDelete()}
      />
    </>
  )
}

export function SiteNavigationPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const [placement, setPlacement] = useState<'header' | 'footer'>('header')
  const [form, setForm] = useState({
    labelAr: '',
    labelEn: '',
    linkType: 'page' as 'page' | 'external',
    pageId: '',
    externalUrl: '',
    sortOrder: '0',
    isEnabled: true,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminSiteMenuItem | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)

  const { data: menuData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'site-menu', token],
    enabled: Boolean(token),
    queryFn: () =>
      adminFetch<{ items: AdminSiteMenuItem[] }>('/admin/v1/site/menu-items', token!),
  })

  const { data: pagesData } = useQuery({
    queryKey: ['admin', 'site-pages', token],
    enabled: Boolean(token),
    queryFn: () => adminFetch<{ items: AdminSitePage[] }>('/admin/v1/site/pages', token!),
  })

  const pages = pagesData?.items ?? []

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Not signed in')
      if (!form.labelAr.trim() || !form.labelEn.trim()) {
        throw new Error('Labels are required')
      }
      const body = {
        placement,
        labelAr: form.labelAr.trim(),
        labelEn: form.labelEn.trim(),
        linkType: form.linkType,
        pageId: form.linkType === 'page' ? form.pageId || null : null,
        externalUrl: form.linkType === 'external' ? form.externalUrl.trim() || null : null,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        isEnabled: form.isEnabled,
      }
      if (editingId) {
        return adminFetch(`/admin/v1/site/menu-items/${editingId}`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      return adminFetch('/admin/v1/site/menu-items', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      toast.success(editingId ? 'Menu item updated' : 'Menu item created')
      resetForm()
      void queryClient.invalidateQueries({ queryKey: ['admin', 'site-menu'] })
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      setFormErr(msg)
      toast.error(msg)
    },
  })

  const items = (menuData?.items ?? []).filter((i) => i.placement === placement)
  const err = formErr ?? (error instanceof Error ? error.message : null)

  function resetForm() {
    setEditingId(null)
    setForm({
      labelAr: '',
      labelEn: '',
      linkType: 'page',
      pageId: pages[0]?.id ?? '',
      externalUrl: '',
      sortOrder: '0',
      isEnabled: true,
    })
    setFormErr(null)
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    try {
      await adminFetch<void>(`/admin/v1/site/menu-items/${deleteTarget.id}`, token, {
        method: 'DELETE',
      })
      toast.success('Menu item deleted')
      setDeleteTarget(null)
      if (editingId === deleteTarget.id) resetForm()
      await queryClient.invalidateQueries({ queryKey: ['admin', 'site-menu'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <AdminToolbar
        isLoading={isLoading}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
      />
      <Main>
        <div className='mb-6'>
          <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
            <Globe className='size-7' />
            Website navigation
          </h1>
          <p className='text-sm text-muted-foreground'>
            Control header and footer links on the public marketing website.
          </p>
        </div>

        {err ? (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        <div className='mb-4 flex gap-2'>
          <Button
            variant={placement === 'header' ? 'default' : 'outline'}
            size='sm'
            onClick={() => {
              setPlacement('header')
              resetForm()
            }}
          >
            Header menu
          </Button>
          <Button
            variant={placement === 'footer' ? 'default' : 'outline'}
            size='sm'
            onClick={() => {
              setPlacement('footer')
              resetForm()
            }}
          >
            Footer menu
          </Button>
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? 'Edit menu item' : `New ${placement} item`}</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-2'>
                  <Label>Label (English)</Label>
                  <Input
                    value={form.labelEn}
                    onChange={(e) => setForm((f) => ({ ...f, labelEn: e.target.value }))}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label>Label (Arabic)</Label>
                  <Input
                    dir='rtl'
                    value={form.labelAr}
                    onChange={(e) => setForm((f) => ({ ...f, labelAr: e.target.value }))}
                  />
                </div>
              </div>
              <div className='grid gap-2'>
                <Label>Link type</Label>
                <Select
                  value={form.linkType}
                  onValueChange={(v) => setForm((f) => ({ ...f, linkType: v as 'page' | 'external' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='page'>Internal page</SelectItem>
                    <SelectItem value='external'>External URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.linkType === 'page' ? (
                <div className='grid gap-2'>
                  <Label>Page</Label>
                  <Select value={form.pageId} onValueChange={(v) => setForm((f) => ({ ...f, pageId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder='Select page' />
                    </SelectTrigger>
                    <SelectContent>
                      {pages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.titleEn} ({p.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className='grid gap-2'>
                  <Label>External URL</Label>
                  <Input
                    type='url'
                    placeholder='https://…'
                    value={form.externalUrl}
                    onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))}
                  />
                </div>
              )}
              <div className='grid gap-2'>
                <Label>Sort order</Label>
                <Input
                  type='number'
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
              <div className='flex items-center gap-2'>
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))}
                />
                <Label>Enabled</Label>
              </div>
              <div className='flex gap-2'>
                <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  {saveMutation.isPending ? 'Saving…' : editingId ? 'Save' : 'Add item'}
                </Button>
                {editingId ? (
                  <Button variant='outline' onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{placement === 'header' ? 'Header' : 'Footer'} items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className='w-24' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.labelEn}</TableCell>
                      <TableCell className='font-mono text-xs'>
                        {row.linkType === 'page' ? row.pageSlug : row.externalUrl}
                      </TableCell>
                      <TableCell>{row.sortOrder}</TableCell>
                      <TableCell>
                        <div className='flex gap-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => {
                              setEditingId(row.id)
                              setPlacement(row.placement)
                              setForm({
                                labelAr: row.labelAr,
                                labelEn: row.labelEn,
                                linkType: row.linkType,
                                pageId: row.pageId ?? '',
                                externalUrl: row.externalUrl ?? '',
                                sortOrder: String(row.sortOrder),
                                isEnabled: row.isEnabled,
                              })
                            }}
                          >
                            <Pencil className='size-4' />
                          </Button>
                          <Button variant='ghost' size='icon' onClick={() => setDeleteTarget(row)}>
                            <Trash2 className='size-4 text-destructive' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Main>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title='Delete menu item?'
        desc={`Remove "${deleteTarget?.labelEn ?? ''}" from the ${placement} menu?`}
        confirmText='Delete'
        destructive
        handleConfirm={() => void confirmDelete()}
      />
    </>
  )
}
