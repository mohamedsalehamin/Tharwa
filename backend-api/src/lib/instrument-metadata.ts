export type QuoteCategoryLabel = 'official' | 'indicative' | 'estimate';

/** Typed view of equity `Instrument.metadata` (metals use `MetalKaratRule` instead). */
export type EquityInstrumentMetadata = {
  tvSymbol?: string;
};

export type FxInstrumentMetadata = {
  quoteCategory?: QuoteCategoryLabel;
  /** Public path or absolute URL for consumer FX flag image. */
  flagUrl?: string;
};

export function parseEquityMetadata(metadata: unknown): EquityInstrumentMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  const m = metadata as Record<string, unknown>;
  const tvSymbol = typeof m.tvSymbol === 'string' ? m.tvSymbol.trim() : undefined;
  return tvSymbol ? { tvSymbol } : {};
}

export function parseFlagUrl(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const flagUrl = (metadata as Record<string, unknown>).flagUrl;
  return typeof flagUrl === 'string' && flagUrl.trim() ? flagUrl.trim() : undefined;
}

export function parseFxMetadata(metadata: unknown): FxInstrumentMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  const m = metadata as Record<string, unknown>;
  const out: FxInstrumentMetadata = {};
  const q = m.quoteCategory;
  if (q === 'official' || q === 'indicative' || q === 'estimate') {
    out.quoteCategory = q;
  }
  const flagUrl = parseFlagUrl(metadata);
  if (flagUrl) out.flagUrl = flagUrl;
  return out;
}

export function isQuoteCategoryLabel(value: string): value is QuoteCategoryLabel {
  return value === 'official' || value === 'indicative' || value === 'estimate';
}
