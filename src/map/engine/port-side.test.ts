import { describe, expect, it } from 'vitest';
import { CRANE, MOLE } from '@/emblems/kits/manifest';
import { mirroredPort, MOLE_LAND_MAX, type PortGround } from './port-side';

/** A ground in the port's metres: land where `land` says, no neighbour unless `taken` does. */
const ground = (
  land: (x: number, z: number) => boolean,
  taken: (x: number, z: number) => boolean = () => false,
): PortGround => ({ land, taken });

/** Land back from the quay, sea beyond it: the port on a straight coast. */
const SEA_FROM_QUAY = (z: number) => z < MOLE.quay;
const STRAIGHT = (_x: number, z: number) => SEA_FROM_QUAY(z);

describe('which side a port is laid on (#476)', () => {
  it('keeps the mole on the +x edge when both sides are free', () => {
    expect(mirroredPort(ground(STRAIGHT))).toBe(false);
  });

  it('mirrors when the coast lies under the mole, and is free on the other side', () => {
    expect(mirroredPort(ground((x, z) => SEA_FROM_QUAY(z) || x > MOLE.inner))).toBe(true);
  });

  it('keeps the plain side when only the mirrored side is blocked', () => {
    expect(mirroredPort(ground((x, z) => SEA_FROM_QUAY(z) || x < -MOLE.inner))).toBe(false);
  });

  it('mirrors for a crane that would stand in the water, its mirror standing on land', () => {
    const shortOfCrane = (x: number, z: number) => z < MOLE.quay && x < CRANE.x - 5 && x > -90;
    expect(mirroredPort(ground(shortOfCrane))).toBe(true);
  });

  it('mirrors for a neighbour on the mole, a site standing where the mole would run', () => {
    const [x0, z0] = [MOLE.x, MOLE.quay + 80];
    expect(mirroredPort(ground(STRAIGHT, (x, z) => Math.hypot(x - x0, z - z0) < 40))).toBe(true);
  });

  it('puts up with a sliver of land under the mole, the bar being a tenth of it', () => {
    const sliver = (x: number, z: number) =>
      SEA_FROM_QUAY(z) || (x > MOLE.inner && z > MOLE.quay && z < MOLE.quay + 10);
    expect(MOLE_LAND_MAX).toBeCloseTo(0.1);
    expect(mirroredPort(ground(sliver))).toBe(false);
  });

  it('keeps the less blocked side when neither is free, no refusal', () => {
    const more = (x: number, z: number) => SEA_FROM_QUAY(z) || (x > 0 ? true : z < MOLE.quay + 100);
    const less = (x: number, z: number) => SEA_FROM_QUAY(z) || (x > 0 ? z < MOLE.quay + 100 : true);
    expect(mirroredPort(ground(more))).toBe(true);
    expect(mirroredPort(ground(less))).toBe(false);
  });

  it('keeps the plain side when both are blocked alike', () => {
    expect(mirroredPort(ground(() => true))).toBe(false);
  });
});
