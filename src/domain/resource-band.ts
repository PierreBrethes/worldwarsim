import { fr, theBuilding } from '@/i18n/fr';
import { PRODUCER_OF, STORED_BY } from './economy';
import type { BuildingKey, ResourceKey } from './ids';
import type { Cost, PlayerView } from './player-view';
import { currentStock } from './player-view';

/** The two stores, in reading order. A group, never a flat list of eight: the double rule
 *  between them is the ceiling's own partition, and a third store would be a third group. */
export const BAND_STORES = ['warehouse', 'depot'] as const;

export type Store = (typeof BAND_STORES)[number];

export const BAND_GROUPS: ReadonlyArray<ReadonlyArray<ResourceKey>> = BAND_STORES.map(
  (store) => STORED_BY[store],
);

/**
 * **Two marks and no third.** *Full* is production being thrown away every hour, *short* is a
 * bill the site cannot pay — the only two facts a permanent line owes a player, and the only two
 * that name a move he can make right now. Everything else about a reserve is one hover away and
 * belongs there.
 *
 * The diagnosis travels with the mark rather than being derived again beside it: a pavé that
 * lights up for one reason and explains itself with another is worse than a silent one.
 */
export type Mark = {
  readonly kind: 'full' | 'short';
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
 * **The head of the site's queue, and its bill.** The only work a shortfall is ever measured
 * against: what stands behind the head has not been reached, and a band that added the whole
 * queue up would mark every reserve of a player who plans ahead.
 *
 * The cost is not served with the entry — it is read back from what the entry is doing. A
 * building of that key already standing on that region means a raise, so the bill is its
 * `nextLevelCost`, which is the very figure the server charges; anything else is a first level,
 * at the catalogue's price. No level arithmetic here: the scale factor lives with the other
 * balance numbers and the pure domain may not read it.
 */
export type QueueHead = { readonly key: BuildingKey; readonly cost: Cost };

export function queueHeadOf(view: PlayerView): QueueHead | null {
  const head = view.me.construction ?? view.me.constructionQueue[0];
  if (head === undefined || head === null) return null;
  const raised = view.me.buildings.find(
    (standing) => standing.regionId === head.regionId && standing.key === head.key,
  );
  return { key: head.key, cost: raised?.nextLevelCost ?? view.buildCatalog[head.key].cost };
}

/**
 * **What the band marks, resource by resource.** `full` wins the tie: a reserve at its ceiling
 * loses something every hour, while a bill it cannot pay is a wait — the first calls for a
 * warehouse now, the second for patience.
 *
 * `full` is `stock >= cap` and nothing softer: a reserve one unit under the bar still takes
 * everything its mines send it, and marking that would teach the player to ignore the mark.
 */
export function marksOf(view: PlayerView, now: number): Marks {
  const head = queueHeadOf(view);
  const marks = {} as Record<ResourceKey, Mark | null>;

  for (const store of BAND_STORES) {
    for (const resource of STORED_BY[store]) {
      const reserve = view.me.resources[resource];
      const stock = currentStock(reserve, view.loadedAt, now);

      if (reserve.cap > 0 && stock >= reserve.cap) {
        marks[resource] = { kind: 'full', diagnosis: fullDiagnosis(reserve, resource, store) };
        continue;
      }

      marks[resource] = shortOf(head, resource, stock);
    }
  }

  return marks;
}

/** Nothing in the queue is never short: the mark answers a bill, and there is none. */
function shortOf(head: QueueHead | null, resource: ResourceKey, stock: number): Mark | null {
  if (head === null) return null;
  const needed = head.cost[resource] ?? 0;
  if (needed <= stock) return null;
  return {
    kind: 'short',
    diagnosis: fr.resourceBand.shortDiagnosis(
      Math.ceil(needed - stock),
      fr.resources[resource],
      // The head names itself, never its region: the band has one line, and which of two ports
      // is waiting is a question the economy window answers.
      theBuilding(head.key),
    ),
  };
}

/**
 * The producer opens the sentence, never the resource: "la fonderie tourne pour rien" names the
 * thing that is wasting itself, and the store to raise names the cure. A reserve nothing fills
 * says so instead — sending a player to enlarge a warehouse for a matter he is not making would
 * send him to build the wrong thing.
 */
function fullDiagnosis(
  reserve: { readonly ratePerHour: number },
  resource: ResourceKey,
  store: Store,
): string {
  return reserve.ratePerHour > 0
    ? fr.resourceBand.fullDiagnosis(
        theBuilding(PRODUCER_OF[resource]),
        theBuilding(store),
        reserve.ratePerHour,
      )
    : fr.resourceBand.fullQuiet(fr.resources[resource]);
}
