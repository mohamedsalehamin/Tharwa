import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

function resolveProjectRoot(fromModuleUrl: string): string {
  const dir = dirname(fileURLToPath(fromModuleUrl));
  const leaf = basename(dir);
  if (leaf === 'dist' || leaf === 'src') {
    return resolve(dir, '..');
  }
  return dir;
}

/** Load `.env` from the API project root (works when aaPanel cwd is not the app folder). */
export function loadDotEnvFromProject(moduleUrl: string): string | undefined {
  const candidates = [
    resolve(resolveProjectRoot(moduleUrl), '.env'),
    resolve(process.cwd(), '.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    loadEnvFile(envPath);
    return envPath;
  }
  return undefined;
}
