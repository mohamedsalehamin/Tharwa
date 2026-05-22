#!/usr/bin/env node
/**
 * Smoke-check EGX movers: Arabic `nameAr` from TradingView scanner + optional `displayName` with `locale=ar`.
 * Requires a running API (default http://127.0.0.1:3000).
 *
 * Usage: npm run verify:movers
 *    or: API_BASE=http://192.168.1.5:3000 npm run verify:movers
 */
const base = (process.env.API_BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

function hasArabic(s) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s);
}

async function get(path) {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${path} -> HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const plain = await get('/v1/stocks/egypt/movers?list=losers&limit=12&offset=0');
  const ar = await get('/v1/stocks/egypt/movers?list=losers&limit=12&offset=0&locale=ar');

  const items = plain.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    console.error('No mover items returned.');
    process.exit(1);
  }

  const withScannerAr = items.filter((it) => it.nameAr && hasArabic(String(it.nameAr)));
  const withDisplayAr = (ar.items ?? []).filter((it) => it.displayName && hasArabic(String(it.displayName)));

  console.log(`GET movers (plain): ${items.length} items`);
  for (const it of items.slice(0, 6)) {
    const arPreview = it.nameAr ? String(it.nameAr).slice(0, 48) : '—';
    console.log(`  ${it.symbol}\tname="${String(it.name).slice(0, 40)}"\tnameAr="${arPreview}"`);
  }

  console.log(`\nArabic nameAr (scanner or DB): ${withScannerAr.length} / ${items.length}`);
  console.log(`Arabic displayName (locale=ar): ${withDisplayAr.length} / ${(ar.items ?? []).length}`);

  if (withScannerAr.length === 0) {
    console.error(
      '\nFAIL: Expected at least one mover with Arabic `nameAr` (TradingView description + lang=ar, or DB).',
    );
    process.exit(1);
  }

  if (withDisplayAr.length === 0) {
    console.error('\nFAIL: Expected at least one `displayName` with Arabic when locale=ar.');
    process.exit(1);
  }

  console.log('\nOK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
