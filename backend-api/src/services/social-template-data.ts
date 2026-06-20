import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { cairoDateKey } from './egx-trading-day.js';
import { fetchMarketBriefSnapshot } from './daily-brief.js';
import { getMetalsCached } from './quotes.js';
import { getEgxMoversCached } from './stocks.js';
import type { GoldVoiceoverInput } from './gold-voiceover-script.js';
import type { SocialTemplateKey } from './social-templates.js';

const COLOR_UP = '#00C853';
const COLOR_DOWN = '#FF3B30';
const COLOR_NEUTRAL = '#8A94A6';

const GOLD_OPEN_KEY = 'jobs:social-posts:gold21-open';

function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function fmtSignedPct(n: number): string {
  return `(${fmtPct(n)})`;
}

function arabicDate(now = new Date()): string {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
}

function metalByKarat(
  items: Awaited<ReturnType<typeof getMetalsCached>>['items'],
  karat: number,
): number | null {
  const row = items.find((i) => i.karat === karat && i.unit === 'gram');
  return row && Number.isFinite(row.amountEgp) ? row.amountEgp : null;
}

function metalOunce(items: Awaited<ReturnType<typeof getMetalsCached>>['items']): number | null {
  const row = items.find((i) => i.unit === 'troy_ounce');
  return row && Number.isFinite(row.amountEgp) ? row.amountEgp : null;
}

function metalPound(items: Awaited<ReturnType<typeof getMetalsCached>>['items']): number | null {
  const direct = items.find((i) => i.unit === 'gold_pound');
  if (direct && Number.isFinite(direct.amountEgp)) return direct.amountEgp;
  const k21 = metalByKarat(items, 21);
  return k21 != null ? Math.round(k21 * 8) : null;
}

export type PlatformCaptions = {
  igReel: string;
  fbReel: string;
  ytTitle: string;
  ytDescription: string;
  storyOverlay: string;
};

export type SocialContentBundle = {
  template: SocialTemplateKey;
  vars: Record<string, string>;
  /** Default caption (Instagram Reel). */
  caption: string;
  platformCaptions?: PlatformCaptions;
  voiceInput?: GoldVoiceoverInput;
};

/** Odd Cairo day → story photo; even → story video (same reel file). */
export function isStoryVideoDay(cairoDayKey: string): boolean {
  const dayNum = Number(cairoDayKey.split('-').at(-1) ?? '0');
  return dayNum % 2 === 0;
}

