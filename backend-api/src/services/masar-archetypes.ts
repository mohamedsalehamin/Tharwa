import type { MasarArchetype } from '@prisma/client';

export type MasarAllocation = {
  equityPct: number;
  fixedIncomePct: number;
  goldPct: number;
};

export type ArchetypeCatalogEntry = {
  id: MasarArchetype;
  nameKey: string;
  descriptionKey: string;
  shariaDescriptionKey: string;
  defaultAllocation: MasarAllocation;
};

export const MASAR_ARCHETYPE_CATALOG: ArchetypeCatalogEntry[] = [
  {
    id: 'conservative',
    nameKey: 'masar.archetype.conservative.name',
    descriptionKey: 'masar.archetype.conservative.desc',
    shariaDescriptionKey: 'masar.archetype.conservative.descSharia',
    defaultAllocation: { equityPct: 20, fixedIncomePct: 55, goldPct: 25 },
  },
  {
    id: 'cautious_balanced',
    nameKey: 'masar.archetype.cautious_balanced.name',
    descriptionKey: 'masar.archetype.cautious_balanced.desc',
    shariaDescriptionKey: 'masar.archetype.cautious_balanced.descSharia',
    defaultAllocation: { equityPct: 35, fixedIncomePct: 45, goldPct: 20 },
  },
  {
    id: 'balanced',
    nameKey: 'masar.archetype.balanced.name',
    descriptionKey: 'masar.archetype.balanced.desc',
    shariaDescriptionKey: 'masar.archetype.balanced.descSharia',
    defaultAllocation: { equityPct: 50, fixedIncomePct: 35, goldPct: 15 },
  },
  {
    id: 'growth_balanced',
    nameKey: 'masar.archetype.growth_balanced.name',
    descriptionKey: 'masar.archetype.growth_balanced.desc',
    shariaDescriptionKey: 'masar.archetype.growth_balanced.descSharia',
    defaultAllocation: { equityPct: 70, fixedIncomePct: 20, goldPct: 10 },
  },
  {
    id: 'aggressive_long_term',
    nameKey: 'masar.archetype.aggressive_long_term.name',
    descriptionKey: 'masar.archetype.aggressive_long_term.desc',
    shariaDescriptionKey: 'masar.archetype.aggressive_long_term.descSharia',
    defaultAllocation: { equityPct: 85, fixedIncomePct: 5, goldPct: 10 },
  },
];

export function getArchetypeEntry(id: MasarArchetype): ArchetypeCatalogEntry {
  const entry = MASAR_ARCHETYPE_CATALOG.find((a) => a.id === id);
  if (!entry) throw new Error(`Unknown archetype: ${id}`);
  return entry;
}

export function defaultAllocationFor(archetype: MasarArchetype): MasarAllocation {
  return { ...getArchetypeEntry(archetype).defaultAllocation };
}
