import { expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { rawVerdictOf, type Column } from './EconomyWindow';

/** « À sec » est réservé à ce qui a de quoi produire (décision du 13/10). */
const viewWith = (buildings: ReadonlyArray<{ key: string }>) =>
  ({ me: { buildings, construction: null, constructionQueue: [] } }) as unknown as PlayerView;

const oil = (held: number, perHour = 0): Column => ({
  id: 'oil',
  sources: [{ kind: 'deposit', deposit: 'oil', held }],
  extraction: ['oilWell'],
  conversion: null,
  output: { resource: 'oil', perHour },
});

it('says the deposit is missing when the soil holds none', () => {
  expect(rawVerdictOf(viewWith([]), oil(0))).toBe('noDeposit');
});

it('says the link is missing when nothing works the deposit', () => {
  expect(rawVerdictOf(viewWith([]), oil(2))).toBe('missing');
});

it('keeps « à sec » for a filière that stands and yields nothing', () => {
  expect(rawVerdictOf(viewWith([{ key: 'oilWell' }]), oil(2))).toBe('dry');
});

it('says nothing of a filière that flows', () => {
  expect(rawVerdictOf(viewWith([{ key: 'oilWell' }]), oil(2, 8))).toBeNull();
});
