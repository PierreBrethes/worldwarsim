import { v, type Infer } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, query, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  EMPTY_TALLY,
  IRREGULAR,
  finalEditionOf,
  tallyPass,
  type FinalPass,
} from '../src/domain/final-edition';
import { playableRegion } from '../src/domain/off-season';
import { modeOf } from '../src/domain/season-mode';
import { fail } from './errors';
import { heldOver } from './holding';
import { regionAtPoint } from './regionGeometry';
import { allRegions } from './regions';
import { accountOf, everySeatOf, isAtWar, seatOf, seatsOf } from './seats';
import { heldMsOf, heldMsOn, seasonPoints } from './strategicPoints';
import { HELD_REGION, PASS_TALLY, SEAT_JOURNAL } from './validators';

/**
 * **La chaîne de clôture d'une Mondiale** (#443, ADR 0040). `concludeSeason` la lance après le
 * passage en `concluded` : chaque maillon est une petite mutation qui lit une page, plie ce qu'il
 * y trouve et passe le pli au suivant ; le dernier écrit l'archive. La carte se lit en
 * un seul maillon : le coût de `heldOver` est presque tout fixe (la couleur de la saison lue
 * une fois), et le monde entier tient sous 500 ms (`view-budget.test.ts`).
 *
 * L'état est figé : plus aucun ordre, plus aucun travail ne s'écrit sur une saison conclue
 * (`requirePlayable`, `seasonStillPlays`), et la carte se relit à l'heure de la conclusion. Un
 * maillon qui échoue arrête la chaîne et rien d'autre : la saison est déjà conclue, et le repli
 * de `concludeSeason` efface le télégraphe quand même.
 *
 * L'ordre : les dépêches d'abord, parce que le télégraphe s'efface derrière elles ; puis le
 * journal de chaque place, les passes, la carte, et l'archive.
 */

/**
 * Messages, dépêches et passes par page : chaque maillon loin de la seconde.
 * @a-mesurer posés à l'œil, sans banc sur une saison de huit joueurs
 */
const MESSAGES_PAGE = 2000;
const NOTICES_PAGE = 2000;
const PASSES_PAGE = 100;

/**
 * Le télégraphe d'une Mondiale s'efface au plus tard ce délai après la conclusion, et c'est
 * aussi le temps que la chaîne a pour écrire l'archive : « en attente » jusque-là, « aucune »
 * ensuite.
 * @a-mesurer assez pour que la chaîne de clôture compte les dépêches avant
 */
export const ERASE_FALLBACK_MS = 30 * 60_000;

type SeatJournal = Infer<typeof SEAT_JOURNAL>;
const FRESH_JOURNAL: SeatJournal = {
  surrenderedAt: null,
  eliminatedBy: null,
  hqRegionId: null,
  outpostsCaptured: 0,
  outpostsLost: 0,
};

const DISPATCHES = v.record(v.id('players'), v.number());
const JOURNAL = v.record(v.id('players'), SEAT_JOURNAL);

/**
 * La saison qu'un maillon peut encore écrire : une Mondiale conclue, sans archive, et dont
 * l'édition finale ordinaire est encore là — un `dev:reset` passé entre-temps l'a emportée, et
 * une archive vide ne s'écrit jamais.
 */
async function closing(ctx: QueryCtx, seasonId: Id<'seasons'>) {
  const season = await ctx.db.get(seasonId);
  if (season === null || season.status !== 'concluded' || modeOf(season.mode) !== 'mondiale')
    return null;
  const { launchedAt, concludedAt } = season;
  if (launchedAt === null || concludedAt === undefined || concludedAt === null) return null;
  if ((await editionOfSeason(ctx, seasonId)) !== null) return null;
  const lines = await ctx.db
    .query('editions')
    .withIndex('bySeasonAt', (q) => q.eq('seasonId', seasonId).eq('at', concludedAt))
    .collect();
  if (!lines.some((line) => line.final)) return null;
  return { ...season, launchedAt, concludedAt };
}

