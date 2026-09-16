import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { isStanding } from '../src/domain/outposts';
import { buildMinutes, outpostReachKm } from './constants';
import { reassessDetection } from './movement/detection';
import { movementsOf, pointOf } from './movement/forces';
import { regionOfOutpost } from './regions';
import { reportChange, settleBeforeChange } from './production';
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
      regionOfOutpost(outpost),
      at,
    );
    await ctx.db.insert('notices', {
      playerId: outpost.playerId,
      at,
      kind: 'outpostStands',
      hostCountry: outpost.hostCountry,
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
    specialization: outpost.specialization,
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
