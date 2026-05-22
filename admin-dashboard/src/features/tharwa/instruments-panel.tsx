import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import {
  adminFetch,
  type EgxSearchHit,
  type EquityCreateBody,
  type InstrumentKind,
  type InstrumentRow,
} from '@/lib/admin-api'
import { FxPresentationPanel } from '@/features/tharwa/fx-presentation-panel'
import { MetalsPresentationPanel } from '@/features/tharwa/metals-presentation-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

const KIND_TABS: { value: 'all' | InstrumentKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'equity', label: 'Equities' },
  { value: 'fx', label: 'FX' },
  { value: 'metal', label: 'Metals' },
]

function tvSymbolFromMetadata(row: InstrumentRow): string | null {
  const m = row.metadata
  if (m && typeof m === 'object' && 'tvSymbol' in m) {
    const v = (m as { tvSymbol?: unknown }).tvSymbol
    return typeof v === 'string' && v.length > 0 ? v : null
  }
  return null
}

type InstrumentsPanelProps = {
  token: string | null
  items: InstrumentRow[]
  isLoading: boolean
  savingInstrumentId: string | null
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
  onUploadInstrumentFlag: (id: string, file: File) => Promise<string>
  onActionError: (message: string | null) => void
}

export function InstrumentsPanel({
  token,
  items,
  isLoading,
  savingInstrumentId,
  onPatch,
  onUploadInstrumentFlag,
  onActionError,
}: InstrumentsPanelProps) {
  const queryClient = useQueryClient()
  const [kindFilter, setKindFilter] = useState<'all' | InstrumentKind>('equity')
  const [addOpen, setAddOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchHits, setSearchHits] = useState<EgxSearchHit[]>([])
  const [code, setCode] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [tvSymbol, setTvSymbol] = useState('')
  const [visibleOnCreate, setVisibleOnCreate] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const filtered = useMemo(() => {
    if (kindFilter === 'all') return items
    return items.filter((r) => r.kind === kindFilter)
  }, [items, kindFilter])

  const tabDescription =
    kindFilter === 'fx'
      ? 'Manage FX pair visibility and consumer quote category labels.'
      : kindFilter === 'metal'
        ? 'Manage gold/silver visibility and gold karat presentation rules.'
        : kindFilter === 'equity'
          ? 'Curate the EGX symbol list shown in the mobile app.'
          : 'All instrument kinds — use tabs to focus FX or metals.'

  const searchQTrimmed = searchQ.trim()
  const displaySearchHits = searchQTrimmed.length < 2 ? [] : searchHits

  useEffect(() => {
    if (!addOpen || !token) return
    const q = searchQ.trim()
    if (q.length < 2) return
    const t = window.setTimeout(() => {
      setSearching(true)
      void adminFetch<{ items: EgxSearchHit[] }>(
        `/admin/v1/instruments/egx-search?${new URLSearchParams({ q, limit: '15' })}`,
        token,
      )
        .then((res) => setSearchHits(res.items ?? []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => window.clearTimeout(t)
  }, [addOpen, searchQ, token])

  function resetAddForm() {
    setSearchQ('')
    setSearchHits([])
    setCode('')
    setNameEn('')
    setNameAr('')
    setTvSymbol('')
    setVisibleOnCreate(false)
    setFormErr(null)
  }

  function applySearchHit(hit: EgxSearchHit) {
    setCode(hit.symbol)
    setNameEn(hit.description)
    setNameAr(hit.description)
    setTvSymbol(hit.tvSymbol)
    if (hit.alreadyExists) {
      setFormErr(`Already in catalog (${hit.symbol})`)
    } else {
      setFormErr(null)
    }
  }

  async function createEquity() {
    if (!token) return
    const c = code.trim().toUpperCase()
    const en = nameEn.trim()
    if (!c || !en) {
      setFormErr('Code and English name are required')
      return
    }
    setSubmitting(true)
    setFormErr(null)
    onActionError(null)
    const body: EquityCreateBody = {
      code: c,
      displayNameEn: en,
      isConsumerVisible: visibleOnCreate,
    }
    const ar = nameAr.trim()
    if (ar) body.displayNameAr = ar
    const tv = tvSymbol.trim()
    if (tv) body.metadata = { tvSymbol: tv }

    try {
      await adminFetch<{ item: InstrumentRow }>('/admin/v1/instruments', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      toast.success(`Added ${c}`)
      setAddOpen(false)
      resetAddForm()
      await queryClient.invalidateQueries({ queryKey: ['admin', 'instruments'] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setFormErr(msg)
      onActionError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Card className='mb-6'>
        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-4'>
          <div className='space-y-3'>
            <CardDescription>{tabDescription}</CardDescription>
            <Tabs
              value={kindFilter}
              onValueChange={(v) => setKindFilter(v as 'all' | InstrumentKind)}
            >
              <TabsList>
                {KIND_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {kindFilter === 'equity' ? (
            <Button
              size='sm'
              onClick={() => {
                resetAddForm()
                setAddOpen(true)
              }}
            >
              <Plus className='me-1 size-4' />
              Add EGX symbol
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {kindFilter === 'fx' ? (
            <FxPresentationPanel
              token={token}
              rows={filtered}
              isLoading={isLoading}
              savingInstrumentId={savingInstrumentId}
              onPatch={onPatch}
              onUploadFlag={onUploadInstrumentFlag}
            />
          ) : kindFilter === 'metal' ? (
            <MetalsPresentationPanel
              token={token}
              rows={filtered}
              isLoading={isLoading}
              savingInstrumentId={savingInstrumentId}
              onPatch={onPatch}
              onUploadFlag={onUploadInstrumentFlag}
              onActionError={onActionError}
            />
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Kind</TableHead>
                    {kindFilter === 'equity' || kindFilter === 'all' ? (
                      <TableHead>TV symbol</TableHead>
                    ) : null}
                    <TableHead>Name (EN)</TableHead>
                    <TableHead>Name (AR)</TableHead>
                    <TableHead>Sort</TableHead>
                    <TableHead>Visible</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <InstrumentRowEditor
                      key={row.id}
                      row={row}
                      showTv={kindFilter === 'equity' || kindFilter === 'all'}
                      saving={savingInstrumentId === row.id}
                      onSave={(body) => void onPatch(row.id, body)}
                    />
                  ))}
                  {!isLoading && filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={kindFilter === 'equity' || kindFilter === 'all' ? 8 : 7}
                        className='text-center text-muted-foreground'
                      >
                        No instruments in this category
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) resetAddForm()
        }}
      >
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>Add EGX symbol</DialogTitle>
            <DialogDescription>
              Search TradingView or enter a ticker manually. New symbols are hidden from consumers
              until you enable visibility.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='egx-search'>Search EGX</Label>
              <div className='relative'>
                <Search className='absolute start-2 top-2.5 size-4 text-muted-foreground' />
                <Input
                  id='egx-search'
                  className='ps-8'
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder='COMI, CIB, …'
                />
              </div>
              {searching ? (
                <p className='text-xs text-muted-foreground'>Searching…</p>
              ) : null}
              {displaySearchHits.length > 0 ? (
                <ul className='max-h-40 overflow-y-auto rounded-md border text-sm'>
                  {displaySearchHits.map((hit) => (
                    <li key={hit.symbol}>
                      <button
                        type='button'
                        className='flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-muted'
                        onClick={() => applySearchHit(hit)}
                      >
                        <span>
                          <span className='font-mono font-medium'>{hit.symbol}</span>
                          <span className='ms-2 text-muted-foreground'>{hit.description}</span>
                        </span>
                        {hit.alreadyExists ? (
                          <Badge variant='secondary'>In catalog</Badge>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='eq-code'>Ticker code</Label>
              <Input
                id='eq-code'
                className='font-mono'
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder='COMI'
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='eq-tv'>TradingView symbol</Label>
              <Input
                id='eq-tv'
                className='font-mono text-xs'
                value={tvSymbol}
                onChange={(e) => setTvSymbol(e.target.value)}
                placeholder='EGX:COMI'
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='eq-name-en'>Name (EN)</Label>
              <Input
                id='eq-name-en'
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='eq-name-ar'>Name (AR)</Label>
              <Input
                id='eq-name-ar'
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
              />
            </div>
            <div className='flex items-center gap-2'>
              <Switch
                id='eq-visible'
                checked={visibleOnCreate}
                onCheckedChange={setVisibleOnCreate}
              />
              <Label htmlFor='eq-visible'>Visible to consumers immediately</Label>
            </div>
            {formErr ? <p className='text-sm text-destructive'>{formErr}</p> : null}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setAddOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void createEquity()} disabled={submitting}>
              {submitting ? 'Adding…' : 'Add symbol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function InstrumentRowEditor({
  row,
  showTv,
  saving,
  onSave,
}: {
  row: InstrumentRow
  showTv: boolean
  saving: boolean
  onSave: (body: Record<string, unknown>) => void
}) {
  const [nameEn, setNameEn] = useState(row.displayNameEn)
  const [nameAr, setNameAr] = useState(row.displayNameAr)
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder))
  const [visible, setVisible] = useState(row.isConsumerVisible)
  const tv = tvSymbolFromMetadata(row)

  const dirty =
    nameEn !== row.displayNameEn ||
    nameAr !== row.displayNameAr ||
    Number(sortOrder) !== row.sortOrder ||
    visible !== row.isConsumerVisible

  return (
    <TableRow>
      <TableCell className='font-mono text-xs'>{row.code}</TableCell>
      <TableCell>{row.kind}</TableCell>
      {showTv ? (
        <TableCell className='font-mono text-xs text-muted-foreground'>{tv ?? '—'}</TableCell>
      ) : null}
      <TableCell>
        <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className='h-8' />
      </TableCell>
      <TableCell>
        <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className='h-8' />
      </TableCell>
      <TableCell>
        <Input
          type='number'
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className='h-8 w-20'
        />
      </TableCell>
      <TableCell>
        <Switch checked={visible} onCheckedChange={setVisible} />
      </TableCell>
      <TableCell>
        <Button
          size='sm'
          variant='secondary'
          disabled={!dirty || saving}
          onClick={() =>
            onSave({
              displayNameEn: nameEn,
              displayNameAr: nameAr,
              sortOrder: Number(sortOrder),
              isConsumerVisible: visible,
            })
          }
        >
          {saving ? '…' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  )
}