/**
 * **L'archive s'écrit encore** : une Mondiale conclue, sans archive, dans le délai du repli.
 * Passé ce délai, la chaîne a échoué ou n'a jamais tourné (saison d'avant l'archive).
 */
export async function editionPending(
  ctx: QueryCtx,
  season: Doc<'seasons'>,
  now: number,
): Promise<boolean> {
  const concludedAt = season.concludedAt ?? null;
  return (
    season.status === 'concluded' &&
    modeOf(season.mode) === 'mondiale' &&
    concludedAt !== null &&
    now < concludedAt + ERASE_FALLBACK_MS &&
    (await editionOfSeason(ctx, season._id)) === null
  );
}

const editionOfSeason = (ctx: QueryCtx, seasonId: Id<'seasons'>) =>
  ctx.db
    .query('finalEditions')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .first();

const belligerentsOf = async (ctx: QueryCtx, season: Doc<'seasons'>) =>
  (await seatsOf(ctx, season._id)).filter((seat) => isAtWar(seat, season));

const nameOf = (seat: Doc<'players'>) =>
  seat.irregular === true ? IRREGULAR : (seat.nation ?? seat.nickname);

/** 1. **Les dépêches du canal général**, comptées avant que le télégraphe s'efface. */
export const countDispatches = internalMutation({
  args: { seasonId: v.id('seasons'), cursor: v.union(v.string(), v.null()), counts: DISPATCHES },
  handler: async (ctx, { seasonId, cursor, counts }) => {
    if ((await closing(ctx, seasonId)) === null) return;
    const page = await ctx.db
      .query('messages')
      .withIndex('byChannel', (q) =>
        q.eq('seasonId', seasonId).eq('lobby', undefined).eq('to', undefined),
      )
      .paginate({ numItems: MESSAGES_PAGE, cursor });
    const next = { ...counts };
    for (const message of page.page) next[message.playerId] = (next[message.playerId] ?? 0) + 1;
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.finalEdition.countDispatches, {
        seasonId,
        cursor: page.continueCursor,
        counts: next,
      });
      return;
    }
    await ctx.scheduler.runAfter(0, internal.messages.erase, { seasonId, lobby: false });
    await ctx.scheduler.runAfter(0, internal.finalEdition.readJournal, {
      seasonId,
      seat: 0,
      cursor: null,
      dispatches: next,
      journal: {},
    });
  },
});

/** 2. **Le journal de chaque place** : sa capitulation, sa chute, ses avant-postes. */
export const readJournal = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    seat: v.number(),
    cursor: v.union(v.string(), v.null()),
    dispatches: DISPATCHES,
    journal: JOURNAL,
  },
  handler: async (ctx, { seasonId, seat, cursor, dispatches, journal }) => {
    const season = await closing(ctx, seasonId);
    if (season === null) return;
    const player = (await belligerentsOf(ctx, season))[seat];
    if (player === undefined) {
      await ctx.scheduler.runAfter(0, internal.finalEdition.readPasses, {
        seasonId,
        seat: 0,
        cursor: null,
        dispatches,
        journal,
        tally: EMPTY_TALLY,
      });
      return;
    }
    const page = await ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .paginate({ numItems: NOTICES_PAGE, cursor });
    const facts = { ...(journal[player._id] ?? FRESH_JOURNAL) };
    const me = nameOf(player);
    for (const notice of page.page) {
      if (notice.kind === 'playerSurrendered' && notice.nation === me)
        facts.surrenderedAt ??= notice.at;
      if (notice.kind === 'playerEliminated' && notice.nation === me)
        facts.eliminatedBy = notice.by ?? null;
      if (notice.kind !== 'captureSucceeded') continue;
      if (notice.site.kind === 'outpost') {
        if (notice.side === 'capturer') facts.outpostsCaptured += 1;
        else facts.outpostsLost += 1;
      }
      if (
        notice.site.kind === 'building' &&
        notice.site.building === 'hq' &&
        notice.side === 'defender' &&
        notice.at === player.eliminatedAt
      )
        facts.hqRegionId = notice.site.regionId;
    }
    await ctx.scheduler.runAfter(0, internal.finalEdition.readJournal, {
      seasonId,
      seat: page.isDone ? seat + 1 : seat,
      cursor: page.isDone ? null : page.continueCursor,
      dispatches,
      journal: { ...journal, [player._id]: facts },
    });
  },
});

