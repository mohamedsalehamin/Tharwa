import type { Env } from '../config/env.js';
import { getTiktokPostMode, missingTiktokScopes, updateTiktokSocialRefreshToken, type TiktokSocialConfig } from './tiktok-social-credentials.js';
import { refreshTiktokAccessToken } from './tiktok-oauth.js';

const TIKTOK_DIRECT_INIT = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_INBOX_INIT = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
const TIKTOK_STATUS_FETCH = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

type TiktokApiEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
};

function pickPrivacyLevel(options: string[]): string {
  if (options.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
  if (options.includes('MUTUAL_FOLLOW_FRIENDS')) return 'MUTUAL_FOLLOW_FRIENDS';
  if (options.includes('FOLLOWER_OF_CREATOR')) return 'FOLLOWER_OF_CREATOR';
  return options[0] ?? 'SELF_ONLY';
}

async function queryCreatorPrivacyOptions(accessToken: string): Promise<string[]> {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  });
  const json = (await res.json()) as TiktokApiEnvelope<{ privacy_level_options?: string[] }>;
  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(json.error?.message ?? 'TikTok creator_info query failed');
  }
  return json.data?.privacy_level_options ?? ['SELF_ONLY'];
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
      throw new Error(json.data?.fail_reason ?? 'TikTok publish failed');
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

/** Upload MP4 to TikTok (direct post or inbox draft depending on TIKTOK_POST_MODE). */
export async function uploadTiktokVideo(args: {
  env: Env;
  config: TiktokSocialConfig;
  title: string;
  videoBytes: Buffer;
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

  const privacyOptions = await queryCreatorPrivacyOptions(tokens.accessToken);
  const privacyLevel = pickPrivacyLevel(privacyOptions);

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
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
        brand_content_toggle: false,
        brand_organic_toggle: true,
      },
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
      const message = initJson.error?.message ?? `TikTok video init failed (${initRes.status})`;
      if (initJson.error?.code === 'scope_not_authorized' || /scope/i.test(message)) {
        throw new Error(
          `${message} Reconnect TikTok in Admin → Integrations after granting video.publish in the Developer Portal.`,
        );
      }
      throw new Error(message);
    }
  const publishId = initJson.data?.publish_id;
  const uploadUrl = initJson.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error('TikTok video init returned no publish_id or upload_url');
  }

  await uploadVideoBytes(uploadUrl, args.videoBytes);
  return pollPublishStatus(tokens.accessToken, publishId);
}
