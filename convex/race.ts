import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { RACE_HOLD_HOURS, clockVerdictOf } from '../src/domain/strategic-points';
import { notifyPlayer } from './notifications';
import { journalUrl, push } from '../src/domain/push';
import { conqueredCounts } from './press';
import { concludeSeason } from './seasons';
import { seatsOf } from './seats';
import { heldMsOf, seasonPoints } from './strategicPoints';

/**
 * **Quatre points tenus vingt-quatre heures prennent la saison** (M1, ADR 0027 §4). Le travail
 * planifié à l'heure où le meneur a atteint quatre points se relit : s'il est passé sous la barre
 * entre-temps, `raceSince` a changé et il ne fait rien.
 */
export const closeRace = internalMutation({
  args: { seasonId: v.id('seasons'), since: v.number() },
  handler: async (ctx, { seasonId, since }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched') return;
    if (season.raceSince !== since || season.raceLeaderId === undefined) return;
    if ((await ctx.db.get(season.raceLeaderId))?.defeated === true) return;
    await concludeSeason(ctx, seasonId, season.raceLeaderId, Date.now(), { reason: 'points' });
  },
});

/**
 * **Le rappel de la course**, à `hoursLeft` heures de la fin, à toute la table. Il relit comme
 * `closeRace` : un meneur retombé, remplacé ou défait, ou une saison close, et il se tait.
 */
export const remindRace = internalMutation({
  args: { seasonId: v.id('seasons'), since: v.number(), hoursLeft: v.number() },
  handler: async (ctx, { seasonId, since, hoursLeft }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched') return;
    if (season.raceSince !== since || season.raceLeaderId === undefined) return;
    const leader = await ctx.db.get(season.raceLeaderId);
    if (leader === null || leader.defeated === true) return;
    const at = Date.now();
    const endsAt = since + RACE_HOLD_HOURS * 3_600_000;
    for (const seat of await seatsOf(ctx, seasonId)) {
      await ctx.db.insert('notices', {
        playerId: seat._id,
        at,
        kind: 'raceReminder',
        leaderNation: leader.nation ?? leader.nickname,
        endsAt,
        hoursLeft,
      });
      await notifyPlayer(ctx, seat._id, {
        type: 'season',
        phrase: push.raceLeft(hoursLeft),
        url: journalUrl,
        at,
      });
    }
  },
});

/**
 * **L'horloge sert de filet** (M4, M12) : à la durée réglée au salon, sans vainqueur, le plus
 * d'heures de points tenus l'emporte, puis les régions conquises. Seuls les belligérants encore debout
 * concourent : un éliminé ne gagne pas.
 */
export const closeAtClock = internalMutation({
  args: { seasonId: v.id('seasons'), expectedAt: v.number() },
  handler: async (ctx, { seasonId, expectedAt }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched') return;
    if (season.launchedAt === null || season.durationHours === null) return;
    if (season.launchedAt + season.durationHours * 3_600_000 !== expectedAt) return;
    const standing = (await seatsOf(ctx, seasonId)).filter((seat) => seat.defeated !== true);
    if (standing.length === 0) return;
    const points = await seasonPoints(ctx, seasonId);
    const conquered = await conqueredCounts(
      ctx,
      seasonId,
      expectedAt,
      new Map(standing.map((seat) => [seat._id as string, seat.nation])),
    );
    const verdict = clockVerdictOf(
      standing.map((seat) => ({
        id: seat._id,
        heldMs: heldMsOf(seat, points, expectedAt),
        conquered: conquered.get(seat._id) ?? 0,
      })),
    );
    await concludeSeason(ctx, seasonId, verdict.winnerId, expectedAt, { reason: verdict.reason });
  },
});
