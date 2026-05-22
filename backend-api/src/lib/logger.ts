import pino from 'pino';

export function createLogger(env: string) {
  return pino({
    level: env === 'production' ? 'info' : 'debug',
  });
}
