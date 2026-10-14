import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  captureDurationMs,
  captureRate,
  completesAt,
  progressAt,
  type CaptureClock,
} from '../src/domain/capture';
import { canonicalBuildingKey } from '../src/domain/ids';
import { releaseBuilding } from './buildings';
import { resolveContact } from './combat';
import { cancelRaisesOf, groundGarrison } from './outposts';
import { regionFacts, pointOfBuilding } from './regions';
import { clipToStorage } from './resources';
import { reportChange, settleBeforeChange } from './production';
import { seasonStillPlays } from './seats';
import { surveyFromPoint } from './surveys';
import { forgetMovement, walkHome } from './movement/arrival';
import { reassessDetection } from './movement/detection';
import {
  defenceOf,
  pointOf,
  seasonMovements,
  seasonTroops,
  troopsCarriedBy,
} from './movement/forces';

/**
 * **La capture** (décision du 14/10, `WWS/CONTEXT.md`). Seule l'infanterie capture : elle tient un
 * bâtiment ou un avant-poste adverse, et au bout du temps il change de propriétaire. Le plus
 * proche parent est la présence du pillage (`plunder.ts`), à une différence près qui change tout :
 * ici les troupes **se posent** au point du site au lieu de rester dans leur mouvement. C'est ce
 * qui laisse le joueur les rappeler — le départ annule — et l'adversaire les attaquer comme une
 * pile posée — la mort annule, une perte ralentit.
 *
 * Rien ne bat pour suivre la capture : elle a une échéance (`completesAt`, un rendez-vous pris),
 * et elle se relit à chaque événement qui peut la toucher (`reassessCaptures`, appelé avec la
 * détection, qui court déjà après tout départ, toute arrivée et toute passe).
 */

type Capture = Doc<'captures'>;
type Target = Doc<'buildings'> | Doc<'outposts'>;

const modeOf = async (ctx: QueryCtx, seasonId: Id<'seasons'>) =>
  (await ctx.db.get(seasonId))?.mode ?? 'mondiale';

const clockOf = (capture: Capture): CaptureClock => ({
  progress: capture.progress,
  at: capture.progressAt,
  rate: capture.rate,
  durationMs: capture.durationMs,
  rest: capture.rest,
});

/** Le site tel qu'il se tient, s'il est encore celui de quelqu'un d'autre dans cette saison. */
async function targetOf(
  ctx: QueryCtx,
  target: Capture['target'],
  capturerId: Id<'players'>,
  seasonId: Id<'seasons'>,
): Promise<Target | null> {
  const site =
    target.kind === 'building'
      ? await ctx.db.get(target.buildingId)
      : await ctx.db.get(target.outpostId);
  if (site === null || site.seasonId !== seasonId || site.playerId === capturerId) return null;
  if ('key' in site && site.key === 'hq') return null;
  return site;
}

export const siteOf = (site: Target): Capture['site'] =>
  'key' in site
    ? { kind: 'building', building: site.key, regionId: site.regionId }
    : { kind: 'outpost', hostCountry: site.hostCountry, level: site.level };

/** L'infanterie du capteur debout au point de la capture — pas en marche, pas ailleurs. */
async function capturersAt(
  ctx: QueryCtx,
  capture: Pick<Capture, 'seasonId' | 'playerId' | 'point'>,
): Promise<ReadonlyArray<Doc<'troops'>>> {
  const marching = new Set(
    (await seasonMovements(ctx, capture.seasonId)).flatMap((movement) => movement.troopIds),
  );
  return (await seasonTroops(ctx, capture.seasonId)).filter((troop) => {
    const address = troop.stationedAt;
    return (
      troop.playerId === capture.playerId &&
      troop.role === 'infantry' &&
      !marching.has(troop._id) &&
      address !== null &&
      typeof address !== 'string' &&
      address.lon === capture.point.lon &&
      address.lat === capture.point.lat
    );
  });
}

const rateOf = (troops: ReadonlyArray<Doc<'troops'>>) =>
  captureRate(
    troops.map((troop) => ({
      role: troop.role,
      strength: troop.currentStrength,
      nominalStrength: troop.nominalStrength,
    })),
  );

const schedule = (ctx: MutationCtx, captureId: Id<'captures'>, at: number) =>
  ctx.scheduler.runAt(at, internal.captures.complete, { captureId, expectedAt: at });

