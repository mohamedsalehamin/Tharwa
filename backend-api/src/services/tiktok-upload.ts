import type { Env } from '../config/env.js';
import {
  getTiktokPostMode,
  missingTiktokScopes,
  updateTiktokSocialRefreshToken,
  type TiktokSocialConfig,
} from './tiktok-social-credentials.js';
import { refreshTiktokAccessToken } from './tiktok-oauth.js';

const TIKTOK_DIRECT_INIT = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_INBOX_INIT = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
const TIKTOK_STATUS_FETCH = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
const TIKTOK_CREATOR_INFO = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';

type TiktokApiEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
};

type TiktokCreatorPublishInfo = {
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
  canPostMore: boolean;
};

function pickPrivacyLevel(options: string[], preferred: string | undefined): string {
  if (preferred && options.includes(preferred)) return preferred;
  if (options.includes('SELF_ONLY')) return 'SELF_ONLY';
  if (options.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
  if (options.includes('MUTUAL_FOLLOW_FRIENDS')) return 'MUTUAL_FOLLOW_FRIENDS';
  if (options.includes('FOLLOWER_OF_CREATOR')) return 'FOLLOWER_OF_CREATOR';
  return options[0] ?? 'SELF_ONLY';
}

function tiktokInitErrorMessage(code: string | undefined, message: string, videoUrl?: string): string {
  if (code === 'url_ownership_unverified') {
    const host = videoUrl ? new URL(videoUrl).host : 'your video URL host';
    return `${message} Verify https://${host}/ in TikTok Developer Portal → Manage URL properties, or set TIKTOK_PULL_URL_ORIGIN to an already-verified domain (e.g. https://thrwa.co) with /files/ proxied to the API.`;
  }
  if (code === 'unaudited_client_can_only_post_to_private_accounts') {
    return `${message} Set the TikTok account to private, use TIKTOK_DIRECT_PRIVACY=SELF_ONLY, then retry.`;
  }
  if (code === 'privacy_level_option_mismatch') {
    return `${message} Reconnect TikTok or set TIKTOK_DIRECT_PRIVACY to a value from creator_info.`;
  }
  if (code === 'scope_not_authorized' || /scope/i.test(message)) {
    return `${message} Reconnect TikTok in Admin → Integrations after granting video.publish.`;
  }
  return message;
}

function tiktokPublishFailReason(reason: string): string {
  if (/integration guidelines|content-sharing-guidelines/i.test(reason)) {
    return `${reason} Sandbox checklist: (1) TikTok app → Settings → Privacy → turn ON Private account before posting, (2) TIKTOK_DIRECT_PRIVACY=SELF_ONLY, (3) video must not include Thrwa logo/CTA watermarks (API now strips these for TikTok), (4) use draft mode (TIKTOK_POST_MODE=draft) if direct post still fails before app audit.`;
  }
  if (/private account|unaudited_client/i.test(reason)) {
    return `${reason} Set the TikTok account to Private in the app, keep TIKTOK_DIRECT_PRIVACY=SELF_ONLY, then retry.`;
  }
  return reason;
}

async function queryCreatorPublishInfo(accessToken: string): Promise<TiktokCreatorPublishInfo> {
  const res = await fetch(TIKTOK_CREATOR_INFO, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  });
  const json = (await res.json()) as TiktokApiEnvelope<{
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
    can_post_more?: boolean;
  }>;
  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? 'TikTok creator_info query failed');
  }
  return {
    privacyLevelOptions: json.data?.privacy_level_options ?? ['SELF_ONLY'],
    commentDisabled: json.data?.comment_disabled ?? false,
    duetDisabled: json.data?.duet_disabled ?? false,
    stitchDisabled: json.data?.stitch_disabled ?? false,
    maxVideoPostDurationSec: json.data?.max_video_post_duration_sec ?? 600,
    canPostMore: json.data?.can_post_more ?? true,
  };
}

async function pollPublishStatus(accessToken: string, publishId: string): Promise<string> {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await fetch(TIKTOK_STATUS_FETCH, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const json = (await res.json()) as TiktokApiEnvelope<{ status?: string; fail_reason?: string }>;
    if (!res.ok || json.error?.code !== 'ok') {
      throw new Error(json.error?.message ?? `TikTok status fetch failed (${res.status})`);
    }
    const status = json.data?.status;
    if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') return publishId;
    if (status === 'FAILED') {
      throw new Error(tiktokPublishFailReason(json.data?.fail_reason ?? 'TikTok publish failed'));
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('TikTok publish timed out waiting for completion');
}

async function uploadVideoBytes(uploadUrl: string, videoBytes: Buffer): Promise<void> {
  const videoSize = videoBytes.length;
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoSize),
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBytes,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`TikTok video upload failed (${uploadRes.status})${errText ? `: ${errText}` : ''}`);
  }
}

