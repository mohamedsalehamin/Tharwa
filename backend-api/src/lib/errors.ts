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

export function sendError(reply: FastifyReply, err: unknown): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      captureException(err, { code: err.code, statusCode: err.statusCode });
    }
    void reply.status(err.statusCode).send({ code: err.code, message: err.message });
    return;
  }
  captureException(err);
  const message = err instanceof Error ? err.message : 'Internal error';
  void reply.status(500).send({ code: 'INTERNAL', message });
}
