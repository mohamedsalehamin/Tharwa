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
  instagramResolutionHint,
  resolvePageInstagramAccount,
} from '../../services/meta-graph.js';
import {
  clearMetaSocialConfig,
  getMetaSocialConfig,
  isMetaOAuthConfigured,
  metaSocialPublicFromConfig,
  upsertMetaSocialConfig,
} from '../../services/meta-social-credentials.js';
import {
  buildYoutubeOAuthUrl,
  exchangeYoutubeOAuthCode,
  fetchYoutubeChannelForToken,
} from '../../services/youtube-oauth.js';
import {
  clearYoutubeSocialConfig,
  getYoutubeSocialConfig,
  isYoutubeOAuthConfigured,
  upsertYoutubeSocialConfig,
  youtubeSocialPublicFromConfig,
} from '../../services/youtube-social-credentials.js';
import {
  buildTiktokOAuthUrl,
  exchangeTiktokOAuthCode,
  fetchTiktokCreatorInfo,
  fetchTiktokUserInfo,
  getTiktokRedirectUri,
} from '../../services/tiktok-oauth.js';
import {
  clearTiktokSocialConfig,
  getTiktokOAuthScopes,
  getTiktokPostMode,
  getTiktokSocialConfig,
  isTiktokOAuthConfigured,
  upsertTiktokSocialConfig,
  tiktokSocialPublicFromConfig,
} from '../../services/tiktok-social-credentials.js';
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

const socialChannelSchema = z.enum(['facebook', 'instagram', 'youtube', 'tiktok']);

const publishBody = z.object({
  template: templateSchema,
  force: z.boolean().optional(),
  retryFailed: z.boolean().optional(),
  channelsOnly: z.array(socialChannelSchema).min(1).optional(),
});

const youtubeSaveBody = z.object({
  publishEnabled: z.boolean(),
});

const tiktokSaveBody = z.object({
  publishEnabled: z.boolean(),
});

const OAUTH_STATE_PREFIX = 'social:meta-oauth:';
const YOUTUBE_OAUTH_STATE_PREFIX = 'social:youtube-oauth:';
const TIKTOK_OAUTH_STATE_PREFIX = 'social:tiktok-oauth:';

type TiktokOAuthSession = {
  adminId: string;
  redirectUri: string;
};

type MetaOAuthSession = {
  pages: Awaited<ReturnType<typeof fetchMetaPages>>;
  userAccessToken?: string;
  at: number;
};

async function readMetaOAuthSession(
  redis: AppCtx['redis'],
  adminId: string,
): Promise<MetaOAuthSession | null> {
  const raw = await redis.get(`${OAUTH_STATE_PREFIX}pages:${adminId}`);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as MetaOAuthSession;
  if (!parsed || !Array.isArray(parsed.pages)) return null;
  return parsed;
}

