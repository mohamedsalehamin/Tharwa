import { describe, expect, it, beforeEach } from 'vitest';
import { setEgxHolidayCacheForTests, invalidateEgxHolidayCache } from '../../src/services/egx-holidays.js';
import {
  cairoDateKey,
  isEgxExchangeHoliday,
  isEgxTradingDay,
} from '../../src/services/egx-trading-day.js';

/** Sunday 12:00 Africa/Cairo — regular trading weekday. */
const CAIRO_SUNDAY = new Date('2026-05-17T09:00:00.000Z');

/** Friday 12:00 Africa/Cairo — EGX weekend. */
const CAIRO_FRIDAY = new Date('2026-05-15T09:00:00.000Z');

/** Saturday 12:00 Africa/Cairo — EGX weekend. */
const CAIRO_SATURDAY = new Date('2026-05-16T09:00:00.000Z');

/** Tuesday 12:00 Africa/Cairo — Muharram 2026 EGX holiday. */
const CAIRO_MUHARRAM = new Date('2026-06-16T09:00:00.000Z');

const BASE_HOLIDAYS = [
  '2026-01-07',
  '2026-01-25',
  '2026-03-19',
  '2026-03-20',
  '2026-04-13',
  '2026-04-25',
  '2026-05-26',
  '2026-05-27',
  '2026-05-28',
  '2026-05-29',
  '2026-05-30',
  '2026-06-16',
  '2026-06-17',
  '2026-07-23',
  '2026-08-25',
  '2026-10-06',
];

describe('isEgxTradingDay', () => {
  beforeEach(() => {
    invalidateEgxHolidayCache();
    setEgxHolidayCacheForTests(BASE_HOLIDAYS);
  });

  it('allows regular Cairo weekdays (Sun–Thu)', async () => {
    expect(await isEgxTradingDay(CAIRO_SUNDAY)).toBe(true);
  });

  it('blocks Friday and Saturday', async () => {
    expect(await isEgxTradingDay(CAIRO_FRIDAY)).toBe(false);
    expect(await isEgxTradingDay(CAIRO_SATURDAY)).toBe(false);
  });

  it('blocks EGX exchange holidays from cache', async () => {
    expect(await isEgxTradingDay(CAIRO_MUHARRAM)).toBe(false);
    expect(await isEgxExchangeHoliday(CAIRO_MUHARRAM)).toBe(true);
    expect(cairoDateKey(CAIRO_MUHARRAM)).toBe('2026-06-16');
  });

  it('respects admin-added holidays in cache', async () => {
    setEgxHolidayCacheForTests([...BASE_HOLIDAYS, '2026-05-17']);
    expect(await isEgxTradingDay(CAIRO_SUNDAY)).toBe(false);
  });
});
