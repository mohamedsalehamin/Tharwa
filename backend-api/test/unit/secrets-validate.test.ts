import { describe, expect, it } from 'vitest';
import { SecretResolverError } from '../../src/lib/secrets/errors.js';
import { EnvSecretsResolver } from '../../src/lib/secrets/env-backend.js';
import {
  assertValidSecretRef,
  normalizeEnvSecretRef,
} from '../../src/lib/secrets/validate.js';

describe('normalizeEnvSecretRef', () => {
  it('accepts env var names and env: prefix', () => {
    expect(normalizeEnvSecretRef('TELEGRAM_METALS_BOT_TOKEN')).toBe('TELEGRAM_METALS_BOT_TOKEN');
    expect(normalizeEnvSecretRef('env:MY_API_KEY')).toBe('MY_API_KEY');
  });

  it('rejects empty, too long, or secret-like values', () => {
    expect(() => normalizeEnvSecretRef('')).toThrow(SecretResolverError);
    expect(() => normalizeEnvSecretRef('not-a-valid-name')).toThrow(SecretResolverError);
    expect(() => normalizeEnvSecretRef('sk-live-abc123secret')).toThrow(SecretResolverError);
  });
});

describe('assertValidSecretRef', () => {
  it('passes for valid refs', () => {
    expect(() => assertValidSecretRef('FX_HTTP_API_KEY')).not.toThrow();
  });
});

describe('EnvSecretsResolver', () => {
  it('reads from process.env', () => {
    process.env.TEST_THARWA_SECRET = 'value';
    const resolver = new EnvSecretsResolver();
    expect(resolver.resolve('TEST_THARWA_SECRET')).toBe('value');
    expect(resolver.resolveRequired('TEST_THARWA_SECRET')).toBe('value');
    delete process.env.TEST_THARWA_SECRET;
  });

  it('returns null when unset', () => {
    const resolver = new EnvSecretsResolver();
    expect(resolver.resolve('UNSET_THARWA_VAR_XYZ')).toBeNull();
  });
});