async function notifyBoth(
  ctx: MutationCtx,
  capture: Pick<Capture, 'playerId' | 'defenderId' | 'site' | 'point'>,
  at: number,
  notice:
    | { kind: 'captureStarted'; completesAt: number }
    | { kind: 'captureSucceeded' }
    | { kind: 'captureCancelled' },
): Promise<void> {
  for (const [playerId, side] of [
    [capture.playerId, 'capturer'],
    [capture.defenderId, 'defender'],
  ] as const) {
    await ctx.db.insert('notices', {
      playerId,
      at,
      side,
      site: capture.site,
      point: capture.point,
      ...notice,
    });
  }
}

/**
 * **La colonne arrive au site qu'elle vient capturer.** S'il reste des défenseurs, une passe a
 * lieu comme pour une attaque ; si l'attaquant gagne et garde de l'infanterie debout, la capture
 * commence. Sinon chacun rentre comme après une attaque.
 */
export async function arriveForCapture(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const aimed = movement.capture;
  if (aimed === undefined) return;
  const troops = await troopsCarriedBy(ctx, movement);
  const site = await targetOf(ctx, aimed, movement.playerId, movement.seasonId);
  if (site === null) {
    await ctx.db.insert('notices', {
      playerId: movement.playerId,
      at: now,
      kind: 'columnFoundNothing',
      movementType: 'attack',
      hostCountry: movement.hostCountry,
      point: movement.to,
      troops: troops.length,
    });
    await walkHome(ctx, { winners: troops, beaten: [] }, pointOf(movement.to), now);
    await forgetMovement(ctx, movement._id);
    return;
  }

  let standing = troops;
  const defence = await defenceOf(ctx, movement);
  if (defence !== null) {
    const { engagement, routed, routedCargo } = await resolveContact(ctx, {
      seasonId: movement.seasonId,
      attacker: { playerId: movement.playerId, troops },
      defender: { playerId: defence.playerId, troops: defence.troops },
      cause: 'arrival',
      point: movement.to,
      hostCountry: movement.hostCountry,
      outpostId: defence.outpostId,
      disabledUntil: null,
      at: now,
    });
    const stateOf = new Map(engagement.outcomes.map((outcome) => [outcome.id, outcome.state]));
    standing = troops.filter((troop) => stateOf.get(troop._id) === 'standing');
    const holds =
      engagement.winner === 'attacker' && standing.some((troop) => troop.role === 'infantry');
    const survivors = troops.filter((troop) => stateOf.get(troop._id) !== 'destroyed');
    await walkHome(
      ctx,
      { winners: holds ? [] : survivors, beaten: routed },
      pointOf(movement.to),
      now,
      routedCargo,
    );
    if (!holds) {
      await forgetMovement(ctx, movement._id);
      return;
    }
  }

  for (const troop of standing) await ctx.db.patch(troop._id, { stationedAt: movement.to });
  await forgetMovement(ctx, movement._id);
  await startCapture(ctx, movement, site, standing, now);
}

async function startCapture(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  site: Target,
  troops: ReadonlyArray<Doc<'troops'>>,
  now: number,
): Promise<void> {
  const target = movement.capture!;
  const mine = await ctx.db
    .query('captures')
    .withIndex('byPlayer', (q) => q.eq('playerId', movement.playerId))
    .collect();
  const sameSite = mine.filter(
    (capture) =>
      (capture.target.kind === 'building'
        ? capture.target.buildingId
        : capture.target.outpostId) ===
      (target.kind === 'building' ? target.buildingId : target.outpostId),
  );
  /** Un renfort qui rejoint une capture en cours la relève, il n'en ouvre pas une seconde. */
  const running = sameSite.find(
    (capture) =>
      capture.stoppedAt === undefined &&
      capture.point.lon === movement.to.lon &&
      capture.point.lat === movement.to.lat,
  );
  if (running !== undefined) {
    await reassessOne(ctx, running, now);
    return;
  }
  for (const stopped of sameSite) await ctx.db.delete(stopped._id);

  const defender = await ctx.db.get(site.playerId);
  const mode = await modeOf(ctx, movement.seasonId);
  const clock: CaptureClock = {
    progress: 0,
    at: now,
    rate: rateOf(troops),
    durationMs: captureDurationMs(mode, target.kind),
    rest: mode === 'mondiale' && defender !== null ? defender.restWindow : null,
  };
  const capture = {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    defenderId: site.playerId,
    target,
    site: siteOf(site),
    point: movement.to,
    progress: 0,
    progressAt: now,
    rate: clock.rate,
    durationMs: clock.durationMs,
    rest: clock.rest,
    completesAt: completesAt(clock),
  };
  const captureId = await ctx.db.insert('captures', capture);
  await schedule(ctx, captureId, capture.completesAt);
  await notifyBoth(ctx, capture, now, { kind: 'captureStarted', completesAt: capture.completesAt });
}

