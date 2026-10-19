import { v } from 'convex/values';
import { stopTour } from './tours';
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
import { modeOf } from '../src/domain/season-mode';
import { settleFunds } from './blitz';
import { releaseBuilding } from './buildings';
import { resolveContact } from './combat';
import { cancelRaisesOf, collapseIfAbandoned, groundGarrison } from './outposts';
import { pointOfBuilding } from './regions';
import { landAtPoint } from './routes';
import { clipToStorage, creditToStorage, debit, economyOf } from './resources';
import { lootFromSurplus } from '../src/domain/loot';
import { positionAt } from '../src/domain/interception';
import { BASE_CAP } from './constants';
import { irregularSeat } from './objectives';
import { handOver } from './strategicPoints';
import { reportChange, settleBeforeChange } from './production';
import { seasonStillPlays, seatsOf } from './seats';
import { notifyPlayer } from './notifications';
import { journalUrl, push } from '../src/domain/push';
import { surveyFromPoint } from './surveys';
import { forgetMovement, walkHome } from './movement/arrival';
import { marchingForce, reassessDetection } from './movement/detection';
import { playerBuildings } from './buildingReads';
import { leaveTheWar } from './players';
import {
  defenceOf,
  movementsOf,
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
type Target = Doc<'buildings'> | Doc<'outposts'> | Doc<'strategicPoints'>;

const isPoint = (site: Target): site is Doc<'strategicPoints'> => 'holderId' in site;
const isBuilding = (site: Target): site is Doc<'buildings'> => 'key' in site && !isPoint(site);
/** Qui défend le site : son propriétaire, ou le teneur d'un point — `null` sur un point neutre,
 *  que garde le siège irrégulier. */
const ownerOf = (site: Target): Id<'players'> | null =>
  isPoint(site) ? site.holderId : site.playerId;
/** Le site est-il encore à qui la capture vise ? Un point neutre l'est toujours. */
const stillHeldBy = (site: Target, defenderId: Id<'players'>): boolean =>
  (ownerOf(site) ?? defenderId) === defenderId;
const targetIdOf = (target: Capture['target']): string =>
  target.kind === 'building'
    ? target.buildingId
    : target.kind === 'outpost'
      ? target.outpostId
      : target.pointId;

const seasonModeOf = async (ctx: QueryCtx, seasonId: Id<'seasons'>) =>
  modeOf((await ctx.db.get(seasonId))?.mode);

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
  const site: Target | null =
    target.kind === 'building'
      ? await ctx.db.get(target.buildingId)
      : target.kind === 'outpost'
        ? await ctx.db.get(target.outpostId)
        : await ctx.db.get(target.pointId);
  if (site === null || site.seasonId !== seasonId || ownerOf(site) === capturerId) return null;
  return site;
}

export const siteOf = (site: Target): Capture['site'] =>
  isPoint(site)
    ? { kind: 'point', key: site.key }
    : isBuilding(site)
      ? { kind: 'building', building: site.key, regionId: site.regionId }
      : { kind: 'outpost', hostCountry: site.hostCountry, level: site.level };

/**
 * **L'infanterie posée de la saison, rangée par tenant et par point** — lue une fois par
 * réévaluation, quel que soit le nombre de captures : pas en marche, pas ailleurs.
 */
