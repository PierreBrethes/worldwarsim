import { fr, theBuilding } from '@/i18n/fr';
import { PRODUCER_OF } from './economy';
import { RESOURCES } from './ids';
import type { BuildingKey, ResourceKey } from './ids';
import type { PlayerView } from './player-view';
import { currentStock } from './player-view';

/** The warehouse raises all eight national ceilings, so the band reads them as one group. */
export const BAND_GROUPS: ReadonlyArray<ReadonlyArray<ResourceKey>> = [RESOURCES];

/**
 * **One mark, and only one.** *Full* is production thrown away every hour: the one fact a
 * permanent line owes a player, and the one that names a move he can make right now. Everything
 * else about a reserve is one hover away, and that is where it stays.
 *
 * The diagnosis travels with the mark rather than being derived again beside it: a pavé that
 * lights up for one reason and explains itself with another is worse than a silent one.
 */
export type Mark = {
  readonly kind: 'full';
  readonly diagnosis: string;
};

export type Marks = Readonly<Record<ResourceKey, Mark | null>>;

/**
 * Where a resource comes from, as the tooltip names it — `null` for one nothing transforms. An
 * extracted or received matter has no chain, and naming its mine here would say the wrong thing
 * about ore, which no foundry makes.
 */
export type Source = { readonly by: BuildingKey; readonly level: number };

export function sourceOf(view: PlayerView, resource: ResourceKey): Source | null {
  const chain = view.me.chains.find((candidate) => candidate.output === resource);
  return chain === undefined ? null : { by: chain.by, level: chain.level };
}

/**
 * **What the band marks, resource by resource.** `full` is `stock >= cap` and nothing softer: a
 * reserve one unit under the bar still takes everything its mines send it, and marking that
 * would teach the player to ignore the mark.
 */
export function marksOf(view: PlayerView, now: number): Marks {
  const marks = {} as Record<ResourceKey, Mark | null>;

  for (const resource of RESOURCES) {
    const reserve = view.me.resources[resource];
    const stock = currentStock(reserve, view.loadedAt, now);
    marks[resource] =
      reserve.cap > 0 && stock >= reserve.cap
        ? { kind: 'full', diagnosis: fullDiagnosis(reserve, resource) }
        : null;
  }

  return marks;
}

/**
 * The producer opens the sentence, never the resource: "la fonderie tourne pour rien" names the
 * thing that is wasting itself, and the store to raise names the cure. A reserve nothing fills
 * says so instead — sending a player to enlarge a warehouse for a matter he is not making would
 * send him to build the wrong thing.
 */
function fullDiagnosis(reserve: { readonly ratePerHour: number }, resource: ResourceKey): string {
  return reserve.ratePerHour > 0
    ? fr.resourceBand.fullDiagnosis(
        theBuilding(PRODUCER_OF[resource]),
        theBuilding('warehouse'),
        reserve.ratePerHour,
      )
    : fr.resourceBand.fullQuiet(fr.resources[resource]);
}
