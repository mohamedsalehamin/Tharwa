import { describe, expect, it } from 'vitest';
import { createTestEnv } from '../helpers/test-env.js';
import { resolveTiktokPullVideoUrl } from '../../src/services/tiktok-upload.js';

describe('resolveTiktokPullVideoUrl', () => {
  it('rewrites api origin to verified TikTok pull origin', () => {
    const env = createTestEnv({
      SOCIAL_PUBLIC_FILES_ORIGIN: 'https://api.thrwa.co',
      TIKTOK_PULL_URL_ORIGIN: 'https://thrwa.co',
    });
    expect(
      resolveTiktokPullVideoUrl(env, 'https://api.thrwa.co/files/social/abc.mp4'),
    ).toBe('https://thrwa.co/files/social/abc.mp4');
  });

  it('returns original URL when pull origin is not set', () => {
    const env = createTestEnv({
      SOCIAL_PUBLIC_FILES_ORIGIN: 'https://api.thrwa.co',
    });
    const url = 'https://api.thrwa.co/files/social/abc.mp4';
    expect(resolveTiktokPullVideoUrl(env, url)).toBe(url);
  });
});
