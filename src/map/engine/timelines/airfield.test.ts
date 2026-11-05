import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import {
  type AirRole,
  ALT,
  APPROACH,
  doorCourse,
  FIL,
  formation,
  groundAt,
  landing,
  parkingZ,
  type Track,
  takeoff,
} from './airfield';

const ROLES: AirRole[] = ['fighter', 'bomber', 'airTransport'];
// A fighter on the yard before hangar B, its tail 4.5 m behind its wheels.
const place = { x: 30, z: parkingZ(4.5) };

/** The farthest it moves in one frame: no jump anywhere along its track. */
const worstStep = (track: Track): number => {
  let worst = 0;
  for (let t = 16; t <= track.ms; t += 16) {
    const [a, b] = [track.at(t - 16), track.at(t)];
    worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return worst;
};
const turnsTo = (yaw: number, to: number) => expect(Math.cos(yaw - to)).toBeCloseTo(1, 3);

describe('a plane takes off from its yard (#269)', () => {
  it.each(ROLES)('%s: from its place to its thread, beyond the free end', (role) => {
    const track = takeoff(role, place);
    const start = track.at(0);
    expect([start.x, start.z]).toEqual([place.x, place.z]);
    expect(start.y).toBeCloseTo(AIRFIELD.top, 3);
    turnsTo(start.yaw, 0);
    const end = track.at(track.ms);
    expect(end.x).toBeCloseTo(FIL.x, 0);
    expect(end.y).toBeCloseTo(ALT, 3);
    expect(end.z).toBeCloseTo(AIRFIELD.runway.z, 3);
    expect(end.gear).toBe(1);
    turnsTo(end.yaw, -Math.PI / 2);
    expect(worstStep(track)).toBeLessThan(1.2);
  });

  it('rolls on the ground down its lane and the ramp, onto the runway', () => {
    const track = takeoff('fighter', place);
    let rolled = 0;
    for (let t = 0; t <= track.ms; t += 50) {
      const p = track.at(t);
      if (Math.abs(p.z - AIRFIELD.runway.z) < 0.01) break;
      expect(p.y).toBeCloseTo(groundAt(p.x, p.z), 3);
      rolled++;
    }
    expect(rolled).toBeGreaterThan(20);
    expect(track.at(0).y - track.at(track.ms * 0.4).y).toBeCloseTo(AIRFIELD.top - 0.1, 3);
  });
});

describe('a plane lands and comes back to its yard (#269)', () => {
  it.each(ROLES)('%s: from the approach to its place, nose to the runway', (role) => {
    const track = landing(role, place);
    const start = track.at(0);
    expect([start.x, start.y, start.z]).toEqual([APPROACH.x, APPROACH.y, APPROACH.z]);
    expect(start.gear).toBe(1);
    const end = track.at(track.ms);
    expect(end.x).toBeCloseTo(place.x, 3);
    expect(end.z).toBeCloseTo(place.z, 3);
    expect(end.y).toBeCloseTo(AIRFIELD.top, 3);
    expect(end.gear).toBe(0);
    turnsTo(end.yaw, 0);
    expect(worstStep(track)).toBeLessThan(1.2);
  });

  it('touches past the threshold and bounces once', () => {
    const track = landing('fighter', place);
    const heights: number[] = [];
    for (let t = 0; t <= track.ms; t += 16) heights.push(track.at(t).y);
    const touched = heights.findIndex((y) => y < 0.2);
    const after = heights.slice(touched, touched + 60);
    expect(Math.max(...after)).toBeGreaterThan(0.8);
  });
});

describe('a new plane comes out of its hangar (#269)', () => {
  it('the doors open, it rolls out to its place, the doors close behind it', () => {
    const track = formation('fighter', place, 4.5);
    expect(track.doors(0)).toBe(0);
    expect(track.born(0)).toBe(0);
    expect(track.at(0).z).toBeLessThan(AIRFIELD.facade);
    const half = track.ms / 2;
    expect(track.doors(half)).toBeGreaterThan(0.5);
    expect(track.born(track.ms)).toBe(1);
    expect(track.doors(track.ms)).toBe(0);
    expect(track.at(track.ms).z).toBeCloseTo(place.z, 3);
  });

  it('the telescopic doors: the middle leaf runs its course, the outer one from half of it', () => {
    expect(doorCourse(0)).toEqual({ inner: 0, outer: 0 });
    expect(doorCourse(0.4).outer).toBe(0);
    expect(doorCourse(1).inner).toBeCloseTo(16.3, 3);
    expect(doorCourse(1).outer).toBeCloseTo(8.3, 3);
  });
});

describe('a plane ends where its pile stands it', () => {
  const rank = { x: 4, z: 40, yaw: 1.2 };
  it.each([
    ['landing', landing('bomber', rank)],
    ['formation', formation('bomber', rank, 7)],
  ] as const)('%s: at its place on the rank, turned as it stands', (_, track) => {
    const end = track.at(track.ms);
    expect(end.x).toBeCloseTo(rank.x, 3);
    expect(end.z).toBeCloseTo(rank.z, 3);
    turnsTo(end.yaw, rank.yaw);
    expect(worstStep(track)).toBeLessThan(1.2);
  });
});
