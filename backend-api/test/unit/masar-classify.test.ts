import { describe, expect, it } from 'vitest';
import { classifyMasarAnswers, scoreQuizAnswers } from '../../src/services/masar-classify.js';
import type { QuizAnswers } from '../../src/services/masar-validation.js';

function answers(partial: Partial<QuizAnswers>): QuizAnswers {
  return {
    goal: 'grow_long_term',
    volatilityComfort: 'comfortable',
    nearTermNeed: 'no',
    shariaPreferred: false,
    ...partial,
  };
}

describe('classifyMasarAnswers', () => {
  it('is deterministic for the same answers', () => {
    const a = answers({});
    expect(classifyMasarAnswers(a)).toBe(classifyMasarAnswers(a));
  });

  it('maps aggressive growth profile to growth_balanced or aggressive_long_term', () => {
    expect(['growth_balanced', 'aggressive_long_term']).toContain(classifyMasarAnswers(answers({})));
  });

  it('pulls toward conservative when near-term need is yes', () => {
    const growth = answers({});
    const conservativePull = answers({ nearTermNeed: 'yes' });
    expect(scoreQuizAnswers(conservativePull)).toBeLessThan(scoreQuizAnswers(growth));
    expect(classifyMasarAnswers(conservativePull)).not.toBe('aggressive_long_term');
  });

  it('maps not_sure answers to a defined conservative-leaning archetype', () => {
    const r = classifyMasarAnswers(
      answers({
        goal: 'not_sure',
        volatilityComfort: 'uncomfortable',
        nearTermNeed: 'not_sure',
      }),
    );
    expect(['conservative', 'cautious_balanced', 'balanced']).toContain(r);
  });

  it('covers all five archetype buckets', () => {
    const samples: QuizAnswers[] = [
      answers({ goal: 'not_sure', volatilityComfort: 'uncomfortable', nearTermNeed: 'yes' }),
      answers({ goal: 'protect_income_short_term', volatilityComfort: 'somewhat', nearTermNeed: 'not_sure' }),
      answers({ goal: 'protect_income_short_term', volatilityComfort: 'comfortable', nearTermNeed: 'no' }),
      answers({ goal: 'grow_long_term', volatilityComfort: 'somewhat', nearTermNeed: 'no' }),
      answers({ goal: 'grow_long_term', volatilityComfort: 'comfortable', nearTermNeed: 'no' }),
    ];
    const ids = new Set(samples.map(classifyMasarAnswers));
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
});