/** 3. **Les passes de résolution**, par attaquant : chacune n'en a qu'un, irréguliers compris. */
export const readPasses = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    seat: v.number(),
    cursor: v.union(v.string(), v.null()),
    dispatches: DISPATCHES,
    journal: JOURNAL,
    tally: PASS_TALLY,
  },
  handler: async (ctx, { seasonId, seat, cursor, dispatches, journal, tally }) => {
    if ((await closing(ctx, seasonId)) === null) return;
    const seats = await everySeatOf(ctx, seasonId);
    const attacker = seats[seat];
    if (attacker === undefined) {
      await ctx.scheduler.runAfter(0, internal.finalEdition.readMap, {
        seasonId,
        dispatches,
        journal,
        tally,
      });
      return;
    }
    const nations = new Map(
      seats.map((one) => [one._id, one.irregular === true ? null : one.nation] as const),
    );
    const page = await ctx.db
      .query('engagements')
      .withIndex('byAttacker', (q) => q.eq('attackerId', attacker._id))
      .paginate({ numItems: PASSES_PAGE, cursor });
    let next = tally;
    for (const engagement of page.page) {
      const destroyed = (side: 'attacker' | 'defender') =>
        engagement.troops.filter((troop) => troop.side === side && troop.state === 'destroyed')
          .length;
      const pass: FinalPass = {
        at: engagement.at,
        regionId: regionAtPoint([engagement.point.lon, engagement.point.lat])?.id ?? null,
        attacker: nations.get(engagement.attackerId) ?? null,
        defender: nations.get(engagement.defenderId) ?? null,
        winner: engagement.winner,
        engaged: engagement.troops.length,
        attackerLost: destroyed('attacker'),
        defenderLost: destroyed('defender'),
      };
      next = tallyPass(next, pass);
    }
    await ctx.scheduler.runAfter(0, internal.finalEdition.readPasses, {
      seasonId,
      seat: page.isDone ? seat + 1 : seat,
      cursor: page.isDone ? null : page.continueCursor,
      dispatches,
      journal,
      tally: next,
    });
  },
});

/** 4. **La carte de la fin**, le monde entier à l'heure de la conclusion (`heldOver`). */
export const readMap = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    dispatches: DISPATCHES,
    journal: JOURNAL,
    tally: PASS_TALLY,
  },
  handler: async (ctx, args) => {
    const season = await closing(ctx, args.seasonId);
    if (season === null) return;
    const held = await heldOver(ctx, season._id, allRegions(), season.concludedAt);
    const names = new Map(
      (await everySeatOf(ctx, season._id)).map((seat) => [seat._id as string, nameOf(seat)]),
    );
    const regions = [...held].flatMap(([regionId, owner]) => {
      const nation = names.get(owner);
      return nation === undefined ? [] : [{ regionId, nation }];
    });
    await ctx.scheduler.runAfter(0, internal.finalEdition.publish, { ...args, regions });
  },
});

/** Un point tenu depuis avant le journal des mains (#443) commence à la prise de son teneur. */
const handsOf = (point: Doc<'strategicPoints'>) =>
  point.hands ??
  (point.holderId === null || point.heldSince === null
    ? []
    : [{ at: point.heldSince, holderId: point.holderId }]);

