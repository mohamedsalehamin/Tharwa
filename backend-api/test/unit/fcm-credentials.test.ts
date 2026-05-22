import { describe, expect, it } from 'vitest';
import { parseFcmServiceAccountJson } from '../../src/services/fcm-credentials.js';

describe('parseFcmServiceAccountJson', () => {
  it('accepts a valid service account', () => {
    const raw = JSON.stringify({
      type: 'service_account',
      project_id: 'my-project',
      private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
      client_email: 'firebase-adminsdk@test.iam.gserviceaccount.com',
    });
    const parsed = parseFcmServiceAccountJson(raw);
    expect(parsed.project_id).toBe('my-project');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseFcmServiceAccountJson('not-json')).toThrow(/valid JSON/);
  });
});
