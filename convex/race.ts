import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { clockVerdictOf } from '../src/domain/strategic-points';
import { heldCounts } from './press';
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
    await concludeSeason(ctx, seasonId, season.raceLeaderId, Date.now(), { reason: 'points' });
  },
});

/**
 * **L'horloge sert de filet** (M4, M12) : à la durée réglée au salon, sans vainqueur, le plus
 * d'heures de points tenus l'emporte, puis le territoire. Seuls les belligérants encore debout
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
    const regions = await heldCounts(ctx, seasonId, expectedAt);
    const verdict = clockVerdictOf(
      standing.map((seat) => ({
        id: seat._id,
        heldMs: heldMsOf(seat, points, expectedAt),
        regions: regions.get(seat._id) ?? 0,
      })),
    );
    await concludeSeason(ctx, seasonId, verdict.winnerId, expectedAt, { reason: verdict.reason });
  },
});
