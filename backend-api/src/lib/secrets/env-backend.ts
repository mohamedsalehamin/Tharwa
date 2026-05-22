import type { SecretRef, SecretResolver, SecretsBackendKind } from './types.js';
import { SecretResolverError } from './errors.js';
import { normalizeEnvSecretRef } from './validate.js';

/**
 * Resolves `secretRef` → `process.env[VAR_NAME]`.
 * Inject secrets via container env, Docker/K8s secrets-as-env, or local `.env` (dev only).
 */
export class EnvSecretsResolver implements SecretResolver {
  readonly kind: SecretsBackendKind = 'env';

  resolve(ref: SecretRef): string | null {
    const name = normalizeEnvSecretRef(ref);
    const value = process.env[name];
    if (value === undefined || value === '') return null;
    return value;
  }

  resolveRequired(ref: SecretRef): string {
    const value = this.resolve(ref);
    if (value === null) {
      throw new SecretResolverError(
        `Secret not found for ref "${ref}" (env var ${normalizeEnvSecretRef(ref)} is unset or empty)`,
        'NOT_FOUND',
      );
    }
    return value;
  }
}
