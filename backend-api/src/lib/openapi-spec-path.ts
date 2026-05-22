import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolves the canonical OpenAPI YAML path for `/v1/openapi.{yaml,json}`.
 * Order: `OPENAPI_SPEC_PATH` → `./contracts/openapi.yaml` (Docker / copied) → monorepo `specs/...` when cwd is `backend-api/`.
 */
export function resolveOpenapiYamlPath(): string {
  const fromEnv = process.env.OPENAPI_SPEC_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const cwd = process.cwd();
  const candidates = [
    join(cwd, 'contracts', 'openapi.yaml'),
    join(cwd, '..', 'specs', '001-tharwa-platform-mvp', 'contracts', 'openapi.yaml'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }

  throw new Error(
    'OpenAPI spec not found. Set OPENAPI_SPEC_PATH to openapi.yaml, or run from the monorepo with specs/001-tharwa-platform-mvp/contracts/openapi.yaml present, or place the file at contracts/openapi.yaml (e.g. Docker image).',
  );
}
