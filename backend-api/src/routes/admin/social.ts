import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { requireSuperadmin } from '../../plugins/admin-role.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  buildMetaOAuthScopes,
  buildMetaOAuthUrl,
  exchangeMetaOAuthCode,
  fetchMetaPages,
} from '../../services/meta-graph.js';
import {
  clearMetaSocialConfig,
  getMetaSocialConfig,
  isMetaOAuthConfigured,
  metaSocialPublicFromConfig,
  upsertMetaSocialConfig,
} from '../../services/meta-social-credentials.js';
import {
  listSocialPostRuns,
  previewSocialPost,
  publishSocialPost,
} from '../../services/social-posts.js';
import type { SocialTemplateKey } from '../../services/social-templates.js';

const templateSchema = z.enum(['gold_daily', 'gold_alert', 'egx_close']);

const metaSaveBody = z.object({
  pageId: z.string().min(1),
  pageName: z.string().min(1),
  pageAccessToken: z.string().optional(),
  igUserId: z.string().min(1).nullable().optional(),
  igUsername: z.string().min(1).nullable().optional(),
  publishFacebook: z.boolean().default(true),
  publishInstagram: z.boolean().default(true),
  schedules: z
    .object({
      goldDaily: z.object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      }),
      egxClose: z.object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      }),
      goldAlert: z.object({
        enabled: z.boolean(),
        dropPct: z.number().min(1).max(50),
      }),
    })
    .optional(),
});

const previewBody = z.object({
  template: templateSchema,
});

const publishBody = z.object({
  template: templateSchema,
  force: z.boolean().optional(),
});

const OAUTH_STATE_PREFIX = 'social:meta-oauth:';

