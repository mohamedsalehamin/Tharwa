import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { loadEnv } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { metalItemsFromEgyptParsed } from './connectors/metals.js';
import {
  fetchTmeChannelHistoryPage,
  normalizePriceText,
  parseGoldMessage,
  publicUsernameFromChannelId,
  type TmeChannelMessage,
} from './connectors/telegram-egypt-metals.js';
import {
  persistHistoricalMetalQuoteSnapshots,
  resetMetalInstrumentIdMapCache,
} from './metal-quote-snapshots.js';
import { resolveMetalsTelegramCredentials } from './upstream-credentials.js';

export type MetalChannelHistoryBackfillOptions = {
  /**
   * Max t.me pages to walk backwards (~20 posts each).
   * `0` or omitted with `fetchAll: true` = paginate until t.me has no older posts.
   */
  maxPages?: number;
  /** When true, ignore maxPages cap and walk back until pagination ends. */
  fetchAll?: boolean;
  /** Delay between page fetches to avoid rate limits. Default 1500ms. */
  delayMs?: number;
  /** Retries per page on transient fetch errors. Default 3. */
  maxRetries?: number;
  /** Skip DB writes and only report what would be stored. */
  dryRun?: boolean;
  /** Ignore posts older than this (UTC). */
  since?: Date;
  /** Ignore posts newer than this (UTC). */
  until?: Date;
  log?: Pick<FastifyBaseLogger, 'info' | 'warn' | 'debug'>;
};

