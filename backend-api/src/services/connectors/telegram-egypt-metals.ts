import type { FastifyBaseLogger } from 'fastify';

/**
 * Egyptian market gold/silver from a Telegram channel — same idea as Dashboard/server/gold.py:
 * pinned message (getChat) + public https://t.me/s/<username> preview scrape + optional one-shot
 * `getUpdates` peek (`TELEGRAM_METALS_PEEK_UPDATES`); Arabic price parsing.
 * Long-polling the same bot token from two processes causes Telegram 409 — peek is optional for that reason.
 */

const MIN_KARAT_EGP = 200;

const AR_TO_WEST = '٠١٢٣٤٥٦٧٨٩'.split('').reduce<Record<string, string>>((acc, ar, i) => {
  acc[ar] = String(i);
  return acc;
}, {});

export type EgyptParsedPrices = {
  timestamp: string | null;
  karat_18: number | null;
  karat_21: number | null;
  karat_24: number | null;
  spread_21: number | null;
  silver_local: number | null;
  gold_pound: number | null;
  ounce_egp: number | null;
  ounce_usd: number | null;
  dollar_saga: number | null;
  dollar_parallel: number | null;
  dollar_official: number | null;
};

const PRICE_KEYS: (keyof Omit<EgyptParsedPrices, 'timestamp'>)[] = [
  'karat_18',
  'karat_21',
  'karat_24',
  'spread_21',
  'silver_local',
  'gold_pound',
  'ounce_egp',
  'ounce_usd',
  'dollar_saga',
  'dollar_parallel',
  'dollar_official',
];

function emptyPriceRow(): EgyptParsedPrices {
  const row = { timestamp: null } as EgyptParsedPrices;
  for (const k of PRICE_KEYS) {
    row[k] = null;
  }
  return row;
}

function karat21IsValid(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= MIN_KARAT_EGP;
}

export function normalizePriceText(text: string): string {
  if (!text) return text;
  let t = text;
  for (const ch of ['\ufeff', '\u200c', '\u200d', '\u2066', '\u2067', '\u2068', '\u2069']) {
    t = t.split(ch).join('');
  }
  let out = '';
  for (const ch of t) {
    out += AR_TO_WEST[ch] ?? ch;
  }
  out = out.replaceAll('٫', '.').replaceAll('٬', ',').replaceAll('،', ',');
  // Emoji variation selectors (common in Telegram); strip so regex sees adjacent letters/digits.
  out = out.split('\uFE0F').join('');
  // Some channels use Unicode “low line” instead of ASCII underscore in templates.
  out = out.replace(/\u2017/g, '_').replace(/\uFF3F/g, '_');
  // Templates like "عيار_21_     6965ج" → spaced "عيار 21 …" (robust across regex engines).
  out = out.replace(/عيار_+([0-9]+)_+/g, 'عيار $1 ');
  out = out.replace(/عيار_+([0-9]+)(?=\s|[^\d]|$)/g, 'عيار $1 ');
  // Channel posts are often one physical line: "…💍 عيار 21 … 💍 عيار 24 … 🔺 فرق …".
  // Split on broadcast markers so `karatLineIsSpreadNotKarat` does not skip the whole line.
  out = out.replace(/💍/g, '\n💍').replace(/🔺/g, '\n🔺').replace(/🕛/g, '\n🕛');
  return out;
}

function messageBody(msg: { text?: string; caption?: string } | null | undefined): string | null {
  if (!msg) return null;
  const raw = ((msg.text ?? '') || (msg.caption ?? '')).trim();
  return raw || null;
}

