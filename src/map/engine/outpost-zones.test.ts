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

const point = (id: string, lon: number, lat = 49): ZonePoint => ({
  id,
  lonLat: [lon, lat],
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
  it('is cut at the board edge, both pieces staying on the board', () => {
    const pieces = layer().segment([177.5, 64.7], [-173.2, 65.6]);
    expect(pieces).toHaveLength(2);
    for (const piece of pieces)
      for (let i = 0; i < piece.length; i += 3) {
        const lat = frame.lonLatAt(piece[i]! + frame.centerX, piece[i + 2]! + frame.centerY)[1];
        const edge = frame.edgeAtLatitude(lat);
        expect(piece[i]!).toBeGreaterThanOrEqual(frame.toWorld(edge.westX, edge.y, 0).x - 1e-6);
        expect(piece[i]!).toBeLessThanOrEqual(frame.toWorld(edge.eastX, edge.y, 0).x + 1e-6);
      }
  });

  it('is drawn once whole when it stays on one side', () => {
    expect(layer().segment([6, 49], [7, 49])).toHaveLength(1);
  });

  it('puts the teeth outward whatever the order of the points', () => {
    const outward = (order: number[]) => {
      /** Paris–Marseille, with Anadyr in the network: Lisbon first used to flip the teeth. */
      const zones = layer();
      const at: Record<number, [number, number]> = {
        0: [2.35, 48.85],
        1: [5.37, 43.3],
        2: [-9.14, 38.7],
        3: [177.5, 64.7],
      };
      zones.show(
        order.map((n) => point(`outpost:${n}`, ...at[n]!)),
        [['outpost:0', 'outpost:1']],
        false,
        { liaisons: [['outpost:0', 'outpost:1']], ink: '#000' },
      );
      return JSON.stringify(
        (zones as unknown as { liaisons: Array<{ line: { outward: unknown } }> }).liaisons.map(
          ({ line }) => line.outward,
        ),
      );
    };
    expect(outward([2, 3, 0, 1])).toBe(outward([0, 1, 2, 3]));
  });
});
