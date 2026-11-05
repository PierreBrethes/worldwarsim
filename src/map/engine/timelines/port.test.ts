import { describe, expect, it } from 'vitest';
import { MOLE } from '@/emblems/kits/manifest';
import {
  berthOf,
  docking,
  type HullTrack,
  launch,
  OFFSHORE,
  type SeaRole,
  undocking,
} from './port';

const ROLES: SeaRole[] = ['cargo', 'escort', 'carrier'];
const BEAM = 18;

const worstStep = (track: HullTrack): number => {
  let worst = 0;
  for (let t = 16; t <= track.ms; t += 16) {
    const [a, b] = [track.at(t - 16), track.at(t)];
    worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return worst;
};
const atBerth = (
  role: SeaRole,
  { x, y, z, yaw }: { x: number; y: number; z: number; yaw: number },
) => {
  const berth = berthOf(role, BEAM);
  expect(x).toBeCloseTo(berth.x, 3);
  expect(z).toBeCloseTo(berth.z, 3);
  expect(y).toBeCloseTo(0, 3);
  expect(Math.cos(yaw - Math.PI)).toBeCloseTo(1, 3);
};

describe('a hull docks at the mole (#270)', () => {
  it('its berth: against the basin face, the stem to the land, 3 m off the quay', () => {
    const berth = berthOf('cargo', BEAM);
    expect(berth.x + BEAM / 2).toBe(MOLE.inner - 1);
    expect(berth.z - 65).toBe(MOLE.quay + 3);
  });

  it.each(ROLES)('%s: from the offshore to its berth', (role) => {
    const track = docking(role, BEAM);
    expect([track.at(0).x, track.at(0).z]).toEqual([OFFSHORE.x, OFFSHORE.z]);
    atBerth(role, track.at(track.ms));
    expect(worstStep(track)).toBeLessThan(3);
  });

  it.each(ROLES)('%s: from its berth back to the offshore', (role) => {
    const track = undocking(role, BEAM);
    atBerth(role, track.at(0));
    const end = track.at(track.ms);
    expect(end.x).toBeCloseTo(OFFSHORE.x, 3);
    expect(end.z).toBeCloseTo(OFFSHORE.z, 3);
    expect(worstStep(track)).toBeLessThan(3);
  });
});

describe('a new hull is launched (#270)', () => {
  it.each(ROLES)('%s: stern first off the slip, hauled to its berth', (role) => {
    const track = launch(role, BEAM, 3);
    const start = track.at(0);
    expect(start.x).toBe(0);
    expect(start.y).toBeGreaterThan(2.2);
    expect(Math.cos(start.yaw - Math.PI)).toBeCloseTo(1, 3);
    expect(track.dressed(0)).toBe(0);
    expect(track.dressed(track.ms)).toBe(1);
    expect(track.shores(track.ms, 5)).toBe(1);
    // Stern first: it moves out to sea (+z) before anything else.
    expect(track.at(track.ms * 0.4).z).toBeGreaterThan(start.z);
    atBerth(role, track.at(track.ms));
    expect(worstStep(track)).toBeLessThan(3);
  });
});
