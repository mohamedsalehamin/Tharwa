/** Client IP for rate limiting (honors first `X-Forwarded-For` hop when present). */
export function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim() ?? 'unknown';
  return req.ip ?? 'unknown';
}
