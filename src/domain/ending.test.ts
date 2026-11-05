import { describe, expect, it } from 'vitest';
import { outcomeOf } from './ending';

describe('the outcome of each nation at the conclusion', () => {
  const line = (nation: string, defeated = false) => ({ nation, defeated });

  /** Sans son issue propre, la clôture à la main (pas de vainqueur) se tamponnait « égalité ». */
  it('stamps nobody winner, loser or even when the season was closed by hand, the fallen only', () => {
    const closed = { reason: 'closed' as const, winnerNation: null, perMinute: null };
    expect(outcomeOf(line('france'), closed)).toBe('closed');
    expect(outcomeOf(line('italy', true), closed)).toBe('out');
  });

  it('keeps the draw for a clock that could not decide', () => {
    const draw = { reason: 'draw' as const, winnerNation: null, perMinute: null };
    expect(outcomeOf(line('france'), draw)).toBe('draw');
  });
});
