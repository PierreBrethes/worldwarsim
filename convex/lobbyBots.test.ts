import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { BOT_CADENCE_MS } from './constants';
import { boot, MIDDAY } from './bot.fixture';
import { foundSeat, joinSeat, type Seat } from './seats.fixture';

/**
 * **Des bots ajoutés depuis le salon, joués par le serveur** (#704, ADR 0042 révisée le 26/11) :
 * le fondateur d'une Mondiale les assoit, et une fois la saison lancée le serveur les fait jouer
 * par la porte d'un joueur, avec leur jeton.
 */
describe('les bots du salon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const lobbyOf = (t: ReturnType<typeof boot>, seat: Seat) => t.query(api.seasons.lobby, seat);

  it('le fondateur ajoute deux bots, lance, et le serveur les joue sur deux passes par les mutations publiques', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.mutation(api.players.reserveNation, { ...founder, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...founder, ready: true });
    await t.action(api.bots.add, founder);
    await t.action(api.bots.add, founder);

    const lobby = await lobbyOf(t, founder);
    const bots = lobby.players.filter((player) => player.bot);
    expect(bots.map(({ nickname, nation, ready }) => ({ nickname, nation, ready }))).toEqual([
      { nickname: 'Bot1', nation: 'uk', ready: true },
      { nickname: 'Bot2', nation: 'usa', ready: true },
    ]);
    expect(lobby.players.find((player) => player.mine)?.bot).toBe(false);

    await t.mutation(api.seasons.launch, founder);
    const builtBy = async () =>
      t.run(async (ctx) => {
        const counts: number[] = [];
        for (const seat of await ctx.db
          .query('players')
          .withIndex('bySeason', (q) => q.eq('seasonId', founder.seasonId))
          .collect()) {
          if (seat.bot !== true) continue;
          const works = await ctx.db
            .query('buildings')
            .withIndex('byPlayer', (q) => q.eq('playerId', seat._id))
            .collect();
          counts.push(works.length);
        }
        return counts;
      });
    expect(await builtBy()).toEqual([0, 0]);

    for (let pass = 0; pass < 2; pass++) {
      vi.advanceTimersByTime(BOT_CADENCE_MS);
      await t.finishInProgressScheduledFunctions();
    }
    // Leur premier ordre est leur QG, posé par `constructions.start` avec leur jeton : il est debout.
    for (const count of await builtBy()) expect(count).toBeGreaterThan(0);
    const pending = await t.run((ctx) =>
      ctx.db.system
        .query('_scheduled_functions')
        .collect()
        .then((jobs) =>
          jobs.filter((job) => job.name.startsWith('bots') && job.state.kind === 'pending'),
        ),
    );
    expect(pending.map((job) => job.name)).toEqual(['bots:round']);
  }, 60_000);

  it("ne joue qu'avec les mutations publiques : la seule lecture interne est le siège du bot", () => {
    const turns = readFileSync(new URL('./botTurns.ts', import.meta.url), 'utf8');
    expect(turns.match(/internal\.[\w.]+/g)).toEqual(['internal.bots.seatOfBot']);
    expect(turns.match(/ctx\.runMutation\(/g)).toHaveLength(1);
    expect(turns).toContain('submitBotOrder(');
    const orders = readFileSync(new URL('./botOrders.ts', import.meta.url), 'utf8');
    expect(orders).not.toMatch(/internal/);
  });

  it("refuse qui n'est pas le fondateur, une saison lancée, un salon plein et la Blitz", async () => {
    const t = boot();
    const { seat: founder, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Paul');
    await expect(t.action(api.bots.add, guest)).rejects.toThrow('BOTS_FOUNDER_ONLY');

    await t.mutation(api.seasons.configure, { ...founder, seatCap: 3 });
    await t.action(api.bots.add, founder);
    await expect(t.action(api.bots.add, founder)).rejects.toThrow('LOBBY_FULL');

    for (const seat of [founder, guest]) {
      await t.mutation(api.players.reserveNation, {
        ...seat,
        nation: seat === founder ? 'germany' : 'italy',
      });
      await t.mutation(api.players.declareReady, { ...seat, ready: true });
    }
    await t.mutation(api.seasons.launch, founder);
    await expect(t.action(api.bots.add, founder)).rejects.toThrow('SEASON_ALREADY_LAUNCHED');

    const blitzToken = (await foundSeat(t, 'Jeanne')).seat.token;
    const blitz = await t.mutation(api.seasons.create, {
      token: blitzToken,
      compensation: 0,
      mode: 'blitz',
      theatre: 'europe',
    });
    await expect(
      t.action(api.bots.add, { token: blitzToken, seasonId: blitz.seasonId }),
    ).rejects.toThrow('BOTS_MONDIALE_ONLY');
  }, 30_000);

  it('le fondateur retire un bot avant le lancement, et ne retire jamais un joueur', async () => {
    const t = boot();
    const { seat: founder, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Paul');
    await t.action(api.bots.add, founder);
    const before = await lobbyOf(t, founder);
    const bot = before.players.find((player) => player.bot)!;
    const human = before.players.find((player) => player.nickname === 'Paul')!;

    await expect(t.mutation(api.bots.remove, { ...guest, playerId: bot.id })).rejects.toThrow(
      'BOTS_FOUNDER_ONLY',
    );
    await expect(t.mutation(api.bots.remove, { ...founder, playerId: human.id })).rejects.toThrow(
      'NOT_A_BOT',
    );

    await t.mutation(api.bots.remove, { ...founder, playerId: bot.id });
    const after = await lobbyOf(t, founder);
    expect(after.players.map((player) => player.nickname)).toEqual(['Pierre', 'Paul']);
    const left = await t.run(async (ctx) => ({
      bots: await ctx.db.query('bots').collect(),
      accounts: (await ctx.db.query('accounts').collect()).filter((a) => a.bot === true),
      season: await ctx.db.get(founder.seasonId),
    }));
    expect(left.bots).toEqual([]);
    expect(left.accounts).toEqual([]);
    expect(left.season?.playerCount).toBe(2);
    // Le pseudo libéré resert au bot suivant.
    await t.action(api.bots.add, founder);
    expect((await lobbyOf(t, founder)).players.find((p) => p.bot)?.nickname).toBe('Bot1');
  }, 30_000);

  it('un bot reste prêt quand le fondateur change ses ordres', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.action(api.bots.add, founder);
    await t.mutation(api.seasons.configure, { ...founder, seatCap: 6 });
    expect((await lobbyOf(t, founder)).players.find((p) => p.bot)?.ready).toBe(true);
  });

  it("un compte de bot n'ouvre aucune connexion par pseudo", async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.action(api.bots.add, founder);
    await expect(
      t.action(api.auth.login, { nickname: 'Bot1', password: 'n-importe-quoi' }),
    ).rejects.toThrow('BAD_CREDENTIALS');
    // Refusé comme un pseudo que personne ne tient : sans tentative examinée, sans dérivation.
    const bot = await t.run(async (ctx) =>
      (await ctx.db.query('accounts').collect()).find((account) => account.bot === true),
    );
    expect(bot?.loginAttemptAt).toBeUndefined();
  });

  it('la boucle des bots s’arrête quand la saison est conclue', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.mutation(api.players.reserveNation, { ...founder, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...founder, ready: true });
    await t.action(api.bots.add, founder);
    await t.mutation(api.seasons.launch, founder);
    await t.mutation(api.seasons.conclude, founder);
    vi.advanceTimersByTime(BOT_CADENCE_MS);
    await t.finishInProgressScheduledFunctions();
    const rounds = await t.run((ctx) =>
      ctx.db.system
        .query('_scheduled_functions')
        .collect()
        .then((jobs) =>
          jobs.filter((job) => job.name.startsWith('bots') && job.state.kind === 'pending'),
        ),
    );
    expect(rounds).toEqual([]);
  }, 30_000);

  it('ne retire pas le bot d’une autre table', async () => {
    const t = boot();
    const { seat: mine } = await foundSeat(t, 'Pierre');
    const { seat: theirs } = await foundSeat(t, 'Jeanne');
    await t.action(api.bots.add, theirs);
    const bot = (await lobbyOf(t, theirs)).players.find((player) => player.bot)!;
    await expect(t.mutation(api.bots.remove, { ...mine, playerId: bot.id })).rejects.toThrow(
      'NOT_A_BOT',
    );
  });

  it('ne fait plus jouer un bot défait', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.mutation(api.players.reserveNation, { ...founder, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...founder, ready: true });
    await t.action(api.bots.add, founder);
    await t.action(api.bots.add, founder);
    await t.mutation(api.seasons.launch, founder);
    const [beaten] = await t.run((ctx) => ctx.db.query('bots').collect());
    await t.run((ctx) => ctx.db.patch(beaten!.playerId, { defeated: true }));
    vi.advanceTimersByTime(BOT_CADENCE_MS);
    await t.finishInProgressScheduledFunctions();
    const turns = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) => job.name === 'botTurns:turn',
      ),
    );
    expect(turns.map((job) => job.args[0])).toEqual([
      { botId: (await t.run((ctx) => ctx.db.query('bots').collect()))[1]!._id },
    ]);
  }, 30_000);

  it('la saison détruite emporte ses bots : jeton, session et compte', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.action(api.bots.add, founder);
    await t.mutation(api.seasons.destroy, founder);
    const left = await t.run(async (ctx) => ({
      bots: await ctx.db.query('bots').collect(),
      accounts: (await ctx.db.query('accounts').collect()).map((account) => account.nickname),
      sessions: (await ctx.db.query('sessions').collect()).length,
    }));
    expect(left).toEqual({ bots: [], accounts: ['Pierre'], sessions: 1 });
  });

  /** Un passage plus long que la cadence (isolat froid, insulaire à 68 s) ne se double pas. */
  it('saute la passe d’un bot dont le passage précédent tourne encore', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.mutation(api.players.reserveNation, { ...founder, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...founder, ready: true });
    await t.action(api.bots.add, founder);
    await t.action(api.bots.add, founder);
    await t.mutation(api.seasons.launch, founder);
    const [slow, quick] = await t.run((ctx) => ctx.db.query('bots').collect());
    // Le passage du lent ne finit pas : il reste planifié bien au-delà des deux pas.
    await t.run(async (ctx) => {
      const turnJobId = await ctx.scheduler.runAfter(100 * BOT_CADENCE_MS, internal.botTurns.turn, {
        botId: slow!._id,
      });
      await ctx.db.patch(slow!._id, { turnJobId });
    });
    // Chaque pas laisse finir les passages qu'il a planifiés : seul le lent reste en cours.
    for (let pass = 0; pass < 2; pass++) {
      vi.advanceTimersByTime(BOT_CADENCE_MS);
      await t.finishInProgressScheduledFunctions();
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
    const turnsOf = async (botId: string) =>
      (await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).filter(
        (job) => job.name === 'botTurns:turn' && job.args[0]?.botId === botId,
      ).length;
    expect(await turnsOf(slow!._id)).toBe(1);
    expect(await turnsOf(quick!._id)).toBe(2);
  }, 30_000);

  it('ne tient qu’une boucle par saison, même si une seconde a été planifiée', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.mutation(api.players.reserveNation, { ...founder, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...founder, ready: true });
    await t.action(api.bots.add, founder);
    await t.mutation(api.seasons.launch, founder);
    await t.run((ctx) =>
      ctx.scheduler.runAfter(BOT_CADENCE_MS, internal.bots.round, { seasonId: founder.seasonId }),
    );
    for (let pass = 0; pass < 2; pass++) {
      vi.advanceTimersByTime(BOT_CADENCE_MS);
      await t.finishInProgressScheduledFunctions();
    }
    const rounds = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) => job.name === 'bots:round' && job.state.kind === 'pending',
      ),
    );
    expect(rounds).toHaveLength(1);
    const season = await t.run((ctx) => ctx.db.get(founder.seasonId));
    expect(season?.roundJobId).toBe(rounds[0]!._id);
  }, 30_000);

  it('refuse le retrait d’un bot qui ferait passer une annonce au départ fixé sous son minimum', async () => {
    const t = boot();
    const { seat: founder } = await foundSeat(t, 'Pierre');
    await t.mutation(api.seasons.configure, { ...founder, listed: true });
    for (let k = 0; k < 3; k++) await t.action(api.bots.add, founder);
    expect((await lobbyOf(t, founder)).listing?.departureAt).not.toBeNull();
    const bot = (await lobbyOf(t, founder)).players.find((player) => player.bot)!;
    await expect(t.mutation(api.bots.remove, { ...founder, playerId: bot.id })).rejects.toThrow(
      'DEPARTURE_FIXED_MINIMUM',
    );
    await t.action(api.bots.add, founder);
    await t.mutation(api.bots.remove, { ...founder, playerId: bot.id });
    expect((await lobbyOf(t, founder)).players).toHaveLength(4);
  }, 30_000);
});
