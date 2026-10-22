import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { World } from '@/domain/world';
import projectionAsset from '../../../public/projection.json';
import { WorldFrame } from './frame';
import { PlacingGhost } from './placing';

const world = {
  sphere: projectionAsset.sphere,
  outline: projectionAsset.outline,
  countries: [],
} as unknown as World;

const PARIS: LonLat = [2.35, 48.86];
const DEPOSIT: LonLat = [3.0, 50.4];

/** The pointer is over Paris, the magnet drags it to the deposit: the pin must stand there. */
const armed = (touch = false) => {
  const frame = new WorldFrame(world);
  const ghost = new PlacingGhost(frame, touch);
  ghost.arm(null, () => DEPOSIT);
  const at = frame.projectLonLat(PARIS);
  ghost.aimAt(at.x + frame.centerX, at.z + frame.centerY);
  return { frame, ghost };
};

describe('the pin of a placement', () => {
  it('is planted at the very point the ghost holds, not under the pointer', () => {
    const { frame, ghost } = armed();
    expect(ghost.spot).toEqual(DEPOSIT);
    expect(ghost.pin.visible).toBe(true);
    ghost.object.updateMatrixWorld(true);
    const foot = ghost.pin.getWorldPosition(new Vector3());
    const held = frame.projectLonLat(DEPOSIT);
    expect(foot.x).toBeCloseTo(held.x);
    expect(foot.z).toBeCloseTo(held.z);
  });

  it('is not there before the pointer has been on the board', () => {
    const ghost = new PlacingGhost(new WorldFrame(world));
    ghost.arm(null, (pointer) => pointer);
    expect(ghost.pin.visible).toBe(false);
  });

  it('turns red when the placement is refused, and back when it is not', () => {
    const { ghost } = armed();
    const free = ghost.pinTone;
    ghost.refuse(true);
    const refused = ghost.pinTone;
    expect(refused).not.toBe(free);
    ghost.refuse(false);
    expect(ghost.pinTone).toBe(free);
  });

  it('drops onto the point when the magnet snaps, unless motion is reduced', () => {
    const { ghost } = armed();
    expect(ghost.pinDrop(0, 'full')).toBeGreaterThan(0);
    expect(ghost.pinDrop(1000, 'full')).toBe(0);
    expect(ghost.pinDrop(0, 'reduced')).toBe(0);
  });

  it('holds its head higher under a finger, which hides what is just beneath it', () => {
    expect(armed(true).ghost.pinHeight).toBeGreaterThan(armed(false).ghost.pinHeight);
  });
});