async function infantryByPoint(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyMap<string, ReadonlyArray<Doc<'troops'>>>> {
  const marching = new Set(
    (await seasonMovements(ctx, seasonId)).flatMap((movement) => movement.troopIds),
  );
  const byPoint = new Map<string, Array<Doc<'troops'>>>();
  for (const troop of await seasonTroops(ctx, seasonId)) {
    const address = troop.stationedAt;
    if (troop.role !== 'infantry' || marching.has(troop._id)) continue;
    if (address === null || typeof address === 'string') continue;
    const key = pointKey(troop.playerId, address);
    byPoint.set(key, [...(byPoint.get(key) ?? []), troop]);
  }
  return byPoint;
}

const pointKey = (playerId: Id<'players'>, point: { lon: number; lat: number }) =>
  `${playerId}@${point.lon},${point.lat}`;

const capturersOf = (
  byPoint: ReadonlyMap<string, ReadonlyArray<Doc<'troops'>>>,
  capture: Pick<Capture, 'playerId' | 'point'>,
) => byPoint.get(pointKey(capture.playerId, capture.point)) ?? [];

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
  capture: Pick<Capture, 'seasonId' | 'playerId' | 'defenderId' | 'site' | 'point'>,
  at: number,
  notice:
    | { kind: 'captureStarted'; completesAt: number }
    | { kind: 'captureSucceeded' }
    | { kind: 'captureCancelled'; reason: 'left' | 'gone' },
): Promise<void> {
  /** Le siège irrégulier ne lit rien : un point neutre ne prévient personne. */
  const defended = (await ctx.db.get(capture.defenderId))?.irregular !== true;
  const sides: ReadonlyArray<readonly [Id<'players'>, 'capturer' | 'defender']> = [
    [capture.playerId, 'capturer'],
    ...(defended ? [[capture.defenderId, 'defender'] as const] : []),
  ];
  for (const [playerId, side] of sides) {
    await ctx.db.insert('notices', {
      playerId,
      at,
      side,
      site: capture.site,
      point: capture.point,
      ...notice,
    });
  }
  /** **L'alarme quitte l'écran en Mondiale** : on ne joue pas devant la carte, et c'est la seule
   *  heure de perte du jeu. En Blitz tout le monde est là, et il n'y a pas de notification. */
  const phrase =
    notice.kind === 'captureStarted'
      ? push.captureThreat
      : notice.kind === 'captureSucceeded'
        ? push.siteLost
        : null;
  if (phrase !== null && (await seasonModeOf(ctx, capture.seasonId)) === 'mondiale') {
    await notifyPlayer(ctx, capture.defenderId, { type: 'attack', phrase, url: journalUrl, at });
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
    /** Un chantier vidé de sa garnison tombe avec elle (révision du 15/09), comme sous une
     *  attaque : il n'y a alors plus rien à capturer, et la colonne rentre. */
    if (defence.outpostId !== null) await collapseIfAbandoned(ctx, defence.outpostId, now);
    const still = await targetOf(ctx, aimed, movement.playerId, movement.seasonId);
    if (!holds || still === null) {
      if (holds) {
        await walkHome(ctx, { winners: standing, beaten: [] }, pointOf(movement.to), now);
      }
      await forgetMovement(ctx, movement._id);
      return;
    }
  }

  for (const troop of standing) await ctx.db.patch(troop._id, { stationedAt: movement.to });
  await forgetMovement(ctx, movement._id);
  if (await surrenderedInBlitz(ctx, movement.playerId)) {
    const refused = {
      seasonId: movement.seasonId,
      playerId: movement.playerId,
      defenderId: ownerOf(site) ?? (await irregularSeat(ctx, movement.seasonId)),
      site: siteOf(site),
      point: movement.to,
    };
    await notifyBoth(ctx, refused, now, { kind: 'captureCancelled', reason: 'left' });
    return;
  }
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
  const sameSite = mine.filter((capture) => targetIdOf(capture.target) === targetIdOf(target));
  /** Un renfort qui rejoint une capture en cours la relève, il n'en ouvre pas une seconde. */
  const running = sameSite.find(
    (capture) =>
      capture.stoppedAt === undefined &&
      capture.point.lon === movement.to.lon &&
      capture.point.lat === movement.to.lat,
  );
  if (running !== undefined) {
    await reassessOne(ctx, running, now, await infantryByPoint(ctx, movement.seasonId));
    return;
  }
  for (const stopped of sameSite) await ctx.db.delete(stopped._id);

  /** Un point neutre se prend sur le siège irrégulier, qui ne dort pas. */
  const defenderId = ownerOf(site) ?? (await irregularSeat(ctx, movement.seasonId));
  const defender = await ctx.db.get(defenderId);
  const mode = await seasonModeOf(ctx, movement.seasonId);
  const clock: CaptureClock = {
    progress: 0,
    at: now,
    rate: rateOf(troops),
    durationMs: captureDurationMs(
      mode,
      isPoint(site)
        ? { kind: 'point' }
        : isBuilding(site)
          ? { kind: 'building', key: site.key }
          : { kind: 'outpost' },
      (await ctx.db.get(movement.seasonId))?.hqCaptureHours,
    ),
    rest:
      mode === 'mondiale' && defender !== null && defender.irregular !== true
        ? defender.restWindow
        : null,
  };
  const capture = {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    defenderId,
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
async function reassessOne(
  ctx: MutationCtx,
  capture: Capture,
  now: number,
  byPoint: ReadonlyMap<string, ReadonlyArray<Doc<'troops'>>>,
): Promise<void> {
  /** **Échue, elle est faite** : le rendez-vous de `complete` peut se réveiller après l'heure,
   *  et ce qui arrive entre-temps à l'infanterie n'efface pas une capture déjà achevée. */
  if (capture.completesAt <= now) return;
  const site = await targetOf(ctx, capture.target, capture.playerId, capture.seasonId);
  const troops = capturersOf(byPoint, capture);
  if (site === null || !stillHeldBy(site, capture.defenderId)) {
    await stop(ctx, capture, now, 'gone');
    return;
  }
  if (troops.length === 0) {
    await stop(ctx, capture, now, 'left');
    return;
  }
  const rate = rateOf(troops);
  if (rate === capture.rate) return;
  const progress = progressAt(clockOf(capture), now);
  const due = completesAt({ ...clockOf(capture), progress, at: now, rate });
  await ctx.db.patch(capture._id, { progress, progressAt: now, rate, completesAt: due });
  await schedule(ctx, capture._id, due);
}

/**
 * **Deux fins, deux lecteurs.** L'infanterie est partie ou morte (`left`) : les deux camps
 * l'apprennent, et la ligne reste au capteur pour qu'il relance. Le site n'est plus à viser —
 * rasé, ou pris par un autre (`gone`) : seul le capteur l'apprend, le défenseur sait déjà ce
 * qui est arrivé à son site, et il n'y a rien à relancer.
 */
async function stop(
  ctx: MutationCtx,
  capture: Capture,
  now: number,
  reason: 'left' | 'gone',
): Promise<void> {
  if (reason === 'gone') {
    await ctx.db.delete(capture._id);
    await ctx.db.insert('notices', {
      playerId: capture.playerId,
      at: now,
      kind: 'captureCancelled',
      side: 'capturer',
      site: capture.site,
      point: capture.point,
      reason,
    });
    return;
  }
  await ctx.db.patch(capture._id, { stoppedAt: now });
  await notifyBoth(ctx, capture, now, { kind: 'captureCancelled', reason });
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
  if (running.length === 0) return;
  const byPoint = await infantryByPoint(ctx, seasonId);
  for (const capture of running) await reassessOne(ctx, capture, now, byPoint);
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
    if (await surrenderedInBlitz(ctx, capture.playerId)) {
      await stop(ctx, capture, expectedAt, 'left');
      return;
    }
    const now = expectedAt;
    const byPoint = await infantryByPoint(ctx, capture.seasonId);
    const site = await targetOf(ctx, capture.target, capture.playerId, capture.seasonId);
    if (site === null || !stillHeldBy(site, capture.defenderId)) {
      await stop(ctx, capture, now, 'gone');
      return;
    }
    const loser = (await ctx.db.get(capture.defenderId))!;
    const mode = await seasonModeOf(ctx, capture.seasonId);

    const before = await settleBeforeChange(ctx, capture.seasonId, now);
    /** Le débit des fonds change avec la main qui tient le site : régler les deux avant. */
    if (mode === 'blitz') {
      await settleFunds(ctx, capture.playerId, now);
      await settleFunds(ctx, loser._id, now);
    }
    const taken: Array<Doc<'buildings'>> = [];
    /** **Un QG de départ tombé élimine son joueur** (B10, M2a), qui sort de la guerre
     *  (`leaveTheWar`, plus bas). En Blitz il emporte tout : ses bâtiments passent au capteur,
     *  ses troupes disparaissent. En Mondiale le capteur ne prend que le QG et le stock au-dessus
     *  du seuil scellé ; le reste passe au siège irrégulier (`toIrregulars`). */
    const falls = isBuilding(site) && site.homeOf === loser._id;
    if (falls && mode === 'mondiale') {
      await releaseBuilding(ctx, loser, site, now);
      await ctx.db.patch(site._id, {
        playerId: capture.playerId,
        capturedAt: now,
        level: Math.max(1, site.level - 1),
      });
      taken.push(site);
      await seizeAboveTheSeal(ctx, loser._id, capture.playerId, now);
      await toIrregulars(ctx, capture, loser, now);
    } else if (isPoint(site)) {
      await takePoint(ctx, site, capture.playerId, now);
    } else if (isBuilding(site)) {
      for (const building of falls ? await playerBuildings(ctx, loser._id) : [site]) {
        await releaseBuilding(ctx, loser, building, now);
        await ctx.db.patch(building._id, {
          playerId: capture.playerId,
          capturedAt: now,
          level: mode === 'mondiale' ? Math.max(1, building.level - 1) : building.level,
        });
        taken.push(building);
      }
      if (falls) {
        await disband(ctx, loser._id, now);
        await handOverSieges(ctx, capture, capture.playerId, now);
      }
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
      for (const troop of capturersOf(byPoint, capture)) {
        await ctx.db.patch(troop._id, { stationedAt: site._id });
      }
    }
    if (taken.some((building) => canonicalBuildingKey(building.key) === 'warehouse')) {
      await clipToStorage(ctx, loser._id, now);
    }
    await reportChange(ctx, capture.seasonId, before, now);

    await ctx.db.delete(captureId);
    await notifyBoth(ctx, capture, now, { kind: 'captureSucceeded' });
    const point = isBuilding(site) ? pointOfBuilding(site) : pointOf(site.point);
    await surveyFromPoint(ctx, capture.playerId, point, now);
    if (loser.irregular !== true) await surveyFromPoint(ctx, loser._id, point, now);
    await ctx.scheduler.runAfter(0, internal.constructions.resume, { playerId: loser._id });
    await reassessDetection(ctx, capture.seasonId, now);
    /** Un joueur qui avait capitulé perd son QG sans sortir une seconde fois de la guerre. */
    if (falls && loser.defeated !== true) {
      const capturer = (await ctx.db.get(capture.playerId))!;
      await leaveTheWar(
        ctx,
        (await ctx.db.get(capture.seasonId))!,
        (await ctx.db.get(loser._id))!,
        now,
        {
          kind: 'playerEliminated',
          by: capturer.nation ?? capturer.nickname,
          capturerId: capturer._id,
          irregulars: mode === 'mondiale',
        },
      );
    }
  },
});

