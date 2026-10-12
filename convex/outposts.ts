import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { outpostDismantleRefusalOf } from '../src/domain/construction';
import { isStanding } from '../src/domain/outposts';
import { razeBuilding } from './buildings';
import { playerBuildings } from './buildingReads';
import { buildCost, buildMinutes, outpostReachKm, type Costs } from './constants';
import { fail } from './errors';
import { homeGroundsOf, soleHoldOf } from './holding';
import { reassessDetection } from './movement/detection';
import { movementsOf, outpostsOf, pointOf, specializationServed } from './movement/forces';
import { allRegions } from './regions';
import { reportChange, settleBeforeChange } from './production';
import { notifyPlayer } from './notifications';
import { journalUrl, push } from '../src/domain/push';
import { credit } from './resources';
import { playerOf, requirePlayable } from './seats';
import { surveyFoundation } from './surveys';

/**
 * **Le chantier, entre l'ordre et le point** (révision du 15/09 de l'ADR 0020 §10). Fonder se
 * paie et prend du temps ; ce module tient les deux bouts de cette fenêtre — le **lever**, que
 * personne n'ordonne, et la **mort** du chantier dont la garnison s'en va ou tombe.
 *
 * Ils vivent ensemble parce qu'ils sont la même règle lue dans les deux sens : un chantier est
 * une garnison posée sur une promesse. Elle tient, le point se lève ; elle s'en va, il n'y a
 * plus rien à lever. L'ordre lui-même reste dans `movements.ts`, où toutes les portes sont.
 */

/** Combien de minutes un chantier de fondation dure — le même barème que l'élévation, au
 *  niveau 1 (`convex/constants.ts`). */
export const foundationMinutes = (): number => buildMinutes('outpost', 1);

/**
 * **Le lever, à `standsAt` exactement même s'il se réveille en retard** — même motif que la fin
 * d'une désactivation (`production.restoreAfterDisabling`) : le rendez-vous est pris à l'ordre,
 * et le règlement se fait à l'heure promise, sans quoi la couleur neuve s'appliquerait
 * rétroactivement aux heures déjà tenues.
 *
 * Idempotent, et c'est le champ qui le dit : le lever **efface** `standsAt`, donc un point déjà
 * debout — ou disparu avec sa garnison — ne fait rien du tout. Pas de second drapeau à tenir.
 */
export const standOutpost = internalMutation({
  args: { outpostId: v.id('outposts') },
  handler: async (ctx, { outpostId }) => {
    const outpost = await ctx.db.get(outpostId);
    if (outpost === null || outpost.standsAt === undefined) return;

    const at = outpost.standsAt;
    const season = await ctx.db.get(outpost.seasonId);
    if (season === null) return;

    /** **Le lever est un événement de couleur** (ADR 0020 §6) : le sol du cercle prend la teinte
     *  du point, ce qui peut couper un voisin. Régler à l'ancienne, écrire, rapporter. */
    const before = await settleBeforeChange(ctx, outpost.seasonId, at);
    await ctx.db.patch(outpost._id, { standsAt: undefined });
    await reportChange(ctx, outpost.seasonId, before, at);

    /** Le sol neuf entre dans les relevés, par le déclencheur de la fondation : une portée qui
     *  vient d'ouvrir n'a rien relevé tant qu'un événement ne le lui a pas demandé. */
    await surveyFoundation(
      ctx,
      outpost.seasonId,
      pointOf(outpost.point),
      outpostReachKm(outpost.level),
      at,
    );
    await ctx.db.insert('notices', {
      playerId: outpost.playerId,
      at,
      kind: 'outpostStands',
      hostCountry: outpost.hostCountry,
      point: outpost.point,
      specialization: outpost.specialization,
    });
    await reassessDetection(ctx, outpost.seasonId, at);
  },
});

/** Le rendez-vous que la fondation prend pour son propre lever. */
export const scheduleStand = (
  ctx: MutationCtx,
  outpostId: Id<'outposts'>,
  standsAt: number,
): Promise<void> =>
  ctx.scheduler
    .runAt(standsAt, internal.outposts.standOutpost, { outpostId })
    .then(() => undefined);

/**
 * **Un chantier meurt avec sa garnison**, et rien n'est remboursé : ce qui est dépensé l'est
 * (même cohérence que la file de chantier prépayée). Une partie de la pile qui reste le garde
 * vivant — c'est une présence qu'on exige, pas un effectif.
 *
 * Appelé aux deux seuls moments où une garnison peut disparaître : le **départ** d'un mouvement
 * et la **résolution** d'une passe. Il n'y a pas d'horloge, donc rien ne « constate » un point
 * vide ; l'événement est le geste qui l'a vidé.
 *
 * Un point déjà debout n'est pas concerné : une garnison qui quitte un avant-poste levé laisse
 * le point derrière elle, c'est tout le sens d'un point.
 */
