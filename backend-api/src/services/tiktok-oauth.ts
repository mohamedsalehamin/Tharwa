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

function oauthClient(env: Env): { clientKey: string; clientSecret: string; redirectUri: string } {
  const clientKey = env.TIKTOK_OAUTH_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = env.TIKTOK_OAUTH_REDIRECT_URI?.trim();
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error('TikTok OAuth env vars are not configured');
  }
  return { clientKey, clientSecret, redirectUri };
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
): Promise<{ refreshToken: string; accessToken: string; openId: string }> {
  const { clientKey, clientSecret, redirectUri } = oauthClient(env);
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const res = await fetch(TIKTOK_TOKEN, { method: 'POST', body });
  const json = (await res.json()) as TiktokTokenResponse;
  if (!res.ok || json.error) {
    throw new Error(json.error_description ?? json.error ?? 'TikTok OAuth token exchange failed');
  }
  if (!json.refresh_token || !json.access_token || !json.open_id) {
    throw new Error('TikTok did not return required OAuth tokens');
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    openId: json.open_id,
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
  const res = await fetch(TIKTOK_TOKEN, { method: 'POST', body });
  const json = (await res.json()) as TiktokTokenResponse;
  if (!res.ok || json.error) {
    throw new Error(json.error_description ?? json.error ?? 'TikTok token refresh failed');
  }
  if (!json.access_token) {
    throw new Error('TikTok token refresh returned no access token');
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
