import type { MasarArchetype } from '@prisma/client';
import { DISCLAIMER_COMBINED } from '../i18n/disclaimers.js';
import {
  getArchetypeEntry,
  MASAR_ARCHETYPE_CATALOG,
  type MasarAllocation,
} from './masar-archetypes.js';
import { classifyMasarAnswers } from './masar-classify.js';
import type { QuizAnswers } from './masar-validation.js';

export const MASAR_DISCLAIMER = `${DISCLAIMER_COMBINED} Masar outputs are educational archetypes and illustrative models — not tailored advice.`;

export type ArchetypeDto = {
  id: MasarArchetype;
  nameLabel: string;
  descriptionLabel: string;
  defaultAllocation: MasarAllocation;
};

export type MasarResultDto = {
  archetype: MasarArchetype;
  nameLabel: string;
  descriptionLabel: string;
  defaultAllocation: MasarAllocation;
  shariaPreferred: boolean;
  disclaimer: string;
};

/** API returns i18n keys as labels; mobile resolves via t(). */
export function presentArchetypeCatalogEntry(
  entry: (typeof MASAR_ARCHETYPE_CATALOG)[number],
): ArchetypeDto {
  return {
    id: entry.id,
    nameLabel: entry.nameKey,
    descriptionLabel: entry.descriptionKey,
    defaultAllocation: { ...entry.defaultAllocation },
  };
}

export function listArchetypeCatalog(): ArchetypeDto[] {
  return MASAR_ARCHETYPE_CATALOG.map(presentArchetypeCatalogEntry);
}

export function computeMasarResult(answers: QuizAnswers): MasarResultDto {
  const archetype = classifyMasarAnswers(answers);
  const entry = getArchetypeEntry(archetype);
  const descriptionLabel = answers.shariaPreferred ? entry.shariaDescriptionKey : entry.descriptionKey;
  return {
    archetype,
    nameLabel: entry.nameKey,
    descriptionLabel,
    defaultAllocation: { ...entry.defaultAllocation },
    shariaPreferred: answers.shariaPreferred,
    disclaimer: MASAR_DISCLAIMER,
  };
}