export async function buildSocialContent(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  template: SocialTemplateKey,
): Promise<SocialContentBundle | null> {
  const { items } = await getMetalsCached(env, redis, log);
  const gold21 = metalByKarat(items, 21);
  const gold18 = metalByKarat(items, 18);
  const gold24 = metalByKarat(items, 24);
  const goldOunce = metalOunce(items);
  const goldPound = metalPound(items);

  const dateAr = arabicDate();
  const playStore = env.SOCIAL_PLAY_STORE_URL;
  const appStore = env.SOCIAL_APP_STORE_URL;

  if (template === 'gold_daily' || template === 'gold_alert') {
    if (gold21 == null) return null;

    const today = cairoDateKey();
    const openRaw = await redis.get(`${GOLD_OPEN_KEY}:${today}`);
    if (!openRaw) {
      await redis.set(`${GOLD_OPEN_KEY}:${today}`, String(gold21), 'EX', 60 * 60 * 48);
    }
    const openPrice = openRaw ? Number(openRaw) : gold21;
    const changeEgp = gold21 - openPrice;
    const changePct = openPrice > 0 ? (changeEgp / openPrice) * 100 : 0;
    const isDown = changeEgp < 0;
    const isUp = changeEgp > 0;

    const vars: Record<string, string> = {
      DATE_AR: dateAr,
      GOLD_18: gold18 != null ? fmtNum(gold18) : '—',
      GOLD_21: fmtNum(gold21),
      GOLD_24: gold24 != null ? fmtNum(gold24) : '—',
      GOLD_POUND: goldPound != null ? fmtNum(goldPound) : '—',
      GOLD_OUNCE: goldOunce != null ? fmtNum(goldOunce) : '—',
      CHANGE_HEADLINE:
        changeEgp === 0
          ? 'أسعار الذهب مستقرة منذ افتتاح اليوم'
          : isDown
            ? `انخفاض ${fmtNum(Math.abs(changeEgp))} ج منذ افتتاح اليوم`
            : `ارتفاع ${fmtNum(changeEgp)} ج منذ افتتاح اليوم`,
      CHANGE_COLOR: isDown ? COLOR_DOWN : isUp ? COLOR_UP : COLOR_NEUTRAL,
      CHANGE_PCT: fmtPct(changePct),
      REF_PRICE: fmtNum(openPrice),
      CURRENT_PRICE: fmtNum(gold21),
      HEADLINE: isDown
        ? 'أسعار الذهب تواصل الانخفاض ❗'
        : isUp
          ? 'أسعار الذهب تواصل الارتفاع 📈'
          : 'أسعار الذهب اليوم',
      BODY_PARAGRAPH: buildGoldBodyParagraph(changeEgp, gold21),
      PLAY_STORE_URL: playStore,
      APP_STORE_URL: appStore,
    };

    if (template === 'gold_alert') {
      const dropPct = env.SOCIAL_GOLD_ALERT_DROP_PCT;
      if (!(changePct <= -dropPct)) return null;
    }

    const platformCaptions = buildGoldPlatformCaptions(template, vars);
    const voiceInput: GoldVoiceoverInput = {
      gold21Price: gold21,
      gold18Price: gold18,
      gold24Price: gold24,
      goldPoundPrice: goldPound,
      goldOuncePrice: goldOunce,
      changeEgpFromOpen: changeEgp,
    };
    return { template, vars, caption: platformCaptions.igReel, platformCaptions, voiceInput };
  }

  const [snap, gainers, losers] = await Promise.all([
    fetchMarketBriefSnapshot(env, redis, log),
    getEgxMoversCached(env, redis, log, { list: 'gainers', limit: 5, offset: 0 }),
    getEgxMoversCached(env, redis, log, { list: 'losers', limit: 5, offset: 0 }),
  ]);

  if (!snap.dataAvailable) return null;

  const vars: Record<string, string> = {
    DATE_AR: dateAr,
    EGX30_VALUE: snap.egx30 ? fmtNum(snap.egx30.value) : '—',
    EGX30_CHANGE: snap.egx30 ? fmtSignedPct(snap.egx30.changePct) : '—',
    EGX30_CHANGE_COLOR:
      snap.egx30 == null
        ? COLOR_NEUTRAL
        : snap.egx30.changePct >= 0
          ? COLOR_UP
          : COLOR_DOWN,
    USD_EGP: snap.usdEgp ? fmtNum(snap.usdEgp.rate, 2) : '—',
    USD_CHANGE: snap.usdEgp?.changePct != null ? fmtSignedPct(snap.usdEgp.changePct) : '',
    USD_CHANGE_COLOR:
      snap.usdEgp?.changePct == null
        ? COLOR_NEUTRAL
        : snap.usdEgp.changePct >= 0
          ? COLOR_UP
          : COLOR_DOWN,
    TOP_GAINERS_LINE: formatMoverLine(gainers.items),
    TOP_LOSERS_LINE: formatMoverLine(losers.items),
    PLAY_STORE_URL: playStore,
    APP_STORE_URL: appStore,
  };

  for (let i = 0; i < 5; i += 1) {
    const g = gainers.items[i];
    const l = losers.items[i];
    vars[`GAINER_${i + 1}_SYMBOL`] = g?.symbol ?? '—';
    vars[`GAINER_${i + 1}_PCT`] = g ? fmtPct(g.changePct) : '—';
    vars[`LOSER_${i + 1}_SYMBOL`] = l?.symbol ?? '—';
    vars[`LOSER_${i + 1}_PCT`] = l ? fmtPct(l.changePct) : '—';
  }

  const caption = fillCaptionTemplate('egx_close', vars);
  return { template: 'egx_close', vars, caption };
}