export async function collapseIfAbandoned(
  ctx: MutationCtx,
  outpostId: Id<'outposts'>,
  now: number,
): Promise<void> {
  const outpost = await ctx.db.get(outpostId);
  if (outpost === null || isStanding(outpost, now)) return;
  if ((await remainingGarrison(ctx, outpost)).length > 0) return;

  await ctx.db.delete(outpost._id);
  await ctx.db.insert('notices', {
    playerId: outpost.playerId,
    at: now,
    kind: 'foundationLost',
    hostCountry: outpost.hostCountry,
    point: outpost.point,
    specialization: outpost.specialization,
  });
  await notifyPlayer(ctx, outpost.playerId, {
    type: 'outpost',
    phrase: push.foundationLost,
    url: journalUrl,
    at: now,
  });
  /** Le rendez-vous du lever n'est pas annulé : il trouvera un point disparu et ne fera rien. */
}

/** **Ce qui tient encore le chantier** : les troupes qui y sont stationnées et qui n'en sont pas
 *  parties. Une colonne en marche porte encore son adresse — elle n'y est pas (`surveys.ts`). */
async function remainingGarrison(
  ctx: MutationCtx,
  outpost: Doc<'outposts'>,
): Promise<ReadonlyArray<Doc<'troops'>>> {
  const marching = new Set<Id<'troops'>>(
    (await movementsOf(ctx, outpost.playerId)).flatMap((movement) => movement.troopIds),
  );
  const stationed = await ctx.db
    .query('troops')
    .withIndex('byStation', (q) => q.eq('stationedAt', outpost._id))
    .collect();
  return stationed.filter((troop) => !marching.has(troop._id));
}

/**
 * **Un point à soi se démonte** (décision de Pierre, 16/09, Registre 27). C'était le seul objet
 * du plateau qu'on posait sans pouvoir le reprendre : une bâtisse se rase depuis le 15/09, un
 * chantier s'annule, un avant-poste restait pour la saison — et avec lui le sol qu'il colore,
 * les emplacements qu'il ouvre et la portée qui relève.
 *
 * **C'est un événement de couleur**, et c'est l'essentiel de sa mécanique : régler à l'ancienne
 * couleur, écrire, rapporter — le même contrat que le lever (`standOutpost`) et la fin d'une
 * désactivation. Sans lui, la coupure de production s'appliquerait rétroactivement aux heures
 * déjà tenues.
 *
 * **Les bâtiments ancrés tombent avec lui** (décision 1a) : l'ancrage est écrit à la pose
 * (`buildings.outpostId`), donc il n'y a aucune géométrie à relire — sauf pour les mâts d'avant
 * le champ, que le sol replace, et le repli part au prochain wipe. Chacun tombe **comme une
 * démolition ordinaire** (`razeBuilding`) : file annulée selon la règle de la file, socle non
 * rendu, garnison au sol, écrêtage d'entrepôt chiffré.
 *
 * **Rien n'est remboursé** (décision 5a) : ni la fondation, ni les élévations. Ce qui revient est
 * ce que la **file** rembourse, et selon sa règle à elle — une entrée qui n'a pas commencé.
 */
export const dismantle = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), outpostId: v.id('outposts') },
  handler: async (ctx, { token, seasonId, outpostId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    const outpost = await ctx.db.get(outpostId);
    const refusal = outpostDismantleRefusalOf({
      mine: outpost !== null && outpost.playerId === player._id,
      serving: outpost !== null && (await specializationServed(ctx, outpost)),
    });
    if (refusal !== null || outpost === null) fail(refusal ?? 'NOT_YOURS');

    const now = Date.now();
    const anchored = await anchoredBuildings(ctx, player._id, outpost, now);

    /** **Régler à l'ancienne couleur avant d'écrire la nouvelle** (ADR 0020 §6) : le point tient
     *  encore ses régions à la seconde où le règlement se fait, et les mâts qu'il ancre tombent
     *  dans cette même seconde. */
    const before = await settleBeforeChange(ctx, season._id, now);
    for (const building of anchored) await razeBuilding(ctx, player._id, building, now);
    await groundGarrison(ctx, outpost);
    const refunded = await cancelRaisesOf(ctx, player._id, outpost, now);
    await ctx.db.delete(outpost._id);
    await reportChange(ctx, season._id, before, now);

    await ctx.db.insert('notices', {
      playerId: player._id,
      at: now,
      kind: 'outpostDismantled',
      hostCountry: outpost.hostCountry,
      point: outpost.point,
      level: outpost.level,
      buildings: anchored.length,
    });
    /** La file repart derrière les entrées disparues, et la détection se réévalue : un point
     *  retiré est une portée de moins, et une garnison passée au sol un détecteur qui a bougé. */
    await ctx.scheduler.runAfter(0, internal.constructions.resume, { playerId: player._id });
    await reassessDetection(ctx, season._id, now);
    return { buildings: anchored.length, refunded };
  },
});

