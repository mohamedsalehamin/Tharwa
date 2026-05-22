import type { Env } from '../../config/env.js';
import type { SecretResolver } from './types.js';
import { EnvSecretsResolver } from './env-backend.js';
import { SecretResolverError } from './errors.js';

export { assertValidSecretRef, normalizeEnvSecretRef } from './validate.js';
export { SecretResolverError } from './errors.js';
export type { SecretRef, SecretResolver, SecretsBackendKind } from './types.js';

let singleton: SecretResolver | null = null;

/** Factory — only `env` is implemented for MVP; extend here for AWS/Doppler later. */
export function createSecretsResolver(env: Env): SecretResolver {
  switch (env.SECRETS_BACKEND) {
    case 'env':
      return new EnvSecretsResolver();
    default:
      throw new SecretResolverError(`Unsupported SECRETS_BACKEND: ${env.SECRETS_BACKEND}`, 'UNSUPPORTED_BACKEND');
  }
}

export function getSecretsResolver(env: Env): SecretResolver {
  if (!singleton) {
    singleton = createSecretsResolver(env);
  }
  return singleton;
}

/** Test helper */
export function resetSecretsResolverForTests(): void {
  singleton = null;
}
