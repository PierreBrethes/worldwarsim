import type { LonLat } from '../src/domain/geo';
import { decodeCoast, onRegionCoast, type Coast, type CoastAsset } from '../src/domain/coast';
import type { Projection } from '../src/domain/world';
import coastAsset from '../public/coast.json';
import projectionAsset from '../public/projection.json';

/**
 * **La géométrie de l'atlas que le serveur porte** (#221, #224, ADR 0023 amendée) : la côte de mer
 * ouverte et les régions sans cellule, cuites en base64 (1,6 Mo de chaîne à l'import), décodées à
 * la première demande. La terre et la région d'un point la lisent (`routes.ts`,
 * `regionGeometry.ts`), donc tout module qui lit le sol la paie.
 */
let coast: Coast | null = null;

export const coastOf = (): Coast =>
  (coast ??= decodeCoast(coastAsset as CoastAsset, projectionAsset as unknown as Projection));

export const isOnRegionCoast = (point: LonLat, regionId: string): boolean =>
  onRegionCoast(coastOf(), point, regionId);
