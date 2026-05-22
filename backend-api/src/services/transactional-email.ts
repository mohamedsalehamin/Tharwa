import { Resend } from 'resend';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';

export function appendTokenToActionUrl(baseUrl: string, token: string): string {
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}token=${encodeURIComponent(token)}`;
}

function resendClient(env: Env): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  return new Resend(env.RESEND_API_KEY);
}

async function sendViaResend(
  env: Env,
  log: FastifyBaseLogger,
  args: { to: string; subject: string; html: string; text: string },
): Promise<boolean> {
  const client = resendClient(env);
  if (!client) {
    log.info({ to: args.to, subject: args.subject }, 'email skipped (RESEND_API_KEY not set)');
    return false;
  }
  const { error } = await client.emails.send({
    from: env.RESEND_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (error) {
    log.warn({ err: error, to: args.to }, 'transactional email send failed');
    return false;
  }
  return true;
}

function expiryMinutes(expiresAt: Date): number {
  return Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
}

export async function sendPasswordResetEmail(
  env: Env,
  log: FastifyBaseLogger,
  args: { email: string; resetToken: string; expiresAt: Date },
): Promise<void> {
  const resetUrl = appendTokenToActionUrl(env.CONSUMER_PASSWORD_RESET_URL, args.resetToken);
  const mins = expiryMinutes(args.expiresAt);
  const subject = 'Reset your Tharwa password';
  const text = [
    'You requested a password reset for your Tharwa account.',
    '',
    `Open this link in the Tharwa app (expires in ${mins} minutes):`,
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    '— Tharwa',
  ].join('\n');
  const html = `
    <p>You requested a password reset for your <strong>Tharwa</strong> account.</p>
    <p><a href="${resetUrl}">Reset your password</a> (link expires in ${mins} minutes).</p>
    <p>If the button does not open the app, copy this URL into your device:</p>
    <p style="word-break:break-all;font-family:monospace;font-size:13px">${resetUrl}</p>
    <p>If you did not request this, you can ignore this email.</p>
  `.trim();
  await sendViaResend(env, log, { to: args.email, subject, html, text });
}

export async function sendEmailVerificationEmail(
  env: Env,
  log: FastifyBaseLogger,
  args: { email: string; verificationToken: string; expiresAt: Date },
): Promise<void> {
  const verifyUrl = appendTokenToActionUrl(env.CONSUMER_EMAIL_VERIFY_URL, args.verificationToken);
  const mins = expiryMinutes(args.expiresAt);
  const subject = 'Verify your Tharwa email';
  const text = [
    'Welcome to Tharwa.',
    '',
    `Verify your email (expires in ${mins} minutes):`,
    verifyUrl,
    '',
    '— Tharwa',
  ].join('\n');
  const html = `
    <p>Welcome to <strong>Tharwa</strong>.</p>
    <p><a href="${verifyUrl}">Verify your email</a> (link expires in ${mins} minutes).</p>
    <p style="word-break:break-all;font-family:monospace;font-size:13px">${verifyUrl}</p>
  `.trim();
  await sendViaResend(env, log, { to: args.email, subject, html, text });
}
