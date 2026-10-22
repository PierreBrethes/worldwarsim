import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { distanceKm, type LonLat } from './geo';
import { DEPOSIT_POINTS } from './world';
import { BASIN_KM, basinsOf, type DepositBasin } from './deposit-basins';

const baked = JSON.parse(readFileSync('public/deposit-basins.json', 'utf8')) as DepositBasin[];
const pointsOf = (ring: ReadonlyArray<number>): LonLat[] =>
  Array.from({ length: ring.length / 2 }, (_, i) => [ring[2 * i]!, ring[2 * i + 1]!] as const);
const reachOf = (basin: DepositBasin, at: LonLat) =>
  Math.max(...pointsOf(basin.ring).map((point) => distanceKm(point, at)));

describe('les bassins des gisements (#239)', () => {
  it('sont cuits dans public/deposit-basins.json tels que basinsOf les trace, un par gisement', () => {
    expect(baked).toEqual(basinsOf(DEPOSIT_POINTS));
    expect(baked.map((basin) => basin.id)).toEqual(DEPOSIT_POINTS.map((point) => point.id));
  });

  it('entourent leur point sans s’en éloigner de plus d’un bassin et quart', () => {
    for (const [k, point] of DEPOSIT_POINTS.entries()) {
      const reach = reachOf(baked[k]!, point.lonLat);
      expect(reach, point.id).toBeLessThanOrEqual(BASIN_KM * 1.3);
      expect(reach, point.id).toBeGreaterThan(1);
    }
  });

  it('ne se chevauchent jamais, même dans la Ruhr où les puits se touchent', () => {
    for (const [i, a] of DEPOSIT_POINTS.entries())
      for (const [j, b] of DEPOSIT_POINTS.entries()) {
        if (j <= i) continue;
        const apart = distanceKm(a.lonLat, b.lonLat);
        if (apart > BASIN_KM * 3) continue;
        const reaches = reachOf(baked[i]!, a.lonLat) + reachOf(baked[j]!, b.lonLat);
        expect(reaches, `${a.id} / ${b.id}`).toBeLessThanOrEqual(apart);
      }
  });

  it('gardent leur espèce, pour la texture que le moteur leur donne', () => {
    expect(baked.find((basin) => basin.id === 'coal-BEL-2')?.deposit).toBe('coal');
  });
});
