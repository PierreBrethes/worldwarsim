import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { canonicalBuildingKey, type BuildingKey } from '../src/domain/ids';
import { demolitionRefusalOf } from '../src/domain/construction';
import { buildCost, recruitmentCost, type Costs, type FoundationDebt } from './constants';
import { fail } from './errors';
import { reassessDetection } from './movement/detection';
import { foundationOwedBy, pointOfBuilding } from './regions';
import { clipToStorage, credit, settle } from './resources';
import { playerOf, requirePlayable } from './seasons';

export type { BuildingKey };

// A completed legacy queue entry changes its building key, never its paid tariff.
export const buildingCostKey = (building: Doc<'buildings'>): BuildingKey =>
  building.costKey ?? building.key;

export async function playerBuildings(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'buildings'>>> {
  return ctx.db
    .query('buildings')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/**
 * **Every building of one season, and of no other.** The single door for the readings that are
 * not about a player — the ground a defence answers from, the stations that listen — so that the
 * season filter is written once instead of at each call site. Several seasons stand at the same
 * time (`schema.ts`), and an unfiltered sweep here is a nation of another game defending this one.
 */
export async function seasonBuildings(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'buildings'>>> {
  return ctx.db
    .query('buildings')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
}

/**
 * **Level 0 means absent.** A building is put up on a region or it does not exist (ADR 0015) —
 * the old floor of 1, which made every building exist from the launch, is gone. A key held on
 * several regions answers with its best instance: the headquarters cap and the tier gates read
 * the strongest one, never a sum of unrelated sites.
 */
export const levelOf = (buildings: ReadonlyArray<Doc<'buildings'>>, key: BuildingKey): number =>
  buildings.reduce(
    (best, building) =>
      canonicalBuildingKey(building.key) === canonicalBuildingKey(key)
        ? Math.max(best, building.level)
        : best,
    0,
  );

/**
 * What a family of buildings is worth altogether. **A ceiling adds up over sites** — storage
 * reads this, and so does the troop ceiling the billets carry. What reads the best instance
 * alone is `levelOf`: the headquarters cap and the tier gates, which are gates, not ceilings.
 *
 * The comment used to claim the opposite while `resources.ts` already summed. Summing is the
 * decision: it is what makes a second site an alternative to a taller one.
 */
export const totalLevelOf = (
  buildings: ReadonlyArray<Doc<'buildings'>>,
  key: BuildingKey,
): number =>
  buildings.reduce(
    (sum, building) =>
      canonicalBuildingKey(building.key) === canonicalBuildingKey(key) ? sum + building.level : sum,
    0,
  );

export async function buildingLevel(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  key: BuildingKey,
): Promise<number> {
  return levelOf(await playerBuildings(ctx, playerId), key);
}

export const buildingAt = (
  buildings: ReadonlyArray<Doc<'buildings'>>,
  key: BuildingKey,
  regionId: string,
): Doc<'buildings'> | undefined =>
  buildings.find(
    (building) =>
      canonicalBuildingKey(building.key) === canonicalBuildingKey(key) &&
      building.regionId === regionId,
  );

/**
 * The HQ caps the others: nothing rises above it. The rule lived twice — once as a guard in
 * `constructions.start`, once as a flag in `view.playerView` — and two copies of a rule are
 * two chances to raise one without the other, which would grey out a button the server still
 * accepts, or the reverse.
 *
 * With no headquarters at all — `hqLevel` 0 — it blocks everything but the headquarters. That
 * used to make the first construction of a season the HQ without a rule saying so; the HQ now
 * stands at level 1 from the launch (ADR 0015), so a launched season never reads that branch.
 * It stays because a destroyed capital would.
 */
export const cappedByHq = (key: BuildingKey, level: number, hqLevel: number): boolean =>
  key !== 'hq' && level >= hqLevel;

/**
 * **Raser un bâtiment à soi** (demande de Pierre, 15/09). Sans elle, une bâtisse par région
 * (ADR 0015) fige une région au premier choix pour toute la saison : une mine posée là où l'on
 * voudrait une caserne est une erreur sans retour.
 *
 * **Rien n'est rendu de l'alliage payé** (décision 5a) : ce qui est bâti est dépensé, et un
 * remboursement ferait de la démolition un entrepôt de matière à l'abri du pillage. Ce qui
 * revient est ce que la **file** rembourse, et selon sa règle à elle — une entrée qui n'a pas
 * commencé, jamais une qui court : ni `constructions.cancel` ni `troops.cancel` ne rendent le
 * temps déjà consommé, et la démolition n'ouvre pas ce voyage aller-retour entre matière et
 * temps.
 *
 * L'ordre de la séquence est le contrat, et il se lit de haut en bas :
 *
 * — **régler avant d'écrire.** Un extracteur rasé fait tomber un débit, un entrepôt un plafond ;
 *   les deux sont lus en avant depuis le dernier règlement (`economyOf`), donc sans ce `settle`
 *   la forme nouvelle s'appliquerait **rétroactivement** aux heures déjà tenues.
 * — **écrêter après**, et seulement pour un entrepôt : le plafond se lit sur ce qui est debout,
 *   donc `clipToStorage` doit trouver la table déjà amputée (`resources.ts`).
 * — **la garnison passe au sol**, jamais ne meurt (règle 3 du projet, ADR 0019) : elle devient
 *   une pile posée au pied du bâtiment, à son propre point s'il en avait un — un port rasé
 *   laisse ses troupes sur le quai.
 *
 * **Aucun événement de couleur** (ADR 0020 §6) : la couleur vient des avant-postes et jamais des
 * bâtiments, donc pas de `settleBeforeChange` — un producteur rasé ne redessine rien.
 */
export const demolish = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), buildingId: v.id('buildings') },
  handler: async (ctx, { token, seasonId, buildingId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    const building = await ctx.db.get(buildingId);
    const refusal = demolitionRefusalOf({
      key: building?.key ?? 'hq',
      mine: building !== null && building.playerId === player._id,
    });
    if (refusal !== null || building === null) fail(refusal ?? 'NOT_YOURS');

    const now = Date.now();
    const { refunded, clipped } = await razeBuilding(ctx, player._id, building, now);

    /** La file repart derrière l'entrée qui vient de disparaître, et la détection se réévalue
     *  parce qu'une garnison qui passe au sol est un détecteur qui a bougé (ADR 0021). */
    await ctx.scheduler.runAfter(0, internal.constructions.resume, { playerId: player._id });
    await reassessDetection(ctx, season._id);
    return { refunded, clipped };
  },
});