function parseNumToken(raw: string): number | null {
  const s = raw.trim().replaceAll(',', '').replaceAll('،', '').replaceAll(' ', '');
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function firstMatchFloat(patterns: string[], t: string): number | null {
  const flags = 'ms';
  for (const p of patterns) {
    const m = new RegExp(p, flags).exec(t);
    if (m?.[1]) {
      const v = parseNumToken(m[1]);
      if (v !== null) return v;
    }
  }
  return null;
}

function karatLineIsSpreadNotKarat(line: string, k: number): boolean {
  return line.includes('فرق') && line.includes('عيار') && line.includes(String(k));
}

function karat(text: string, k: number): number | null {
  const ks = String(k);
  const h = '[ \\t]*';
  const linePatterns = [
    new RegExp(`عيار[_\\t ]*${ks}[_\\t ]*[:=\\-]?${h}([0-9,.]+)${h}ج`, 'm'),
    new RegExp(`عيار[_\\t ]*${ks}${h}[:=\\-]${h}([0-9,.]+)${h}ج`, 'm'),
    new RegExp(`عيار[_\\t ]*${ks}\\W+([0-9,.]+)${h}ج`, 'm'),
    new RegExp(`عيار[_\\t ]*${ks}[_\\t ]*[:=\\-]?${h}([0-9,.]+)${h}$`, 'm'),
    new RegExp(`عيار${ks}[:=\\t \\-]*([0-9,.]+)${h}ج`, 'm'),
  ];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('عيار') || !trimmed.includes(ks)) continue;
    if (!new RegExp(`عيار[_\\t ]*${ks}`).test(trimmed)) continue;
    if (karatLineIsSpreadNotKarat(trimmed, k)) continue;

    for (const p of linePatterns) {
      const m = p.exec(trimmed);
      if (m?.[1]) {
        const v = parseNumToken(m[1]);
        if (v !== null && v >= MIN_KARAT_EGP) return v;
      }
    }
    const mEnd = new RegExp(`([0-9,.]+)${h}ج${h}$`).exec(trimmed);
    if (mEnd?.[1] && new RegExp(`عيار[_\\t ]*${ks}`).test(trimmed)) {
      const v = parseNumToken(mEnd[1]);
      if (v !== null && v >= MIN_KARAT_EGP) return v;
    }
    const mLoose = new RegExp(`عيار[_\\t ]*${ks}[^\\d٠-٩0-9]+([0-9,.]+)`).exec(trimmed);
    if (mLoose?.[1]) {
      const v = parseNumToken(mLoose[1]);
      if (v !== null && v >= MIN_KARAT_EGP) return v;
    }
  }
  return null;
}

