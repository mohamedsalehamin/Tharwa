import { describe, expect, it } from 'vitest';
import { SessionState } from '@prisma/client';
import {
  egxPollIntervalSec,
  getEgxSessionState,
  shouldPollEgxEquities,
} from '../../src/services/session-egx.js';

/** Sunday 09:00 Africa/Cairo — pre-market. */
const CAIRO_PRE = new Date('2026-05-17T06:00:00.000Z');

/** Sunday 11:00 Africa/Cairo — open. */
const CAIRO_OPEN = new Date('2026-05-17T08:00:00.000Z');

/** Sunday 15:30 Africa/Cairo — post. */
const CAIRO_POST = new Date('2026-05-17T12:30:00.000Z');

/** Friday 12:00 Africa/Cairo — closed (weekend). */
const CAIRO_FRIDAY = new Date('2026-05-15T09:00:00.000Z');

describe('getEgxSessionState', () => {
  it('classifies pre, open, post, and closed', () => {
    expect(getEgxSessionState(CAIRO_PRE)).toBe(SessionState.pre);
    expect(getEgxSessionState(CAIRO_OPEN)).toBe(SessionState.open);
    expect(getEgxSessionState(CAIRO_POST)).toBe(SessionState.post);
    expect(getEgxSessionState(CAIRO_FRIDAY)).toBe(SessionState.closed);
  });
});

describe('shouldPollEgxEquities', () => {
  it('polls during Cairo trading week sessions', () => {
    expect(shouldPollEgxEquities(CAIRO_OPEN)).toBe(true);
    expect(shouldPollEgxEquities(CAIRO_FRIDAY)).toBe(false);
  });
});

describe('egxPollIntervalSec', () => {
  it('uses faster cadence when session is open', () => {
    expect(egxPollIntervalSec(SessionState.open, 90, 300)).toBe(90);
    expect(egxPollIntervalSec(SessionState.pre, 90, 300)).toBe(300);
  });
});
