import { describe, expect, it } from 'vitest';
import { MOLE } from '@/emblems/kits/manifest';
import {
  type Berth,
  berthOf,
  docking,
  hauling,
  type HullTrack,
  launch,
  OFFSHORE,
  type SeaRole,
  undocking,
} from './port';
import { berths } from './rest';

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

describe('a hull ends, and starts, where its pile stands it', () => {
  const quay = { x: 10, z: 175, yaw: 0.3 };
  it.each([
    ['docking', docking('cargo', BEAM, quay)],
    ['launch', launch('cargo', BEAM, 3, quay)],
  ] as const)('%s: at its place, turned as it stands', (_, track) => {
    const end = track.at(track.ms);
    expect([end.x, end.z]).toEqual([quay.x, quay.z].map((v) => expect.closeTo(v, 3)));
    expect(Math.cos(end.yaw - quay.yaw)).toBeCloseTo(1, 3);
  });
  it('undocking: from its place, turned as it stands', () => {
    const start = undocking('cargo', BEAM, quay).at(0);
    expect(start.x).toBeCloseTo(quay.x, 3);
    expect(start.z).toBeCloseTo(quay.z, 3);
    expect(Math.cos(start.yaw - quay.yaw)).toBeCloseTo(1, 3);
  });
});

describe('a hull at its post, not only at the mole (#487)', () => {
  const [mole, couple, roads] = berths(['cargo', 'cargo', 'cargo']) as [Berth, Berth, Berth];
  const stood = (track: HullTrack, at: Berth) => {
    const end = track.at(track.ms);
    expect([end.x, end.z]).toEqual([at.x, at.z].map((v) => expect.closeTo(v, 3)));
    expect(Math.cos(end.yaw - at.yaw)).toBeCloseTo(1, 3);
  };

  it('docks in the roads without being hauled: it ends at its anchorage, stem to the land', () => {
    const track = docking('cargo', BEAM, roads);
    expect([track.at(0).x, track.at(0).z]).toEqual([OFFSHORE.x, OFFSHORE.z]);
    stood(track, roads);
    expect(worstStep(track)).toBeLessThan(3);
  });

  it('is launched to the roads: it runs on to its anchorage, with no haul across', () => {
    const track = launch('cargo', BEAM, 3, roads);
    stood(track, roads);
    expect(worstStep(track)).toBeLessThan(3);
    // Still moving at the second before its end would be a haul: it has come to rest by then.
    expect(Math.abs(track.at(track.ms).z - track.at(track.ms - 300).z)).toBeLessThan(0.5);
  });

  it('puts to sea from the roads ahead, never back toward the mole', () => {
    const track = undocking('cargo', BEAM, roads);
    stood({ ms: 0, at: () => track.at(0) }, roads);
    const end = track.at(track.ms);
    expect([end.x, end.z]).toEqual([OFFSHORE.x, OFFSHORE.z].map((v) => expect.closeTo(v, 3)));
    expect(worstStep(track)).toBeLessThan(3);
    for (let t = 0; t <= track.ms; t += 50)
      expect(track.at(t).z).toBeGreaterThanOrEqual(roads.z - 1);
  });

  it('puts to sea from the side of the mole, where the hull stood', () => {
    const track = undocking('cargo', BEAM, couple);
    expect(track.at(0).x).toBeCloseTo(couple.x, 3);
    expect(worstStep(track)).toBeLessThan(3);
  });

  it('hauls the hull at the side across to the mole, bows level', () => {
    const track = hauling('cargo', couple, mole);
    stood({ ms: 0, at: () => track.at(0) }, couple);
    stood(track, mole);
    expect(worstStep(track)).toBeLessThan(3);
  });
});
