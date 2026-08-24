import type { MasarArchetype } from '@prisma/client';
import type { QuizAnswers } from './masar-validation.js';

/** Risk score from quiz answers; higher → more growth-oriented archetype. */
export function scoreQuizAnswers(answers: QuizAnswers): number {
  let score = 0;

  if (answers.goal === 'grow_long_term') score += 3;
  else if (answers.goal === 'protect_income_short_term') score += 1;

  if (answers.volatilityComfort === 'comfortable') score += 3;
  else if (answers.volatilityComfort === 'somewhat') score += 2;

  if (answers.nearTermNeed === 'no') score += 2;
  else if (answers.nearTermNeed === 'yes') score -= 3;

  return score;
}

/** Map score to one of five archetypes; ties resolve downward (more conservative). */
export function archetypeFromScore(score: number): MasarArchetype {
  if (score <= 2) return 'conservative';
  if (score <= 4) return 'cautious_balanced';
  if (score <= 6) return 'balanced';
  if (score <= 8) return 'growth_balanced';
  return 'aggressive_long_term';
}

export function classifyMasarAnswers(answers: QuizAnswers): MasarArchetype {
  return archetypeFromScore(scoreQuizAnswers(answers));
}
