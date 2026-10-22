import type { LonLat } from '../src/domain/geo';
import { regionAtPoint } from './regionGeometry';
import { regionFacts } from './regions';

/**
 * **Le nom d'un point nu, quand il en a un** : la région admin-1 sous lui (`regionAtPoint`, #224)
 * — la même que le reste des règles du sol. Une marche vers un point, un camp
 * relevé ou un objectif n'a pas de nom à elle, et le serveur rendait jusqu'ici le code du pays,
 * qu'un écran imprimait tel quel : « FRA ».
 *
 * `null` en mer et hors de toute région : l'appelant retombe alors sur le code du pays — un
 * code, jamais une phrase (ADR 0016) — que le client traduit (`placeLabel`,
 * `src/domain/station-name.ts`). Un nom de région est un nom propre de Natural Earth, il n'a
 * rien à traduire (`convex/regions.ts`).
 */
export function regionNameAt(point: LonLat): string | null {
  const region = regionAtPoint(point);
  return region === null ? null : (regionFacts(region.id)?.name ?? null);
}
