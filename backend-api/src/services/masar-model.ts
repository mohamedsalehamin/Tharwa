import type { MasarArchetype } from '@prisma/client';
import { defaultAllocationFor, type MasarAllocation } from './masar-archetypes.js';

export function validateAllocation(allocation: MasarAllocation): string | null {
  const { equityPct, fixedIncomePct, goldPct } = allocation;
  for (const [label, pct] of [
    ['equityPct', equityPct],
    ['fixedIncomePct', fixedIncomePct],
    ['goldPct', goldPct],
  ] as const) {
    if (pct < 0 || pct > 100) return `${label} must be between 0 and 100`;
    if (pct % 5 !== 0) return `${label} must be a multiple of 5`;
  }
  if (equityPct + fixedIncomePct + goldPct !== 100) {
    return 'Allocation must sum to exactly 100';
  }
  return null;
}

export function resetToDefault(archetype: MasarArchetype): MasarAllocation {
  return defaultAllocationFor(archetype);
}
