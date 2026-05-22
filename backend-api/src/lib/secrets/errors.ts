export class SecretResolverError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_REF' | 'NOT_FOUND' | 'UNSUPPORTED_BACKEND' = 'NOT_FOUND',
  ) {
    super(message);
    this.name = 'SecretResolverError';
  }
}
