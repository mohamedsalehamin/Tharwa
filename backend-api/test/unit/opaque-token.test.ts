import { describe, expect, it } from 'vitest';
import { hashOpaqueToken, issueOpaqueToken } from '../../src/lib/opaque-token.js';

describe('opaque tokens', () => {
  it('issues URL-safe tokens and stable hashes', () => {
    const token = issueOpaqueToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const h1 = hashOpaqueToken(token);
    const h2 = hashOpaqueToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(hashOpaqueToken(issueOpaqueToken()));
  });
});
