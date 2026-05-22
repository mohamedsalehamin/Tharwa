import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../config/env.js';

/** Serves admin-uploaded files under `/files/*`. */
export const publicUploadsPlugin: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const root = path.resolve(opts.env.PUBLIC_UPLOADS_DIR);
  await app.register(fastifyStatic, {
    root,
    prefix: '/files/',
    decorateReply: false,
  });
};
