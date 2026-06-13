/** Shared path matching for anonymous market read endpoints. */

export function publicMarketPath(url: string): string {
  return url.split('?')[0] ?? url;
}

export function isPublicMarketReadPath(method: string, url: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const path = publicMarketPath(url);
  if (
    path === '/v1/fx/rates' ||
    path === '/v1/metals' ||
    path === '/v1/market/summary' ||
    path === '/v1/announcements' ||
    path === '/v1/learn/glossary' ||
    path === '/v1/learn/articles' ||
    path.startsWith('/v1/learn/articles/') ||
    path === '/v1/learn/courses'
  ) {
    return true;
  }
  if (path === '/v1/stocks' || path.startsWith('/v1/stocks/')) return true;
  return false;
}
