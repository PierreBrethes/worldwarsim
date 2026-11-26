import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalMutation, internalQuery, mutation } from './_generated/server';
import { fail } from './errors';
import { nicknameKey } from '../src/domain/account';
import { botAdditionRefusalOf, botNicknameOf, botRemovalRefusalOf } from '../src/domain/lobby-bots';
import { LISTED_MINIMUM } from '../src/domain/listing';
import { modeOf } from '../src/domain/season-mode';
import {
  erasePlayer,
  eraseBot,
  freeNations,
  maximumOf,
  planBotRound,
  planDeparture,
  seat,
} from './seasons';
import { playerOf, seatsOf } from './seats';
import { openSession } from './sessions';

/**
 * **Des bots au salon, joués par le serveur** (#704, ADR 0042 révisée le 26/11). Le fondateur
 * d'une Mondiale assoit un bot : un compte `BotN` neuf, sans mot de passe, avec sa session, la
 * première nation libre et son tampon « prêt ». Une fois la saison lancée, `round` fait jouer
 * chaque bot par `botTurns.turn`, qui passe par la porte d'un joueur avec son jeton.
 */

/** 32 octets d'aléa, comme une session de joueur (`convex/auth.ts`) : une action, pour un aléa vrai. */
function botToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export const add = action({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }): Promise<null> => {
    await ctx.runMutation(internal.bots.seatBot, { token, seasonId, botToken: botToken() });
    return null;
  },
});

export const seatBot = internalMutation({
  args: { token: v.string(), seasonId: v.id('seasons'), botToken: v.string() },
  handler: async (ctx, { token, seasonId, botToken }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const present = await seatsOf(ctx, season._id);
    const refusal = botAdditionRefusalOf({
      founder: player.creator,
      status: season.status,
      seats: present.length,
      maximum: maximumOf(season),
      mode: modeOf(season.mode),
    });
    if (refusal === 'LOBBY_FULL') fail(refusal, { maximum: maximumOf(season) });
    if (refusal !== null) fail(refusal);
    const nation = freeNations(present)[0];
    if (nation === undefined) fail('NO_FREE_NATION');

    const taken = new Set(
      (
        await ctx.db
          .query('accounts')
          .withIndex('byNicknameKey', (q) => q.gte('nicknameKey', 'bot').lt('nicknameKey', 'bou'))
          .collect()
      ).map((account) => account.nicknameKey),
    );
    const nickname = botNicknameOf((candidate) => taken.has(nicknameKey(candidate)));
    const accountId = await ctx.db.insert('accounts', {
      nickname,
      nicknameKey: nicknameKey(nickname),
      passwordHash: '',
      salt: '',
      iterations: 0,
      createdAt: Date.now(),
      bot: true,
    });
    await openSession(ctx, accountId, botToken);
    const account = (await ctx.db.get(accountId))!;
    const playerId = await seat(ctx, account, season._id, false, { nation });
    await ctx.db.insert('bots', { seasonId: season._id, playerId, accountId, token: botToken });
    await planDeparture(ctx, season._id);
  },
});

export const remove = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), playerId: v.id('players') },
  handler: async (ctx, { token, seasonId, playerId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const bot = await ctx.db
      .query('bots')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .unique();
    const refusal = botRemovalRefusalOf({
      founder: player.creator,
      status: season.status,
      bot: bot !== null && bot.seasonId === season._id,
      departureAt: season.listed === true ? (season.departureAt ?? null) : null,
      seats: (await seatsOf(ctx, season._id)).length,
      minimum: LISTED_MINIMUM,
    });
    if (refusal === 'DEPARTURE_FIXED_MINIMUM') fail(refusal, { minimum: LISTED_MINIMUM });
    if (refusal !== null) fail(refusal);
    await erasePlayer(ctx, playerId);
    await ctx.db.delete(playerId);
    await eraseBot(ctx, bot!);
    await ctx.db.patch(season._id, { playerCount: (await seatsOf(ctx, season._id)).length });
    /** Relu comme à l'ajout ; un départ fixé ne se défait pas (#654), le refus l'a gardé. */
    await planDeparture(ctx, season._id);
  },
});

/**
 * **Une passe des bots** : chacun joue dans sa propre action (`botTurns.turn`), qui reste ainsi
 * sous les limites d'une action quel que soit leur nombre, puis la passe suivante se planifie.
 * Elle s'arrête d'elle-même quand la saison n'est plus lancée ; un bot défait ne joue plus, et
 * un bot dont le passage précédent n'a pas fini saute la passe.
 */
export const round = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched') return;
    for (const bot of await ctx.db
      .query('bots')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect()) {
      const seated = await ctx.db.get(bot.playerId);
      if (seated === null || seated.defeated === true) continue;
      if (bot.turnJobId !== undefined) {
        const previous = await ctx.db.system.get(bot.turnJobId);
        const kind = previous?.state.kind;
        if (kind === 'pending' || kind === 'inProgress') continue;
      }
      const turnJobId = await ctx.scheduler.runAfter(0, internal.botTurns.turn, { botId: bot._id });
      await ctx.db.patch(bot._id, { turnJobId });
    }
    await planBotRound(ctx, seasonId);
  },
});

/** Le siège d'un bot, jeton compris : lu par sa seule action, jamais servi au client. */
export const seatOfBot = internalQuery({
  args: { botId: v.id('bots') },
  handler: async (ctx, { botId }) => {
    const bot = await ctx.db.get(botId);
    return bot === null ? null : { token: bot.token, seasonId: bot.seasonId };
  },
});
