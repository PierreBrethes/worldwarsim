import { describe, expect, it } from 'vitest';
import type { World } from '@/domain/world';
import worldAsset from '../../../public/world.json';
import { WorldFrame } from './frame';

const world = {
  sphere: worldAsset.meta.sphere,
  outline: worldAsset.meta.outline,
  countries: [],
} as unknown as World;

/**
 * The right click is the one gesture that starts on the board rather than on a datum, so the
 * inverse has to agree with the projection to the pixel — a place read half a degree off is a
 * column that lands somewhere else.
 */
describe('reading a place off the board', () => {
  const frame = new WorldFrame(world);

  const roundTrip = (lon: number, lat: number) => {
    const world3d = frame.projectLonLat([lon, lat]);
    return frame.lonLatAt(world3d.x + frame.centerX, world3d.z + frame.centerY);
  };

  it.each([
    ['the prime meridian at the equator', 0, 0],
    ['Paris', 2.35, 48.86],
    ['the Romanian plain', 25.2, 44.6],
    ['the open Pacific', -150, -20],
    ['the far south', 170, -70],
  ])('comes back where it went in — %s', (_name, lon, lat) => {
    const [backLon, backLat] = roundTrip(lon, lat);
    expect(backLon).toBeCloseTo(lon, 4);
    expect(backLat).toBeCloseTo(lat, 4);
  });
});
