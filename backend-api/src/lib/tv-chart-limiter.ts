/** Limits concurrent TradingView chart WebSocket sessions to reduce 429 rate limits. */

const MAX_CONCURRENT = 2;
let active = 0;
const waiters: Array<() => void> = [];

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

export async function withTvChartSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
