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

/** Scopes required to read instagram_business_account and publish to Instagram. */
export const META_OAUTH_SCOPES_DEFAULT =
  'pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,business_management';

const IG_PAGE_FIELDS =
  'instagram_business_account{id,username},connected_instagram_account{id,username}';

export function buildMetaOAuthScopes(env: Env): string {
  const custom = env.META_OAUTH_SCOPES?.trim();
  if (custom) return custom;
  return META_OAUTH_SCOPES_DEFAULT;
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

export type PageInstagramResolution = {
  igUserId: string | null;
  igUsername: string | null;
  error: string | null;
};

type ResolvePageInstagramOptions = {
  userAccessToken?: string;
};

function igFromPageFields(data: {
  instagram_business_account?: { id: string; username?: string } | null;
  connected_instagram_account?: { id: string; username?: string } | null;
}): PageInstagramResolution | null {
  const ig = data.instagram_business_account ?? data.connected_instagram_account;
  if (!ig?.id) return null;
  return { igUserId: ig.id, igUsername: ig.username ?? null, error: null };
}

async function tryInstagramAccountsEdge(
  pageId: string,
  accessToken: string,
): Promise<PageInstagramResolution | null> {
  try {
    const data = await graphGet<{ data?: { id: string; username?: string }[] }>(
      `/${pageId}/instagram_accounts`,
      { access_token: accessToken, fields: 'id,username' },
    );
    const account = data.data?.find((row) => row.id) ?? data.data?.[0];
    if (!account?.id) return null;
    return { igUserId: account.id, igUsername: account.username ?? null, error: null };
  } catch {
    return null;
  }
}

async function resolveWithToken(
  pageId: string,
  accessToken: string,
  label: string,
): Promise<{ resolution: PageInstagramResolution | null; notes: string[] }> {
  const notes: string[] = [];
  if (accessToken.length < 20) {
    notes.push(`${label}: token missing`);
    return { resolution: null, notes };
  }

  try {
    const data = await graphGet<{
      instagram_business_account?: { id: string; username?: string } | null;
      connected_instagram_account?: { id: string; username?: string } | null;
    }>(`/${pageId}`, {
      access_token: accessToken,
      fields: IG_PAGE_FIELDS,
    });
    const fromFields = igFromPageFields(data);
    if (fromFields) return { resolution: fromFields, notes };
    notes.push(`${label}: instagram_business_account empty`);
  } catch (e) {
    notes.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const fromEdge = await tryInstagramAccountsEdge(pageId, accessToken);
  if (fromEdge) return { resolution: fromEdge, notes };
  notes.push(`${label}: instagram_accounts empty`);
  return { resolution: null, notes };
}

export async function resolvePageInstagramAccount(
  pageId: string,
  pageAccessToken: string,
  options?: ResolvePageInstagramOptions,
): Promise<PageInstagramResolution> {
  if (!pageId || pageAccessToken.length < 20) {
    return {
      igUserId: null,
      igUsername: null,
      error: 'Page ID and access token are required',
    };
  }

  const notes: string[] = [];
  const userAccessToken = options?.userAccessToken?.trim();

  const pageAttempt = await resolveWithToken(pageId, pageAccessToken, 'page token');
  notes.push(...pageAttempt.notes);
  if (pageAttempt.resolution) return pageAttempt.resolution;

  if (userAccessToken && userAccessToken !== pageAccessToken) {
    const userAttempt = await resolveWithToken(pageId, userAccessToken, 'user token');
    notes.push(...userAttempt.notes);
    if (userAttempt.resolution) return userAttempt.resolution;
  }

  return {
    igUserId: null,
    igUsername: null,
    error:
      `No Instagram account returned for Page ${pageId}. ${notes.join('; ')}. ` +
      'In Meta Business Suite, open the Thrwa Page → Settings → Linked accounts and re-link @thrwa.co, ' +
      'then Disconnect and Connect with Facebook again.',
  };
}

export function instagramResolutionHint(resolution: PageInstagramResolution): string {
  if (resolution.igUserId) return '';
  const metaError = resolution.error ?? INSTAGRAM_NOT_LINKED_MESSAGE;
  if (/pages_read_engagement|instagram_basic|instagram_content_publish/i.test(metaError)) {
    return `${metaError} Reconnect with Facebook after deploying the latest API — OAuth must include pages_read_engagement and Instagram permissions (enable Instagram use case in Meta App Dashboard).`;
  }
  return metaError;
}

async function enrichPageWithInstagram(
  page: MetaPageOption,
  userAccessToken?: string,
): Promise<MetaPageOption> {
  if (page.pageAccessToken.length < 20) return page;
  const ig = await resolvePageInstagramAccount(page.pageId, page.pageAccessToken, {
    userAccessToken,
  });
  return {
    ...page,
    igUserId: ig.igUserId ?? page.igUserId,
    igUsername: ig.igUsername ?? page.igUsername,
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

  return Promise.all(pages.map((page) => enrichPageWithInstagram(page, userAccessToken)));
}

export const INSTAGRAM_NOT_LINKED_MESSAGE =
  'Instagram business account is not linked to the selected Facebook Page, or the Page token cannot read it. Connect @thrwa.co in Meta Business Suite, then reconnect Facebook with Instagram permissions. Or turn off "Publish to Instagram".';

export async function resolveInstagramForConfig(
  config: MetaSocialConfig,
  options?: ResolvePageInstagramOptions,
): Promise<{ config: MetaSocialConfig; resolution: PageInstagramResolution }> {
  if (config.igUserId) {
    return {
      config,
      resolution: {
        igUserId: config.igUserId,
        igUsername: config.igUsername ?? null,
        error: null,
      },
    };
  }
  const resolution = await resolvePageInstagramAccount(
    config.pageId,
    config.pageAccessToken,
    {
      userAccessToken: options?.userAccessToken ?? config.metaUserAccessToken,
    },
  );
  if (!resolution.igUserId) {
    return { config, resolution };
  }
  return {
    config: {
      ...config,
      igUserId: resolution.igUserId,
      igUsername: resolution.igUsername ?? config.igUsername ?? null,
    },
    resolution,
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
  const { config, resolution } = await resolveInstagramForConfig(args.config);
  if (!config.igUserId) {
    throw new Error(instagramResolutionHint(resolution));
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForInstagramContainer(
  containerId: string,
  accessToken: string,
  maxWaitMs = 180_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const status = await graphGet<{ status_code?: string; status?: string }>(`/${containerId}`, {
      fields: 'status_code,status',
      access_token: accessToken,
    });
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram container failed: ${status.status ?? status.status_code}`);
    }
    await sleep(4_000);
  }
  throw new Error('Instagram media container timed out');
}

async function publishInstagramMediaContainer(
  config: MetaSocialConfig,
  containerParams: Record<string, string>,
): Promise<string> {
  const { config: resolved, resolution } = await resolveInstagramForConfig(config);
  if (!resolved.igUserId) {
    throw new Error(instagramResolutionHint(resolution));
  }

  const container = await graphPostJson<{ id: string }>(`/${resolved.igUserId}/media`, {
    ...containerParams,
    access_token: resolved.pageAccessToken,
  });
  await waitForInstagramContainer(container.id, resolved.pageAccessToken);
  const published = await graphPostJson<{ id: string }>(`/${resolved.igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: resolved.pageAccessToken,
  });
  return published.id;
}

export async function publishInstagramReel(args: {
  config: MetaSocialConfig;
  caption: string;
  videoUrl: string;
}): Promise<string> {
  return publishInstagramMediaContainer(args.config, {
    media_type: 'REELS',
    video_url: args.videoUrl,
    caption: args.caption,
  });
}

export async function publishInstagramStoryPhoto(args: {
  config: MetaSocialConfig;
  imageUrl: string;
}): Promise<string> {
  return publishInstagramMediaContainer(args.config, {
    media_type: 'STORIES',
    image_url: args.imageUrl,
  });
}

export async function publishInstagramStoryVideo(args: {
  config: MetaSocialConfig;
  videoUrl: string;
}): Promise<string> {
  return publishInstagramMediaContainer(args.config, {
    media_type: 'STORIES',
    video_url: args.videoUrl,
  });
}

/** Page video (9:16) — surfaces as Reels on Facebook for short vertical uploads. */
export async function publishFacebookReel(args: {
  config: MetaSocialConfig;
  caption: string;
  videoUrl: string;
}): Promise<string> {
  const data = await graphPostJson<{ id?: string }>(`/${args.config.pageId}/videos`, {
    file_url: args.videoUrl,
    description: args.caption,
    published: 'true',
    access_token: args.config.pageAccessToken,
  });
  return data.id ?? 'unknown';
}

export async function publishFacebookStoryPhoto(args: {
  config: MetaSocialConfig;
  imageUrl: string;
}): Promise<string> {
  const photo = await graphPostJson<{ id: string }>(`/${args.config.pageId}/photos`, {
    url: args.imageUrl,
    published: 'false',
    access_token: args.config.pageAccessToken,
  });
  const story = await graphPostJson<{ id?: string }>(`/${args.config.pageId}/photo_stories`, {
    photo_id: photo.id,
    access_token: args.config.pageAccessToken,
  });
  return story.id ?? photo.id;
}

/** Page video story — requires upload_phase start → rupload → finish (not /videos + video_id alone). */
export async function publishFacebookStoryVideo(args: {
  config: MetaSocialConfig;
  videoUrl: string;
}): Promise<string> {
  const session = await graphPostJson<{ video_id: string; upload_url: string }>(
    `/${args.config.pageId}/video_stories`,
    {
      upload_phase: 'start',
      access_token: args.config.pageAccessToken,
    },
  );

  await ruploadHostedVideo(session.upload_url, args.videoUrl, args.config.pageAccessToken);

  const story = await graphPostJson<{ success?: boolean; post_id?: string }>(
    `/${args.config.pageId}/video_stories`,
    {
      upload_phase: 'finish',
      video_id: session.video_id,
      access_token: args.config.pageAccessToken,
    },
  );
  return story.post_id ?? session.video_id;
}

async function ruploadHostedVideo(
  uploadUrl: string,
  fileUrl: string,
  accessToken: string,
): Promise<void> {
  const url = new URL(uploadUrl);
  if (!url.searchParams.has('access_token')) {
    url.searchParams.set('access_token', accessToken);
  }
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_url: fileUrl,
    },
  });
  const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || json.success !== true) {
    throw new Error(json.error?.message ?? `Meta video story upload failed (${res.status})`);
  }
}
