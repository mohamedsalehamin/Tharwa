import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { InstrumentKind, MetalUnit, Prisma } from '@prisma/client';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { requireSuperadmin } from '../../plugins/admin-role.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import { signAdminAccessToken } from '../../services/admin-jwt.js';
import { verifyPassword } from '../../services/password.js';
import { assertValidSecretRef } from '../../lib/secrets/resolver.js';
import { SecretResolverError } from '../../lib/secrets/errors.js';
import { isFcmConfigured } from '../../services/fcm.js';
import { broadcastPush, pushAudienceStats } from '../../services/push-devices.js';
import type { PushBroadcastAudience } from '../../services/push-audience.js';
import {
  createEquityInstrument,
  instrumentAdminPayload,
  validateEquityInstrumentCode,
} from '../../services/instruments.js';
import { invalidateMarketCachesForInstrument } from '../../services/instrument-presentation.js';
import { invalidateMarketCaches } from '../../services/market-cache.js';
import {
  computeUpstreamHealth,
  UPSTREAM_DEGRADED_MAX_AGE_SEC,
  UPSTREAM_HEALTHY_MAX_AGE_SEC,
} from '../../services/upstream-health.js';
import { isPlausibleEgxTickerForTv, normalizeEquitySymbolParam } from '../../services/curated-equities.js';
import { searchCompaniesCached } from '../../services/stocks.js';
import { mergeJsonMetadata } from '../../lib/merge-metadata.js';
import { parseFxMetadata } from '../../lib/instrument-metadata.js';
import {
  publicFileUrl,
  saveInstrumentFlagFile,
  type InstrumentFlagKind,
} from '../../services/instrument-flag-storage.js';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const patchInstrumentBody = z.object({
  isConsumerVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  displayNameAr: z.string().min(1).optional(),
  displayNameEn: z.string().min(1).optional(),
  metadata: z.union([z.record(z.string(), z.any()), z.null()]).optional(),
});

const patchUpstreamBody = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().min(1).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    secretRef: z.union([z.string(), z.null()]).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'At least one field is required',
  });

const pushBroadcastBody = z.object({
  audience: z.enum(['all', 'registered', 'ios', 'android']),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  data: z.record(z.string(), z.string()).optional(),
});

const listUsersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().optional(),
});

const listAuditLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().trim().max(120).optional(),
  adminUserId: z.string().uuid().optional(),
  adminEmail: z.string().trim().max(200).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
});

function parseAuditDateBound(raw: string | undefined, endOfDay: boolean): Date | undefined {
  if (!raw?.trim()) return undefined;
  const trimmed = raw.trim();
  const d =
    trimmed.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? new Date(`${trimmed}T00:00:00.000Z`)
      : new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('VALIDATION', `Invalid date: ${raw}`, 400);
  }
  if (endOfDay && trimmed.length === 10) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

const createUpstreamBody = z.object({
  name: z.string().min(1),
  type: z.enum(['fx', 'metals', 'equities']),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secretRef: z.union([z.string(), z.null()]).optional(),
});

const listInstrumentsQuery = z.object({
  kind: z.enum(['fx', 'metal', 'equity']).optional(),
});

const createEquityInstrumentBody = z.object({
  code: z.string().min(1).max(32),
  displayNameEn: z.string().min(1),
  displayNameAr: z.string().min(1).optional(),
  isConsumerVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z
    .object({
      tvSymbol: z.string().min(1).optional(),
    })
    .optional(),
});

const egxSearchQuery = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function upstreamStatusPayload(r: {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: unknown;
  secretRef: string | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
}) {
  const config =
    r.config !== null && typeof r.config === 'object' && !Array.isArray(r.config)
      ? (r.config as Record<string, unknown>)
      : {};
  const status = computeUpstreamHealth(r);
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    enabled: r.enabled,
    config,
    secretRef: r.secretRef ?? null,
    lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
    lastError: r.lastError ?? null,
    status,
  };
}

const invalidateCacheBody = z.object({
  scopes: z
    .array(z.enum(['fx', 'metals', 'equities', 'all']))
    .min(1)
    .max(4)
    .default(['all']),
});

