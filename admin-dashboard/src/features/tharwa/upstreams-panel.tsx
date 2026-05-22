import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  adminFetch,
  type InvalidateCacheResponse,
  type MarketCacheScope,
  type UpstreamCreateBody,
  type UpstreamHealthStatus,
  type UpstreamPatchBody,
  type UpstreamRow,
  type UpstreamType,
} from '@/lib/admin-api'
import { apiFetchUrl } from '@/lib/api'
import {
  formatAgeSince,
  healthStatusLabel,
  healthStatusVariant,
} from '@/lib/upstream-health'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

const UPSTREAM_TYPES: UpstreamType[] = ['fx', 'metals', 'equities']

type FormMode = 'create' | 'edit'

type UpstreamsPanelProps = {
  token: string | null
  superadmin: boolean
  upstreams: UpstreamRow[]
  summary?: Partial<Record<UpstreamHealthStatus, number>>
  thresholds?: { healthyMaxAgeSec: number; degradedMaxAgeSec: number }
  isLoading: boolean
  savingUpstreamId: string | null
  onActionError: (message: string | null) => void
  onPatchEnabled: (id: string, enabled: boolean) => Promise<void>
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const age = formatAgeSince(iso)
  return age ? `${new Date(iso).toLocaleString()} (${age})` : new Date(iso).toLocaleString()
}

function parseConfigJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed) return {}
  const parsed: unknown = JSON.parse(trimmed)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Config must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function configToText(config: Record<string, unknown>): string {
  if (Object.keys(config).length === 0) return '{}'
  return JSON.stringify(config, null, 2)
}

function emptyForm(mode: FormMode, row?: UpstreamRow) {
  if (mode === 'edit' && row) {
    return {
      name: row.name,
      type: row.type,
      enabled: row.enabled,
      configText: configToText(row.config),
      secretRef: row.secretRef ?? '',
      clearSecretRef: false,
    }
  }
  return {
    name: '',
    type: 'fx' as UpstreamType,
    enabled: true,
    configText: '{}',
    secretRef: '',
    clearSecretRef: false,
  }
}

