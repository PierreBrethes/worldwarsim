import { v } from 'convex/values';
import { pauseResearch } from './research';
import type { Doc, Id } from './_generated/dataModel';
import { mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { canonicalBuildingKey, type BuildingKey } from '../src/domain/ids';
import { demolitionRefusalOf } from '../src/domain/construction';
import { buildCost, recruitmentCost, type Costs, type FoundationDebt } from './constants';
import { playerBuildings } from './buildingReads';
import { fail } from './errors';
import { reassessDetection } from './movement/detection';
import { foundationOwedBy, pointOfBuilding } from './regions';
import { clipToStorage, credit, settle } from './resources';
import { playerOf, requirePlayable } from './seats';
import { reportChange, settleBeforeChange } from './production';
import { refuseInBlitz } from './blitz';

export type { BuildingKey };

/**
 * **Raser un bâtiment à soi** (demande de Pierre, 15/09). Sans elle, un point posé (ADR 0029) se
 * fige au premier choix pour toute la saison : une mine qui tient le seul gisement d'à côté, ou
 * une caserne trop près d'où l'on voudrait une usine, est une erreur sans retour.
 *
 * **Rien n'est rendu de l'acier payé** (décision 5a) : ce qui est bâti est dépensé, et un
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
 * **Aucun événement de couleur** (ADR 0020 §6), sauf pour un bâtiment capturé : lui seul colore
 * sa région (décision M8 du 14/10) ; un producteur bâti et rasé ne redessine rien.
 */
export const demolish = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), buildingId: v.id('buildings') },
  handler: async (ctx, { token, seasonId, buildingId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);

    const building = await ctx.db.get(buildingId);
    const refusal = demolitionRefusalOf({
      key: building?.key ?? 'hq',
      mine: building !== null && building.playerId === player._id,
    });
    if (refusal !== null || building === null) fail(refusal ?? 'NOT_YOURS');

    const now = Date.now();
    /** Un bâtiment capturé colore sa région (14/10) : le raser est un événement de couleur. */
    const before =
      building.capturedAt === undefined ? null : await settleBeforeChange(ctx, season._id, now);
    const { refunded, clipped } = await razeBuilding(ctx, player._id, building, now);
    if (before !== null) await reportChange(ctx, season._id, before, now);

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
  const player = await ctx.db.get(playerId);
  if (player === null) return { refunded: {}, clipped: null };
  const refunded = await releaseBuilding(ctx, player, building, now);
  await ctx.db.delete(building._id);
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
 * **Ce que son propriétaire perd avec un bâtiment, quel que soit le geste** — la file reprise
 * selon sa règle, le socle qu'il acquittait retenu, le stock réglé, la garnison au sol. Le
 * bâtiment, lui, reste à l'appelant : la démolition l'efface, la capture le donne.
 */
export async function releaseBuilding(
  ctx: MutationCtx,
  player: Doc<'players'>,
  building: Doc<'buildings'>,
  now: number,
): Promise<Costs> {
  const refunded = await cancelWorkOn(ctx, player, building, now);

  /** Ce que ce mât acquittait du socle, retenu avant qu'il quitte le sol : le socle est un don
   *  de lancement, fait une fois, et il ne se redemande pas (décision 6a). **Relu à chaque
   *  mât**, et non porté depuis l'appelant : un démantèlement en emporte plusieurs d'affilée, et
   *  `settledFoundation` grandit entre deux. */
  const fresh = (await ctx.db.get(player._id)) ?? player;
  const standing = await playerBuildings(ctx, player._id);
  const settled = revivedDebts(
    fresh,
    standing,
    standing.filter((held) => held._id !== building._id),
  );

  await settle(ctx, player._id, now);
  await groundGarrison(ctx, building);
  if (building.key === 'hq') await pauseResearch(ctx, player._id, now);
  if (settled.length > 0) {
    await ctx.db.patch(player._id, {
      settledFoundation: [...(fresh.settledFoundation ?? []), ...settled],
    });
  }
  return refunded;
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

  /** **Une Blitz n'a jamais de lot en attente** (U6) : un seul par bâtiment libre, daté à
   *  l'ordre, donc rien à y rendre. */
  const batches = await ctx.db
    .query('recruitments')
    .withIndex('byBuilding', (q) => q.eq('buildingId', building._id))
    .collect();
  for (const batch of batches) {
    if (batch.finishesAt === null) {
      add(recruitmentCost(batch.role, batch.tier).costs);
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
