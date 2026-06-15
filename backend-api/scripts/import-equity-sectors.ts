/**
 * Bootstrap sector equity-list memberships from TradingView EGX scanner.
 *
 * Usage: npm run import:equity-sectors
 */
import { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { importSectorMembersFromTradingView } from '../src/services/equity-lists.js';

const prisma = new PrismaClient();

const log = {
  info: (obj: Record<string, unknown>, msg?: string) => {
    if (msg) console.log(msg, obj);
    else console.log(obj);
  },
  warn: (obj: Record<string, unknown>, msg?: string) => console.warn(msg ?? '', obj),
  error: (obj: Record<string, unknown>, msg?: string) => console.error(msg ?? '', obj),
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  child: () => log,
  level: 'info',
  silent: false,
} as unknown as FastifyBaseLogger;

async function main() {
  const result = await importSectorMembersFromTradingView(log);
  console.log('Sector import complete:', result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
