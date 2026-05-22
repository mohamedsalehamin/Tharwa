/** Opaque handle stored in `upstream_connections.secret_ref` — never the secret value. */
export type SecretRef = string;

export type SecretsBackendKind = 'env';

export interface SecretResolver {
  readonly kind: SecretsBackendKind;
  /** Resolve by ref; returns `null` if unset/empty. */
  resolve(ref: SecretRef): string | null;
  /** Resolve by ref; throws `SecretResolverError` if missing. */
  resolveRequired(ref: SecretRef): string;
}
