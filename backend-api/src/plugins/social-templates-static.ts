import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../config/env.js';
import { resolveSocialTemplatesDir } from '../services/social-templates.js';

/** Serves social template assets (logo, SVGs, fonts) under `/assets/social-templates/*`. */
export const socialTemplatesStaticPlugin: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const root = resolveSocialTemplatesDir(opts.env);
  await app.register(fastifyStatic, {
    root,
    prefix: '/assets/social-templates/',
    decorateReply: false,
  });
};
