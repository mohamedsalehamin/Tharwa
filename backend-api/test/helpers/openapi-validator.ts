import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { OpenAPIV3 } from 'openapi-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, '../../../specs/001-tharwa-platform-mvp/contracts/openapi.yaml');

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

const cache = new Map<string, ValidateFunction>();
let ajvPromise: Promise<Ajv> | null = null;
let bundledSpecPromise: Promise<OpenAPIV3.Document> | null = null;

function cacheKey(path: string, method: HttpMethod, status: string): string {
  return `${method.toUpperCase()} ${path} ${status}`;
}

async function loadBundledSpec(): Promise<OpenAPIV3.Document> {
  bundledSpecPromise ??= SwaggerParser.bundle(OPENAPI_PATH) as Promise<OpenAPIV3.Document>;
  return bundledSpecPromise;
}

async function getAjv(): Promise<Ajv> {
  if (!ajvPromise) {
    ajvPromise = (async () => {
      const doc = await loadBundledSpec();
      const ajv = new Ajv({ strict: false, allErrors: true });
      addFormats(ajv);
      const schemas = doc.components?.schemas ?? {};
      for (const [name, schema] of Object.entries(schemas)) {
        ajv.addSchema(schema as object, `#/components/schemas/${name}`);
      }
      return ajv;
    })();
  }
  return ajvPromise;
}

function resolveResponseSchema(
  doc: OpenAPIV3.Document,
  path: string,
  method: HttpMethod,
  status: string,
): OpenAPIV3.SchemaObject | null {
  const item = doc.paths?.[path]?.[method];
  if (!item || !('responses' in item)) return null;
  const response = item.responses?.[status];
  if (!response || typeof response !== 'object' || !('content' in response)) return null;
  const json = response.content?.['application/json'];
  if (!json?.schema) return null;
  return json.schema as OpenAPIV3.SchemaObject;
}

export async function validateOpenApiResponse(
  path: string,
  method: HttpMethod,
  status: string,
  body: unknown,
): Promise<{ valid: boolean; errors?: string[] }> {
  const key = cacheKey(path, method, status);
  let validate = cache.get(key);
  if (!validate) {
    const doc = await loadBundledSpec();
    const schema = resolveResponseSchema(doc, path, method, status);
    if (!schema) {
      throw new Error(`No application/json schema for ${key}`);
    }
    const ajv = await getAjv();
    validate = ajv.compile(schema);
    cache.set(key, validate);
  }
  const valid = validate(body);
  if (valid) return { valid: true };
  return {
    valid: false,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()),
  };
}

/** Ensures canonical OpenAPI file is readable (smoke). */
export async function readOpenApiSpecText(): Promise<string> {
  return readFile(OPENAPI_PATH, 'utf8');
}