/**
 * **Un point stratégique change de teneur** (P1-P3) : sa règle passe avec lui, et toute la table
 * l'apprend — un point tenu est public. Le teneur le garde sans garnison.
 */
async function takePoint(
  ctx: MutationCtx,
  point: Doc<'strategicPoints'>,
  takerId: Id<'players'>,
  now: number,
): Promise<void> {
  await handOver(ctx, point, takerId, now);
  const taker = await ctx.db.get(takerId);
  for (const seat of await seatsOf(ctx, point.seasonId)) {
    await ctx.db.insert('notices', {
      playerId: seat._id,
      at: now,
      kind: 'pointTaken',
      key: point.key,
      nation: taker?.nation ?? taker?.nickname ?? '',
      point: point.point,
    });
  }
}

/**
 * **En Blitz, qui a déposé les armes ne prend plus rien** : sa capture d'un QG éliminerait un
 * belligérant au profit d'un observateur. En Mondiale ses troupes tiennent et agissent comme
 * avant (décision du 31/08), captures comprises.
 */
async function surrenderedInBlitz(ctx: QueryCtx, playerId: Id<'players'>): Promise<boolean> {
  const player = await ctx.db.get(playerId);
  return player?.defeated === true && (await seasonModeOf(ctx, player.seasonId)) === 'blitz';
}

