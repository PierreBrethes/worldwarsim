import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { heapFullSince } from '../src/domain/economy';
import { modeOf } from '../src/domain/season-mode';
import { economyOf } from './resources';
import { heapRowOf, setHeapWatch, writeHeapRow, type HeapReading } from './heaps';

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
 *
 * **Un job au plus par tas** : son id est sur la ligne, annulé avant d'en planifier un neuf.
 * `due` : c'est ce job-là qui tourne, à l'heure du plein ; trouvant le tas pas plein, il ne se
 * replanifie pas, l'écriture qui l'a vidé a déjà planifié le suivant.
 */
export async function examineHeap(
  ctx: MutationCtx,
  building: Doc<'buildings'>,
  reading: HeapReading,
  now: number,
  { silent = false, due = false }: { silent?: boolean; due?: boolean } = {},
): Promise<void> {
  const known = await heapRowOf(ctx, building._id);
  /** Un tas sans ligne se lit vide depuis la pose : la ligne qui le dit, au même montant, porte le job. */
  const rowId =
    known?._id ??
    (await writeHeapRow(
      ctx,
      building,
      building.playerId,
      reading.fullSince === undefined ? reading.amount : reading.cap,
      reading.fullSince ?? now,
    ));
  const waiting = known?.fullJob;
  if (waiting !== undefined && !due) await ctx.scheduler.cancel(waiting);
  if (reading.fullSince === undefined) {
    const fullJob =
      due || reading.cap <= 0 || reading.heapPerHour <= 0
        ? undefined
        : await ctx.scheduler.runAt(
            Math.max(
              Math.ceil(
                heapFullSince(
                  {
                    heap: known?.amount ?? reading.amount,
                    settledAt: known?.settledAt ?? now,
                    heapPerHour: reading.heapPerHour,
                    cap: reading.cap,
                  },
                  Infinity,
                )!,
              ) + AFTER_FULL_MS,
              now + AFTER_FULL_MS,
            ),
            internal.heapFull.check,
            { buildingId: building._id, due: true },
          );
    await setHeapWatch(ctx, rowId, { fullToldTo: undefined, fullJob });
    return;
  }
  if (known?.fullToldTo !== building.playerId && !silent)
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
  await setHeapWatch(ctx, rowId, { fullToldTo: building.playerId, fullJob: undefined });
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
  args: { buildingId: v.id('buildings'), due: v.optional(v.boolean()) },
  handler: async (ctx, { buildingId, due }) => {
    const building = await ctx.db.get(buildingId);
    if (building === null) return;
    const now = Date.now();
    const reading = await readingOfBuilding(ctx, building, now);
    if (reading === null) return;
    await examineHeap(ctx, building, reading, now, { due: due === true });
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
      if (building !== null) await examineHeap(ctx, building, reading, now, { silent: true });
    }
  },
});
