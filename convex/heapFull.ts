import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { heapFullSince } from '../src/domain/economy';
import { modeOf } from '../src/domain/season-mode';
import { economyOf } from './resources';
import type { HeapReading } from './heaps';

/**
 * **La dépêche « tas plein »** (#555). Le tas se lit paresseusement : l'instant où il devient plein
 * n'est un événement nulle part, donc un job le fait naître. Le job se replanifie à chaque écriture
 * de la ligne du tas (`stampHeap`) et à la naissance de l'exploitation, et **relit tout à son
 * échéance** (invariant « Échéance ») : le tas a pu être pris, l'exploitation rasée ou capturée.
 *
 * Pas de jeton ni d'id de job à garder : `check` ne dit que ce qui est vrai à l'instant où il
 * tourne, et la ligne du tas retient à qui la dépêche de ce remplissage est déjà tombée
 * (`fullToldTo`). Un job périmé trouve donc un tas pas plein, ou déjà annoncé, et ne fait rien ;
 * plusieurs en attente sur un même tas ne donnent qu'une dépêche.
 */

/** Une seconde après l'instant projeté : l'arrondi flottant du tas pourrait sinon le lire à
 *  `cap - ε` et replanifier à l'infini sur le même instant. */
const AFTER_FULL_MS = 1_000;

/** Planifier le prochain examen du tas d'une exploitation, dans une autre transaction : à
 *  l'appel, l'événement qui change son débit n'a pas fini de s'écrire. */
export const watchHeap = (ctx: Pick<MutationCtx, 'scheduler'>, buildingId: Id<'buildings'>) =>
  ctx.scheduler.runAfter(0, internal.heapFull.check, { buildingId });

/**
 * **Examine un tas à `now`** à partir d'une économie déjà lue : le dit s'il est plein et ne l'a pas
 * été, sinon efface le « déjà dit » d'un tas qui ne l'est plus et planifie son plein. `silent` : la
 * mise en service, qui marque un tas déjà plein comme dit sans l'annoncer.
 */
export async function examineHeap(
  ctx: MutationCtx,
  building: Doc<'buildings'>,
  reading: HeapReading,
  now: number,
  silent: boolean,
): Promise<void> {
  const row = await ctx.db
    .query('heaps')
    .withIndex('byBuilding', (q) => q.eq('buildingId', building._id))
    .unique();
  if (reading.fullSince === undefined) {
    if (row?.fullToldTo !== undefined) await ctx.db.patch(row._id, { fullToldTo: undefined });
    if (reading.cap <= 0 || reading.heapPerHour <= 0) return;
    const settled = {
      heap: row?.amount ?? 0,
      settledAt: row?.settledAt ?? building._creationTime,
      heapPerHour: reading.heapPerHour,
      cap: reading.cap,
    };
    const full = heapFullSince(settled, Infinity)!;
    await ctx.scheduler.runAt(
      Math.max(Math.ceil(full) + AFTER_FULL_MS, now + AFTER_FULL_MS),
      internal.heapFull.check,
      { buildingId: building._id },
    );
    return;
  }
  if (row?.fullToldTo === building.playerId) return;
  if (!silent)
    await ctx.db.insert('notices', {
      playerId: building.playerId,
      at: Math.round(reading.fullSince),
      kind: 'heapFull',
      building: building.key,
      regionId: building.regionId,
      point: building.point,
      resource: reading.resource,
      amount: reading.amount,
    });
  if (row !== null) await ctx.db.patch(row._id, { fullToldTo: building.playerId });
  /** Pas de ligne : le tas est plein depuis son règlement, que la ligne écrite ici date de
   *  `fullSince` au plafond, ce qui se lit à tout instant comme le tas sans ligne. */
  else
    await ctx.db.insert('heaps', {
      buildingId: building._id,
      seasonId: building.seasonId,
      playerId: building.playerId,
      amount: reading.cap,
      settledAt: reading.fullSince,
      fullToldTo: building.playerId,
    });
}

/** Les exploitations d'une Mondiale en cours seulement : en Blitz il n'y a pas de tas, et une
 *  saison finie n'a plus de nouvelles à donner. */
async function readingOfBuilding(ctx: MutationCtx, building: Doc<'buildings'>, now: number) {
  const season = await ctx.db.get(building.seasonId);
  if (season === null || season.status !== 'launched' || modeOf(season.mode) === 'blitz')
    return null;
  return (await economyOf(ctx, building.playerId, now)).heaps[building._id] ?? null;
}

export const check = internalMutation({
  args: { buildingId: v.id('buildings') },
  handler: async (ctx, { buildingId }) => {
    const building = await ctx.db.get(buildingId);
    if (building === null) return;
    const now = Date.now();
    const reading = await readingOfBuilding(ctx, building, now);
    if (reading === null) return;
    await examineHeap(ctx, building, reading, now, false);
  },
});

/** **La mise en service d'un joueur** : ses tas déjà pleins sont marqués dits sans dépêche
 *  rétroactive, les autres planifient leur plein. */
export const commission = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (player === null) return;
    const season = await ctx.db.get(player.seasonId);
    if (season === null || season.status !== 'launched' || modeOf(season.mode) === 'blitz') return;
    const now = Date.now();
    const { heaps } = await economyOf(ctx, playerId, now);
    for (const [id, reading] of Object.entries(heaps)) {
      const building = await ctx.db.get(id as Id<'buildings'>);
      if (building !== null) await examineHeap(ctx, building, reading, now, true);
    }
  },
});
