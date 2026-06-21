import { describe, expect, it } from 'vitest';
import { createTestEnv } from '../helpers/test-env.js';
import {
  publicUploadRelativePath,
  resolvePublicFileUrl,
} from '../../src/services/instrument-flag-storage.js';

describe('resolvePublicFileUrl', () => {
  const env = createTestEnv({ PUBLIC_FILES_ORIGIN: 'https://api.thrwa.co' });

  it('extracts /files paths from legacy absolute URLs', () => {
    expect(
      publicUploadRelativePath('https://api.7aduta.com/files/metal-flags/GOLD_EGP.png'),
    ).toBe('/files/metal-flags/GOLD_EGP.png');
  });

  it('rebases legacy upload URLs onto PUBLIC_FILES_ORIGIN', () => {
    expect(
      resolvePublicFileUrl(env, 'https://api.7aduta.com/files/metal-flags/GOLD_EGP.png'),
    ).toBe('https://api.thrwa.co/files/metal-flags/GOLD_EGP.png');
  });

  it('leaves unrelated external URLs unchanged', () => {
    expect(resolvePublicFileUrl(env, 'https://cdn.example.com/icon.png')).toBe(
      'https://cdn.example.com/icon.png',
    );
  });
});
