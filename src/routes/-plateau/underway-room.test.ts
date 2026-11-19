import { describe, expect, it } from 'vitest';
import { crowdedBy } from './underway-room';

const pile = { left: 8, right: 190, top: 100, bottom: 300 };

describe('the buttons of the map never cover the « En cours » pile', () => {
  it('leaves the pile open while the buttons stay below it', () => {
    expect(crowdedBy(pile, [{ left: 8, right: 52, top: 420, bottom: 520 }])).toBe(false);
  });

  it('folds the pile when a button rises under it', () => {
    expect(crowdedBy(pile, [{ left: 8, right: 52, top: 290, bottom: 520 }])).toBe(true);
  });

  it('keeps an air gap: touching is crowded', () => {
    expect(crowdedBy(pile, [{ left: 8, right: 52, top: 306, bottom: 520 }])).toBe(true);
  });

  it('ignores what rises on the other side of the screen', () => {
    expect(crowdedBy(pile, [{ left: 300, right: 380, top: 200, bottom: 520 }])).toBe(false);
  });
});
