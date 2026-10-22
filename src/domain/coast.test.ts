import { describe, expect, it } from 'vitest';
import { decodeCoast, nearestCoast, onRegionCoast, type CoastAsset } from './coast';
import { distanceKm, type LonLat } from './geo';
import type { Projection } from './world';
import coastAsset from '../../public/coast.json';
import projectionAsset from '../../public/projection.json';
import indexAsset from '../../public/region-index.json';

/** **La côte cuite, et pas une fixture** : la règle tient ou tombe sur la géographie de l'atlas. */
const coast = decodeCoast(coastAsset as CoastAsset, projectionAsset as unknown as Projection);
const pointOf = (id: string) => (indexAsset.point as unknown as Record<string, LonLat>)[id]!;

describe('la côte de mer ouverte', () => {
  it('compte les 1 830 régions qui touchent la mer selon l’atlas, et l’index les dit côtières', () => {
    expect(coast.regions.size).toBe(1830);
    expect(new Set(indexAsset.coastal)).toEqual(coast.regions);
  });

  it('ne compte ni la Caspienne, ni un lac, ni l’intérieur', () => {
    for (const inland of ['KAZ-3198', 'RUS-2388', 'UGA-3088', 'CHE-159', 'ITA-5386', 'SMR-4884'])
      expect(coast.regions.has(inland), inland).toBe(false);
  });

  it('prend un quai à La Valette, que la grille noie, et le refuse à Florence', () => {
    expect(onRegionCoast(coast, pointOf('MLT-5949'), 'MLT-5949')).toBe(true);
    expect(onRegionCoast(coast, pointOf('ITA-5386'), 'ITA-5386')).toBe(false);
    expect(nearestCoast(coast, pointOf('ITA-5386'), 100, 'ITA-5386')).toBeNull();
  });

  it('accepte à moins de 2 km de la côte de la région, et la refuse au-delà', () => {
    const shore = nearestCoast(coast, pointOf('ITA-5380'), 60, 'ITA-5380')!.lonLat;
    const [lon, lat] = shore;
    const offshore = (km: number): LonLat => [
      lon - km / (111 * Math.cos((lat * Math.PI) / 180)),
      lat,
    ];
    expect(onRegionCoast(coast, offshore(1.5), 'ITA-5380')).toBe(true);
    expect(onRegionCoast(coast, offshore(20), 'ITA-5380')).toBe(false);
  });

  it('aimante Singapour sur sa propre côte, et non sur celle de Johor en face', () => {
    const snapped = nearestCoast(coast, pointOf('SGP-4871'), 60, 'SGP-4871')!;
    expect(snapped.regionId).toBe('SGP-4871');
    expect(onRegionCoast(coast, snapped.lonLat, 'SGP-4871')).toBe(true);
    expect(distanceKm(snapped.lonLat, pointOf('SGP-4871'))).toBeLessThan(15);
  });
});