/** 5. **L'archive**, écrite une fois : l'édition, et une ligne par compte qui l'a jouée. */
export const publish = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    dispatches: DISPATCHES,
    journal: JOURNAL,
    tally: PASS_TALLY,
    regions: v.array(HELD_REGION),
  },
  handler: async (ctx, { seasonId, dispatches, journal, tally, regions }) => {
    const season = await closing(ctx, seasonId);
    if (season === null) return;
    const { concludedAt } = season;
    const seats = await belligerentsOf(ctx, season);
    const everyone = await everySeatOf(ctx, seasonId);
    const names = new Map(everyone.map((seat) => [seat._id as string, nameOf(seat)]));
    const editions = await ctx.db
      .query('editions')
      .withIndex('bySeasonAt', (q) => q.eq('seasonId', seasonId))
      .collect();
    const finalLine = new Map(
      editions
        .filter((line) => line.final && line.at === concludedAt)
        .map((line) => [line.playerId as string, line]),
    );
    const points = await seasonPoints(ctx, seasonId);
    /** L'ordre de l'édition finale, qui est celui du territoire : le rang en sort à l'identique. */
    const ordered = [
      ...[...finalLine.keys()].flatMap((id) => seats.filter((seat) => seat._id === id)),
      ...seats.filter((seat) => !finalLine.has(seat._id)),
    ];
    const figuresOf = (line: Doc<'editions'> | undefined) => ({
      territory: line?.territory ?? 0,
      general: line?.general ?? 0,
      industry: line?.industry ?? 0,
      military: line?.military ?? 0,
      deeds: line?.deeds ?? 0,
    });

    const edition = finalEditionOf({
      concludedAt,
      verdict: {
        ...(season.verdict ?? { reason: 'closed' }),
        winnerNation: season.winnerNation ?? null,
      },
      nations: ordered.map((seat) => {
        const facts = journal[seat._id] ?? FRESH_JOURNAL;
        const eliminatedAt = seat.eliminatedAt ?? null;
        return {
          nation: nameOf(seat),
          nickname: seat.nickname,
          final: figuresOf(finalLine.get(seat._id)),
          series: editions
            .filter((line) => line.playerId === seat._id)
            .map((line) => ({ at: line.at, ...figuresOf(line) })),
          exit:
            eliminatedAt !== null
              ? { kind: 'eliminated' as const, at: eliminatedAt }
              : seat.defeated === true
                ? { kind: 'surrendered' as const, at: facts.surrenderedAt }
                : null,
          hqLost:
            eliminatedAt === null
              ? null
              : { at: eliminatedAt, regionId: facts.hqRegionId, by: facts.eliminatedBy },
          outpostsCaptured: facts.outpostsCaptured,
          outpostsLost: facts.outpostsLost,
          dispatches: dispatches[seat._id] ?? 0,
          pointHeldMs: heldMsOf(seat, points, concludedAt),
        };
      }),
      points: points.map((point) => ({
        key: point.key,
        regionId: point.regionId,
        hands: handsOf(point).map(({ at, holderId }) => ({
          at,
          nation: holderId === null ? null : (names.get(holderId) ?? null),
        })),
        heldMs: seats.flatMap((seat) => {
          const ms = heldMsOn(point, seat._id, concludedAt);
          return ms > 0 ? [{ nation: nameOf(seat), ms }] : [];
        }),
      })),
      tally,
    });

    const accountOfNation = new Map(seats.map((seat) => [nameOf(seat), seat.accountId]));
    const editionId = await ctx.db.insert('finalEditions', {
      seasonId,
      code: season.code,
      launchedAt: season.launchedAt,
      concludedAt,
      durationHours: season.durationHours,
      playableRegion: season.playableRegion ?? playableRegion(seats.length),
      verdict: edition.verdict,
      nations: edition.nations.map((page) => {
        const accountId = accountOfNation.get(page.nation);
        return accountId === undefined ? page : { ...page, accountId };
      }),
      points: edition.points,
      moments: edition.moments,
      regions,
    });
    for (const seat of seats) {
      if (seat.accountId === undefined) continue;
      await ctx.db.insert('finalEditionReaders', {
        accountId: seat.accountId,
        editionId,
        concludedAt,
      });
    }
  },
});