/**
 * **La chute d'un mât, sans la porte qui l'ordonne.** Extraite de `demolish` le 16/09 parce
 * qu'un second geste l'emporte désormais : démanteler un avant-poste fait tomber les bâtiments
 * qu'il ancre (`outposts.dismantle`), et ils doivent tomber **de la même façon** — file annulée
 * selon la règle de la file, socle non rendu, garnison au sol, écrêtage d'entrepôt, aucun
 * remboursement. Recopier cette séquence eût été se donner deux démolitions à tenir d'accord.
 *
 * Ce qui reste chez l'appelant est ce qui n'appartient pas au mât : le refus, la reprise de la
 * file et la réévaluation de la détection — une seule par geste, quel que soit le nombre de
 * bâtiments emportés.
 */
export async function razeBuilding(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  building: Doc<'buildings'>,
  now: number,
): Promise<{ refunded: Costs; clipped: Costs | null }> {
  /** **Relu à chaque mât**, et non porté depuis l'appelant : un démantèlement en emporte
   *  plusieurs d'affilée, et `settledFoundation` grandit entre deux — un document capturé au
   *  premier ferait acquitter deux fois la même dette de socle. */
  const player = await ctx.db.get(playerId);
  if (player === null) return { refunded: {}, clipped: null };
  const refunded = await cancelWorkOn(ctx, player, building, now);

  /** Ce que ce mât acquittait du socle, retenu avant qu'il quitte le sol : le socle est un don
   *  de lancement, fait une fois, et il ne se redemande pas (décision 6a). */
  const standing = await playerBuildings(ctx, player._id);
  const settled = revivedDebts(
    player,
    standing,
    standing.filter((held) => held._id !== building._id),
  );

  await settle(ctx, player._id, now);
  await groundGarrison(ctx, building);
  await ctx.db.delete(building._id);
  if (settled.length > 0) {
    await ctx.db.patch(player._id, {
      settledFoundation: [...(player.settledFoundation ?? []), ...settled],
    });
  }
  const clipped =
    canonicalBuildingKey(building.key) === 'warehouse'
      ? await clipToStorage(ctx, player._id, now)
      : null;

  await ctx.db.insert('notices', {
    playerId: player._id,
    at: now,
    kind: 'buildingDemolished',
    building: canonicalBuildingKey(building.key),
    regionId: building.regionId,
    level: building.level,
  });
  return { refunded, clipped };
}

