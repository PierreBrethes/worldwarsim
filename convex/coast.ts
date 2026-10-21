import type { LonLat } from '../src/domain/geo';
import { decodeCoast, onRegionCoast, type Coast, type CoastAsset } from '../src/domain/coast';
import type { Projection } from '../src/domain/world';
import coastAsset from '../public/coast.json';
import projectionAsset from '../public/projection.json';

/**
 * **La côte de mer ouverte, côté serveur** (#221, ADR 0023 amendée) : la seule géométrie de
 * l'atlas que l'isolat porte, cuite en base64 (1,5 Mo de chaîne à l'import, décodée à la première
 * demande). Un module à part : seuls ceux qui posent un port la paient, pas tout ce qui lit la
 * grille de routage.
 */
let coast: Coast | null = null;

export function isOnRegionCoast(point: LonLat, regionId: string): boolean {
  coast ??= decodeCoast(coastAsset as CoastAsset, projectionAsset as unknown as Projection);
  return onRegionCoast(coast, point, regionId);
}
