import type { Atlas } from './atlas';
import type { World } from './world';

/**
 * The `World` the routing raster is cut from (ADR 0034): the atlas's regions merged by country at
 * the `near` level, lakes and enclaves as holes. `buildGrid` fills it by even-odd, so a hole is
 * water. One function for the generator and for the tests that re-cut the grid, so they cannot
 * read two coasts.
 */
export function atlasWorld(atlas: Atlas, frame: Pick<World, 'sphere' | 'outline'>): World {
  const countries = [...atlas.shapes((region) => region.country, 'near')].map(([adm0, shapes]) => {
    const rings = shapes.flatMap(({ outer, holes }) =>
      [outer, ...holes].map((flat) =>
        Array.from(
          { length: flat.length / 2 },
          (_, i) => [flat[2 * i]!, flat[2 * i + 1]!] as const,
        ),
      ),
    );
    return { name: adm0, adm0, representativePoint: rings[0]![0]!, lonLat: [0, 0] as const, rings };
  });
  return { ...frame, countries };
}