/** Map stored public URL to a TikTok-verified pull origin when configured. */
export function resolveTiktokPullVideoUrl(env: Env, publicUrl: string): string {
  const pullOrigin = env.TIKTOK_PULL_URL_ORIGIN?.replace(/\/$/, '');
  if (!pullOrigin) return publicUrl;

  const storageOrigin = (env.SOCIAL_PUBLIC_FILES_ORIGIN ?? env.PUBLIC_FILES_ORIGIN)?.replace(
    /\/$/,
    '',
  );
  if (storageOrigin && publicUrl.startsWith(storageOrigin)) {
    return `${pullOrigin}${publicUrl.slice(storageOrigin.length)}`;
  }

  try {
    const url = new URL(publicUrl);
    return `${pullOrigin}${url.pathname}${url.search}`;
  } catch {
    return publicUrl;
  }
}

/** Upload MP4 to TikTok (direct post or inbox draft depending on TIKTOK_POST_MODE). */
export async function uploadTiktokVideo(args: {
  env: Env;
  config: TiktokSocialConfig;
  title: string;
  videoBytes: Buffer;
  /** Public HTTPS URL for server-hosted video — required for direct post (PULL_FROM_URL). */
  videoUrl?: string;
  videoDurationSec?: number;
}): Promise<string> {
  const tokens = await refreshTiktokAccessToken(args.env, args.config.refreshToken);
  await updateTiktokSocialRefreshToken(tokens.refreshToken);

  const videoSize = args.videoBytes.length;
  const mode = getTiktokPostMode(args.env);
  const missingScopes = missingTiktokScopes(args.config.grantedScopes, mode);
  if (missingScopes.length > 0) {
    throw new Error(
      `TikTok connection is missing scope(s): ${missingScopes.join(', ')}. Disconnect and reconnect in Admin → Integrations after adding video.publish in the Developer Portal.`,
    );
  }

  if (mode === 'draft') {
    const initRes = await fetch(TIKTOK_INBOX_INIT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      }),
    });
    const initJson = (await initRes.json()) as TiktokApiEnvelope<{
      publish_id?: string;
      upload_url?: string;
    }>;
    if (!initRes.ok || initJson.error?.code !== 'ok') {
      throw new Error(initJson.error?.message ?? `TikTok inbox init failed (${initRes.status})`);
    }
    const publishId = initJson.data?.publish_id;
    const uploadUrl = initJson.data?.upload_url;
    if (!publishId || !uploadUrl) {
      throw new Error('TikTok inbox init returned no publish_id or upload_url');
    }
    await uploadVideoBytes(uploadUrl, args.videoBytes);
    return pollPublishStatus(tokens.accessToken, publishId);
  }

  if (!args.videoUrl?.trim()) {
    throw new Error(
      'TikTok direct post requires a public video URL (PULL_FROM_URL). Set SOCIAL_PUBLIC_FILES_ORIGIN on the API.',
    );
  }
  const pullVideoUrl = resolveTiktokPullVideoUrl(args.env, args.videoUrl.trim());

  const creator = await queryCreatorPublishInfo(tokens.accessToken);
  if (!creator.canPostMore) {
    throw new Error('TikTok creator cannot post more right now — try again later.');
  }
  if (
    args.videoDurationSec != null &&
    args.videoDurationSec > creator.maxVideoPostDurationSec
  ) {
    throw new Error(
      `Video is ${Math.ceil(args.videoDurationSec)}s but TikTok allows max ${creator.maxVideoPostDurationSec}s for this account.`,
    );
  }

  const privacyLevel = pickPrivacyLevel(creator.privacyLevelOptions, args.env.TIKTOK_DIRECT_PRIVACY);
  const usePullFromUrl = Boolean(pullVideoUrl);

  const initRes = await fetch(TIKTOK_DIRECT_INIT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: args.title,
        privacy_level: privacyLevel,
        disable_duet: true,
        disable_stitch: true,
        disable_comment: true,
        brand_content_toggle: false,
        brand_organic_toggle: false,
      },
      source_info: usePullFromUrl
        ? { source: 'PULL_FROM_URL', video_url: pullVideoUrl }
        : {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
    }),
  });

  const initJson = (await initRes.json()) as TiktokApiEnvelope<{
    publish_id?: string;
    upload_url?: string;
  }>;
  if (!initRes.ok || initJson.error?.code !== 'ok') {
    const message = initJson.error?.message ?? `TikTok video init failed (${initRes.status})`;
    throw new Error(tiktokInitErrorMessage(initJson.error?.code, message, pullVideoUrl));
  }
  const publishId = initJson.data?.publish_id;
  const uploadUrl = initJson.data?.upload_url;
  if (!publishId) {
    throw new Error('TikTok video init returned no publish_id');
  }

  if (!usePullFromUrl) {
    if (!uploadUrl) {
      throw new Error('TikTok video init returned no upload_url');
    }
    await uploadVideoBytes(uploadUrl, args.videoBytes);
  }

  return pollPublishStatus(tokens.accessToken, publishId);
}
