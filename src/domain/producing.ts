import { produces } from './economy';
import type { BuildingKey } from './ids';
import { searcherOf } from './research';

/**
 * **My sites that are producing right now** — what smokes over its maquette (lot « vie des
 * pièces »). Read on what the view already serves and on nothing else: the region's colour
 * (`regions[].linked`, the rule of `isLinked`), then the rate — the site's own for an
 * extractor, its chain's for a converter. A chain's rate is national, which is why the region is
 * read first: a cut arsenal does not smoke on the strength of its sister.
 */
export function producingSites(me: {
  readonly buildings: ReadonlyArray<{
    readonly id: string;
    readonly key: BuildingKey;
    readonly regionId: string;
    /** Out of service (`PLUNDER_DISABLED_HOURS`): the served rate is its neighbours', not its own. */
    readonly disabled?: true;
    /** Its heap, when it is an exploitation: a full one takes nothing more (`heapAt`). */
    readonly heap?: { readonly amount: number; readonly cap: number };
  }>;
  readonly regions: ReadonlyArray<{ readonly id: string; readonly linked: boolean }>;
  readonly extraction: ReadonlyArray<{
    readonly buildingId: string;
    readonly nationalPerHour: number;
    readonly heapPerHour: number;
  }>;
  readonly chains: ReadonlyArray<{ readonly by: BuildingKey; readonly perHour: number }>;
}): ReadonlySet<string> {
  const linked = new Set(me.regions.filter((region) => region.linked).map((region) => region.id));
  /** What an extractor sends out: the national rate, and its heap's while that one still fills.
   *  A full heap takes nothing more, so it no longer smokes on its heap's account. */
  const rateOf = (building: {
    readonly id: string;
    readonly key: BuildingKey;
    readonly heap?: { readonly amount: number; readonly cap: number };
  }) => {
    const site = me.extraction.find((one) => one.buildingId === building.id);
    if (site === undefined)
      return me.chains.find((chain) => chain.by === building.key)?.perHour ?? 0;
    const filling = building.heap === undefined || building.heap.amount < building.heap.cap;
    return site.nationalPerHour + (filling ? site.heapPerHour : 0);
  };
  return new Set(
    me.buildings
      .filter(
        (building) =>
          produces(building.key) &&
          !building.disabled &&
          linked.has(building.regionId) &&
          rateOf(building) > 0,
      )
      .map((building) => building.id),
  );
}

/**
 * **My sites at work at rest** (#273), whose loop plays where their file has one: the producers
 * (`producingSites`), my Centre while a card advances — not one waiting for its headquarters —,
 * and a yard with a hull on its slip (`recruiting`). An enemy site is not served: it never works.
 */
export function workingSites(
  me: Parameters<typeof producingSites>[0] & {
    readonly buildings: ReadonlyArray<{
      readonly id: string;
      readonly key: BuildingKey;
      readonly level: number;
      readonly captured?: boolean;
    }>;
    readonly research: { readonly running: { readonly since: number | null } | null };
    readonly recruiting: ReadonlyArray<string>;
  },
): ReadonlySet<string> {
  const searcher = (me.research.running?.since ?? null) === null ? null : searcherOf(me.buildings);
  return new Set([
    ...producingSites(me),
    ...(searcher === null ? [] : [searcher.id]),
    ...me.recruiting,
  ]);
}
