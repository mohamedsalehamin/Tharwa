import { describe, expect, it } from 'vitest';
import { appendTokenToActionUrl } from '../../src/services/transactional-email.js';

describe('appendTokenToActionUrl', () => {
  it('appends token query param to deep link base', () => {
    const url = appendTokenToActionUrl('tharwa://reset-password', 'abc+def');
    expect(url).toBe('tharwa://reset-password?token=abc%2Bdef');
  });

  it('uses ampersand when base already has query', () => {
    const url = appendTokenToActionUrl('https://app.example/reset?lang=en', 'tok');
    expect(url).toBe('https://app.example/reset?lang=en&token=tok');
  });
});