/**
 * **Ce que la file avait engagé sur ce bâtiment, repris** : l'élévation en cours ou en attente,
 * et les lots que la caserne formait. La règle du remboursement est celle de la file et d'elle
 * seule — ce qui n'a pas commencé revient entier, ce qui court est du temps déjà consommé.
 *
 * L'entrée part **dans tous les cas**, remboursée ou non : son `finish` inscrirait sinon un
 * bâtiment neuf sur la région qu'on vient de libérer.
 */
async function cancelWorkOn(
  ctx: MutationCtx,
  player: Doc<'players'>,
  building: Doc<'buildings'>,
  now: number,
): Promise<Costs> {
  const refunded: Record<string, number> = {};
  const add = (costs: Costs) => {
    for (const [key, amount] of Object.entries(costs)) {
      refunded[key] = (refunded[key] ?? 0) + amount;
    }
  };

  /** Une entrée par région (`constructions.ts`), donc celle de cette région est l'élévation de
   *  ce bâtiment-ci — une élévation d'avant-poste ne prend aucun sol et ne compte pas. */
  const queued = await ctx.db
    .query('constructions')
    .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
    .collect();
  for (const entry of queued) {
    if (entry.outpostId !== undefined || entry.regionId !== building.regionId) continue;
    if (entry.finishesAt === null) add(buildCost(entry.building, entry.level));
    await ctx.db.delete(entry._id);
  }

  const hqLevel = levelOf(await playerBuildings(ctx, player._id), 'hq');
  const batches = await ctx.db
    .query('recruitments')
    .withIndex('byBuilding', (q) => q.eq('buildingId', building._id))
    .collect();
  for (const batch of batches) {
    if (batch.finishesAt === null) {
      add({ alloy: recruitmentCost(batch.role, batch.tier, hqLevel).alloy });
    }
    await ctx.db.delete(batch._id);
  }

  const costs = refunded as Costs;
  await credit(ctx, player._id, costs, now);
  return costs;
}

/**
 * **La garnison passe au sol, elle ne meurt pas** (ADR 0019) : un bâtiment de projection rasé
 * rend ses troupes à la région, en pile posée, au point du bâtiment quand il en avait un — le
 * quai d'un port — et au point de sa région sinon. Sans point du tout, l'adresse nulle est le
 * repli que le schéma nomme déjà : « sur le sol national, accroché à rien qui tienne debout ».
 */
async function groundGarrison(ctx: MutationCtx, building: Doc<'buildings'>): Promise<void> {
  const point = pointOfBuilding(building);
  const stationed = await ctx.db
    .query('troops')
    .withIndex('byStation', (q) => q.eq('stationedAt', building._id))
    .collect();
  for (const troop of stationed) {
    await ctx.db.patch(troop._id, {
      stationedAt: point === null ? null : { lon: point[0], lat: point[1] },
    });
  }
}

/**
 * **Les dettes du socle que ce bâtiment tenait**, celles qui renaîtraient de sa disparition. Le
 * socle se lit sur le sol, donc la seule façon honnête de savoir ce qu'un mât acquittait est de
 * poser la question deux fois — avec lui, sans lui — et de garder la différence.
 */
function revivedDebts(
  player: Doc<'players'>,
  before: ReadonlyArray<Doc<'buildings'>>,
  after: ReadonlyArray<Doc<'buildings'>>,
): ReadonlyArray<FoundationDebt> {
  const held = [...foundationOwedBy(player, before)];
  return foundationOwedBy(player, after).filter((due) => {
    const rank = held.findIndex((kept) => kept.key === due.key && kept.deposit === due.deposit);
    if (rank < 0) return true;
    held.splice(rank, 1);
    return false;
  });
}
