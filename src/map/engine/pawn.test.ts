import { troopSpan } from '@/domain/piece-size';
import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import type { Medium } from '@/domain/routing';
import type { Figurine } from './figurines/figurine';
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

describe('the pawn without figurines', () => {
  it('holds the three medium silhouettes and only wears one', () => {
    const pawn = new Pawn('#000');
    expect(wornCostume(pawn)).toBe('land');
  });

  it('changes costume at the dock crossing', () => {
    const pawn = new Pawn('#000');
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
    const pawn = new Pawn('#000');
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
    const pawn = new Pawn('#000');
    for (const medium of ['land', 'air'] as const) {
      pawn.wear(medium);
      pawn.orient(close, 0);
      expect(wakeOf(pawn).visible).toBe(false);
    }
  });
});

describe('the plane shadow', () => {
  const close = new Vector3(0, 8, 0);
  const shadowOf = (pawn: Pawn) => pawn.object.getObjectByName('shadow')!;

  it('lies on the ground under a plane in flight, the gap its altitude', () => {
    const pawn = new Pawn('#000');
    pawn.wear('air');
    pawn.place(new Vector3(0, 3, 0), new Vector3(1, 3, 0), 0.5);
    pawn.orient(close, 0);
    pawn.object.updateMatrixWorld(true);
    const shadow = shadowOf(pawn);
    expect(shadow.visible).toBe(true);
    expect(shadow.getWorldPosition(new Vector3()).y).toBeCloseTo(0.5);
  });

  it('is never stuck under a plane on the ground, nor under a hull or a column', () => {
    const pawn = new Pawn('#000');
    pawn.wear('air');
    pawn.place(new Vector3(0, 0.5, 0), new Vector3(1, 0.5, 0), 0.5);
    pawn.orient(close, 0);
    expect(shadowOf(pawn).visible).toBe(false);
    for (const medium of ['land', 'sea'] as const) {
      pawn.wear(medium);
      pawn.place(new Vector3(0, 3, 0), new Vector3(1, 3, 0), 0.5);
      pawn.orient(close, 0);
      expect(shadowOf(pawn).visible).toBe(false);
    }
  });
});

describe('the life of a piece of mine on its road', () => {
  const close = new Vector3(0, 5, 0);
  const figurine = (): Figurine => ({
    object: new Group(),
    span: troopSpan('armor'),
    ready: Promise.resolve(),
    spin() {},
  });
  const tank = (roles: boolean) => {
    const land = figurine();
    const pawn = new Pawn(
      '#000',
      { land, sea: null, air: null },
      null,
      roles ? { land: 'armor', sea: null, air: null } : null,
    );
    return { pawn, land };
  };
  const roll = (pawn: Pawn, lively: boolean, x = 0.1) => {
    pawn.place(new Vector3(x, 0, 0), new Vector3(x + 1, 0, 0));
    pawn.step(lively ? 0.1 : null);
    pawn.orient(close, 0);
  };
  const dustOf = (land: Figurine) => land.object.children.find((child) => child.type === 'Group')!;

  it('raises dust and jolts a vehicle that rolls, at full motion only', () => {
    const { pawn, land } = tank(true);
    roll(pawn, true);
    expect(dustOf(land).visible).toBe(true);
    expect(land.object.rotation.x).not.toBe(0);
    roll(pawn, false, 0.2);
    expect(dustOf(land).visible).toBe(false);
    expect(land.object.rotation.x).toBe(0);
  });

  it('settles the dust when the vehicle stops', () => {
    const { pawn, land } = tank(true);
    roll(pawn, true);
    roll(pawn, true);
    expect(dustOf(land).visible).toBe(false);
  });

  it('leaves a piece that is not mine still: the fog serves it no role', () => {
    const { pawn, land } = tank(false);
    roll(pawn, true);
    expect(land.object.rotation.x).toBe(0);
    expect(land.object.children).toHaveLength(0);
  });
});
