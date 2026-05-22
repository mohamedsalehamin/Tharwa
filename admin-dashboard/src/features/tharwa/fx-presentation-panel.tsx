import { useRef, useState } from 'react'
import {
  flagUrlFromMetadata,
  instrumentEditorKey,
  type InstrumentRow,
  type QuoteCategoryLabel,
} from '@/lib/admin-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const QUOTE_CATEGORIES: QuoteCategoryLabel[] = ['official', 'indicative', 'estimate']

function quoteCategoryFromMetadata(row: InstrumentRow): QuoteCategoryLabel {
  const m = row.metadata
  if (m && typeof m === 'object' && 'quoteCategory' in m) {
    const q = (m as { quoteCategory?: unknown }).quoteCategory
    if (q === 'official' || q === 'indicative' || q === 'estimate') return q
  }
  return 'official'
}

function buildFxMetadata(
  row: InstrumentRow,
  quoteCategory: QuoteCategoryLabel,
  flagUrl: string | null,
): Record<string, unknown> {
  const prev =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {}
  const next: Record<string, unknown> = { ...prev, quoteCategory }
  if (flagUrl) next.flagUrl = flagUrl
  else delete next.flagUrl
  return next
}

type FxPresentationPanelProps = {
  token: string | null
  rows: InstrumentRow[]
  isLoading: boolean
  savingInstrumentId: string | null
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
  onUploadFlag: (id: string, file: File) => Promise<string>
}

export function FxPresentationPanel({
  token,
  rows,
  isLoading,
  savingInstrumentId,
  onPatch,
  onUploadFlag,
}: FxPresentationPanelProps) {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))

  return (
    <div className='space-y-4'>
      <Alert>
        <AlertDescription>
          Toggle which FX pairs appear on the consumer home and FX screens. Upload a flag image
          (PNG, JPEG, WebP, or SVG, max 512 KB) per pair — shown in the mobile app next to the
          localized label.
        </AlertDescription>
      </Alert>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pair</TableHead>
            <TableHead>Flag</TableHead>
            <TableHead>Label (EN)</TableHead>
            <TableHead>Label (AR)</TableHead>
            <TableHead>Quote category</TableHead>
            <TableHead>Sort</TableHead>
            <TableHead>Visible</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <FxRowEditor
              key={instrumentEditorKey(row)}
              row={row}
              token={token}
              saving={savingInstrumentId === row.id}
              onSave={(body) => void onPatch(row.id, body)}
              onUploadFlag={(file) => onUploadFlag(row.id, file)}
            />
          ))}
          {!isLoading && sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className='text-center text-muted-foreground'>
                No FX instruments — run DB migrations (0012_seed_fx_metals_presentation).
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

function FxRowEditor({
  row,
  token,
  saving,
  onSave,
  onUploadFlag,
}: {
  row: InstrumentRow
  token: string | null
  saving: boolean
  onSave: (body: Record<string, unknown>) => void
  onUploadFlag: (file: File) => Promise<string>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [nameEn, setNameEn] = useState(row.displayNameEn)
  const [nameAr, setNameAr] = useState(row.displayNameAr)
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder))
  const [visible, setVisible] = useState(row.isConsumerVisible)
  const [quoteCategory, setQuoteCategory] = useState<QuoteCategoryLabel>(
    quoteCategoryFromMetadata(row),
  )
  const [flagUrl, setFlagUrl] = useState(flagUrlFromMetadata(row))
  const [uploadingFlag, setUploadingFlag] = useState(false)

  const dirty =
    nameEn !== row.displayNameEn ||
    nameAr !== row.displayNameAr ||
    Number(sortOrder) !== row.sortOrder ||
    visible !== row.isConsumerVisible ||
    quoteCategory !== quoteCategoryFromMetadata(row)

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
      <TableCell className='font-mono text-sm font-medium'>
        {row.code}/EGP
      </TableCell>
      <TableCell>
        <div className='flex flex-col items-start gap-2'>
          {flagUrl ? (
            <img
              src={flagUrl}
              alt=''
              className='size-9 rounded border object-cover'
            />
          ) : (
            <span className='text-xs text-muted-foreground'>No flag</span>
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
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          className='h-8'
          dir='rtl'
        />
      </TableCell>
      <TableCell>
        <Select
          value={quoteCategory}
          onValueChange={(v) => setQuoteCategory(v as QuoteCategoryLabel)}
        >
          <SelectTrigger className='h-8 w-[130px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUOTE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              metadata: buildFxMetadata(row, quoteCategory, flagUrl),
            })
          }
        >
          {saving ? '…' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  )
}