function oauthResultHtml(adminOrigin: string, title: string, body: string, query = ''): string {
  const socialUrl = `${adminOrigin.replace(/\/$/, '')}/social${query ? `?${query}` : ''}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:40rem"><h1>${title}</h1><p>${body}</p><p><a href="${socialUrl}">Return to Social posts</a></p><script>setTimeout(()=>window.close(),8000)</script></body></html>`;
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

export const adminSocialRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };
  const superadminGuard = {
    preHandler: [adminBearerPreHandler(ctx().env), requireSuperadmin],
  };

  app.get('/social/status', { ...guard }, async (_req, reply) => {
    try {
      const config = await getMetaSocialConfig(ctx().env);
      return reply.send({
        configured: config != null,
        oauthAvailable: isMetaOAuthConfigured(ctx().env),
        meta: config ? metaSocialPublicFromConfig(config, ctx().env) : null,
        brand: {
          website: 'https://thrwa.co',
          facebook: 'https://www.facebook.com/thrwa.co',
          instagram: 'https://www.instagram.com/thrwa.co',
        },
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/social/meta', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = metaSaveBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);

      const existing = await getMetaSocialConfig(ctx().env);
      let pageAccessToken = parsed.data.pageAccessToken?.trim() ?? '';
      if (pageAccessToken.length < 20 && existing?.pageId === parsed.data.pageId) {
        pageAccessToken = existing.pageAccessToken;
      }
      if (pageAccessToken.length < 20) {
        throw new AppError(
          'VALIDATION',
          'Page access token is required. Select a Page from OAuth or paste a token manually.',
          400,
        );
      }

      const publicInfo = await upsertMetaSocialConfig(
        admin.id,
        { ...parsed.data, pageAccessToken },
        ctx().env,
      );
      await writeAdminAudit(
        admin.id,
        'admin.social.meta.save',
        { pageId: publicInfo.pageId, pageName: publicInfo.pageName },
        clientIp(req),
      );
      return reply.send({ meta: publicInfo });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/social/meta', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      await clearMetaSocialConfig();
      await writeAdminAudit(admin.id, 'admin.social.meta.clear', {}, clientIp(req));
      return reply.send({ ok: true });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/social/meta/oauth/start', { ...superadminGuard }, async (req, reply) => {
    try {
      if (!isMetaOAuthConfigured(ctx().env)) {
        throw new AppError('CONFIG', 'Meta OAuth env vars are not configured', 503);
      }
      const state = randomUUID();
      await ctx().redis.set(`${OAUTH_STATE_PREFIX}${state}`, req.admin!.id, 'EX', 600);
      const url = buildMetaOAuthUrl(ctx().env, state);
      const scopes = buildMetaOAuthScopes(ctx().env);
      return reply.send({ url, state, scopes });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/social/meta/oauth/callback', async (req, reply) => {
    const adminOrigin = ctx().env.ADMIN_PUBLIC_ORIGIN;
    try {
      const raw = req.query as Record<string, unknown>;
      const oauthError =
        typeof raw.error === 'string'
          ? raw.error
          : typeof raw.error_message === 'string'
            ? raw.error_message
            : null;
      if (oauthError) {
        const message =
          typeof raw.error_message === 'string'
            ? decodeURIComponent(raw.error_message.replace(/\+/g, ' '))
            : oauthError;
        return reply
          .type('text/html')
          .send(
            oauthResultHtml(
              adminOrigin,
              'Facebook connection failed',
              `Meta returned: ${message}. Try again after deploy, or paste a Page access token manually in Social posts.`,
            ),
          );
      }

      const query = z
        .object({
          code: z.string().min(1),
          state: z.string().min(1),
        })
        .safeParse(req.query);
      if (!query.success) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'Facebook connection failed', 'Missing OAuth code or state.'));
      }

      const adminId = await ctx().redis.get(`${OAUTH_STATE_PREFIX}${query.data.state}`);
      if (!adminId) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'Facebook connection failed', 'Invalid or expired OAuth state.'));
      }
      await ctx().redis.del(`${OAUTH_STATE_PREFIX}${query.data.state}`);

      const userToken = await exchangeMetaOAuthCode(ctx().env, query.data.code);
      const pages = await fetchMetaPages(userToken);

      await ctx().redis.set(
        `${OAUTH_STATE_PREFIX}pages:${adminId}`,
        JSON.stringify({ pages, at: Date.now() }),
        'EX',
        900,
      );

      const accept = String(req.headers.accept ?? '');
      if (accept.includes('text/html')) {
        return reply.type('text/html').send(
          oauthResultHtml(
            adminOrigin,
            'Facebook connected',
            `Return to the admin dashboard and pick a Facebook Page (${pages.length} found).`,
            'oauth=ok',
          ),
        );
      }
      return reply.send({ pages });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!reply.sent) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'Facebook connection failed', message));
      }
    }
  });

  app.get('/social/meta/oauth/pages', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const raw = await ctx().redis.get(`${OAUTH_STATE_PREFIX}pages:${admin.id}`);
      if (!raw) return reply.send({ pages: [] });
      const parsed = JSON.parse(raw) as { pages: Awaited<ReturnType<typeof fetchMetaPages>> };
      return reply.send({ pages: parsed.pages ?? [] });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/social/posts', { ...guard }, async (req, reply) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .safeParse(req.query);
      if (!q.success) throw new AppError('VALIDATION', zodMessage(q.error), 400);
      const data = await listSocialPostRuns(q.data.limit, q.data.offset);
      return reply.send(data);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/social/preview', { ...guard }, async (req, reply) => {
    try {
      const parsed = previewBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const preview = await previewSocialPost(
        ctx().env,
        ctx().redis,
        req.log,
        parsed.data.template as SocialTemplateKey,
      );
      if (!preview) {
        throw new AppError('UNAVAILABLE', 'Market data not ready for this template', 503);
      }
      return reply.send(preview);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/social/publish', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = publishBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);

      const result = await publishSocialPost({
        env: ctx().env,
        redis: ctx().redis,
        log: req.log,
        template: parsed.data.template as SocialTemplateKey,
        triggeredBy: admin.id,
        force: parsed.data.force,
      });

      await writeAdminAudit(
        admin.id,
        'admin.social.publish',
        { template: parsed.data.template, force: parsed.data.force ?? false },
        clientIp(req),
      );

      if (!result) {
        return reply.send({ published: false, reason: 'skipped_or_unavailable' });
      }
      return reply.send({ published: true, ...result });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
