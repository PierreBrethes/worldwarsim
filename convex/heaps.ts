import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  EXPLOITED_DEPOSITS,
  YIELD_OF,
  exploits,
  heapAt,
  heapCapOf,
  type HarvestSite,
} from '../src/domain/economy';
import type { ResourceKey } from '../src/domain/ids';
import type { SeasonMode } from '../src/domain/season-mode';
import { depositAt } from '../src/domain/world';
import { pointOfBuilding } from './regions';
import type { ExtractionSite } from './resources';

/**
 * **Le tas d'une exploitation, tel qu'on le lit à `now`** (ADR 0041 §1). `heapPerHour` est le débit
 * d'*aujourd'hui* : celui qui vaut tant que la ligne n'est pas réécrite, d'où la règle d'écriture
 * plus bas.
 */
export type HeapReading = {
  readonly playerId: Id<'players'>;
  readonly amount: number;
  readonly heapPerHour: number;
  readonly cap: number;
  readonly resource: ResourceKey;
};

/** Par identifiant de bâtiment, en objet simple plutôt qu'en `Map` : l'économie traverse des
 *  frontières que Convex sérialise, et une `Map` n'y passe pas. */
export type Heaps = Readonly<Record<string, HeapReading>>;

export const isExploitation = (building: Pick<Doc<'buildings'>, 'key'>): boolean =>
  EXPLOITED_DEPOSITS[building.key] !== undefined;

/** Ce que le sol sous le point du bâtiment lui donne, `null` s'il n'en tire rien. */
const yieldingDepositOf = (building: Doc<'buildings'>) => {
  const deposit = depositAt(pointOfBuilding(building))?.deposit ?? null;
  return exploits(building.key, deposit) ? deposit : null;
};

/**
 * Le plafond ne lit ni la part ni la désactivation (`heapCapOf`) : une exploitation coupée ou
 * hors service garde son tas, et son plafond avec lui.
 */
const harvestSiteOf = (building: Doc<'buildings'>): HarvestSite => ({
  deposit: yieldingDepositOf(building),
  level: building.level,
  share: 1,
  foundation: building.foundationMark === true,
});

/**
 * **Les tas d'un joueur, lus sans rien écrire**, un par exploitation — la désactivée comprise, qui
 * n'est pas dans `sites` et dont le débit vaut zéro : son tas reste intact et lisible. Une
 * exploitation qui ne rend rien a un tas de 0, présent. Vide en Blitz, qui n'a ni tas ni marque.
 *
 * Une ligne absente est un tas vide depuis la pose du bâtiment : les tas naissent vides, et
 * personne n'a à les créer.
 */
export function heapsOf(
  rows: ReadonlyArray<Doc<'heaps'>>,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  sites: ReadonlyArray<ExtractionSite>,
  mode: SeasonMode,
  now: number,
): Heaps {
  const readings: Record<string, HeapReading> = {};
  if (mode === 'blitz') return readings;
  const rateOf = new Map(sites.map((site) => [site.buildingId, site.heapPerHour]));
  const rowOf = new Map(rows.map((row) => [row.buildingId, row]));
  for (const building of buildings.filter(isExploitation)) {
    const harvest = harvestSiteOf(building);
    const cap = heapCapOf(harvest);
    const heapPerHour = rateOf.get(building._id) ?? 0;
    const row = rowOf.get(building._id);
    readings[building._id] = {
      playerId: building.playerId,
      amount: heapAt(
        {
          heap: row?.amount ?? 0,
          settledAt: row?.settledAt ?? building._creationTime,
          heapPerHour,
          cap,
        },
        now,
      ),
      heapPerHour,
      cap,
      resource: YIELD_OF[harvest.deposit ?? EXPLOITED_DEPOSITS[building.key]![0]!],
    };
  }
  return readings;
}

export const heapRowsOf = (ctx: QueryCtx, seasonId: Id<'seasons'>, playerId: Id<'players'>) =>
  ctx.db
    .query('heaps')
    .withIndex('bySeasonPlayer', (q) => q.eq('seasonId', seasonId).eq('playerId', playerId))
    .collect();

/**
 * **La seule écriture d'un tas** (ADR 0041, contrat technique de #545). Le tas se lit par `heapAt`
 * au débit courant depuis `settledAt` : il faut donc l'écrire **à l'instant où son débit ou son
 * plafond change**, avec le montant tel que l'ancien débit l'a fait, et à ce seul instant.
 * Les appelants, un par événement qui change ce débit :
 *
 * - l'élévation, à son échéance (`constructions.finish`) ;
 * - un changement de couleur (`reportChange`) et Narvik (`handOver`), par `restampChanged` : seules
 *   les exploitations dont le débit a bougé s'écrivent, jamais tous les belligérants réglés ;
 * - la désactivation d'un bâtiment (`plunder`), sa fin étant un changement de couleur ;
 * - la capture, qui change aussi la main qui tient le tas (`passHeap`).
 *
 * Un règlement des stocks n'écrit rien : c'est lui qui, sur tous les belligérants, écrirait toutes
 * les lignes.
 */
export async function stampHeap(
  ctx: MutationCtx,
  building: Pick<Doc<'buildings'>, '_id' | 'seasonId'>,
  playerId: Id<'players'>,
  amount: number,
  at: number,
): Promise<void> {
  const row = await ctx.db
    .query('heaps')
    .withIndex('byBuilding', (q) => q.eq('buildingId', building._id))
    .unique();
  const next = { playerId, amount, settledAt: Math.max(at, row?.settledAt ?? at) };
  if (row === null)
    await ctx.db.insert('heaps', {
      buildingId: building._id,
      seasonId: building.seasonId,
      ...next,
    });
  else await ctx.db.patch(row._id, next);
}

/**
 * **Réécrit les tas dont le débit a changé entre deux lectures**, au montant de la première, à son
 * heure. `before` vient de `settleBeforeChange` (ou d'un règlement juste avant l'événement),
 * `after` de l'économie relue une fois l'événement écrit. Une exploitation qui change de main
 * n'est pas lue ici : `passHeap` l'a déjà écrite.
 */
export async function restampChanged(
  ctx: MutationCtx,
  after: Heaps,
  before: Heaps,
  at: number,
): Promise<void> {
  for (const [buildingId, reading] of Object.entries(after)) {
    const was = before[buildingId];
    if (
      was === undefined ||
      was.playerId !== reading.playerId ||
      (was.heapPerHour === reading.heapPerHour && was.cap === reading.cap)
    )
      continue;
    const building = await ctx.db.get(buildingId as Id<'buildings'>);
    if (building !== null) await stampHeap(ctx, building, reading.playerId, was.amount, at);
  }
}

/** **Capturé, le tas passe au capteur avec le bâtiment**, réglé à l'instant de la capture
 *  (Pierre, 12/11) : sa ligne change de `playerId`. */
export async function passHeap(
  ctx: MutationCtx,
  building: Pick<Doc<'buildings'>, '_id' | 'seasonId'>,
  heaps: Heaps,
  to: Id<'players'>,
  at: number,
): Promise<void> {
  const held = heaps[building._id];
  if (held !== undefined) await stampHeap(ctx, building, to, held.amount, at);
}

/** **Rasée, l'exploitation emporte son tas.** */
export async function dropHeap(ctx: MutationCtx, buildingId: Id<'buildings'>): Promise<void> {
  const row = await ctx.db
    .query('heaps')
    .withIndex('byBuilding', (q) => q.eq('buildingId', buildingId))
    .unique();
  if (row !== null) await ctx.db.delete(row._id);
}