export type MetalChannelHistoryBackfillResult = {
  ok: boolean;
  channelUsername: string | null;
  pagesFetched: number;
  messagesSeen: number;
  messagesParsed: number;
  snapshotsInserted: number;
  messagesSkippedDuplicate: number;
  messagesSkippedUnparsed: number;
  messagesSkippedDate: number;
  oldestMessageId: number | null;
  newestMessageId: number | null;
  oldestPostedAt: string | null;
  newestPostedAt: string | null;
  reason?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHistoryPageWithRetry(
  username: string,
  beforeMessageId: number | undefined,
  maxRetries: number,
  delayMs: number,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetchTmeChannelHistoryPage(username, { beforeMessageId });
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        await sleep(delayMs * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function resolvePublicChannelUsername(env: Env): Promise<string | null> {
  const creds = await resolveMetalsTelegramCredentials(env);
  if (!creds) return null;

  const fromId = publicUsernameFromChannelId(creds.channelId);
  if (fromId) return fromId;

  const q = new URLSearchParams({ chat_id: creds.channelId });
  const res = await fetch(`https://api.telegram.org/bot${creds.botToken}/getChat?${q}`);
  const body = (await res.json()) as { ok: boolean; result?: { username?: string } };
  if (!body.ok || !body.result?.username) return null;
  return body.result.username;
}

function inDateWindow(postedAt: Date, since?: Date, until?: Date): boolean {
  if (since && postedAt < since) return false;
  if (until && postedAt > until) return false;
  return true;
}

async function processHistoryMessage(
  env: Env,
  message: TmeChannelMessage,
  dryRun: boolean,
): Promise<{ kind: 'inserted' | 'duplicate' | 'unparsed'; inserted: number }> {
  const parsed = parseGoldMessage(normalizePriceText(message.text));
  if (!parsed) return { kind: 'unparsed', inserted: 0 };

  const withTs = {
    ...parsed,
    timestamp: message.postedAt.toISOString(),
  };
  const items = await metalItemsFromEgyptParsed(env, withTs, message.postedAt);
  if (dryRun) return { kind: 'inserted', inserted: items.length };

  const { inserted, skipped } = await persistHistoricalMetalQuoteSnapshots(items, {
    telegramMessageId: message.messageId,
    source: 'telegram_history',
  });
  if (skipped || inserted === 0) return { kind: 'duplicate', inserted: 0 };
  return { kind: 'inserted', inserted };
}

export async function backfillMetalChannelHistory(
  env: Env,
  opts: MetalChannelHistoryBackfillOptions = {},
): Promise<MetalChannelHistoryBackfillResult> {
  const log = opts.log;
  const fetchAll = opts.fetchAll ?? false;
  const maxPages = fetchAll ? Number.POSITIVE_INFINITY : (opts.maxPages ?? 200);
  const delayMs = opts.delayMs ?? 1500;
  const maxRetries = opts.maxRetries ?? 3;
  const dryRun = opts.dryRun ?? false;

  resetMetalInstrumentIdMapCache();

  const result: MetalChannelHistoryBackfillResult = {
    ok: false,
    channelUsername: null,
    pagesFetched: 0,
    messagesSeen: 0,
    messagesParsed: 0,
    snapshotsInserted: 0,
    messagesSkippedDuplicate: 0,
    messagesSkippedUnparsed: 0,
    messagesSkippedDate: 0,
    oldestMessageId: null,
    newestMessageId: null,
    oldestPostedAt: null,
    newestPostedAt: null,
  };

  const username = await resolvePublicChannelUsername(env);
  result.channelUsername = username;
  if (!username) {
    result.reason = 'no_public_channel_username';
    log?.warn(
      'metal history backfill: need a public @channel handle (or bot getChat username). Numeric -100… channels cannot use t.me history.',
    );
    return result;
  }

  let beforeMessageId: number | undefined;
  let oldestPostedAt: Date | null = null;
  let newestPostedAt: Date | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    let messages: TmeChannelMessage[];
    let hasPublicPostFeed: boolean;
    try {
      ({ messages, hasPublicPostFeed } = await fetchHistoryPageWithRetry(
        username,
        beforeMessageId,
        maxRetries,
        delayMs,
      ));
    } catch (e) {
      result.reason = 'fetch_failed';
      log?.warn({ err: e, page: page + 1, beforeMessageId }, 'metal history backfill: page fetch failed');
      break;
    }
    result.pagesFetched += 1;

    if (!hasPublicPostFeed) {
      result.reason = page === 0 ? 'no_public_post_feed' : 'pagination_end';
      break;
    }
    if (messages.length === 0) {
      result.reason = 'pagination_end';
      break;
    }

    const oldestOnPage = messages[0]!;
    const newestOnPage = messages[messages.length - 1]!;
    result.oldestMessageId =
      result.oldestMessageId == null
        ? oldestOnPage.messageId
        : Math.min(result.oldestMessageId, oldestOnPage.messageId);
    result.newestMessageId =
      result.newestMessageId == null
        ? newestOnPage.messageId
        : Math.max(result.newestMessageId, newestOnPage.messageId);
    if (!oldestPostedAt || oldestOnPage.postedAt < oldestPostedAt) {
      oldestPostedAt = oldestOnPage.postedAt;
    }
    if (!newestPostedAt || newestOnPage.postedAt > newestPostedAt) {
      newestPostedAt = newestOnPage.postedAt;
    }

    for (const message of messages) {
      result.messagesSeen += 1;
      if (!inDateWindow(message.postedAt, opts.since, opts.until)) {
        result.messagesSkippedDate += 1;
        continue;
      }

      const outcome = await processHistoryMessage(env, message, dryRun);
      if (outcome.kind === 'unparsed') {
        result.messagesSkippedUnparsed += 1;
        continue;
      }
      if (outcome.kind === 'duplicate') {
        result.messagesSkippedDuplicate += 1;
        continue;
      }

      result.messagesParsed += 1;
      result.snapshotsInserted += outcome.inserted;
    }

    const nextBefore = oldestOnPage.messageId;
    if (beforeMessageId != null && nextBefore >= beforeMessageId) {
      result.reason = 'pagination_stuck';
      break;
    }
    beforeMessageId = nextBefore;

    log?.info(
      {
        page: page + 1,
        beforeMessageId,
        oldestOnPage: oldestOnPage.postedAt.toISOString(),
        messagesOnPage: messages.length,
        snapshotsInserted: result.snapshotsInserted,
      },
      'metal history backfill: page done',
    );

    if (page + 1 < maxPages) {
      await sleep(delayMs);
    }
  }

  result.oldestPostedAt = oldestPostedAt?.toISOString() ?? null;
  result.newestPostedAt = newestPostedAt?.toISOString() ?? null;
  result.ok = result.snapshotsInserted > 0 || result.messagesSkippedDuplicate > 0;
  if (!result.reason) {
    result.reason = fetchAll || result.pagesFetched < maxPages ? 'completed' : 'max_pages_reached';
  }
  return result;
}

/** CLI entrypoint — loads env from process, runs backfill, disconnects Prisma. */
export async function runMetalChannelHistoryBackfillFromCli(
  argv: string[] = process.argv.slice(2),
): Promise<MetalChannelHistoryBackfillResult> {
  const env = loadEnv();
  const opts: MetalChannelHistoryBackfillOptions = {
    dryRun: argv.includes('--dry-run'),
    fetchAll: argv.includes('--all'),
    log: console,
  };

  for (const arg of argv) {
    if (arg.startsWith('--max-pages=')) {
      opts.maxPages = Number.parseInt(arg.split('=')[1] ?? '', 10);
    } else if (arg === '--all') {
      opts.fetchAll = true;
    } else if (arg.startsWith('--delay-ms=')) {
      opts.delayMs = Number.parseInt(arg.split('=')[1] ?? '', 10);
    } else if (arg.startsWith('--since=')) {
      opts.since = new Date(arg.split('=')[1] ?? '');
    } else if (arg.startsWith('--until=')) {
      opts.until = new Date(arg.split('=')[1] ?? '');
    }
  }

  try {
    return await backfillMetalChannelHistory(env, opts);
  } finally {
    await prisma.$disconnect();
  }
}
