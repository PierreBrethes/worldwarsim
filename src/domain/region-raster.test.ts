import { describe, expect, it } from 'vitest';
import { coveredByDisc, decodeRegionRaster, type RegionRasterAsset } from './region-raster';
import { distanceKm, type LonLat } from './geo';
import type { World } from './world';
import rasterAsset from '../../public/region-grid.json';
import projectionAsset from '../../public/projection.json';
import indexAsset from '../../public/region-index.json';

/**
 * **Le raster réel, et pas un damier de fixture** (révision du 17/09/2026 de l'ADR 0020 §1). La
 * règle tient ou tombe sur la géographie cuite : c'est la taille des régions qui l'a fait
 * réviser, et un monde inventé ici prouverait la fonction sans prouver la décision.
 */
const world = {
  sphere: projectionAsset.sphere,
  outline: projectionAsset.outline,
  countries: [],
} as unknown as World;

const raster = decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, world);

const REACH_L1 = 120;
const REACH_L3 = 240;

/** L'ancienne règle, gardée en clair : une région est tenue si **son pôle** tombe dans le rayon,
 *  plus celle où le point se tient. C'est elle que les cas ci-dessous comparent — un test de
 *  non-régression inversé, qui dit ce que la révision a changé plutôt que ce qu'elle préserve. */
const points = indexAsset.point as unknown as Record<string, LonLat>;
const byPole = (centre: LonLat, reachKm: number): ReadonlyArray<string> =>
  Object.entries(points).flatMap(([id, point]) =>
    distanceKm(centre, point) <= reachKm ? [id] : [],
  );

const QUEBEC = 'CAN-683';
const ONTARIO = 'CAN-682';
const PARANA = 'BRA-613';
const SANTA_CATARINA = 'BRA-614';
const RIO_GRANDE_DO_SUL = 'BRA-612';

describe('ce qu’un disque d’avant-poste touche', () => {
  /**
   * **Le cas qui a fait réviser la règle.** Un point à Gatineau, en lisière : l'Ontario et le
   * Québec commencent tous deux à quelques kilomètres, et leurs pôles d'inaccessibilité sont à
   * 1 018 et 801 km — hors de portée d'un niveau 3, a fortiori d'un niveau 1. Au pôle, le point
   * ne tenait que le Québec, et seulement parce qu'il s'y tenait.
   */
  it('tient les deux géantes qu’il touche depuis leur lisière', () => {
    const gatineau: LonLat = [-75.7, 45.5];
    const covered = coveredByDisc(raster, gatineau, REACH_L1);

    expect(covered.has(QUEBEC)).toBe(true);
    expect(covered.has(ONTARIO)).toBe(true);
    expect(byPole(gatineau, REACH_L3)).toEqual([]);
  });

  /** La triple frontière brésilienne, quarante kilomètres au sud du point cité dans la décision :
   *  le Rio Grande do Sul commence vers 26,6° S, et c'est la mesure qui tranche, pas l'estimation. */
  it('tient les trois régions d’une triple frontière', () => {
    const covered = coveredByDisc(raster, [-51.5, -26.6], REACH_L1);
    expect([...covered.keys()].sort()).toEqual([PARANA, SANTA_CATARINA, RIO_GRANDE_DO_SUL].sort());
  });

  /**
   * **La règle ne doit pas faire exploser l'Europe**, où les régions sont petites et les pôles
   * proches : c'est là que le disque et le pôle devraient se ressembler. Mesuré depuis Paris —
   * 12 régions au pôle contre 19 au disque au niveau 1, 34 contre 40 au niveau 3. L'écart est
   * celui des régions dont la lisière entre dans le cercle sans que leur pôle y soit, et il se
   * resserre à mesure que le cercle grandit.
   */
  it('ne change presque rien là où les régions sont petites', () => {
    const paris: LonLat = [2.35, 48.85];
    expect(coveredByDisc(raster, paris, REACH_L1).size).toBe(19);
    expect(byPole(paris, REACH_L1)).toHaveLength(12);
    expect(coveredByDisc(raster, paris, REACH_L3).size).toBe(40);
    expect(byPole(paris, REACH_L3)).toHaveLength(34);
  });

  /** **Une région plus petite qu'une cellule** n'est pas dans le canal du raster : elle est
   *  touchée quand sa cellule d'ancrage l'est. Malte en compte quarante-cinq sur une cellule. */
  it('tient une région plus petite qu’une cellule par son ancrage', () => {
    const covered = coveredByDisc(raster, [14.45, 35.9], REACH_L1);
    const maltese = [...covered.keys()].filter((id) => id.startsWith('MLT-'));
    expect(maltese.length).toBeGreaterThan(40);
    expect(covered.get('MLT-5949')).toBeLessThanOrEqual(REACH_L1);
  });

  /** La distance rendue est celle de la **cellule la plus proche**, et c'est elle que le litige
   *  compare : la région où le point se tient est à zéro, les autres à leur lisière. */
  it('rend zéro pour le sol sous ses pieds, la lisière pour le reste', () => {
    const covered = coveredByDisc(raster, [-75.7, 45.5], REACH_L1);
    expect(covered.get(QUEBEC)).toBe(0);
    expect(covered.get(ONTARIO)).toBeGreaterThan(0);
    expect(covered.get(ONTARIO)).toBeLessThanOrEqual(REACH_L1);
  });

  /** Le cercle s'enroule : un point posé près de l'antiméridien ne perd pas la moitié de son
   *  disque, et les colonnes sont lues d'un bord à l'autre. */
  it('enroule le disque d’est en ouest', () => {
    const east = coveredByDisc(raster, [179.5, -17], REACH_L1);
    const west = coveredByDisc(raster, [-179.5, -17], REACH_L1);
    expect(east.size).toBeGreaterThan(0);
    // Les deux disques ne sont pas centrés au même point : le côté ouest peut toucher une île de plus.
    expect([...west.keys()]).toEqual(expect.arrayContaining([...east.keys()]));
  });

  /** Un rayon nul ne touche que le sol sous ses pieds — la cellule du point, ici celle que le
   *  raster donne à la Seine-Saint-Denis : la mesure ne se lance même pas. */
  it('ne touche que sa propre cellule à rayon nul', () => {
    expect([...coveredByDisc(raster, [2.35, 48.85], 0).keys()]).toEqual(['FRA-5344']);
  });

  /**
   * **Le parcours est celui de la boîte englobante**, jamais des 1,33 M de cellules : quelques
   * milliers à 240 km. Le seuil est large — il tombe sur un ordre de grandeur, pas sur une
   * milliseconde ; mesuré à moins d'un millième de seconde par point sur une machine de
   * développement.
   */
  it('mesure un disque de niveau 3 sans dépouiller le monde', () => {
    const started = performance.now();
    for (let pass = 0; pass < 20; pass += 1) {
      coveredByDisc(raster, [2.35 + pass / 100, 48.85], REACH_L3);
    }
    expect((performance.now() - started) / 20).toBeLessThan(20);
  });
});
