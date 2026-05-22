import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import {
  adminFetch,
  flagUrlFromMetadata,
  instrumentEditorKey,
  type InstrumentRow,
  type KaratRuleRow,
} from '@/lib/admin-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { toast } from 'sonner'

const DEFAULT_RULES: KaratRuleRow[] = [
  { karat: 24, unit: 'gram', priceNumerator: 24, priceDenominator: 24, sortOrder: 0, isActive: true },
  { karat: 21, unit: 'gram', priceNumerator: 21, priceDenominator: 24, sortOrder: 1, isActive: true },
  { karat: 18, unit: 'gram', priceNumerator: 18, priceDenominator: 24, sortOrder: 2, isActive: true },
  {
    karat: null,
    unit: 'troy_ounce',
    priceNumerator: 1,
    priceDenominator: 1,
    sortOrder: 3,
    isActive: true,
  },
]

type MetalsPresentationPanelProps = {
  token: string | null
  rows: InstrumentRow[]
  isLoading: boolean
  savingInstrumentId: string | null
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
  onUploadFlag: (id: string, file: File) => Promise<string>
  onActionError: (message: string | null) => void
}

export function MetalsPresentationPanel({
  token,
  rows,
  isLoading,
  savingInstrumentId,
  onPatch,
  onUploadFlag,
  onActionError,
}: MetalsPresentationPanelProps) {
  const queryClient = useQueryClient()
  const [karatInstrument, setKaratInstrument] = useState<InstrumentRow | null>(null)
  const [rules, setRules] = useState<KaratRuleRow[]>([])
  const [loadingRules, setLoadingRules] = useState(false)
  const [savingRules, setSavingRules] = useState(false)
  const [rulesErr, setRulesErr] = useState<string | null>(null)

  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  const goldCode = 'GOLD_EGP'

  useEffect(() => {
    if (!karatInstrument || !token) return
    let cancelled = false
    void adminFetch<{ items: KaratRuleRow[] }>(
      `/admin/v1/instruments/${karatInstrument.id}/karat-rules`,
      token,
    )
      .then((res) => {
        if (cancelled) return
        setRules(res.items?.length ? res.items : DEFAULT_RULES)
      })
      .catch((e) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setRulesErr(msg)
        setRules(DEFAULT_RULES)
      })
      .finally(() => {
        if (!cancelled) setLoadingRules(false)
      })
    return () => {
      cancelled = true
    }
  }, [karatInstrument, token])

  async function saveKaratRules() {
    if (!token || !karatInstrument) return
    setSavingRules(true)
    setRulesErr(null)
    onActionError(null)
    try {
      await adminFetch(`/admin/v1/instruments/${karatInstrument.id}/karat-rules`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
      toast.success('Karat rules saved')
      setKaratInstrument(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'instruments'] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRulesErr(msg)
      onActionError(msg)
      toast.error(msg)
    } finally {
      setSavingRules(false)
    }
  }

  function updateRule(index: number, patch: Partial<KaratRuleRow>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        karat: 21,
        unit: 'gram',
        priceNumerator: 21,
        priceDenominator: 24,
        sortOrder: prev.length,
        isActive: true,
      },
    ])
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className='space-y-4'>
      <Alert>
        <AlertDescription>
          Control whether gold and silver quotes appear for consumers. Upload an icon per metal
          (shown next to titles in the app). Gold karat rows (18k / 21k / 24k / oz) are derived
          from the 24k anchor using the rules below.
        </AlertDescription>
      </Alert>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Instrument</TableHead>
            <TableHead>Icon</TableHead>
            <TableHead>Name (EN)</TableHead>
            <TableHead>Sort</TableHead>
            <TableHead>Visible</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <MetalRowEditor
              key={instrumentEditorKey(row)}
              row={row}
              token={token}
              saving={savingInstrumentId === row.id}
              onSave={(body) => void onPatch(row.id, body)}
              onUploadFlag={(file) => onUploadFlag(row.id, file)}
              onEditKarat={
                row.code === goldCode
                  ? () => {
                      setKaratInstrument(row)
                      setRules(DEFAULT_RULES)
                      setRulesErr(null)
                      setLoadingRules(true)
                    }
                  : undefined
              }
            />
          ))}
          {!isLoading && sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className='text-center text-muted-foreground'>
                No metal instruments — run DB migrations.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <Dialog
        open={!!karatInstrument}
        onOpenChange={(open) => {
          if (!open) {
            setKaratInstrument(null)
            setRulesErr(null)
          }
        }}
      >
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Karat presentation — {karatInstrument?.code}</DialogTitle>
            <DialogDescription>
              Price = 24k gram anchor × (numerator ÷ denominator). Troy oz uses gram × 31.1034768 ×
              ratio. Inactive rules are omitted from consumer responses.
            </DialogDescription>
          </DialogHeader>
          {loadingRules ? (
            <p className='text-sm text-muted-foreground'>Loading rules…</p>
          ) : (
            <div className='space-y-3'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Karat</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Num</TableHead>
                    <TableHead>Den</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          className='h-8 w-16 font-mono text-xs'
                          placeholder='—'
                          value={rule.karat ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.trim()
                            updateRule(idx, {
                              karat: v === '' ? null : Number(v),
                            })
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={rule.unit}
                          onValueChange={(v) =>
                            updateRule(idx, { unit: v as 'gram' | 'troy_ounce' })
                          }
                        >
                          <SelectTrigger className='h-8 w-[110px]'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='gram'>gram</SelectItem>
                            <SelectItem value='troy_ounce'>troy oz</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type='number'
                          className='h-8 w-14'
                          value={rule.priceNumerator}
                          onChange={(e) =>
                            updateRule(idx, { priceNumerator: Number(e.target.value) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type='number'
                          className='h-8 w-14'
                          value={rule.priceDenominator}
                          onChange={(e) =>
                            updateRule(idx, { priceDenominator: Number(e.target.value) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type='number'
                          className='h-8 w-14'
                          value={rule.sortOrder}
                          onChange={(e) => updateRule(idx, { sortOrder: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(isActive) => updateRule(idx, { isActive })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          disabled={rules.length <= 1}
                          onClick={() => removeRule(idx)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className='flex flex-wrap gap-2'>
                <Button type='button' size='sm' variant='outline' onClick={addRule}>
                  Add row
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => setRules(DEFAULT_RULES)}
                >
                  Reset to defaults
                </Button>
              </div>
              {rulesErr ? <p className='text-sm text-destructive'>{rulesErr}</p> : null}
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setKaratInstrument(null)} disabled={savingRules}>
              Cancel
            </Button>
            <Button onClick={() => void saveKaratRules()} disabled={savingRules || loadingRules}>
              {savingRules ? 'Saving…' : 'Save rules'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MetalRowEditor({
  row,
  token,
  saving,
  onSave,
  onUploadFlag,
  onEditKarat,
}: {
  row: InstrumentRow
  token: string | null
  saving: boolean
  onSave: (body: Record<string, unknown>) => void
  onUploadFlag: (file: File) => Promise<string>
  onEditKarat?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [nameEn, setNameEn] = useState(row.displayNameEn)
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder))
  const [visible, setVisible] = useState(row.isConsumerVisible)
  const [flagUrl, setFlagUrl] = useState(flagUrlFromMetadata(row))
  const [uploadingFlag, setUploadingFlag] = useState(false)

  const dirty =
    nameEn !== row.displayNameEn ||
    Number(sortOrder) !== row.sortOrder ||
    visible !== row.isConsumerVisible

  async function handleFlagFile(file: File | undefined) {
    if (!file || !token) return
    setUploadingFlag(true)
    try {
      const url = await onUploadFlag(file)
      setFlagUrl(url)
    } finally {
      setUploadingFlag(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <TableRow>
      <TableCell className='font-mono text-xs'>{row.code}</TableCell>
      <TableCell>
        <div className='flex flex-col items-start gap-2'>
          {flagUrl ? (
            <img src={flagUrl} alt='' className='size-9 rounded-full border object-cover' />
          ) : (
            <span className='text-xs text-muted-foreground'>No icon</span>
          )}
          <input
            ref={fileRef}
            type='file'
            accept='image/png,image/jpeg,image/webp,image/svg+xml'
            className='hidden'
            onChange={(e) => void handleFlagFile(e.target.files?.[0])}
          />
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={!token || uploadingFlag || saving}
            onClick={() => fileRef.current?.click()}
          >
            {uploadingFlag ? 'Uploading…' : flagUrl ? 'Replace' : 'Upload'}
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className='h-8' />
      </TableCell>
      <TableCell>
        <Input
          type='number'
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className='h-8 w-16'
        />
      </TableCell>
      <TableCell>
        <Switch checked={visible} onCheckedChange={setVisible} />
      </TableCell>
      <TableCell className='flex gap-1'>
        <Button
          size='sm'
          variant='secondary'
          disabled={!dirty || saving}
          onClick={() =>
            onSave({
              displayNameEn: nameEn,
              sortOrder: Number(sortOrder),
              isConsumerVisible: visible,
            })
          }
        >
          {saving ? '…' : 'Save'}
        </Button>
        {onEditKarat ? (
          <Button size='sm' variant='outline' onClick={onEditKarat}>
            <Settings2 className='me-1 size-3.5' />
            Karat rules
          </Button>
        ) : (
          <span className='self-center text-xs text-muted-foreground'>Spot only</span>
        )}
      </TableCell>
    </TableRow>
  )
}
