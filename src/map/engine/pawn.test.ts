import { describe, expect, it } from 'vitest';
import type { Medium } from '@/domain/routing';
import { Pawn } from './pawn';

/**
 * Costumes are stored in `land`, `sea`, `air` order: the index says which one is worn,
 * without the pawn having to expose its internal state to be verified.
 */
const MEDIUMS: ReadonlyArray<Medium> = ['land', 'sea', 'air'];

const wornCostume = (pawn: Pawn): Medium | null => {
  const worn = pawn.object.children.flatMap((costume, index) =>
    costume.visible ? [MEDIUMS[index]!] : [],
  );
  return worn.length === 1 ? worn[0]! : null;
};

/**
 * The sprite is not tested here: `TextureLoader` needs a `document`, and the rule that must
 * be engraved — an enemy arc structurally has no sprite URL — lives in `movementSprite`,
 * hence in `manifest.test.ts`.
 */
describe('the spriteless pawn', () => {
  it('holds the three medium silhouettes and only wears one', () => {
    const pawn = new Pawn(null, '#000');
    expect(pawn.object.children).toHaveLength(3);
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
