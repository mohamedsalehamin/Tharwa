import type { FastifyPluginAsync } from 'fastify';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../lib/metrics.js';
import { bindSentryRequestContext } from '../observability/sentry.js';
import { sendError } from '../lib/errors.js';

function routeLabel(url: string, routeTemplate?: string): string {
  if (routeTemplate) return routeTemplate;
  const path = url.split('?')[0] ?? url;
  return path.replace(/\/[0-9a-f-]{36}/gi, '/:id').slice(0, 120);
}

export const observabilityPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    req.observabilityStart = process.hrtime.bigint();
    bindSentryRequestContext({
      requestId: req.id,
      method: req.method,
      url: req.url,
    });
  });

  app.addHook('onResponse', async (req, reply) => {
    const start = req.observabilityStart;
    if (!start) return;
    const route = routeLabel(req.url, req.routeOptions?.url);
    const status = String(reply.statusCode);
    const labels = { method: req.method, route, status };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
  });

  app.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error, reqId: req.id }, 'request failed');
    if (!reply.sent) {
      sendError(reply, error);
    }
  });
};
