import type { Env } from '../config/env.js';
import { YOUTUBE_OAUTH_SCOPES } from './youtube-social-credentials.js';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

type GoogleOAuthError = { error?: string; error_description?: string };

function oauthClient(env: Env): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = env.YOUTUBE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('YouTube OAuth env vars are not configured');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildYoutubeOAuthUrl(env: Env, state: string): string {
  const { clientId, redirectUri } = oauthClient(env);
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_OAUTH_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeYoutubeOAuthCode(
  env: Env,
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const { clientId, clientSecret, redirectUri } = oauthClient(env);
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN, { method: 'POST', body });
  const json = (await res.json()) as GoogleTokenResponse & GoogleOAuthError;
  if (!res.ok) {
    throw new Error(json.error_description ?? json.error ?? 'YouTube OAuth token exchange failed');
  }
  if (!json.refresh_token) {
    throw new Error('YouTube did not return a refresh token — revoke app access and reconnect with consent');
  }
  return { refreshToken: json.refresh_token, accessToken: json.access_token };
}

export async function refreshYoutubeAccessToken(
  env: Env,
  refreshToken: string,
): Promise<string> {
  const { clientId, clientSecret } = oauthClient(env);
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN, { method: 'POST', body });
  const json = (await res.json()) as GoogleTokenResponse & GoogleOAuthError;
  if (!res.ok) {
    throw new Error(json.error_description ?? json.error ?? 'YouTube token refresh failed');
  }
  return json.access_token;
}

export async function fetchYoutubeChannelForToken(accessToken: string): Promise<{
  channelId: string;
  channelTitle: string;
}> {
  const url = new URL(`${YOUTUBE_API}/channels`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    items?: Array<{ id: string; snippet?: { title?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? 'YouTube channels.list failed');
  }
  const channel = json.items?.[0];
  if (!channel?.id) {
    throw new Error('No YouTube channel found for this Google account');
  }
  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title ?? channel.id,
  };
}