/** **Ses troupes disparaissent** (B10), en marche comme posées, et ses captures avec elles. */
async function disband(ctx: MutationCtx, playerId: Id<'players'>, now: number): Promise<void> {
  for (const movement of await movementsOf(ctx, playerId)) {
    await forgetMovement(ctx, movement._id, now);
  }
  for (const troop of await ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect()) {
    await ctx.db.delete(troop._id);
  }
  await dropCapturesOf(ctx, playerId, now);
}

/** Les captures que l'éliminé menait s'arrêtent, dites aux deux côtés. */
async function dropCapturesOf(ctx: MutationCtx, playerId: Id<'players'>, now: number) {
  for (const capture of await ctx.db
    .query('captures')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect()) {
    if (capture.stoppedAt === undefined) {
      await notifyBoth(ctx, capture, now, { kind: 'captureCancelled', reason: 'left' });
    }
    await ctx.db.delete(capture._id);
  }
}

/**
 * **Le capteur prend le stock au-dessus du seuil scellé** (R7, R12) : ce qui est sous
 * `BASE_CAP` ne se pille jamais, et ne se prend pas davantage à la chute. Il entre comme un
 * butin, dans la place libre de ses magasins (`creditToStorage`) ; le reste se perd.
 */
async function seizeAboveTheSeal(
  ctx: MutationCtx,
  loserId: Id<'players'>,
  capturerId: Id<'players'>,
  now: number,
): Promise<void> {
  const seized = lootFromSurplus(
    (await economyOf(ctx, loserId, now)).stocks,
    BASE_CAP,
    Number.POSITIVE_INFINITY,
  );
  await debit(ctx, loserId, seized, now);
  await creditToStorage(ctx, capturerId, seized, now);
}

