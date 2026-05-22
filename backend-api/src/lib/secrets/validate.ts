import { SecretResolverError } from './errors.js';

/** Env-var style names only (what `SECRETS_BACKEND=env` expects). */
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]{0,126}$/;

/**
 * Normalizes `secretRef` to the env var name (strips optional `env:` prefix).
 * @throws SecretResolverError when the ref is not a valid env key name
 */
export function normalizeEnvSecretRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    throw new SecretResolverError('secretRef must not be empty', 'INVALID_REF');
  }
  if (trimmed.length > 140) {
    throw new SecretResolverError('secretRef is too long', 'INVALID_REF');
  }
  const name = trimmed.startsWith('env:') ? trimmed.slice(4) : trimmed;
  if (!ENV_VAR_NAME.test(name)) {
    throw new SecretResolverError(
      'secretRef must be an environment variable name (e.g. TELEGRAM_METALS_BOT_TOKEN) or env:NAME — never paste the secret itself',
      'INVALID_REF',
    );
  }
  return name;
}

/** Admin/API validation before persisting `secret_ref`. */
export function assertValidSecretRef(ref: string): void {
  normalizeEnvSecretRef(ref);
}
