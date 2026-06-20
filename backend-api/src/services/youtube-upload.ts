import type { Env } from '../config/env.js';
import { refreshYoutubeAccessToken } from './youtube-oauth.js';
import type { YoutubeSocialConfig } from './youtube-social-credentials.js';

const YOUTUBE_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';

type YoutubeVideoResponse = {
  id?: string;
  error?: { message?: string };
};

/** Upload MP4 as a public YouTube Short. */
export async function uploadYoutubeShort(args: {
  env: Env;
  config: YoutubeSocialConfig;
  title: string;
  description: string;
  videoBytes: Buffer;
}): Promise<string> {
  const accessToken = await refreshYoutubeAccessToken(args.env, args.config.refreshToken);

  const initRes = await fetch(`${YOUTUBE_UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(args.videoBytes.length),
    },
    body: JSON.stringify({
      snippet: {
        title: args.title,
        description: args.description,
        categoryId: '22',
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    }),
  });

  if (!initRes.ok) {
    const err = (await initRes.json()) as YoutubeVideoResponse;
    throw new Error(err.error?.message ?? `YouTube upload init failed (${initRes.status})`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('YouTube upload init returned no Location header');
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(args.videoBytes.length),
    },
    body: args.videoBytes,
  });

  const payload = (await uploadRes.json()) as YoutubeVideoResponse;
  if (!uploadRes.ok) {
    throw new Error(payload.error?.message ?? `YouTube upload failed (${uploadRes.status})`);
  }
  if (!payload.id) {
    throw new Error('YouTube upload returned no video id');
  }
  return payload.id;
}
