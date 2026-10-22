import { describe, expect, it } from 'vitest';
import type { Compass, CompassAction } from './compass-rose';
import { chipOf, dropReadingOf, forbiddenGroundOf, turnChoice } from './drop-order';

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
      fan([branch('aim', 'marcher'), branch('upgrade'), branch('found'), branch('capture')]),
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

  it('holds a drop while the coast is on its way, rather than refuse it', () => {
    expect(dropReadingOf({ ...fan([], 'un instant'), pending: true })).toEqual({
      kind: 'pending',
      reason: 'un instant',
    });
  });

  it('leaves a drop with nothing to do as nothing, not as a refusal', () => {
    expect(dropReadingOf(fan([branch('demolish'), branch('upgrade')]))).toEqual({ kind: 'none' });
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

describe('chipOf', () => {
  const aim = (type: string, extra: object = {}): CompassAction =>
    ({ ...branch('aim', type), type, ...extra }) as unknown as CompassAction;

  it('says an attack in red, with crossed swords', () => {
    expect(chipOf(aim('attack'), 'sea')).toEqual({ icon: '⚔', tone: 'fight', verb: 'Attaquer' });
    expect(chipOf(branch('bombard'), 'sea').tone).toBe('fight');
  });

  it('forms a squad on a lone troop, and joins one already formed', () => {
    expect(chipOf(aim('march', { join: { formed: true, pieces: 2 } }), 'sea')).toEqual({
      icon: '+',
      tone: 'order',
      verb: 'Former une escouade',
    });
    expect(chipOf(aim('march', { join: { formed: false, pieces: 4 } }), 'sea').verb).toBe(
      'Rejoindre l’escouade',
    );
  });

  it('boards under the boarding arrow', () => {
    expect(chipOf(branch('board'), 'sea')).toEqual({ icon: '⤓', tone: 'order', verb: 'Embarquer' });
    expect(chipOf(aim('march', { boardsOn: 't1' }), 'sea').icon).toBe('⤓');
  });

  it('names a plain march by what goes: on foot, by sea, by air', () => {
    expect(chipOf(aim('march'), 'sea').verb).toBe('Marcher');
    expect(chipOf(aim('march'), 'inland').verb).toBe('Faire route');
    expect(chipOf(aim('march'), null).verb).toBe('Voler');
  });

  it('keeps any other order under its own label, capitalised', () => {
    expect(chipOf(branch('collect', 'ramasser'), 'sea')).toEqual({
      icon: '✓',
      tone: 'order',
      verb: 'Ramasser',
    });
  });
});
