import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('masar sim exclusion', () => {
  it('masar services do not reference SimAccount or SimTrade', () => {
    const files = [
      'src/services/masar-archetypes.ts',
      'src/services/masar-classify.ts',
      'src/services/masar-model.ts',
      'src/services/masar-result.ts',
      'src/services/masar-profile.ts',
      'src/services/masar-benchmark.ts',
      'src/services/masar-illustration.ts',
      'src/routes/v1/masar.ts',
    ];
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), f), 'utf8');
      expect(text).not.toMatch(/SimAccount|SimTrade/);
    }
  });
});
