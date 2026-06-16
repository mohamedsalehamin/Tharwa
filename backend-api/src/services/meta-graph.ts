import type { Env } from '../config/env.js';
import type { MetaSocialConfig } from './meta-social-credentials.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

type GraphError = { error?: { message?: string; type?: string; code?: number } };

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = (await res.json()) as T & GraphError;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Meta Graph GET failed (${res.status})`);
  }
  return json;
}

async function graphPostForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { method: 'POST', body: form });
  const json = (await res.json()) as T & GraphError;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Meta Graph POST failed (${res.status})`);
  }
  return json;
}

async function graphPostJson<T>(path: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & GraphError;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Meta Graph POST failed (${res.status})`);
  }
  return json;
}

export type MetaPageOption = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string | null;
  igUsername: string | null;
};

export function buildMetaOAuthScopes(env: Env): string {
  const custom = env.META_OAUTH_SCOPES?.trim();
  if (custom) return custom;
  // Minimal scope — Meta auto-bundles pages_read_engagement with pages_manage_posts
  // and fails OAuth when that permission is not enabled on the app use case.
  // Page access tokens from /me/accounts may still allow posting for page admins.
  return 'pages_show_list';
}

export function buildMetaOAuthUrl(env: Env, state: string): string {
  const appId = env.META_APP_ID!.trim();
  const redirect = env.META_OAUTH_REDIRECT_URI!.trim();
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', buildMetaOAuthScopes(env));
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

export async function exchangeMetaOAuthCode(
  env: Env,
  code: string,
): Promise<string> {
  const data = await graphGet<{ access_token: string }>('/oauth/access_token', {
    client_id: env.META_APP_ID!.trim(),
    client_secret: env.META_APP_SECRET!.trim(),
    redirect_uri: env.META_OAUTH_REDIRECT_URI!.trim(),
    code,
  });
  return data.access_token;
}

export async function resolvePageInstagramAccount(
  pageId: string,
  pageAccessToken: string,
): Promise<{ igUserId: string | null; igUsername: string | null }> {
  if (!pageId || pageAccessToken.length < 20) {
    return { igUserId: null, igUsername: null };
  }
  try {
    const data = await graphGet<{
      instagram_business_account?: { id: string; username?: string } | null;
    }>(`/${pageId}`, {
      access_token: pageAccessToken,
      fields: 'instagram_business_account{id,username}',
    });
    return {
      igUserId: data.instagram_business_account?.id ?? null,
      igUsername: data.instagram_business_account?.username ?? null,
    };
  } catch {
    return { igUserId: null, igUsername: null };
  }
}

async function enrichPageWithInstagram(page: MetaPageOption): Promise<MetaPageOption> {
  if (page.igUserId || page.pageAccessToken.length < 20) return page;
  const ig = await resolvePageInstagramAccount(page.pageId, page.pageAccessToken);
  return {
    ...page,
    igUserId: ig.igUserId,
    igUsername: ig.igUsername,
  };
}

export async function fetchMetaPages(userAccessToken: string): Promise<MetaPageOption[]> {
  const data = await graphGet<{
    data: {
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string } | null;
    }[];
  }>('/me/accounts', {
    access_token: userAccessToken,
    fields: 'id,name,access_token,instagram_business_account{id,username}',
  });

  const pages = (data.data ?? [])
    .map((p) => ({
      pageId: p.id,
      pageName: p.name,
      pageAccessToken: p.access_token ?? '',
      igUserId: p.instagram_business_account?.id ?? null,
      igUsername: p.instagram_business_account?.username ?? null,
    }))
    .filter((p) => p.pageId && p.pageName);

  return Promise.all(pages.map(enrichPageWithInstagram));
}

export const INSTAGRAM_NOT_LINKED_MESSAGE =
  'Instagram business account is not linked to the selected Facebook Page. In Meta Business Suite, connect @thrwa.co to this Page (Settings → Linked accounts → Instagram), then reconnect OAuth and Save. Or turn off "Publish to Instagram".';

export async function resolveInstagramForConfig(
  config: MetaSocialConfig,
): Promise<MetaSocialConfig> {
  if (config.igUserId) return config;
  const ig = await resolvePageInstagramAccount(config.pageId, config.pageAccessToken);
  if (!ig.igUserId) return config;
  return {
    ...config,
    igUserId: ig.igUserId,
    igUsername: ig.igUsername ?? config.igUsername ?? null,
  };
}

export async function publishFacebookPhoto(args: {
  config: MetaSocialConfig;
  caption: string;
  png: Buffer;
}): Promise<string> {
  const form = new FormData();
  form.set('access_token', args.config.pageAccessToken);
  form.set('message', args.caption);
  form.set('published', 'true');
  form.set('source', new Blob([args.png], { type: 'image/png' }), 'post.png');

  const data = await graphPostForm<{ id?: string; post_id?: string }>(
    `/${args.config.pageId}/photos`,
    form,
  );
  return data.post_id ?? data.id ?? 'unknown';
}

export async function publishInstagramPhoto(args: {
  config: MetaSocialConfig;
  caption: string;
  imageUrl: string;
}): Promise<string> {
  const config = await resolveInstagramForConfig(args.config);
  if (!config.igUserId) {
    throw new Error(INSTAGRAM_NOT_LINKED_MESSAGE);
  }

  const container = await graphPostJson<{ id: string }>(`/${config.igUserId}/media`, {
    image_url: args.imageUrl,
    caption: args.caption,
    access_token: config.pageAccessToken,
  });

  const published = await graphPostJson<{ id: string }>(
    `/${config.igUserId}/media_publish`,
    {
      creation_id: container.id,
      access_token: config.pageAccessToken,
    },
  );

  return published.id;
}