export function UpstreamsPanel({
  token,
  superadmin,
  upstreams,
  summary,
  thresholds,
  isLoading,
  savingUpstreamId,
  onActionError,
  onPatchEnabled,
}: UpstreamsPanelProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('create')
  const [editRow, setEditRow] = useState<UpstreamRow | null>(null)
  const [form, setForm] = useState(() => emptyForm('create'))
  const [formErr, setFormErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UpstreamRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [invalidating, setInvalidating] = useState(false)

  const healthySec = thresholds?.healthyMaxAgeSec ?? 180
  const degradedSec = thresholds?.degradedMaxAgeSec ?? 600

  function openCreate() {
    setFormMode('create')
    setEditRow(null)
    setForm(emptyForm('create'))
    setFormErr(null)
    setDialogOpen(true)
  }

  function openEdit(row: UpstreamRow) {
    setFormMode('edit')
    setEditRow(row)
    setForm(emptyForm('edit', row))
    setFormErr(null)
    setDialogOpen(true)
  }

  async function invalidateOps() {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
  }

  async function invalidateMarketCache(scopes: MarketCacheScope[]) {
    if (!token) return
    setInvalidating(true)
    onActionError(null)
    try {
      const res = await adminFetch<InvalidateCacheResponse>('/admin/v1/ops/invalidate-cache', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes }),
      })
      toast.success(`Cleared ${res.deletedKeys.length} cache key(s)`)
      await invalidateOps()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onActionError(msg)
      toast.error(msg)
    } finally {
      setInvalidating(false)
    }
  }

  async function submitForm() {
    if (!token) return
    setFormErr(null)
    onActionError(null)
    let config: Record<string, unknown>
    try {
      config = parseConfigJson(form.configText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setFormErr(msg)
      return
    }

    const name = form.name.trim()
    if (!name) {
      setFormErr('Name is required')
      return
    }

    setSubmitting(true)
    try {
      if (formMode === 'create') {
        const body: UpstreamCreateBody = {
          name,
          type: form.type,
          enabled: form.enabled,
          config,
        }
        const ref = form.secretRef.trim()
        if (ref) body.secretRef = ref
        await adminFetch<{ item: UpstreamRow }>('/admin/v1/upstreams', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        toast.success('Upstream created')
      } else if (editRow) {
        const body: UpstreamPatchBody = {
          name,
          enabled: form.enabled,
          config,
        }
        if (form.clearSecretRef) {
          body.secretRef = null
        } else {
          const ref = form.secretRef.trim()
          if (ref && ref !== (editRow.secretRef ?? '')) {
            body.secretRef = ref
          }
        }
        await adminFetch<{ item: UpstreamRow }>(`/admin/v1/upstreams/${editRow.id}`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        toast.success('Upstream updated')
      }
      setDialogOpen(false)
      await invalidateOps()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setFormErr(msg)
      onActionError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    onActionError(null)
    try {
      await adminFetch<void>(`/admin/v1/upstreams/${deleteTarget.id}`, token, {
        method: 'DELETE',
      })
      toast.success('Upstream deleted')
      setDeleteTarget(null)
      await invalidateOps()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onActionError(msg)
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  const healthUrl = apiFetchUrl('/health')
  const metricsUrl = apiFetchUrl('/metrics')

  return (
    <>
      <Card>
        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-4'>
          <div className='space-y-2'>
            <CardTitle>Upstreams</CardTitle>
            <CardDescription>
              {superadmin
                ? 'Connector health from background polls. Healthy = last success within '
                : 'Connector health. Healthy = last success within '}
              <strong>{healthySec}s</strong>; degraded up to <strong>{degradedSec}s</strong>.
            </CardDescription>
            {summary ? (
              <div className='flex flex-wrap gap-2 pt-1'>
                {(
                  [
                    ['healthy', summary.healthy],
                    ['degraded', summary.degraded],
                    ['down', summary.down],
                    ['disabled', summary.disabled],
                    ['unknown', summary.unknown],
                  ] as const
                ).map(([status, count]) =>
                  count ? (
                    <Badge key={status} variant={healthStatusVariant(status)}>
                      {healthStatusLabel(status)}: {count}
                    </Badge>
                  ) : null,
                )}
              </div>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={invalidating}
              onClick={() => void invalidateMarketCache(['all'])}
            >
              <RefreshCw className={invalidating ? 'me-1 size-4 animate-spin' : 'me-1 size-4'} />
              Invalidate caches
            </Button>
            {superadmin ? (
              <Button size='sm' onClick={openCreate}>
                <Plus className='me-1 size-4' />
                Add upstream
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Alert>
            <AlertDescription className='space-y-2 text-sm'>
              <p>
                <strong>Recovery:</strong> fix credentials or upstream outage, toggle{' '}
                <em>Enabled</em> off/on if needed, then use <strong>Invalidate caches</strong> or
                wait for the next poll (~90s). Status updates when the background poller runs.
              </p>
              <p className='flex flex-wrap gap-3'>
                <a
                  href={healthUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline'
                >
                  API health
                  <ExternalLink className='size-3' />
                </a>
                <a
                  href={metricsUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline'
                >
                  Prometheus metrics
                  <ExternalLink className='size-3' />
                </a>
              </p>
            </AlertDescription>
          </Alert>

          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Secret ref</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead>Last error</TableHead>
                  {superadmin ? <TableHead className='w-[120px]' /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {upstreams.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className='font-medium'>{row.name}</TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>
                      <Badge variant={healthStatusVariant(row.status)}>
                        {healthStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={row.enabled}
                        disabled={savingUpstreamId === row.id}
                        onCheckedChange={(enabled) => void onPatchEnabled(row.id, enabled)}
                      />
                    </TableCell>
                    <TableCell className='max-w-[10rem] truncate font-mono text-xs'>
                      {row.secretRef ?? '—'}
                    </TableCell>
                    <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>
                      {formatTimestamp(row.lastSuccessAt)}
                    </TableCell>
                    <TableCell
                      className='max-w-xs truncate text-xs text-destructive'
                      title={row.lastError ?? undefined}
                    >
                      {row.lastError ?? '—'}
                    </TableCell>
                    {superadmin ? (
                      <TableCell>
                        <div className='flex gap-1'>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='size-8'
                            aria-label={`Edit ${row.name}`}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className='size-4' />
                          </Button>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='size-8 text-destructive'
                            aria-label={`Delete ${row.name}`}
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className='size-4' />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {!isLoading && upstreams.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={superadmin ? 8 : 7}
                      className='text-center text-muted-foreground'
                    >
                      No upstreams — run migration 0014_seed_upstream_connectors or add one.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? 'Add upstream' : 'Edit upstream'}</DialogTitle>
            <DialogDescription>
              Store env var names in <strong>secret ref</strong> (e.g.{' '}
              <code className='text-xs'>TELEGRAM_METALS_BOT_TOKEN</code>) — never paste API keys
              here.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='upstream-name'>Name</Label>
              <Input
                id='upstream-name'
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder='fx-primary'
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='upstream-type'>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as UpstreamType }))}
                disabled={formMode === 'edit'}
              >
                <SelectTrigger id='upstream-type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPSTREAM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-center gap-2'>
              <Switch
                id='upstream-enabled'
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
              />
              <Label htmlFor='upstream-enabled'>Enabled</Label>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='upstream-config'>Config (JSON)</Label>
              <Textarea
                id='upstream-config'
                className='min-h-[120px] font-mono text-xs'
                value={form.configText}
                onChange={(e) => setForm((f) => ({ ...f, configText: e.target.value }))}
                spellCheck={false}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='upstream-secret'>Secret ref (env var name)</Label>
              <Input
                id='upstream-secret'
                className='font-mono text-xs'
                value={form.secretRef}
                onChange={(e) => setForm((f) => ({ ...f, secretRef: e.target.value }))}
                placeholder='TELEGRAM_METALS_BOT_TOKEN'
                disabled={formMode === 'edit' && form.clearSecretRef}
              />
              {formMode === 'edit' ? (
                <div className='flex items-center gap-2'>
                  <Checkbox
                    id='upstream-clear-secret'
                    checked={form.clearSecretRef}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({
                        ...f,
                        clearSecretRef: checked === true,
                        secretRef: checked === true ? '' : f.secretRef,
                      }))
                    }
                  />
                  <Label htmlFor='upstream-clear-secret' className='font-normal text-muted-foreground'>
                    Clear secret ref
                  </Label>
                </div>
              ) : null}
            </div>
            {formErr ? <p className='text-sm text-destructive'>{formErr}</p> : null}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void submitForm()} disabled={submitting}>
              {submitting ? 'Saving…' : formMode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title='Delete upstream?'
        desc={
          deleteTarget
            ? `Remove "${deleteTarget.name}" (${deleteTarget.type}). This cannot be undone.`
            : ''
        }
        destructive
        confirmText='Delete'
        isLoading={deleting}
        handleConfirm={() => void confirmDelete()}
      />
    </>
  )
}
