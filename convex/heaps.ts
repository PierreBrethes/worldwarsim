import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  EXPLOITED_DEPOSITS,
  YIELD_OF,
  exploits,
  heapAt,
  heapCapOf,
  type HarvestSite,
  heapFullSince,
} from '../src/domain/economy';
import type { ResourceKey } from '../src/domain/ids';
import type { SeasonMode } from '../src/domain/season-mode';
import { depositAt } from '../src/domain/world';
import { watchHeap } from './heapFull';
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
  /** Depuis quand il est plein : absent tant qu'il ne l'est pas. Au propriétaire seul, comme le tas. */
  readonly fullSince?: number;
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
    const settled = {
      heap: row?.amount ?? 0,
      settledAt: row?.settledAt ?? building._creationTime,
      heapPerHour,
      cap,
    };
    const fullSince = heapFullSince(settled, now);
    readings[building._id] = {
      playerId: building.playerId,
      amount: heapAt(settled, now),
      heapPerHour,
      cap,
      resource: YIELD_OF[harvest.deposit ?? EXPLOITED_DEPOSITS[building.key]![0]!],
      ...(fullSince === null ? {} : { fullSince }),
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
  await writeHeapRow(ctx, building, playerId, amount, at);
  /** Le débit change : son plein se recalcule (#555), dans une transaction à part qui lit
   *  l'événement fini. */
  await watchHeap(ctx, building._id);
}

/** La ligne d'un tas, sans rien planifier : `stampHeap` s'en sert, et `heapFull` quand il lui faut
 *  une ligne où poser son job sans changer ce que le tas lit. Rend l'id de la ligne. */
export async function writeHeapRow(
  ctx: MutationCtx,
  building: Pick<Doc<'buildings'>, '_id' | 'seasonId'>,
  playerId: Id<'players'>,
  amount: number,
  at: number,
): Promise<Id<'heaps'>> {
  const row = await heapRowOf(ctx, building._id);
  const next = { playerId, amount, settledAt: at };
  if (row === null)
    return ctx.db.insert('heaps', {
      buildingId: building._id,
      seasonId: building.seasonId,
      ...next,
    });
  await ctx.db.patch(row._id, next);
  return row._id;
}

export const heapRowOf = (ctx: QueryCtx, buildingId: Id<'buildings'>) =>
  ctx.db
    .query('heaps')
    .withIndex('byBuilding', (q) => q.eq('buildingId', buildingId))
    .unique();

/** **Une exploitation neuve a son tas vide dès sa pose** : la ligne s'écrit à cet instant, où le
 *  job du plein s'accroche (#555). */
export const bearHeap = (ctx: MutationCtx, building: Doc<'buildings'>, at: number) =>
  stampHeap(ctx, building, building.playerId, 0, at);

/** Ce que `heapFull` retient d'un tas : à qui son plein est dit, et le job qui l'examinera. */
export const setHeapWatch = (
  ctx: MutationCtx,
  rowId: Id<'heaps'>,
  watch: {
    fullToldTo?: Id<'players'> | undefined;
    fullJob?: Id<'_scheduled_functions'> | undefined;
  },
) => ctx.db.patch(rowId, watch);

/**
 * **Réécrit les tas dont le débit a changé entre deux lectures**, au montant de la première, à son
 * heure. `before` vient de `settleBeforeChange` (ou d'un règlement juste avant l'événement),
 * `after` de l'économie relue une fois l'événement écrit. Une exploitation qui change de main
 * l'a déjà vue écrite par `passHeap`, au même montant et à la même heure.
 */
export async function restampChanged(
  ctx: MutationCtx,
  after: Heaps,
  before: Heaps,
  at: number,
): Promise<void> {
  for (const [buildingId, reading] of Object.entries(after)) {
    const was = before[buildingId];
    if (was === undefined || (was.heapPerHour === reading.heapPerHour && was.cap === reading.cap))
      continue;
    const building = await ctx.db.get(buildingId as Id<'buildings'>);
    if (building !== null) await stampHeap(ctx, building, reading.playerId, was.amount, at);
  }
}

/** **Capturé, le tas passe au capteur avec le bâtiment**, réglé à l'instant de la capture
 *  (Pierre, 12/11) : sa ligne change de `playerId`. Un belligérant le lit dans `heaps` ; un siège
 *  irrégulier ne produit pas, son tas est celui que sa ligne a gelé, vide sans ligne. */
export async function passHeap(
  ctx: MutationCtx,
  building: Pick<Doc<'buildings'>, '_id' | 'seasonId'>,
  heaps: Heaps,
  to: Id<'players'>,
  at: number,
): Promise<void> {
  const row = await heapRowOf(ctx, building._id);
  await stampHeap(ctx, building, to, heaps[building._id]?.amount ?? row?.amount ?? 0, at);
}

/** **Rasée, l'exploitation emporte son tas.** */
export async function dropHeap(ctx: MutationCtx, buildingId: Id<'buildings'>): Promise<void> {
  const row = await ctx.db
    .query('heaps')
    .withIndex('byBuilding', (q) => q.eq('buildingId', buildingId))
    .unique();
  if (row !== null) await ctx.db.delete(row._id);
}

/**
 * **Prendre au tas** (ADR 0041 §2) : un transport emporte `taken` unités, et le reste se réécrit à
 * cet instant, au débit d'aujourd'hui. La seule prise au tas, avec le plein de #547 : `reading`
 * vient d'une économie réglée à `now`, jamais d'une ligne relue seule.
 */
export async function takeHeap(
  ctx: MutationCtx,
  building: Pick<Doc<'buildings'>, '_id' | 'seasonId'>,
  reading: HeapReading,
  taken: number,
  now: number,
): Promise<void> {
  await stampHeap(ctx, building, reading.playerId, reading.amount - taken, now);
}
