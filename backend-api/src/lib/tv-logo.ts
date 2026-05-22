/** TradingView CDN symbol logos (SVG). */
export const TV_SYMBOL_LOGO_ORIGIN = 'https://s3-symbol-logo.tradingview.com';

/** Build logo URL from scanner `logoid` slug (e.g. `abou-kir-fertilizers`). */
export function logoUrlFromTvLogoid(logoid: string | null | undefined): string | null {
  const s = logoid?.trim();
  if (!s) return null;
  return `${TV_SYMBOL_LOGO_ORIGIN}/${encodeURIComponent(s)}.svg`;
}