/**
 * **Le reste de l'éliminé devient un siège irrégulier** (M16) : ses bâtiments, ses avant-postes
 * et ses troupes passent au siège sans compte des objectifs neutres, qui ne joue pas et ne se
 * défend que sur place. Chacun peut les capturer et les piller. Une colonne en marche s'arrête
 * où elle est ; un bâtiment passé colore sa région pour le siège, comme une capture.
 */
async function toIrregulars(
  ctx: MutationCtx,
  fall: Capture,
  loser: Doc<'players'>,
  now: number,
): Promise<void> {
  const irregularId = await irregularSeat(ctx, fall.seasonId);
  for (const building of await playerBuildings(ctx, loser._id)) {
    await releaseBuilding(ctx, loser, building, now);
    await ctx.db.patch(building._id, { playerId: irregularId, capturedAt: now });
  }
  for (const outpost of await ctx.db
    .query('outposts')
    .withIndex('byPlayer', (q) => q.eq('playerId', loser._id))
    .collect()) {
    await cancelRaisesOf(ctx, loser._id, outpost, now);
    await ctx.db.patch(outpost._id, { playerId: irregularId });
  }
  /** Une colonne à terre s'arrête où elle est ; une colonne en mer sombre avec ses coques —
   *  un siège irrégulier ne navigue pas, et personne ne capture le large. */
  for (const movement of await movementsOf(ctx, loser._id)) {
    const [lon, lat] = positionAt(marchingForce(movement), now);
    const ashore = landAtPoint([lon, lat]);
    for (const troopId of movement.troopIds) {
      if (ashore) await ctx.db.patch(troopId, { stationedAt: { lon, lat } });
      else await ctx.db.delete(troopId);
    }
    await forgetMovement(ctx, movement._id, now);
  }
  /** Ses chantiers tombent avec lui : un bâtiment ne se pose pas au nom d'un éliminé. */
  for (const work of await ctx.db
    .query('constructions')
    .withIndex('byPlayer', (q) => q.eq('playerId', loser._id))
    .collect()) {
    await ctx.db.delete(work._id);
  }
  for (const troop of await ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', loser._id))
    .collect()) {
    /** Sa tournée tombe avec lui : un siège irrégulier ne ravitaille personne. */
    if (troop.tour !== undefined) await stopTour(ctx, troop, now, 'cut');
    await ctx.db.patch(troop._id, { playerId: irregularId });
  }
  await dropCapturesOf(ctx, loser._id, now);
  await handOverSieges(ctx, fall, irregularId, now);
}

/**
 * **Les sièges des biens de l'éliminé suivent leur nouveau propriétaire** — le capteur en Blitz,
 * le siège irrégulier en Mondiale. Celui que mène ce nouveau propriétaire s'efface sans bruit, le
 * site lui revient déjà ; celui d'un autre continue contre lui, et un joueur l'apprend comme une
 * capture qui s'ouvre.
 */
async function handOverSieges(
  ctx: MutationCtx,
  fall: Capture,
  heirId: Id<'players'>,
  now: number,
): Promise<void> {
  const heir = await ctx.db.get(heirId);
  for (const siege of await ctx.db
    .query('captures')
    .withIndex('byDefender', (q) => q.eq('defenderId', fall.defenderId))
    .collect()) {
    if (siege._id === fall._id) continue;
    if (siege.playerId === heirId) {
      await ctx.db.delete(siege._id);
      continue;
    }
    await ctx.db.patch(siege._id, { defenderId: heirId });
    /** **Le siège irrégulier ne dort pas** (M15) : la capture qu'il hérite ne se fige plus aux
     *  heures de l'éliminé, et son échéance se reprend d'ici. */
    if (heir?.irregular === true && siege.rest !== null && siege.stoppedAt === undefined) {
      const progress = progressAt(clockOf(siege), now);
      const due = completesAt({ ...clockOf(siege), progress, at: now, rest: null });
      await ctx.db.patch(siege._id, { rest: null, progress, progressAt: now, completesAt: due });
      await schedule(ctx, siege._id, due);
    }
    if (siege.stoppedAt !== undefined || heir?.irregular === true) continue;
    await ctx.db.insert('notices', {
      playerId: heirId,
      at: now,
      kind: 'captureStarted',
      side: 'defender',
      site: siege.site,
      point: siege.point,
      completesAt: siege.completesAt,
    });
  }
}