function validateSecretRefField(ref: string | null | undefined): void {
  if (ref === undefined || ref === null) return;
  try {
    assertValidSecretRef(ref);
  } catch (e) {
    const msg = e instanceof SecretResolverError ? e.message : 'Invalid secretRef';
    throw new AppError('VALIDATION', msg, 400);
  }
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

export const adminV1Routes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;

  await app.register(multipart, {
    limits: { fileSize: 512 * 1024, files: 1 },
  });

  app.post('/auth/login', async (req, reply) => {
    try {
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const email = parsed.data.email.trim().toLowerCase();
      const ip = clientIp(req);
      const user = await prisma.adminUser.findUnique({ where: { email } });
      if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
        throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);
      }
      const token = await signAdminAccessToken(ctx().env, {
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      await writeAdminAudit(user.id, 'admin.auth.login', { email: user.email }, ip);
      return reply.send({
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn: ctx().env.ADMIN_ACCESS_TOKEN_TTL_SEC,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  const guard = { preHandler: adminBearerPreHandler(ctx().env) };
  const superadminGuard = {
    preHandler: [adminBearerPreHandler(ctx().env), requireSuperadmin],
  };

  app.get('/auth/me', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!; // role/email loaded from DB in adminBearerPreHandler
      return reply.send({
        id: admin.id,
        email: admin.email,
        role: admin.role,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/audit-logs', { ...guard }, async (req, reply) => {
    try {
      const parsed = listAuditLogsQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { limit, offset, action, adminUserId, adminEmail } = parsed.data;
      const from = parseAuditDateBound(parsed.data.from, false);
      const to = parseAuditDateBound(parsed.data.to, true);

      const adminWhere: Prisma.AdminUserWhereInput | undefined = (() => {
        if (adminUserId) return { id: adminUserId };
        if (adminEmail?.trim()) {
          return { email: { contains: adminEmail.trim(), mode: 'insensitive' } };
        }
        return undefined;
      })();

      const where: Prisma.AdminAuditLogWhereInput = {
        ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(adminWhere ? { adminUser: adminWhere } : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.adminAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            adminUser: { select: { id: true, email: true, role: true } },
          },
        }),
        prisma.adminAuditLog.count({ where }),
      ]);

      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          payload: r.payload,
          ip: r.ip,
          createdAt: r.createdAt.toISOString(),
          adminUser: {
            id: r.adminUser.id,
            email: r.adminUser.email,
            role: r.adminUser.role,
          },
        })),
        total,
        limit,
        offset,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/users', { ...guard }, async (req, reply) => {
    try {
      const parsed = listUsersQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { limit, offset, q } = parsed.data;
      const search = q?.trim();
      const where =
        search && search.length > 0
          ? { email: { contains: search, mode: 'insensitive' as const } }
          : undefined;
      const [rows, total] = await Promise.all([
        prisma.consumerUser.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            passwordHash: true,
            authSubject: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.consumerUser.count({ where }),
      ]);
      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          email: r.email,
          emailVerifiedAt: r.emailVerifiedAt?.toISOString() ?? null,
          hasPassword: r.passwordHash != null,
          hasAuthSubject: r.authSubject != null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
        total,
        limit,
        offset,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/ops/invalidate-cache', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = invalidateCacheBody.safeParse(req.body ?? { scopes: ['all'] });
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { deletedKeys } = await invalidateMarketCaches(ctx().redis, parsed.data.scopes);
      await writeAdminAudit(
        admin.id,
        'admin.ops.invalidate_cache',
        { scopes: parsed.data.scopes, deletedKeys },
        clientIp(req),
      );
      return reply.send({
        scopes: parsed.data.scopes,
        deletedKeys,
        thresholds: {
          healthyMaxAgeSec: UPSTREAM_HEALTHY_MAX_AGE_SEC,
          degradedMaxAgeSec: UPSTREAM_DEGRADED_MAX_AGE_SEC,
        },
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/upstreams', { ...guard }, async (_req, reply) => {
    try {
      const rows = await prisma.upstreamConnection.findMany({ orderBy: { name: 'asc' } });
      const items = rows.map((r) => upstreamStatusPayload(r));
      const summary = { healthy: 0, degraded: 0, down: 0, disabled: 0, unknown: 0 };
      for (const i of items) {
        const s = i.status;
        if (s === 'healthy') summary.healthy += 1;
        else if (s === 'degraded') summary.degraded += 1;
        else if (s === 'down') summary.down += 1;
        else if (s === 'disabled') summary.disabled += 1;
        else summary.unknown += 1;
      }
      return reply.send({
        items,
        summary,
        thresholds: {
          healthyMaxAgeSec: UPSTREAM_HEALTHY_MAX_AGE_SEC,
          degradedMaxAgeSec: UPSTREAM_DEGRADED_MAX_AGE_SEC,
        },
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/upstreams', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = createUpstreamBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const b = parsed.data;
      validateSecretRefField(b.secretRef);
      const row = await prisma.upstreamConnection.create({
        data: {
          name: b.name,
          type: b.type,
          enabled: b.enabled ?? true,
          config: (b.config ?? {}) as Prisma.InputJsonValue,
          secretRef: b.secretRef === undefined ? undefined : b.secretRef,
        },
      });
      await writeAdminAudit(
        admin.id,
        'admin.upstreams.create',
        { id: row.id, name: row.name, type: row.type },
        clientIp(req),
      );
      return reply.status(201).send({ item: upstreamStatusPayload(row) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.patch('/upstreams/:id', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const { id } = req.params as { id: string };
      const parsed = patchUpstreamBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const existing = await prisma.upstreamConnection.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('NOT_FOUND', 'Upstream not found', 404);
      }
      const data: Prisma.UpstreamConnectionUpdateInput = {};
      const b = parsed.data;
      if (admin.role === 'operator') {
        const restricted = ['name', 'config', 'secretRef'].filter(
          (k) => b[k as keyof typeof b] !== undefined,
        );
        if (restricted.length > 0) {
          throw new AppError(
            'FORBIDDEN',
            'Operators may only change upstream enabled state',
            403,
          );
        }
      }
      validateSecretRefField(b.secretRef);
      if (b.enabled !== undefined) data.enabled = b.enabled;
      if (b.name !== undefined) data.name = b.name;
      if (b.config !== undefined) data.config = b.config as Prisma.InputJsonValue;
      if (b.secretRef !== undefined) data.secretRef = b.secretRef;
      const updated = await prisma.upstreamConnection.update({ where: { id }, data });
      await writeAdminAudit(
        admin.id,
        'admin.upstreams.patch',
        {
          id,
          before: { name: existing.name, enabled: existing.enabled },
          after: {
            enabled: b.enabled,
            name: b.name,
            configUpdated: b.config !== undefined,
            secretRefUpdated: b.secretRef !== undefined,
            secretRefCleared: b.secretRef === null,
          },
        },
        clientIp(req),
      );
      return reply.send({
        item: upstreamStatusPayload(updated),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.delete('/upstreams/:id', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const { id } = req.params as { id: string };
      const existing = await prisma.upstreamConnection.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('NOT_FOUND', 'Upstream not found', 404);
      }
      await prisma.upstreamConnection.delete({ where: { id } });
      await writeAdminAudit(
        admin.id,
        'admin.upstreams.delete',
        { id, name: existing.name, type: existing.type },
        clientIp(req),
      );
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/instruments', { ...guard }, async (req, reply) => {
    try {
      const parsed = listInstrumentsQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const rows = await prisma.instrument.findMany({
        where: parsed.data.kind ? { kind: parsed.data.kind } : undefined,
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });
      return reply.send({
        items: rows.map((r) => instrumentAdminPayload(r)),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/instruments/egx-search', { ...guard }, async (req, reply) => {
    try {
      const parsed = egxSearchQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const q = parsed.data.q.trim();
      const queries = [
        q.toUpperCase(),
        q.includes(':') ? q.toUpperCase() : `EGX:${q.toUpperCase()}`,
      ];
      const seen = new Set<string>();
      const merged: Array<{
        symbol: string;
        tvSymbol: string;
        description: string;
        exchange: string;
      }> = [];

      for (const query of [...new Set(queries)]) {
        const { items } = await searchCompaniesCached(ctx().env, ctx().redis, req.log, {
          q: query,
          type: 'stock',
          limit: parsed.data.limit,
          offset: 0,
        });
        for (const row of items) {
          if (row.exchange !== 'EGX' && !row.id.startsWith('EGX:')) continue;
          const symbol = normalizeEquitySymbolParam(row.symbol || row.id);
          if (!isPlausibleEgxTickerForTv(symbol)) continue;
          if (seen.has(symbol)) continue;
          seen.add(symbol);
          merged.push({
            symbol,
            tvSymbol: row.id.startsWith('EGX:') ? row.id : `EGX:${symbol}`,
            description: row.description?.trim() || symbol,
            exchange: row.exchange || 'EGX',
          });
        }
      }

      const codes = merged.map((m) => m.symbol);
      const existingRows =
        codes.length > 0
          ? await prisma.instrument.findMany({
              where: { code: { in: codes }, kind: InstrumentKind.equity },
              select: { id: true, code: true },
            })
          : [];
      const byCode = new Map(existingRows.map((r) => [r.code.toUpperCase(), r]));

      return reply.send({
        q: parsed.data.q,
        items: merged.slice(0, parsed.data.limit).map((m) => {
          const ex = byCode.get(m.symbol.toUpperCase());
          return {
            ...m,
            alreadyExists: Boolean(ex),
            existingInstrumentId: ex?.id ?? null,
          };
        }),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/instruments', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = createEquityInstrumentBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      let code: string;
      try {
        code = validateEquityInstrumentCode(parsed.data.code);
      } catch {
        throw new AppError('VALIDATION', 'Invalid EGX ticker code', 400);
      }
      const dup = await prisma.instrument.findUnique({ where: { code } });
      if (dup) {
        throw new AppError('CONFLICT', 'Instrument code already exists', 409);
      }

      const created = await createEquityInstrument(parsed.data);
      await writeAdminAudit(
        admin.id,
        'admin.instruments.create',
        { id: created.id, code: created.code, kind: created.kind },
        clientIp(req),
      );
      await invalidateMarketCachesForInstrument(ctx().redis, created.kind);
      return reply.status(201).send({ item: instrumentAdminPayload(created) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.patch('/instruments/:id', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const { id } = req.params as { id: string };
      const parsed = patchInstrumentBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const existing = await prisma.instrument.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('NOT_FOUND', 'Instrument not found', 404);
      }
      const data: Prisma.InstrumentUpdateInput = {};
      const b = parsed.data;
      if (b.isConsumerVisible !== undefined) data.isConsumerVisible = b.isConsumerVisible;
      if (b.sortOrder !== undefined) data.sortOrder = b.sortOrder;
      if (b.displayNameAr !== undefined) data.displayNameAr = b.displayNameAr;
      if (b.displayNameEn !== undefined) data.displayNameEn = b.displayNameEn;
      if (b.metadata !== undefined) {
        data.metadata =
          b.metadata === null
            ? Prisma.JsonNull
            : (mergeJsonMetadata(
                existing.metadata,
                b.metadata as Record<string, unknown>,
              ) as Prisma.InputJsonValue);
      }
      const updated = await prisma.instrument.update({ where: { id }, data });
      await writeAdminAudit(
        admin.id,
        'admin.instruments.patch',
        { id, before: { code: existing.code }, after: b },
        clientIp(req),
      );
      await invalidateMarketCachesForInstrument(ctx().redis, updated.kind);
      return reply.send({
        item: instrumentAdminPayload(updated),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/instruments/:id/flag', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const { id } = req.params as { id: string };
      const existing = await prisma.instrument.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('NOT_FOUND', 'Instrument not found', 404);
      }
      if (existing.kind !== InstrumentKind.fx && existing.kind !== InstrumentKind.metal) {
        throw new AppError('VALIDATION', 'Image upload is only supported for FX and metal instruments', 400);
      }

      const part = await req.file();
      if (!part) {
        throw new AppError('VALIDATION', 'Missing file field "flag"', 400);
      }
      const buffer = await part.toBuffer();
      const mime = part.mimetype || 'application/octet-stream';
      const flagKind: InstrumentFlagKind =
        existing.kind === InstrumentKind.fx ? 'fx' : 'metal';
      const relativePath = await saveInstrumentFlagFile(
        ctx().env,
        flagKind,
        existing.code,
        buffer,
        mime,
      );
      const flagUrl = publicFileUrl(ctx().env, relativePath, `${req.protocol}://${req.hostname}`);

      const metadata =
        existing.kind === InstrumentKind.fx
          ? mergeJsonMetadata(existing.metadata, {
              quoteCategory: parseFxMetadata(existing.metadata).quoteCategory ?? 'official',
              flagUrl,
            })
          : mergeJsonMetadata(existing.metadata, { flagUrl });

      const updated = await prisma.instrument.update({
        where: { id },
        data: { metadata: metadata as Prisma.InputJsonValue },
      });

      await writeAdminAudit(
        admin.id,
        'admin.instruments.flag.upload',
        { id, code: existing.code, flagUrl },
        clientIp(req),
      );
      await invalidateMarketCachesForInstrument(ctx().redis, updated.kind);

      return reply.send({
        flagUrl,
        item: instrumentAdminPayload(updated),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  const karatRuleInput = z.object({
    karat: z.number().int().min(18).max(24).nullable(),
    unit: z.enum(['gram', 'troy_ounce']),
    priceNumerator: z.number().int().positive(),
    priceDenominator: z.number().int().positive(),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  });

  const putKaratRulesBody = z.object({
    rules: z.array(karatRuleInput).min(1).max(12),
  });

  app.get('/instruments/:id/karat-rules', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const ins = await prisma.instrument.findUnique({ where: { id } });
      if (!ins || ins.kind !== 'metal') {
        throw new AppError('NOT_FOUND', 'Metal instrument not found', 404);
      }
      const rules = await prisma.metalKaratRule.findMany({
        where: { instrumentId: id },
        orderBy: [{ sortOrder: 'asc' }, { karat: 'asc' }],
      });
      return reply.send({
        instrumentId: id,
        items: rules.map((r) => ({
          id: r.id,
          karat: r.karat,
          unit: r.unit,
          priceNumerator: r.priceNumerator,
          priceDenominator: r.priceDenominator,
          sortOrder: r.sortOrder,
          isActive: r.isActive,
        })),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/push/audiences', { ...guard }, async (_req, reply) => {
    try {
      const audiences = await pushAudienceStats();
      return reply.send({
        fcmConfigured: await isFcmConfigured(ctx().env),
        audiences,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/push/broadcast', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = pushBroadcastBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      if (!(await isFcmConfigured(ctx().env))) {
        throw new AppError(
          'SERVICE_UNAVAILABLE',
          'FCM is not configured. Upload a service account in Settings → Integrations.',
          503,
        );
      }
      const result = await broadcastPush(ctx().env, {
        audience: parsed.data.audience as PushBroadcastAudience,
        title: parsed.data.title.trim(),
        body: parsed.data.body.trim(),
        data: parsed.data.data,
      });
      await writeAdminAudit(
        admin.id,
        'admin.push.broadcast',
        {
          audience: result.audience,
          title: parsed.data.title,
          targetedDeviceCount: result.targetedDeviceCount,
          successCount: result.successCount,
          failureCount: result.failureCount,
        },
        clientIp(req),
      );
      return reply.send({ result });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/instruments/:id/karat-rules', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const { id } = req.params as { id: string };
      const parsed = putKaratRulesBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const ins = await prisma.instrument.findUnique({ where: { id } });
      if (!ins || ins.kind !== 'metal') {
        throw new AppError('NOT_FOUND', 'Metal instrument not found', 404);
      }
      await prisma.$transaction([
        prisma.metalKaratRule.deleteMany({ where: { instrumentId: id } }),
        prisma.metalKaratRule.createMany({
          data: parsed.data.rules.map((r) => ({
            instrumentId: id,
            karat: r.karat,
            unit: r.unit as MetalUnit,
            priceNumerator: r.priceNumerator,
            priceDenominator: r.priceDenominator,
            sortOrder: r.sortOrder,
            isActive: r.isActive,
          })),
        }),
      ]);
      await writeAdminAudit(
        admin.id,
        'admin.instruments.karat_rules.replace',
        { instrumentId: id, count: parsed.data.rules.length },
        clientIp(req),
      );
      const rules = await prisma.metalKaratRule.findMany({
        where: { instrumentId: id },
        orderBy: [{ sortOrder: 'asc' }, { karat: 'asc' }],
      });
      await invalidateMarketCachesForInstrument(ctx().redis, InstrumentKind.metal);
      return reply.send({
        instrumentId: id,
        items: rules.map((r) => ({
          id: r.id,
          karat: r.karat,
          unit: r.unit,
          priceNumerator: r.priceNumerator,
          priceDenominator: r.priceDenominator,
          sortOrder: r.sortOrder,
          isActive: r.isActive,
        })),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
