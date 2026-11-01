import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SOCLE_TOP, worksGround } from './works';

describe('worksGround', () => {
  // The port's slip goes 2.5 m under the water: its works stand on the ground all the same.
  const port = new Box3(new Vector3(-20, -2.5, -105), new Vector3(20, 30, 105));

  it('stands the works of a building without a socle on the ground, its stake by its corner', () => {
    expect(worksGround(port, null)).toEqual({
      base: 0,
      stake: [20 + 210 * 0.13, 105 + 210 * 0.09],
    });
  });

  it('stands them on the socle top, the stake kept inside its edge', () => {
    const barracks = new Box3(new Vector3(-25.3, SOCLE_TOP, -8.3), new Vector3(39.4, 22, 10.6));
    const socle = new Box3(new Vector3(-34, 0, -15), new Vector3(46, 29.4, 33));
    const { base, stake } = worksGround(barracks, socle);
    expect(base).toBe(SOCLE_TOP);
    expect(stake[0]).toBeLessThanOrEqual(46 - 2);
    expect(stake[1]).toBeLessThanOrEqual(33 - 2);
    expect(stake[0]).toBeGreaterThan(barracks.max.x);
  });
});
