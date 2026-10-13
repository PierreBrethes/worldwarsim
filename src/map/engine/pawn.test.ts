import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Medium } from '@/domain/routing';
import { Pawn } from './pawn';

/**
 * Costumes are stored in `land`, `sea`, `air` order: the index says which one is worn,
 * without the pawn having to expose its internal state to be verified.
 */
const MEDIUMS: ReadonlyArray<Medium> = ['land', 'sea', 'air'];

const wornCostume = (pawn: Pawn): Medium | null => {
  const worn = pawn.object.children
    .slice(0, MEDIUMS.length)
    .flatMap((costume, index) => (costume.visible ? [MEDIUMS[index]!] : []));
  return worn.length === 1 ? worn[0]! : null;
};

/**
 * The sprite is not tested here: `TextureLoader` needs a `document`, and the rule that must
 * be engraved — an enemy arc structurally has no sprite URL, and each medium is dressed by its
 * own units — lives in `movementSprites`, hence in `manifest.test.ts`.
 */
describe('the spriteless pawn', () => {
  it('holds the three medium silhouettes and only wears one', () => {
    const pawn = new Pawn(null, '#000');
    expect(wornCostume(pawn)).toBe('land');
  });

  it('changes costume at the dock crossing', () => {
    const pawn = new Pawn(null, '#000');
    pawn.wear('sea');
    expect(wornCostume(pawn)).toBe('sea');
    pawn.wear('land');
    expect(wornCostume(pawn)).toBe('land');
    pawn.wear('air');
    expect(wornCostume(pawn)).toBe('air');
  });
});

describe('the wake', () => {
  const close = new Vector3(0, 5, 0);
  const wakeOf = (pawn: Pawn) => pawn.object.getObjectByName('wake')!;

  it('trails behind a hull at sea, in the axis of its road', () => {
    const pawn = new Pawn(null, '#000');
    pawn.wear('sea');
    pawn.place(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
    pawn.orient(close, 0);
    pawn.object.updateMatrixWorld(true);
    const wake = wakeOf(pawn);
    expect(wake.visible).toBe(true);
    const puffs = wake.children.filter((puff) => puff.visible);
    expect(puffs.length).toBeGreaterThan(0);
    for (const puff of puffs) {
      const at = puff.getWorldPosition(new Vector3());
      expect(at.x).toBeLessThan(0);
      expect(Math.abs(at.z)).toBeLessThan(Math.abs(at.x));
    }
  });

  it('is not drawn on land nor in the air', () => {
    const pawn = new Pawn(null, '#000');
    for (const medium of ['land', 'air'] as const) {
      pawn.wear(medium);
      pawn.orient(close, 0);
      expect(wakeOf(pawn).visible).toBe(false);
    }
  });
});
