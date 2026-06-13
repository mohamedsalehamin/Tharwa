import { getEgxHolidayDateKeysCached, invalidateEgxHolidayCache, setEgxHolidayCacheForTests } from './egx-holidays.js';
import { isEgxWeekend } from './session-egx.js';

export function cairoDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
}

/** Official EGX closure dates (Africa/Cairo calendar day), excluding weekend logic. */
export async function isEgxExchangeHoliday(now: Date = new Date()): Promise<boolean> {
  const set = await getEgxHolidayDateKeysCached();
  return set.has(cairoDateKey(now));
}

/** True on Sun–Thu Cairo days that are not listed EGX holidays. */
export async function isEgxTradingDay(now: Date = new Date()): Promise<boolean> {
  if (isEgxWeekend(now)) return false;
  return !(await isEgxExchangeHoliday(now));
}

export { invalidateEgxHolidayCache as clearEgxHolidayCache, setEgxHolidayCacheForTests };
