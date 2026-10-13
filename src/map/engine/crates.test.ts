import { describe, expect, it } from 'vitest';
import { CratePile } from './crates';

const heights = (pile: CratePile) => pile.object.children.map((crate) => crate.position.y);

describe('CratePile', () => {
  it('stands the crates already due, and drops only a quarter crossed under the eye', () => {
    const pile = new CratePile(2);
    pile.update(2, 0, true);
    expect(heights(pile)).toEqual([0, 0]);

    pile.update(3, 1000, true);
    expect(heights(pile)[2]).toBeGreaterThan(1);
    pile.update(3, 1300, true);
    expect(heights(pile)).toEqual([0, 0, 0]);
  });

  it('sets a crate down without a fall when motion is not full', () => {
    const pile = new CratePile(0);
    pile.update(1, 1000, false);
    expect(heights(pile)).toEqual([0]);
  });
});
