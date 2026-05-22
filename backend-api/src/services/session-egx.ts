import { SessionState } from '@prisma/client';

/** EGX regular session (cash equities), Africa/Cairo — indicative windows for MVP. */
const OPEN_DOW = new Set([0, 1, 2, 3, 4]); // Sun–Thu
const OPEN_MIN = 10 * 60; // 10:00
const CLOSE_MIN = 14 * 60 + 30; // 14:30

function cairoMinutesSinceMidnight(d: Date): number {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  const [hh, mm] = s.split(':').map((x) => parseInt(x, 10));
  return hh * 60 + mm;
}

function cairoWeekday(d: Date): number {
  // weekday: short -> map; use formatToParts
  const w = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
  }).format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[w] ?? 6;
}

/** Session hint for EGX-listed instruments (not exchange-official). */
export function getEgxSessionState(now: Date = new Date()): SessionState {
  const dow = cairoWeekday(now);
  if (!OPEN_DOW.has(dow)) return SessionState.closed;
  const mins = cairoMinutesSinceMidnight(now);
  if (mins < OPEN_MIN) return SessionState.pre;
  if (mins >= CLOSE_MIN) return SessionState.post;
  return SessionState.open;
}

/** Poll EGX upstreams during pre/open/post (skip Fri/Sat–Sun closed). */
export function shouldPollEgxEquities(now: Date = new Date()): boolean {
  return getEgxSessionState(now) !== SessionState.closed;
}

/** Slower cadence for pre/post; full cadence when cash session is open. */
export function egxPollIntervalSec(
  session: SessionState,
  openIntervalSec: number,
  offHoursIntervalSec: number,
): number {
  return session === SessionState.open ? openIntervalSec : offHoursIntervalSec;
}
