import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { clientIp } from '../../lib/client-ip.js';
import { allowAuthRateLimit } from '../../plugins/auth-rate-limit.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { deleteConsumerAccount } from '../../services/consumer-account.js';
import { registerConsumerWithPassword, verifyConsumerPasswordLogin } from '../../services/consumer-auth.js';
import { signInWithSocialIdentity, SocialAuthError } from '../../services/consumer-social-auth.js';
import {
  getConsumerUserPublic,
  updateConsumerProfile,
  type ConsumerUserPublic,
} from '../../services/consumer-user.js';
import {
  SocialTokenError,
  verifyAppleIdToken,
  verifyGoogleIdToken,
} from '../../services/social-id-token.js';
import {
  issueConsumerRefreshToken,
  revokeConsumerRefreshToken,
  rotateConsumerRefreshToken,
} from '../../services/consumer-refresh-tokens.js';
import { signConsumerAccessToken } from '../../services/consumer-jwt.js';
import { issueEmailVerificationToken, verifyEmailWithToken } from '../../services/email-verification.js';
import {
  consumePasswordResetToken,
  issuePasswordResetToken,
} from '../../services/password-reset.js';
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from '../../services/transactional-email.js';

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  phone: z.string().min(8).max(20).regex(/^[\d+\s()-]+$/),
});

