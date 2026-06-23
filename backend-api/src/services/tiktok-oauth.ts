import type { Env } from '../config/env.js';
import { getTiktokOAuthScopes } from './tiktok-social-credentials.js';

const TIKTOK_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_CREATOR_INFO = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';

type TiktokTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  log_id?: string;
};

type TiktokApiEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
};

export type TiktokCreatorInfo = {
  username: string;
  displayName: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
};

function normalizeRedirectUri(uri: string): string {
  const trimmed = uri.trim();
  try {
    const url = new URL(trimmed);
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function normalizeOAuthCode(code: string): string {
  try {
    return decodeURIComponent(code.trim());
  } catch {
    return code.trim();
  }
}

function tiktokTokenError(json: TiktokTokenResponse, fallback: string): string {
  const message = json.error_description ?? json.error ?? fallback;
  return json.log_id ? `${message} (log_id: ${json.log_id})` : message;
}

async function postTiktokTokenForm(body: URLSearchParams): Promise<TiktokTokenResponse> {
  const res = await fetch(TIKTOK_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: body.toString(),
  });
  return (await res.json()) as TiktokTokenResponse;
}

function oauthClient(env: Env): { clientKey: string; clientSecret: string; redirectUri: string } {
  const clientKey = env.TIKTOK_OAUTH_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = env.TIKTOK_OAUTH_REDIRECT_URI?.trim();
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error('TikTok OAuth env vars are not configured');
  }
  return { clientKey, clientSecret, redirectUri: normalizeRedirectUri(redirectUri) };
}

export function getTiktokRedirectUri(env: Env): string | null {
  const redirectUri = env.TIKTOK_OAUTH_REDIRECT_URI?.trim();
  return redirectUri ? normalizeRedirectUri(redirectUri) : null;
}

export function buildTiktokOAuthUrl(env: Env, state: string): string {
  const { clientKey, redirectUri } = oauthClient(env);
  const url = new URL(TIKTOK_AUTH);
  url.searchParams.set('client_key', clientKey);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', getTiktokOAuthScopes(env));
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeTiktokOAuthCode(
  env: Env,
  code: string,
  redirectUriOverride?: string,
): Promise<{ refreshToken: string; accessToken: string; openId: string; scope: string }> {
  const { clientKey, clientSecret, redirectUri } = oauthClient(env);
  const redirectUriForExchange = redirectUriOverride
    ? normalizeRedirectUri(redirectUriOverride)
    : redirectUri;
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code: normalizeOAuthCode(code),
    grant_type: 'authorization_code',
    redirect_uri: redirectUriForExchange,
  });
  const json = await postTiktokTokenForm(body);
  if (json.error || !json.access_token) {
    throw new Error(
      tiktokTokenError(
        json,
        `TikTok OAuth token exchange failed — verify redirect URI matches Portal exactly: ${redirectUriForExchange}`,
      ),
    );
  }
  if (!json.refresh_token || !json.open_id) {
    throw new Error('TikTok did not return required OAuth tokens');
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    openId: json.open_id,
    scope: json.scope?.trim() ?? '',
  };
}

export async function refreshTiktokAccessToken(
  env: Env,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { clientKey, clientSecret } = oauthClient(env);
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const json = await postTiktokTokenForm(body);
  if (json.error || !json.access_token) {
    throw new Error(tiktokTokenError(json, 'TikTok token refresh failed'));
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
  };
}

export async function fetchTiktokUserInfo(accessToken: string): Promise<{
  openId: string;
  username: string;
  displayName: string;
}> {
  const url = new URL('https://open.tiktokapis.com/v2/user/info/');
  url.searchParams.set('fields', 'open_id,display_name');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as TiktokApiEnvelope<{
    user?: { open_id?: string; display_name?: string };
  }>;
  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? 'TikTok user info query failed');
  }
  const user = json.data?.user;
  if (!user?.open_id) {
    throw new Error('TikTok user info returned no open_id');
  }
  const displayName = user.display_name?.trim() || user.open_id;
  const username = displayName;
  return { openId: user.open_id, username, displayName };
}

export async function fetchTiktokCreatorInfo(accessToken: string): Promise<TiktokCreatorInfo> {
  const res = await fetch(TIKTOK_CREATOR_INFO, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  });
  const json = (await res.json()) as TiktokApiEnvelope<{
    creator_username?: string;
    creator_nickname?: string;
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
  }>;
  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? 'TikTok creator_info query failed');
  }
  const data = json.data;
  if (!data?.creator_username) {
    throw new Error('TikTok creator_info returned no username');
  }
  return {
    username: data.creator_username,
    displayName: data.creator_nickname ?? data.creator_username,
    privacyLevelOptions: data.privacy_level_options ?? ['SELF_ONLY'],
    commentDisabled: data.comment_disabled ?? false,
    duetDisabled: data.duet_disabled ?? false,
    stitchDisabled: data.stitch_disabled ?? false,
  };
}