/**
 * **Ce que ce point ancre.** L'ancrage est un champ écrit à la pose et jamais recalculé
 * (ADR 0020 §10) : c'est la seule lecture juste, parce qu'un mât posé sous un point y reste quoi
 * qu'on fonde plus tard autour de lui.
 *
 * Le **repli** ne concerne que les mâts d'avant le champ : faute d'ancre, on leur en donne une
 * par le sol — leur région est-elle de celles que ce point tient à lui seul (`soleHoldOf`, la
 * lecture même de la couleur). Le sol national ne répond jamais oui, ce qui est exactement la
 * bonne réponse : un mât chez soi ne dépend d'aucun avant-poste.
 */
async function anchoredBuildings(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  outpost: Doc<'outposts'>,
  now: number,
): Promise<ReadonlyArray<Doc<'buildings'>>> {
  const buildings = await playerBuildings(ctx, playerId);
  const anchored = buildings.filter((building) => building.outpostId === outpost._id);
  const orphans = buildings.filter((building) => building.outpostId === undefined);
  if (orphans.length === 0) return anchored;

  const held = new Set(
    soleHoldOf({
      regions: allRegions(),
      outposts: await outpostsOf(ctx, playerId),
      outpost,
      homeGrounds: await homeGroundsOf(ctx, outpost.seasonId),
      now,
    }),
  );
  return [...anchored, ...orphans.filter((building) => held.has(building.regionId))];
}

/**
 * **La garnison passe au sol, elle ne meurt pas** (ADR 0019, règle 3) : elle devient une pile
 * posée au point de l'avant-poste — là où elle se tenait déjà, et où la carte la dessinait.
 */
async function groundGarrison(ctx: MutationCtx, outpost: Doc<'outposts'>): Promise<void> {
  for (const troop of await ctx.db
    .query('troops')
    .withIndex('byStation', (q) => q.eq('stationedAt', outpost._id))
    .collect()) {
    await ctx.db.patch(troop._id, { stationedAt: { ...outpost.point } });
  }
}

/**
 * **L'élévation en file part avec le point qu'elle visait** — et selon la règle de la file, pas
 * selon une règle du démantèlement : ce qui n'a pas commencé revient entier, ce qui court est du
 * temps déjà consommé. C'est mot pour mot ce que `cancelWorkOn` fait des chantiers d'un bâtiment
 * rasé ; la file d'un avant-poste se lit sur un autre champ, voilà tout.
 */
async function cancelRaisesOf(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  outpost: Doc<'outposts'>,
  now: number,
): Promise<Costs> {
  const refunded: Record<string, number> = {};
  for (const entry of await ctx.db
    .query('constructions')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect()) {
    if (entry.outpostId !== outpost._id) continue;
    if (entry.finishesAt === null) {
      for (const [key, amount] of Object.entries(buildCost(entry.building, entry.level))) {
        refunded[key] = (refunded[key] ?? 0) + amount;
      }
    }
    await ctx.db.delete(entry._id);
  }
  const costs = refunded as Costs;
  await credit(ctx, playerId, costs, now);
  return costs;
}

/**
 * **La couleur qu'un point tient à lui seul**, servie à la carte de confirmation avant le clic.
 * C'est la **même lecture** que la zone hachurée d'un point hors service (`soleHoldOf`) : le
 * chiffre annoncé et la règle qui l'applique ne peuvent pas diverger, puisqu'il n'y en a qu'une.
 *
 * Ses points et les siens seuls, comme `control.held` : la vérité des autres n'entre pas dans
 * une requête que le plateau tient ouverte (`brouillard-et-fanout.md`).
 */
export const soleHold = query({
  args: { token: v.string(), seasonId: v.id('seasons'), outpostId: v.id('outposts') },
  handler: async (ctx, { token, seasonId, outpostId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const outpost = await ctx.db.get(outpostId);
    if (outpost === null || outpost.playerId !== player._id) return { regions: 0 };
    return {
      regions: soleHoldOf({
        regions: allRegions(),
        outposts: await outpostsOf(ctx, player._id),
        outpost,
        homeGrounds: await homeGroundsOf(ctx, season._id),
        now: Date.now(),
      }).length,
    };
  },
});
