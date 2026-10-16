import { describe, expect, it } from 'vitest';
import type { Compass, CompassAction } from './compass-rose';
import { dropReadingOf, forbiddenGroundOf, turnChoice } from './drop-order';

const branch = (key: CompassAction['key'], label: string = key): CompassAction =>
  ({ key, label, pictogram: 'cabin', cost: null, consequence: '' }) as unknown as CompassAction;
const fan = (actions: CompassAction[], refusal: string | null = null): Compass => ({
  kicker: '',
  name: '',
  actions,
  refusal,
});

describe('dropReadingOf', () => {
  it('gives the orders a dropped pile can carry out, in the rose order', () => {
    const reading = dropReadingOf(
      fan([branch('aim', 'marcher'), branch('build'), branch('found'), branch('capture')]),
    );
    expect(reading.kind === 'orders' && reading.verbs.map((verb) => verb.label)).toEqual([
      'marcher',
      'found',
      'capture',
    ]);
  });

  it('says the refusal when the target takes nothing from the pile', () => {
    expect(dropReadingOf(fan([], 'Trop loin'))).toEqual({ kind: 'refused', reason: 'Trop loin' });
  });

  it('leaves a drop with nothing to do as nothing, not as a refusal', () => {
    expect(dropReadingOf(fan([branch('build'), branch('upgrade')]))).toEqual({ kind: 'none' });
    expect(dropReadingOf(null)).toEqual({ kind: 'none' });
  });
});

describe('turnChoice', () => {
  it('wraps both ways', () => {
    expect(turnChoice(3, 2, 1)).toBe(0);
    expect(turnChoice(3, 0, -1)).toBe(2);
    expect(turnChoice(3, 1, 1)).toBe(2);
  });
});

describe('forbiddenGroundOf', () => {
  it('veils the sea under what walks, the inland under what floats, nothing under what flies', () => {
    expect(forbiddenGroundOf(['infantry', 'armor'])).toBe('sea');
    expect(forbiddenGroundOf(['landTransport', 'infantry'])).toBe('sea');
    expect(forbiddenGroundOf(['cargo'])).toBe('inland');
    expect(forbiddenGroundOf(['cargo', 'infantry'])).toBe('inland');
    expect(forbiddenGroundOf(['airTransport', 'infantry'])).toBeNull();
  });

  it('veils nothing for an empty hand', () => {
    expect(forbiddenGroundOf([])).toBeNull();
  });
});
