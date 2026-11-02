import { describe, expect, it } from 'vitest';
import { Vector2 } from 'three';
import type { World } from '@/domain/world';
import projectionAsset from '../../../public/projection.json';
import { WorldFrame } from './frame';
import { nightUniforms } from './night-here';
import { OutpostZones, type ZonePoint } from './outpost-zones';

const frame = new WorldFrame({
  sphere: projectionAsset.sphere,
  outline: projectionAsset.outline,
  countries: [],
} as unknown as World);
const layer = () => new OutpostZones(frame, nightUniforms(frame, { value: new Vector2() }));

const point = (id: string, lon: number): ZonePoint => ({
  id,
  lonLat: [lon, 49],
  reachKm: 120,
  lookoutKm: 60,
  wholeLookout: false,
});

describe('the km of the outposts’ zones', () => {
  /** La pose lit `reachesOf`, désactivés compris, hors du calque (#239, #375). */
  it('graduates the reach a held building reads, the layer off and the point disabled', () => {
    const zones = layer();
    zones.show([], []);
    zones.hold([{ lonLat: [7.75, 48.58], reachKm: 120 }]);
    expect(zones.labels()).toEqual([expect.objectContaining({ km: 120, kind: 'reach' })]);
    zones.hold([]);
    expect(zones.labels()).toEqual([]);
  });

  it('writes the km of a lifted pile’s rings only at the point pointed at', () => {
    const zones = layer();
    zones.show([point('outpost:a', 6), point('outpost:b', 7)], [['outpost:a', 'outpost:b']]);
    zones.focus({ points: 'all', lookout: true, labelled: [] });
    expect(zones.labels()).toEqual([]);
    zones.focus({ points: 'all', lookout: true, labelled: ['outpost:b'] });
    expect(zones.labels().map(({ kind, km }) => [kind, km])).toEqual([
      ['reach', 120],
      ['lookout', 60],
    ]);
  });
});

describe('a liaison across the antimeridian', () => {
  it('is drawn the short way, its stroke never running back over the world', () => {
    const stroke = layer().segment([175, 49], [-175, 49]);
    const xs = stroke.filter((_, i) => i % 3 === 0);
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    expect(Math.abs(xs.at(-1)! - xs[0]!)).toBeLessThan(
      Math.abs(frame.projectLonLat([175, 49], 0).x - frame.projectLonLat([-175, 49], 0).x) / 2,
    );
    expect(new Set(steps.map(Math.sign)).size).toBe(1);
  });
});