function oauthResultHtml(adminOrigin: string, title: string, body: string, query = ''): string {
  const returnUrl = `${adminOrigin.replace(/\/$/, '')}/settings/integrations${query ? `?${query}` : ''}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:40rem"><h1>${title}</h1><p>${body}</p><p><a href="${returnUrl}">Return to Integrations</a></p><script>setTimeout(()=>window.close(),8000)</script></body></html>`;
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function toSocialAdminError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/prisma|invocation|Unknown field|SocialPostFormat|social_post_runs/i.test(message)) {
    return new AppError(
      'CONFIG',
      'Database migration missing — run: npm run migrate (0033_social_video_formats).',
      503,
    );
  }
  if (
    /GEMINI|ffmpeg|ffprobe|SOCIAL_PUBLIC|PUBLIC_FILES_ORIGIN|not found on PATH|Configure Meta/i.test(
      message,
    )
  ) {
    return new AppError('CONFIG', message, 503);
  }
  return err;
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
      const youtube = await getYoutubeSocialConfig(ctx().env);
      const tiktok = await getTiktokSocialConfig(ctx().env);
      return reply.send({
        configured: config != null,
        oauthAvailable: isMetaOAuthConfigured(ctx().env),
        oauthScopes: buildMetaOAuthScopes(ctx().env),
        meta: config ? metaSocialPublicFromConfig(config, ctx().env) : null,
        youtube: {
          configured: youtube != null,
          oauthAvailable: isYoutubeOAuthConfigured(ctx().env),
          channel: youtube ? youtubeSocialPublicFromConfig(youtube) : null,
        },
        tiktok: {
          configured: tiktok != null,
          oauthAvailable: isTiktokOAuthConfigured(ctx().env),
          oauthScopes: getTiktokOAuthScopes(ctx().env),
          postMode: getTiktokPostMode(ctx().env),
          redirectUri: getTiktokRedirectUri(ctx().env),
          account: tiktok ? tiktokSocialPublicFromConfig(tiktok) : null,
        },
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

      const oauthSession = await readMetaOAuthSession(ctx().redis, admin.id);
      let metaUserAccessToken = existing?.metaUserAccessToken;
      if (oauthSession?.userAccessToken) {
        metaUserAccessToken = oauthSession.userAccessToken;
      }

      let igUserId = parsed.data.igUserId ?? null;
      let igUsername = parsed.data.igUsername ?? null;
      let igResolutionError: string | null = null;
      if (!igUserId) {
        const resolved = await resolvePageInstagramAccount(parsed.data.pageId, pageAccessToken, {
          userAccessToken: metaUserAccessToken,
        });
        igUserId = resolved.igUserId;
        igUsername = resolved.igUsername ?? igUsername;
        igResolutionError = resolved.error;
      }
      if (parsed.data.publishInstagram && !igUserId) {
        throw new AppError(
          'VALIDATION',
          instagramResolutionHint({
            igUserId: null,
            igUsername: null,
            error: igResolutionError,
          }),
          400,
        );
      }

      const publicInfo = await upsertMetaSocialConfig(
        admin.id,
        { ...parsed.data, pageAccessToken, metaUserAccessToken, igUserId, igUsername },
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

  app.get('/social/youtube/oauth/start', { ...superadminGuard }, async (req, reply) => {
    try {
      if (!isYoutubeOAuthConfigured(ctx().env)) {
        throw new AppError('CONFIG', 'YouTube OAuth env vars are not configured', 503);
      }
      const state = randomUUID();
      await ctx().redis.set(`${YOUTUBE_OAUTH_STATE_PREFIX}${state}`, req.admin!.id, 'EX', 600);
      return reply.send({ url: buildYoutubeOAuthUrl(ctx().env, state), state });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/social/youtube/oauth/callback', async (req, reply) => {
    const adminOrigin = ctx().env.ADMIN_PUBLIC_ORIGIN;
    try {
      const raw = req.query as Record<string, unknown>;
      const oauthError = typeof raw.error === 'string' ? raw.error : null;
      if (oauthError) {
        return reply
          .type('text/html')
          .send(
            oauthResultHtml(
              adminOrigin,
              'YouTube connection failed',
              `Google returned: ${oauthError}`,
            ),
          );
      }

      const query = z
        .object({ code: z.string().min(1), state: z.string().min(1) })
        .safeParse(req.query);
      if (!query.success) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'YouTube connection failed', 'Missing OAuth code or state.'));
      }

      const adminId = await ctx().redis.get(`${YOUTUBE_OAUTH_STATE_PREFIX}${query.data.state}`);
      if (!adminId) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'YouTube connection failed', 'Invalid or expired OAuth state.'));
      }
      await ctx().redis.del(`${YOUTUBE_OAUTH_STATE_PREFIX}${query.data.state}`);

      const tokens = await exchangeYoutubeOAuthCode(ctx().env, query.data.code);
      const channel = await fetchYoutubeChannelForToken(tokens.accessToken);
      await upsertYoutubeSocialConfig(adminId, {
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        refreshToken: tokens.refreshToken,
        publishEnabled: true,
      });
      await writeAdminAudit(adminId, 'admin.social.youtube.connect', { channelId: channel.channelId });

      return reply.type('text/html').send(
        oauthResultHtml(
          adminOrigin,
          'YouTube connected',
          `Channel «${channel.channelTitle}» is ready for daily Shorts.`,
          'youtube=ok',
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!reply.sent) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'YouTube connection failed', message));
      }
    }
  });

  app.put('/social/youtube', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = youtubeSaveBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const existing = await getYoutubeSocialConfig(ctx().env);
      if (!existing) {
        throw new AppError('NOT_FOUND', 'YouTube is not connected', 404);
      }
      const publicInfo = await upsertYoutubeSocialConfig(admin.id, {
        ...existing,
        publishEnabled: parsed.data.publishEnabled,
      });
      await writeAdminAudit(
        admin.id,
        'admin.social.youtube.update',
        { publishEnabled: parsed.data.publishEnabled },
        clientIp(req),
      );
      return reply.send({ ok: true, channel: publicInfo });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/social/youtube', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      await clearYoutubeSocialConfig();
      await writeAdminAudit(admin.id, 'admin.social.youtube.clear', {}, clientIp(req));
      return reply.send({ ok: true });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/social/tiktok/oauth/start', { ...superadminGuard }, async (req, reply) => {
    try {
      if (!isTiktokOAuthConfigured(ctx().env)) {
        throw new AppError('CONFIG', 'TikTok OAuth env vars are not configured', 503);
      }
      const state = randomUUID();
      const redirectUri = getTiktokRedirectUri(ctx().env);
      if (!redirectUri) {
        throw new AppError('CONFIG', 'TIKTOK_OAUTH_REDIRECT_URI is not configured', 503);
      }
      const session: TiktokOAuthSession = { adminId: req.admin!.id, redirectUri };
      await ctx().redis.set(`${TIKTOK_OAUTH_STATE_PREFIX}${state}`, JSON.stringify(session), 'EX', 600);
      return reply.send({ url: buildTiktokOAuthUrl(ctx().env, state), state });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/social/tiktok/oauth/callback', async (req, reply) => {
    const adminOrigin = ctx().env.ADMIN_PUBLIC_ORIGIN;
    try {
      const raw = req.query as Record<string, unknown>;
      const oauthError = typeof raw.error === 'string' ? raw.error : null;
      if (oauthError) {
        const description =
          typeof raw.error_description === 'string'
            ? decodeURIComponent(raw.error_description.replace(/\+/g, ' '))
            : oauthError;
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'TikTok connection failed', `TikTok returned: ${description}`));
      }

      const query = z
        .object({ code: z.string().min(1), state: z.string().min(1) })
        .safeParse(req.query);
      if (!query.success) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'TikTok connection failed', 'Missing OAuth code or state.'));
      }

      const rawSession = await ctx().redis.get(`${TIKTOK_OAUTH_STATE_PREFIX}${query.data.state}`);
      if (!rawSession) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'TikTok connection failed', 'Invalid or expired OAuth state.'));
      }
      await ctx().redis.del(`${TIKTOK_OAUTH_STATE_PREFIX}${query.data.state}`);

      let session: TiktokOAuthSession;
      try {
        session = JSON.parse(rawSession) as TiktokOAuthSession;
        if (!session?.adminId || !session?.redirectUri) throw new Error('invalid session');
      } catch {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'TikTok connection failed', 'Invalid OAuth session payload.'));
      }

      const tokens = await exchangeTiktokOAuthCode(ctx().env, query.data.code, session.redirectUri);
      const account =
        getTiktokPostMode(ctx().env) === 'direct'
          ? await fetchTiktokCreatorInfo(tokens.accessToken).then((creator) => ({
              openId: tokens.openId,
              username: creator.username,
              displayName: creator.displayName,
            }))
          : await fetchTiktokUserInfo(tokens.accessToken);
      await upsertTiktokSocialConfig(session.adminId, {
        openId: account.openId,
        username: account.username,
        displayName: account.displayName,
        refreshToken: tokens.refreshToken,
        publishEnabled: true,
      });
      await writeAdminAudit(session.adminId, 'admin.social.tiktok.connect', { username: account.username });

      return reply.type('text/html').send(
        oauthResultHtml(
          adminOrigin,
          'TikTok connected',
          `Account @${account.username} is ready for daily video posts.`,
          'tiktok=ok',
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!reply.sent) {
        return reply
          .type('text/html')
          .send(oauthResultHtml(adminOrigin, 'TikTok connection failed', message));
      }
    }
  });

  app.put('/social/tiktok', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = tiktokSaveBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const existing = await getTiktokSocialConfig(ctx().env);
      if (!existing) {
        throw new AppError('NOT_FOUND', 'TikTok is not connected', 404);
      }
      const publicInfo = await upsertTiktokSocialConfig(admin.id, {
        ...existing,
        publishEnabled: parsed.data.publishEnabled,
      });
      await writeAdminAudit(
        admin.id,
        'admin.social.tiktok.update',
        { publishEnabled: parsed.data.publishEnabled },
        clientIp(req),
      );
      return reply.send({ ok: true, account: publicInfo });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/social/tiktok', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      await clearTiktokSocialConfig();
      await writeAdminAudit(admin.id, 'admin.social.tiktok.clear', {}, clientIp(req));
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
        JSON.stringify({ pages, userAccessToken: userToken, at: Date.now() } satisfies MetaOAuthSession),
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
      const session = await readMetaOAuthSession(ctx().redis, admin.id);
      return reply.send({ pages: session?.pages ?? [] });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/social/meta/detect-instagram', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const body = z
        .object({
          pageId: z.string().min(1).optional(),
          pageAccessToken: z.string().min(20).optional(),
        })
        .safeParse(req.body ?? {});

      const existing = await getMetaSocialConfig(ctx().env);
      const pageId = body.success ? (body.data.pageId ?? existing?.pageId) : existing?.pageId;
      let pageAccessToken = body.success
        ? (body.data.pageAccessToken?.trim() ?? '')
        : '';
      if (pageAccessToken.length < 20 && existing && existing.pageId === pageId) {
        pageAccessToken = existing.pageAccessToken;
      }
      if (!pageId || pageAccessToken.length < 20) {
        throw new AppError(
          'VALIDATION',
          'Save a Facebook Page connection first, or pass pageId and pageAccessToken.',
          400,
        );
      }

      const resolution = await resolvePageInstagramAccount(pageId, pageAccessToken, {
        userAccessToken:
          (await readMetaOAuthSession(ctx().redis, admin.id))?.userAccessToken ??
          existing?.metaUserAccessToken,
      });
      if (!resolution.igUserId) {
        return reply.send({
          ...resolution,
          pageId,
          updated: false,
          hint: instagramResolutionHint(resolution),
        });
      }

      if (!existing || existing.pageId !== pageId) {
        return reply.send({
          ...resolution,
          updated: false,
          hint: 'Instagram account found. Select this Page from OAuth and Save to store it.',
        });
      }

      const publicInfo = await upsertMetaSocialConfig(
        admin.id,
        {
          ...existing,
          pageAccessToken,
          igUserId: resolution.igUserId,
          igUsername: resolution.igUsername,
        },
        ctx().env,
      );
      await writeAdminAudit(
        admin.id,
        'admin.social.meta.detect_instagram',
        { pageId, igUserId: resolution.igUserId },
        clientIp(req),
      );
      return reply.send({
        ...resolution,
        updated: true,
        meta: publicInfo,
      });
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
        retryFailed: parsed.data.retryFailed,
        channelsOnly: parsed.data.channelsOnly,
      });

      await writeAdminAudit(
        admin.id,
        'admin.social.publish',
        {
          template: parsed.data.template,
          force: parsed.data.force ?? false,
          retryFailed: parsed.data.retryFailed ?? false,
          channelsOnly: parsed.data.channelsOnly ?? null,
        },
        clientIp(req),
      );

      if (!result) {
        return reply.send({ published: false, reason: 'skipped_or_unavailable' });
      }
      return reply.send({ published: true, ...result });
    } catch (e) {
      if (!reply.sent) sendError(reply, toSocialAdminError(e));
    }
  });
};
