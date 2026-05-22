import { readFile } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import { parse as parseYaml } from 'yaml';
import { resolveOpenapiYamlPath } from '../../lib/openapi-spec-path.js';

export const openapiDocRoutes: FastifyPluginAsync = async (app) => {
  app.get('/openapi.yaml', async (_req, reply) => {
    const specPath = resolveOpenapiYamlPath();
    const body = await readFile(specPath, 'utf8');
    return reply.type('application/yaml; charset=utf-8').send(body);
  });

  app.get('/openapi.json', async (_req, reply) => {
    const specPath = resolveOpenapiYamlPath();
    const body = await readFile(specPath, 'utf8');
    const doc = parseYaml(body) as Record<string, unknown>;
    return reply.send(doc);
  });
};
