#!/usr/bin/env node
import { Prisma, PrismaClient } from '@prisma/client';
import { loadEnv } from '../dist/config/env.js';
import { getRedis } from '../dist/lib/redis.js';
import { getMetalsCached } from '../dist/services/quotes.js';
import { resetMetalInstrumentIdMapCache } from '../dist/services/metal-quote-snapshots.js';

const prisma = new PrismaClient();
const codes = [
  'GOLD_21K_GRAM_EGP',
  'GOLD_24K_GRAM_EGP',
  'GOLD_18K_GRAM_EGP',
  'GOLD_POUND_EGP',
  'GOLD_TROY_OZ_EGP',
  'SILVER_EGP',
];

try {
  const metals = await prisma.instrument.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const ids = metals.map((m) => m.id);

  const historyCount = await prisma.quoteSnapshot.count({
    where: {
      instrumentId: { in: ids },
      raw: { path: ['source'], equals: 'telegram_history' },
    },
  });

  const range = await prisma.$queryRaw`
    SELECT
      MIN(qs.as_of) AS oldest,
      MAX(qs.as_of) AS newest,
      COUNT(DISTINCT (qs.raw->>'telegramMessageId'))::int AS unique_posts
    FROM quote_snapshots qs
    WHERE qs.instrument_id IN (${Prisma.join(ids)})
      AND qs.raw->>'source' = 'telegram_history'
  `;

  const byInstrument = await prisma.$queryRaw`
    SELECT
      i.code,
      COUNT(*)::int AS rows,
      MIN(qs.as_of) AS oldest,
      MAX(qs.as_of) AS newest,
      MIN((qs.last)::numeric) AS min_price,
      MAX((qs.last)::numeric) AS max_price
    FROM quote_snapshots qs
    JOIN instruments i ON i.id = qs.instrument_id
    WHERE qs.instrument_id IN (${Prisma.join(ids)})
      AND qs.raw->>'source' = 'telegram_history'
    GROUP BY i.code
    ORDER BY i.code
  `;

  const latest21k = await prisma.$queryRaw`
    SELECT qs.as_of, qs.last, qs.raw->>'telegramMessageId' AS msg_id
    FROM quote_snapshots qs
    JOIN instruments i ON i.id = qs.instrument_id
    WHERE i.code = 'GOLD_21K_GRAM_EGP' AND qs.raw->>'source' = 'telegram_history'
    ORDER BY qs.as_of DESC
    LIMIT 5
  `;

  const oldest21k = await prisma.$queryRaw`
    SELECT qs.as_of, qs.last, qs.raw->>'telegramMessageId' AS msg_id
    FROM quote_snapshots qs
    JOIN instruments i ON i.id = qs.instrument_id
    WHERE i.code = 'GOLD_21K_GRAM_EGP' AND qs.raw->>'source' = 'telegram_history'
    ORDER BY qs.as_of ASC
    LIMIT 5
  `;

  const env = loadEnv();
  resetMetalInstrumentIdMapCache();
  const redis = getRedis(env.REDIS_URL);
  await redis.connect().catch(() => undefined);
  const log = { info() {}, warn() {}, debug() {}, error() {} };
  const live = await getMetalsCached(env, redis, log);
  await redis.quit();

  console.log(
    JSON.stringify(
      {
        instrumentsFound: metals.length,
        historySnapshotRows: historyCount,
        range: range[0],
        byInstrument,
        gold21kLatest: latest21k,
        gold21kOldest: oldest21k,
        apiMetalsFromDb: {
          bundleFetchedAt: live.bundleFetchedAt,
          items: live.items.map((i) => ({
            metal: i.metal,
            karat: i.karat,
            unit: i.unit,
            amountEgp: i.amountEgp,
            asOf: i.asOf,
          })),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
