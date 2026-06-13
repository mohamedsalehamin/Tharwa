import type { FastifyReply } from 'fastify';
import { captureException } from '../observability/sentry.js';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Avoid leaking Prisma/SQL internals to API clients. */
function clientSafeMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) {
    const m = err.message;
    if (/prisma/i.test(m) || /invocation/i.test(m) || /Unknown field/i.test(m)) {
      return 'Something went wrong. Please try again later.';
    }
  }
  return 'Internal error';
}

export function sendError(reply: FastifyReply, err: unknown): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      captureException(err, { code: err.code, statusCode: err.statusCode });
    }
    void reply.status(err.statusCode).send({ code: err.code, message: err.message });
    return;
  }
  captureException(err);
  void reply.status(500).send({ code: 'INTERNAL', message: clientSafeMessage(err) });
}