export function parseGoldMessage(text: string): EgyptParsedPrices | null {
  const normalized = normalizePriceText(text);
  if (!normalized.includes('عيار') && !normalized.includes('ذهب')) return null;

  const k21 = karat(normalized, 21);
  if (k21 === null || !karat21IsValid(k21)) return null;

  const prices: EgyptParsedPrices = {
    timestamp: new Date().toISOString(),
    karat_18: karat(normalized, 18),
    karat_21: k21,
    karat_24: karat(normalized, 24),
    spread_21: firstMatchFloat(
      [
        `فرق\\s*البيع\\s*والشراء\\s*لعيار\\s*21[=\\s:]*([0-9,.]+)`,
        `فرق[^\\n]*عيار\\s*21[=\\s:]*([0-9,.]+)`,
        `فرق.*عيار\\s*21[=\\s]*([0-9,.]+)`,
      ],
      normalized,
    ),
    silver_local: firstMatchFloat(
      [
        `السعر\\s*المحلي\\s*الفضة[=\\s:]*([0-9,.]+)`,
        `الفضة[=\\s:]*([0-9,.]+)`,
        `فضة[=\\s:]*([0-9,.]+)`,
        `الفضة[^\\d\\n]*([0-9,.]+)\\s*ج`,
      ],
      normalized,
    ),
    gold_pound: firstMatchFloat(
      [
        `سعر\\s*الجنيه\\s*الذهب\\s+([0-9,.]+)`,
        `الجنيه الذهب[=\\s:]*([0-9,.]+)`,
        `جنيه الذهب[=\\s:]*([0-9,.]+)`,
        `الجنيه الذهب[^\\d\\n]*([0-9,.]+)`,
      ],
      normalized,
    ),
    ounce_egp: firstMatchFloat(
      [
        `سعر\\s*الأونصة\\s*\\([^)]*\\)\\s*([0-9,.]+)\\s*ج`,
        `الأونصة[^\\n]*?بالجنيه[^\\d\\n]*([0-9,.]+)`,
        `الأونصة[^\\n]*?([0-9,.]+)\\s*ج`,
        `أونصة[^\\n]*?([0-9,.]+)\\s*ج`,
        `الأونصة.*?\\s([0-9,.]+)ج`,
      ],
      normalized,
    ),
    ounce_usd: firstMatchFloat(
      [
        `الاونصة[^\\n]*?عالميا[^\\n]*?([0-9,.]+)\\s*\\$`,
        `عالميا[^\\n]*?([0-9,.]+)\\s*\\$`,
        `عالميا.*?([0-9,.]+)\\s*\\$`,
        `الأونصة[^\\n]*?([0-9,.]+)\\s*\\$`,
        `أونصة[^\\n]*?([0-9,.]+)\\s*\\$`,
      ],
      normalized,
    ),
    dollar_saga: firstMatchFloat(
      [`دولار الصاغة[=\\s:]*([0-9,.]+)`, `دولار\\s*الصاغة[=\\s:]*([0-9,.]+)`],
      normalized,
    ),
    dollar_parallel: firstMatchFloat(
      [
        `سعر\\s*الدولار\\s*الان\\s*بالسوق\\s*الموازى[=\\s:]*([0-9,.]+)`,
        `بالسوق\\s*الموازى[=\\s:]*([0-9,.]+)`,
        `السوق الموازي[=\\s:]*([0-9,.]+)`,
        `السوق الموازى[=\\s:]*([0-9,.]+)`,
        `الموازي[=\\s:]*([0-9,.]+)`,
        `الموازى[=\\s:]*([0-9,.]+)`,
        `سوق الموازي[=\\s:]*([0-9,.]+)`,
      ],
      normalized,
    ),
    dollar_official: firstMatchFloat(
      [
        `سعر\\s*صرف\\s*الدولار\\s*مقابل\\s*الجنيه\\s*الأن[=\\s:]*([0-9,.]+)`,
        `صرف\\s*الدولار\\s*مقابل\\s*الجنيه\\s*الأن[=\\s:]*([0-9,.]+)`,
        `سعر صرف الدولار[^\\n]*?ال[إاأ]ن[=\\s:]*([0-9,.]+)`,
        `سعر صرف الدولار[^\\n]*?الان بالأن[=\\s:]*([0-9,.]+)`,
        `صرف الدولار[^\\n]*?ال[إاأ]ن[=\\s:]*([0-9,.]+)`,
        `الدولار\\s*ال[إاأ]ن[=\\s:]*([0-9,.]+)`,
        `سعر الدولار[^\\n]*ال[إاأ]ن[=\\s:]*([0-9,.]+)`,
      ],
      normalized,
    ),
  };

  return prices;
}

function mergeOverlayParsed(...parts: (EgyptParsedPrices | null | undefined)[]): EgyptParsedPrices | null {
  const merged = emptyPriceRow();
  let saw = false;
  for (const part of parts) {
    if (!part) continue;
    saw = true;
    if (part.timestamp != null) merged.timestamp = part.timestamp;
    for (const k of PRICE_KEYS) {
      const v = part[k];
      if (v != null) merged[k] = v;
    }
  }
  if (!saw || merged.karat_21 == null) return null;
  if (!karat21IsValid(merged.karat_21)) return null;
  if (!merged.timestamp) merged.timestamp = new Date().toISOString();
  return merged;
}

function publicUsernameFromChannelId(channelId: string): string | null {
  const s = channelId.trim().replace(/^@/, '');
  if (!s) return null;
  if (s.startsWith('-') || /^-?\d+$/.test(s)) return null;
  if (/^[A-Za-z0-9_]{4,64}$/.test(s)) return s;
  return null;
}

function stripTagsToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTmeWidgetTexts(html: string): string[] {
  if (!html.includes('tgme_widget_message_text')) return [];
  const results: string[] = [];
  const needle = 'tgme_widget_message_text';
  let pos = 0;
  while (pos < html.length) {
    const idx = html.indexOf(needle, pos);
    if (idx === -1) break;
    const afterClass = html.indexOf('>', idx);
    if (afterClass === -1) break;
    const contentStart = afterClass + 1;
    let scan = contentStart;
    let depth = 1;
    let closed = false;
    while (scan < html.length && depth > 0) {
      const openIdx = html.indexOf('<div', scan);
      const closeIdx = html.indexOf('</div>', scan);
      if (closeIdx === -1) break;
      if (openIdx !== -1 && openIdx < closeIdx) {
        depth += 1;
        scan = openIdx + 4;
      } else {
        depth -= 1;
        if (depth === 0) {
          const inner = html.slice(contentStart, closeIdx);
          const text = stripTagsToText(inner);
          if (text) results.push(text);
          pos = closeIdx + 6;
          closed = true;
          break;
        }
        scan = closeIdx + 6;
      }
    }
    if (!closed) pos = idx + needle.length;
  }
  return results.slice().reverse();
}

async function fetchTmeChannelPreview(
  username: string,
  signal?: AbortSignal,
): Promise<{ texts: string[]; hasPublicPostFeed: boolean }> {
  const handle = username.replace(/^@/, '');
  if (!handle) return { texts: [], hasPublicPostFeed: false };
  const url = `https://t.me/s/${handle}`;
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TharwaMetals/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) return { texts: [], hasPublicPostFeed: false };
  const html = await res.text();
  const hasPublicPostFeed = html.includes('tgme_widget_message');
  if (!hasPublicPostFeed) {
    return { texts: [], hasPublicPostFeed: false };
  }
  return { texts: extractTmeWidgetTexts(html), hasPublicPostFeed: true };
}

type TgMessage = { text?: string; caption?: string; date?: number };

type TgChatResult = {
  username?: string;
  pinned_message?: TgMessage;
};

type TgChannelPost = {
  date?: number;
  text?: string;
  caption?: string;
  chat?: { id?: number; username?: string };
};

type TgUpdateWithPost = {
  update_id: number;
  channel_post?: TgChannelPost;
  edited_channel_post?: TgChannelPost;
};

function channelMatches(chat: { id?: number; username?: string } | undefined, channelId: string): boolean {
  const cid = channelId.trim();
  if (!cid || !chat) return false;
  if (String(chat.id ?? '') === cid) return true;
  const un = chat.username;
  if (un) {
    const want = cid.replace(/^@/, '').toLowerCase();
    return un.toLowerCase() === want;
  }
  return false;
}

async function fetchLatestParsedFromPendingUpdates(
  botToken: string,
  channelId: string,
  signal?: AbortSignal,
): Promise<EgyptParsedPrices | null> {
  const updates = await telegramGetJson<TgUpdateWithPost[]>(
    botToken,
    'getUpdates',
    {
      limit: '100',
      timeout: '0',
      allowed_updates: JSON.stringify(['channel_post', 'edited_channel_post']),
    },
    signal,
  );
  const candidates: { updateId: number; parsed: EgyptParsedPrices }[] = [];
  for (const u of updates) {
    const post = u.channel_post ?? u.edited_channel_post;
    const bodyText = messageBody(post ?? null);
    if (!post?.chat || !bodyText) continue;
    if (!channelMatches(post.chat, channelId)) continue;
    const p = parseGoldMessage(bodyText);
    if (!p) continue;
    const withTs =
      post.date != null ? { ...p, timestamp: new Date(post.date * 1000).toISOString() } : p;
    candidates.push({ updateId: u.update_id, parsed: withTs });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.updateId - b.updateId);
  return candidates[candidates.length - 1]!.parsed;
}

