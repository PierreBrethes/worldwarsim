import { produces } from './economy';
import type { BuildingKey } from './ids';

/**
 * **My sites that are producing right now** — what smokes over its maquette (lot « vie des
 * pièces »). Read on what the view already serves and on nothing else: the region's colour
 * (`regions[].linked`, the rule of `isLinked`), then the rate — the site's own for an
 * extractor, its chain's for a converter. A chain's rate is national, which is why the region is
 * read first: a cut foundry does not smoke on the strength of its sister.
 */
export function producingSites(me: {
  readonly buildings: ReadonlyArray<{
    readonly id: string;
    readonly key: BuildingKey;
    readonly regionId: string;
  }>;
  readonly regions: ReadonlyArray<{ readonly id: string; readonly linked: boolean }>;
  readonly extraction: ReadonlyArray<{
    readonly key: BuildingKey;
    readonly regionId: string;
    readonly perHour: number;
  }>;
  readonly chains: ReadonlyArray<{ readonly by: BuildingKey; readonly perHour: number }>;
}): ReadonlySet<string> {
  const linked = new Set(me.regions.filter((region) => region.linked).map((region) => region.id));
  const rateOf = (building: { readonly key: BuildingKey; readonly regionId: string }) =>
    me.extraction.find((site) => site.key === building.key && site.regionId === building.regionId)
      ?.perHour ??
    me.chains.find((chain) => chain.by === building.key)?.perHour ??
    0;
  return new Set(
    me.buildings
      .filter(
        (building) =>
          produces(building.key) && linked.has(building.regionId) && rateOf(building) > 0,
      )
      .map((building) => building.id),
  );
}