/**
 * **Relire une capture après ce qui a pu la toucher.** Plus d'infanterie au point, ou un site qui
 * n'est plus à qui l'on visait : elle s'arrête. Une force qui a changé : ce qui est fait est
 * gardé, et l'échéance se reprend au nouveau rythme. Jamais de remise à zéro.
 */
async function reassessOne(ctx: MutationCtx, capture: Capture, now: number): Promise<void> {
  const site = await targetOf(ctx, capture.target, capture.playerId, capture.seasonId);
  const troops = await capturersAt(ctx, capture);
  if (site === null || site.playerId !== capture.defenderId || troops.length === 0) {
    await ctx.db.patch(capture._id, { stoppedAt: now });
    await notifyBoth(ctx, capture, now, { kind: 'captureCancelled' });
    return;
  }
  const rate = rateOf(troops);
  if (rate === capture.rate) return;
  const progress = progressAt(clockOf(capture), now);
  const due = completesAt({ ...clockOf(capture), progress, at: now, rate });
  await ctx.db.patch(capture._id, { progress, progressAt: now, rate, completesAt: due });
  await schedule(ctx, capture._id, due);
}

export async function reassessCaptures(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  now: number,
): Promise<void> {
  const running = (
    await ctx.db
      .query('captures')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect()
  ).filter((capture) => capture.stoppedAt === undefined);
  for (const capture of running) await reassessOne(ctx, capture, now);
}

/**
 * **Le site change de main, et c'est un événement de couleur** : régler à l'ancienne couleur,
 * écrire, rapporter (`production.ts`). Ce que la garnison adverse avait n'est pas transmis — elle
 * passe au sol —, ni la file : la reprise est celle d'une démolition (`releaseBuilding`).
 */
export const complete = internalMutation({
  args: { captureId: v.id('captures'), expectedAt: v.number() },
  handler: async (ctx, { captureId, expectedAt }) => {
    const capture = await ctx.db.get(captureId);
    if (
      capture === null ||
      capture.stoppedAt !== undefined ||
      capture.completesAt !== expectedAt ||
      !(await seasonStillPlays(ctx, capture.playerId))
    ) {
      return;
    }
    const now = expectedAt;
    await reassessOne(ctx, capture, now);
    const fresh = await ctx.db.get(captureId);
    if (fresh === null || fresh.stoppedAt !== undefined || fresh.completesAt !== expectedAt) return;
    const site = (await targetOf(ctx, capture.target, capture.playerId, capture.seasonId))!;
    const loser = (await ctx.db.get(site.playerId))!;
    const mode = await modeOf(ctx, capture.seasonId);

    const before = await settleBeforeChange(ctx, capture.seasonId, now);
    const taken: Array<Doc<'buildings'>> = [];
    if ('key' in site) {
      await releaseBuilding(ctx, loser, site, now);
      await ctx.db.patch(site._id, {
        playerId: capture.playerId,
        capturedAt: now,
        level: mode === 'mondiale' ? Math.max(1, site.level - 1) : site.level,
      });
      taken.push(site);
    } else {
      const anchored = (
        await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', loser._id))
          .collect()
      ).filter((building) => building.outpostId === site._id);
      for (const building of anchored) {
        await releaseBuilding(ctx, loser, building, now);
        await ctx.db.patch(building._id, { playerId: capture.playerId });
      }
      taken.push(...anchored);
      await groundGarrison(ctx, site);
      await cancelRaisesOf(ctx, loser._id, site, now);
      await ctx.db.patch(site._id, { playerId: capture.playerId });
      /** La garnison du capteur entre dans le point qu'il vient de prendre : sans elle, le premier
       *  raid le trouverait vide et le désactiverait sans combat. */
      for (const troop of await capturersAt(ctx, capture)) {
        await ctx.db.patch(troop._id, { stationedAt: site._id });
      }
    }
    if (taken.some((building) => canonicalBuildingKey(building.key) === 'warehouse')) {
      await clipToStorage(ctx, loser._id, now);
    }
    await reportChange(ctx, capture.seasonId, before, now);

    await ctx.db.delete(captureId);
    await notifyBoth(ctx, capture, now, { kind: 'captureSucceeded' });
    const point =
      'key' in site
        ? (pointOfBuilding(site) ?? regionFacts(site.regionId)?.point ?? pointOf(capture.point))
        : pointOf(site.point);
    await surveyFromPoint(ctx, capture.playerId, point, now);
    await surveyFromPoint(ctx, loser._id, point, now);
    await ctx.scheduler.runAfter(0, internal.constructions.resume, { playerId: loser._id });
    await reassessDetection(ctx, capture.seasonId, now);
  },
});