const profilePatchBody = z.object({
  name: z.string().min(1).max(120).optional().nullable(),
  phone: z.string().max(20).optional().nullable().or(z.literal('')),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const refreshBody = z.object({
  refreshToken: z.string().min(20).max(512),
});

const forgotPasswordBody = z.object({
  email: z.string().email(),
});

const resetPasswordBody = z.object({
  resetToken: z.string().min(20).max(512),
  newPassword: z.string().min(8).max(128),
});

const verifyEmailBody = z.object({
  verificationToken: z.string().min(20).max(512),
});

const deleteAccountBody = z.object({
  password: z.string().min(1).max(128).optional(),
});

const socialLoginBody = z.object({
  provider: z.enum(['google', 'apple']),
  idToken: z.string().min(20).max(8192),
  name: z.string().min(1).max(120).optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

async function authTokens(ctx: AppCtx, profile: ConsumerUserPublic) {
  const accessToken = await signConsumerAccessToken(ctx.env, {
    sub: profile.id,
    email: profile.email,
  });
  const refresh = await issueConsumerRefreshToken(ctx.env, profile.id);
  return {
    accessToken,
    tokenType: 'Bearer' as const,
    expiresIn: ctx.env.CONSUMER_ACCESS_TOKEN_TTL_SEC,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: profile,
  };
}

export const v1AuthRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;

  app.post('/auth/register', async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!allowAuthRateLimit(`reg:${ip}`)) {
        throw new AppError('RATE_LIMIT', 'Too many requests', 429);
      }
      const parsed = registerBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const result = await registerConsumerWithPassword(
        parsed.data.email,
        parsed.data.password,
        parsed.data.name,
        parsed.data.phone,
      );
      if (!result.ok) {
        throw new AppError('CONFLICT', 'Email already registered', 409);
      }
      const verification = await issueEmailVerificationToken(ctx().env, result.user.id);
      void sendEmailVerificationEmail(ctx().env, app.log, {
        email: result.user.email,
        verificationToken: verification.verificationToken,
        expiresAt: verification.expiresAt,
      }).catch(() => {});
      const tokens = await authTokens(ctx(), result.user);
      const body: Record<string, unknown> = { ...tokens };
      if (ctx().env.NODE_ENV === 'development') {
        body.verificationToken = verification.verificationToken;
      }
      return reply.status(201).send(body);
    } catch (e) {
      if (e instanceof Error && (e.message === 'Invalid phone number' || e.message === 'Invalid name')) {
        if (!reply.sent) sendError(reply, new AppError('VALIDATION', e.message, 400));
        return;
      }
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/auth/social', async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!allowAuthRateLimit(`social:${ip}`)) {
        throw new AppError('RATE_LIMIT', 'Too many requests', 429);
      }
      const parsed = socialLoginBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const env = ctx().env;
      let identity;
      if (parsed.data.provider === 'google') {
        identity = await verifyGoogleIdToken(parsed.data.idToken, env.GOOGLE_OAUTH_CLIENT_IDS);
      } else {
        identity = await verifyAppleIdToken(parsed.data.idToken, env.APPLE_SIGN_IN_CLIENT_IDS);
      }
      let user;
      try {
        user = await signInWithSocialIdentity(identity, { displayName: parsed.data.name });
      } catch (e) {
        if (e instanceof Error && e.message === 'Invalid name') {
          throw new AppError('VALIDATION', 'Invalid name', 400);
        }
        throw e;
      }
      return reply.send(await authTokens(ctx(), user));
    } catch (e) {
      if (e instanceof SocialTokenError) {
        if (!reply.sent) sendError(reply, new AppError('UNAUTHORIZED', e.message, 401));
        return;
      }
      if (e instanceof SocialAuthError) {
        if (e.code === 'EMAIL_REQUIRED') {
          if (!reply.sent) sendError(reply, new AppError('VALIDATION', e.message, 400));
          return;
        }
        if (e.code === 'ACCOUNT_CONFLICT') {
          if (!reply.sent) sendError(reply, new AppError('CONFLICT', e.message, 409));
          return;
        }
      }
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/auth/login', async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!allowAuthRateLimit(`login:${ip}`)) {
        throw new AppError('RATE_LIMIT', 'Too many requests', 429);
      }
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const user = await verifyConsumerPasswordLogin(parsed.data.email, parsed.data.password);
      if (!user) {
        throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);
      }
      return reply.send(await authTokens(ctx(), user));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/auth/refresh', async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!allowAuthRateLimit(`refresh:${ip}`)) {
        throw new AppError('RATE_LIMIT', 'Too many requests', 429);
      }
      const parsed = refreshBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const rotated = await rotateConsumerRefreshToken(ctx().env, parsed.data.refreshToken);
      if (!rotated) {
        throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token', 401);
      }
      const accessToken = await signConsumerAccessToken(ctx().env, {
        sub: rotated.userId,
        email: rotated.user.email,
      });
      return reply.send({
        accessToken,
        tokenType: 'Bearer',
        expiresIn: ctx().env.CONSUMER_ACCESS_TOKEN_TTL_SEC,
        refreshToken: rotated.newRefreshToken,
        refreshExpiresAt: rotated.expiresAt.toISOString(),
        user: rotated.user,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/auth/logout', async (req, reply) => {
    try {
      const parsed = refreshBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      await revokeConsumerRefreshToken(parsed.data.refreshToken);
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/auth/forgot-password', async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!allowAuthRateLimit(`forgot:${ip}`)) {
        throw new AppError('RATE_LIMIT', 'Too many requests', 429);
      }
      const parsed = forgotPasswordBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const issued = await issuePasswordResetToken(ctx().env, parsed.data.email);
      if (issued) {
        void sendPasswordResetEmail(ctx().env, app.log, {
          email: parsed.data.email.trim().toLowerCase(),
          resetToken: issued.resetToken,
          expiresAt: issued.expiresAt,
        }).catch(() => {});
      }
      const body: Record<string, unknown> = {
        message: 'If that email exists, a reset link was sent.',
      };
      if (ctx().env.NODE_ENV === 'development' && issued) {
        body.resetToken = issued.resetToken;
        body.resetExpiresAt = issued.expiresAt.toISOString();
      }
      return reply.send(body);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/auth/reset-password', async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!allowAuthRateLimit(`reset:${ip}`)) {
        throw new AppError('RATE_LIMIT', 'Too many requests', 429);
      }
      const parsed = resetPasswordBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const user = await consumePasswordResetToken(parsed.data.resetToken, parsed.data.newPassword);
      if (!user) {
        throw new AppError('UNAUTHORIZED', 'Invalid or expired reset token', 401);
      }
      return reply.send(await authTokens(ctx(), user));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/auth/verify-email', async (req, reply) => {
    try {
      const parsed = verifyEmailBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const ok = await verifyEmailWithToken(parsed.data.verificationToken);
      if (!ok) {
        throw new AppError('UNAUTHORIZED', 'Invalid or expired verification token', 401);
      }
      return reply.send({ verified: true });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get(
    '/me',
    { preHandler: consumerBearerPreHandler(ctx().env) },
    async (req, reply) => {
      try {
        const profile = await getConsumerUserPublic(req.consumer!.id);
        if (!profile) {
          throw new AppError('NOT_FOUND', 'Account not found', 404);
        }
        return reply.send(profile);
      } catch (e) {
        if (!reply.sent) sendError(reply, e);
      }
    },
  );

  app.patch(
    '/me',
    { preHandler: consumerBearerPreHandler(ctx().env) },
    async (req, reply) => {
      try {
        const parsed = profilePatchBody.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
        }
        let profile;
        try {
          profile = await updateConsumerProfile(req.consumer!.id, {
            name: parsed.data.name,
            phone: parsed.data.phone,
          });
        } catch (e) {
          if (e instanceof Error && (e.message === 'Invalid phone number' || e.message === 'Invalid name')) {
            throw new AppError('VALIDATION', e.message, 400);
          }
          throw e;
        }
        if (!profile) {
          throw new AppError('NOT_FOUND', 'Account not found', 404);
        }
        return reply.send(profile);
      } catch (e) {
        if (!reply.sent) sendError(reply, e);
      }
    },
  );

  app.delete(
    '/auth/account',
    { preHandler: consumerBearerPreHandler(ctx().env) },
    async (req, reply) => {
      try {
        const ip = clientIp(req);
        if (!allowAuthRateLimit(`delete-account:${ip}`)) {
          throw new AppError('RATE_LIMIT', 'Too many requests', 429);
        }
        const parsed = deleteAccountBody.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
        }
        const result = await deleteConsumerAccount(req.consumer!.id, parsed.data.password);
        if (!result.ok) {
          if (result.code === 'INVALID_PASSWORD') {
            throw new AppError('UNAUTHORIZED', 'Invalid password', 401);
          }
          if (result.code === 'NO_PASSWORD') {
            throw new AppError(
              'VALIDATION',
              'This account has no password. Sign in with your original method or set a password first.',
              400,
            );
          }
          throw new AppError('NOT_FOUND', 'Account not found', 404);
        }
        return reply.status(204).send();
      } catch (e) {
        if (!reply.sent) sendError(reply, e);
      }
    },
  );
};