/**
 * **Ce que lit la page de l'édition finale** : l'archive entière, le brouillard levé — aux seuls
 * comptes qui ont joué la saison. Les comptes ne sortent pas : chaque nation dit seulement si
 * elle est la mienne.
 */
function served(edition: Doc<'finalEditions'>, account: Doc<'accounts'>) {
  if (!edition.nations.some((page) => page.accountId === account._id)) fail('NOT_A_PARTICIPANT');
  return {
    ...edition,
    nations: edition.nations.map(({ accountId, ...page }) => ({
      ...page,
      mine: accountId === account._id,
    })),
  };
}

async function readerOf(ctx: QueryCtx, token: string) {
  const account = await accountOf(ctx, token);
  if (account === null) fail('UNKNOWN_SESSION');
  return account;
}

/**
 * **L'édition finale d'une saison, depuis le plateau.** Refusée tant que la saison n'est pas
 * conclue. Sans archive, `pending` tant que la chaîne a le temps de l'écrire, `none` ensuite
 * (chaîne en échec, Blitz, saison d'avant l'archive). Une saison détruite se relit encore par
 * son identifiant.
 *
 * L'heure est celle de la lecture : une page ouverte en `pending` ne passe pas seule à `none`,
 * elle passe à `ready` quand l'archive s'écrit, ou à `none` à la lecture suivante.
 */
export const ofSeason = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const account = await readerOf(ctx, token);
    const season = await ctx.db.get(seasonId);
    /** Qui n'y a pas de place n'apprend rien de la saison, pas même où elle en est. */
    if (season !== null) {
      if ((await seatOf(ctx, account, seasonId)) === null) fail('NOT_A_PARTICIPANT');
      if (season.status !== 'concluded') fail('SEASON_NOT_CONCLUDED');
    }
    const edition = await editionOfSeason(ctx, seasonId);
    if (edition !== null) return { state: 'ready' as const, edition: served(edition, account) };
    return {
      state:
        season !== null && (await editionPending(ctx, season, Date.now()))
          ? ('pending' as const)
          : ('none' as const),
    };
  },
});

/** **Une édition finale par son identifiant**, depuis l'accueil : elle ne lit que l'archive. */
export const read = query({
  args: { token: v.string(), editionId: v.id('finalEditions') },
  handler: async (ctx, { token, editionId }) => {
    const account = await readerOf(ctx, token);
    const edition = await ctx.db.get(editionId);
    if (edition === null) fail('UNKNOWN_EDITION');
    return served(edition, account);
  },
});

/** Les éditions finales que l'accueil montre, les plus récentes d'abord. */
const RECENT = 3;

/** **Les dernières éditions finales du compte**, même d'une saison détruite : de quoi les nommer. */
export const recent = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const account = await readerOf(ctx, token);
    const rows = await ctx.db
      .query('finalEditionReaders')
      .withIndex('byAccountAt', (q) => q.eq('accountId', account._id))
      .order('desc')
      .take(RECENT);
    const editions = await Promise.all(rows.map((row) => ctx.db.get(row.editionId)));
    return editions.flatMap((edition) => {
      if (edition === null) return [];
      const mine = edition.nations.find((page) => page.accountId === account._id);
      return mine === undefined
        ? []
        : [
            {
              editionId: edition._id,
              seasonId: edition.seasonId,
              code: edition.code,
              concludedAt: edition.concludedAt,
              playableRegion: edition.playableRegion,
              verdict: edition.verdict,
              nation: mine.nation,
              rank: mine.rank,
              nations: edition.nations.length,
            },
          ];
    });
  },
});