function formatMoverLine(items: { symbol: string; changePct: number }[]): string {
  if (items.length === 0) return '—';
  return items
    .slice(0, 3)
    .map((i) => `${i.symbol} ${fmtPct(i.changePct)}`)
    .join(' · ');
}

function buildGoldBodyParagraph(changeEgp: number, gold21: number): string {
  if (changeEgp === 0) {
    return `يتداول عيار 21 الآن عند ${fmtNum(gold21)} ج للجرام.`;
  }
  const dir = changeEgp < 0 ? 'انخفضت' : 'ارتفعت';
  return `${dir} #اسعار_الذهب محلياً بما يقارب ${fmtNum(Math.abs(changeEgp))} جنيهاً مقارنةً بسعر افتتاح اليوم، ليتداول عيار 21 الآن عند ${fmtNum(gold21)} ج للجرام.`;
}

function buildGoldPlatformCaptions(
  template: 'gold_daily' | 'gold_alert',
  vars: Record<string, string>,
): PlatformCaptions {
  const base = fillCaptionTemplate(template, vars);
  const shortHook = `${vars.HEADLINE} — عيار 21: ${vars.CURRENT_PRICE} ج`;

  return {
    igReel: base,
    fbReel: `${vars.HEADLINE}

${vars.BODY_PARAGRAPH}

حمّل تطبيق ثروة وتابع أسعار الذهب لحظة بلحظة.
${vars.PLAY_STORE_URL}`,
    ytTitle: `أسعار الذهب اليوم | عيار 21 ${vars.CURRENT_PRICE} ج #Shorts`,
    ytDescription: `${vars.BODY_PARAGRAPH}

حمّل تطبيق ثروة:
Android: ${vars.PLAY_STORE_URL}
iOS: ${vars.APP_STORE_URL}

#ثروة #اسعار_الذهب #الذهب_في_مصر #Shorts`,
    storyOverlay: shortHook,
  };
}

function fillCaptionTemplate(template: SocialTemplateKey, vars: Record<string, string>): string {
  const blocks: Record<SocialTemplateKey, string> = {
    gold_daily: `🔴 #اسعار_الذهب_اليوم

${vars.HEADLINE}

${vars.BODY_PARAGRAPH}

الأسعار متغيرة على مدار اليوم — حمّل تطبيق ثروة واعرف أسعار الذهب لحظة بلحظة 🕛

${vars.PLAY_STORE_URL}
${vars.APP_STORE_URL}

#ثروة #thrwa #اسعار_الذهب #الذهب_في_مصر`,
    gold_alert: `🔴 #اسعار_الذهب_اليوم

${vars.HEADLINE}

${vars.BODY_PARAGRAPH}

الأسعار متغيرة على مدار اليوم — حمّل تطبيق ثروة واعرف أسعار الذهب لحظة بلحظة 🕛

${vars.PLAY_STORE_URL}
${vars.APP_STORE_URL}

#ثروة #thrwa #اسعار_الذهب #الذهب_في_مصر`,
    egx_close: `🔴 #ملخص_البورصة_المصرية

إغلاق جلسة اليوم على مؤشر EGX 30 عند ${vars.EGX30_VALUE} ${vars.EGX30_CHANGE}.

أعلى الرابحين: ${vars.TOP_GAINERS_LINE}
أعلى الخاسرين: ${vars.TOP_LOSERS_LINE}

تابع السوق والمحفظة لحظة بلحظة في تطبيق ثروة 📈

${vars.PLAY_STORE_URL}
${vars.APP_STORE_URL}

#ثروة #thrwa #البورصة_المصرية #EGX`,
  };
  return blocks[template];
}

export async function wasGoldAlertSentToday(redis: Redis, day: string): Promise<boolean> {
  return (await redis.get(`jobs:social-posts:last-gold-alert:${day}`)) != null;
}

export async function markGoldAlertSent(redis: Redis, day: string): Promise<void> {
  await redis.set(`jobs:social-posts:last-gold-alert:${day}`, '1', 'EX', 60 * 60 * 48);
}
