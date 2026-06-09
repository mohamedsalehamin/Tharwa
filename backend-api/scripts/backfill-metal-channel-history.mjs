#!/usr/bin/env node
/**
 * One-off: paginate public t.me/s/@channel history and store parsed gold prices in quote_snapshots.
 *
 * Prerequisites:
 *   - Migration 0020 applied (metal sub-instruments)
 *   - DATABASE_URL points at target DB (production)
 *   - TELEGRAM_METALS_BOT_TOKEN + TELEGRAM_METALS_CHANNEL_ID (public @ handle)
 *
 * Usage:
 *   npm run build
 *   npm run backfill:metal-history
 *   npm run backfill:metal-history -- --dry-run --max-pages=5
 *   npm run backfill:metal-history -- --all
 *   npm run backfill:metal-history -- --since=2025-01-01 --max-pages=500
 */
import { runMetalChannelHistoryBackfillFromCli } from '../dist/services/metal-channel-history-backfill.js';

const result = await runMetalChannelHistoryBackfillFromCli(process.argv.slice(2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