async function telegramGetJson<T>(
  botToken: string,
  method: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const q = new URLSearchParams(params);
  const url = `https://api.telegram.org/bot${botToken}/${method}?${q}`;
  const res = await fetch(url, { signal });
  const body = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!body.ok) {
    throw new Error(`Telegram ${method}: ${body.description ?? res.statusText}`);
  }
  return body.result as T;
}

export async function fetchEgyptMetalsFromTelegramChannel(opts: {
  botToken: string;
  channelId: string;
  signal?: AbortSignal;
  /** When true, merge latest matching `getUpdates` channel post (do not use with another long-poller on the same bot token). */
  peekPendingChannelUpdates?: boolean;
  log?: FastifyBaseLogger;
}): Promise<{ parsed: EgyptParsedPrices; fetchedAt: Date } | null> {
  const { botToken, channelId, signal, peekPendingChannelUpdates, log } = opts;
  let parsedPin: EgyptParsedPrices | null = null;
  let parsedWeb: EgyptParsedPrices | null = null;
  let parsedPeek: EgyptParsedPrices | null = null;
  let username = publicUsernameFromChannelId(channelId);
  let getChatError: string | null = null;
  let hadPinnedBody = false;
  let pinnedParseFailed = false;

  try {
    const chat = await telegramGetJson<TgChatResult>(botToken, 'getChat', { chat_id: channelId }, signal);
    if (chat.username) username = chat.username;
    const pm = chat.pinned_message;
    const pmText = messageBody(pm);
    if (pm && pmText) {
      hadPinnedBody = true;
      const p = parseGoldMessage(pmText);
      if (p && pm.date) {
        parsedPin = { ...p, timestamp: new Date(pm.date * 1000).toISOString() };
      } else if (p) {
        parsedPin = p;
      } else {
        pinnedParseFailed = true;
      }
    }
  } catch (e) {
    getChatError = e instanceof Error ? e.message : String(e);
    log?.warn({ err: getChatError, channelId }, 'telegram metals: getChat failed');
  }

  let tmeCandidates: string[] = [];
  let tmeHasPublicFeed = false;
  if (username) {
    const tme = await fetchTmeChannelPreview(username, signal);
    tmeCandidates = tme.texts;
    tmeHasPublicFeed = tme.hasPublicPostFeed;
    if (!tmeHasPublicFeed) {
      log?.warn(
        { handle: `@${username}` },
        'telegram metals: t.me/s has no public post preview (user/bot/private channel, or wrong @). Use your real gold channel @, or numeric -100… id with bot in channel + pinned price post, or TELEGRAM_METALS_PEEK_UPDATES=1.',
      );
    }
    for (const webText of tmeCandidates) {
      const p = parseGoldMessage(normalizePriceText(webText));
      if (p) {
        parsedWeb = p;
        break;
      }
    }
    if (!parsedWeb && tmeCandidates.length > 0) {
      parsedWeb = parseGoldMessage(normalizePriceText(tmeCandidates.join('\n\n')));
    }
  }

  if (peekPendingChannelUpdates) {
    try {
      parsedPeek = await fetchLatestParsedFromPendingUpdates(botToken, channelId, signal);
    } catch (e) {
      log?.warn({ err: e instanceof Error ? e.message : String(e) }, 'telegram metals: getUpdates peek failed');
    }
  }

  const merged = mergeOverlayParsed(parsedPin, parsedPeek, parsedWeb);
  if (!merged) {
    log?.warn(
      {
        channelId,
        getChatError,
        hadPinnedBody,
        pinnedParseFailed,
        tmeSnippetCount: tmeCandidates.length,
        tmeHasPublicFeed,
        peekEnabled: Boolean(peekPendingChannelUpdates),
        peekParsed: Boolean(parsedPeek),
      },
      'telegram metals: no merged parse (pin + peek + t.me all empty or invalid)',
    );
    return null;
  }
  return { parsed: merged, fetchedAt: new Date() };
}
