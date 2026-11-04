import { describe, expect, it } from 'vitest';
import {
  coastFacing,
  decodeCoast,
  groundOf,
  isLandingShore,
  nearestCoast,
  onRegionCoast,
  regionOf,
  type CoastAsset,
} from './coast';
import { distanceKm, type LonLat } from './geo';
import { decodeRegionRaster, type RegionRasterAsset } from './region-raster';
import { decodeGrid, groundAt, lonLatAtProjected, projectLonLat } from './routing';
import type { Projection } from './world';
import coastAsset from '../../public/coast.json';
import gridAsset from '../../public/grid.json';
import projectionAsset from '../../public/projection.json';
import indexAsset from '../../public/region-index.json';
import rasterAsset from '../../public/region-grid.json';

/** **La côte cuite, et pas une fixture** : la règle tient ou tombe sur la géographie de l'atlas. */
const coast = decodeCoast(coastAsset as CoastAsset, projectionAsset as unknown as Projection);
const projection = projectionAsset as unknown as Projection;
const grid = decodeGrid(gridAsset, projection);
const raster = decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, projection);
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

/**
 * **La terre et la région d'un point, à la précision de l'atlas** (#224) : la grille de 25 km noie
 * Malte, Singapour, le centre de Naples et Venise ; les polygones des régions sans cellule et le
 * côté de la côte de mer ouverte les lui rendent. Le large reste le large.
 */
describe('la terre exacte', () => {
  const NAPLES: LonLat = [14.25, 40.85];
  /** Saint-Marc : l'île de Venise n'a que trois sommets au niveau près, et le cadre du serveur
   *  (`projection.json`, au centième) la décale de 0,4 km — un point à son bord tomberait à l'eau. */
  const VENICE: LonLat = [12.3397, 45.4341];
  const CALAIS: LonLat = [1.858, 50.951];
  const VALLETTA = pointOf('MLT-5949');
  const OPEN_SEA: LonLat = [15.5, 37.5];
  const OFF_MALTA: LonLat = [14.6, 35.75];

  it('rend la terre que la grille noie, et laisse le large au large', () => {
    for (const point of [NAPLES, VENICE, CALAIS, VALLETTA, pointOf('SGP-4871')]) {
      expect(groundAt(grid, point), String(point)).toBe('sea');
      expect(groundOf(grid, coast, point), String(point)).toBe('land');
    }
    for (const point of [OPEN_SEA, OFF_MALTA]) expect(groundOf(grid, coast, point)).toBe('sea');
  });

  it('rend la rive d’un lac à la terre, et laisse son large et la Caspienne à l’eau', () => {
    for (const shore of [
      [-81.69, 41.5],
      [6.63, 46.52],
    ] as const)
      expect(groundOf(grid, coast, [...shore])).toBe('land');
    for (const water of [
      [-81.6, 41.85],
      [50.2, 40.3],
    ] as const)
      expect(groundOf(grid, coast, [...water])).toBe('lake');
  });

  it('nomme la région maltaise sous le point, et son pays', () => {
    expect(regionOf(raster, coast, VALLETTA)).toEqual({ id: 'MLT-5949', country: 'MLT' });
    expect(regionOf(raster, coast, NAPLES)?.country).toBe('ITA');
    expect(regionOf(raster, coast, OPEN_SEA)).toBeNull();
  });

  it('dit une plage où une coque accoste à Malte, et pas au large', () => {
    expect(isLandingShore(grid, coast, VALLETTA)).toBe(true);
    expect(isLandingShore(grid, coast, OFF_MALTA)).toBe(false);
  });
});

describe('la côte que regarde un port (#436)', () => {
  /** Le cap de la normale, en degrés depuis le nord, mesuré sur le terrain à son point de côte. */
  const capOf = (at: LonLat, [sx, sy]: readonly [number, number]) => {
    const [x, y] = projectLonLat(projection.outline, projection.sphere, at);
    const [lon, lat] = lonLatAtProjected(projection.outline, projection.sphere, [
      x + sx * 0.01,
      y + sy * 0.01,
    ]);
    const east = (lon - at[0]) * Math.cos((at[1] * Math.PI) / 180);
    return ((Math.atan2(east, lat - at[1]) * 180) / Math.PI + 360) % 360;
  };

  // La mer que chacun a devant lui, lue sur une carte : le cap à 45° près. Les huit ports de
  // l'enquête du 04/11, des baies fermées (la rade de Brest, la baie de Sébastopol) et des îles.
  it.each([
    ['Marseille', [5.37, 43.3], 225],
    ['Le Havre', [0.11, 49.49], 240],
    ['Brest', [-4.49, 48.38], 180],
    ['Portsmouth', [-1.1, 50.8], 200],
    ['Norfolk', [-76.29, 36.85], 315],
    ['Sébastopol', [33.52, 44.6], 0],
    ['Kiel', [10.14, 54.32], 20],
    ['Yokosuka', [139.67, 35.28], 45],
    ['La Spezia', [9.83, 44.1], 180],
    ['Shanghai', [121.5, 31.23], 60],
    ['La Valette', [14.51, 35.9], 45],
    ['Pantelleria', [11.94, 36.83], 315],
    ['Rønne, Bornholm', [14.69, 55.1], 270],
  ] as const)('tourne %s vers le large', (_, point, cap) => {
    const facing = coastFacing(coast, point as unknown as LonLat, 30, 5)!;
    expect(Math.hypot(...facing.seaward)).toBeCloseTo(1, 9);
    expect(distanceKm(facing.lonLat, point as unknown as LonLat)).toBeLessThan(30);
    const off = Math.abs(((capOf(facing.lonLat, facing.seaward) - cap + 540) % 360) - 180);
    expect(off).toBeLessThan(45);
  });

  it('ne dit rien loin de toute côte', () => {
    expect(coastFacing(coast, [2.35, 48.85], 30, 5)).toBeNull();
  });
});
