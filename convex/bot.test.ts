import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { playerViewOf } from '../src/domain/server-view';
import { BOT_POINT_COLUMN } from '../src/domain/bot';
import { boot, HOUR, MIDDAY, pass } from './bot.fixture';
import { foundSeat, joinSeat, neutralPoint, placeHq, seatIn, unclocked } from './seats.fixture';

describe("un bot joue son ouverture par la porte d'un joueur", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it("deux bots (France, URSS) ouvrent, envoient une colonne, fondent un avant-poste et ravitaillent sans qu'aucun ordre soit refusé", async () => {
    const t = boot();
    const { seat: bot, code } = await foundSeat(t, 'Bot1', 0.5);
    const idle = await joinSeat(t, code, 'Bot2');
    await t.mutation(api.players.reserveNation, { ...bot, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...bot, ready: true });
    await t.mutation(api.players.reserveNation, { ...idle, nation: 'ussr' });
    await t.mutation(api.players.declareReady, { ...idle, ready: true });
    await t.mutation(api.seasons.launch, bot);
    await unclocked(t);

    const refused: string[] = [];
    const played = { france: [] as string[], ussr: [] as string[] };
    for (let i = 0; i < 60; i++) {
      for (const seat of [bot, idle])
        await pass(t, seat, refused, played[seat === bot ? 'france' : 'ussr']);
      vi.advanceTimersByTime(HOUR);
      await t.finishInProgressScheduledFunctions();
    }
    expect(refused).toEqual([]);
    // Après l'ouverture : une colonne prend un point, une autre part, un avant-poste est fondé, un camion se charge et tourne.
    for (const nation of [played.france, played.ussr]) {
      for (const fn of [
        'movements.capture',
        'movements.marchTo',
        'movements.foundOutpostHere',
        'logistics.load',
        'tours.start',
      ])
        expect(nation).toContain(fn);
    }

    for (const seat of [bot, idle]) {
      const { me } = playerViewOf(await t.query(api.view.playerView, seat));
      // Le bot monte son QG quand il plafonne ses fermes (#652).
      expect(me.hqLevel).toBeGreaterThanOrEqual(1);
      expect(me.outposts.length).toBeGreaterThan(0);
      expect(me.foundation).toEqual([]);
      const barracks =
        me.buildings.some((b) => b.key === 'barracks') ||
        [me.construction, ...me.constructionQueue].some((work) => work?.key === 'barracks');
      expect(barracks).toBe(true);
      const workshop = await t.query(api.troops.workshop, seat);
      expect(workshop.troopsInService + workshop.troopsQueued).toBeGreaterThan(1);
    }
  }, 30_000);
});

describe("un bot prend un point neutre par la porte d'un joueur", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('envoie sa colonne du QG sur Lisbonne et le serveur accepte la capture', async () => {
    const t = boot();
    const { seat: bot, code } = await foundSeat(t, 'Bot1', 0.5);
    const idle = await joinSeat(t, code, 'Bot2');
    await t.mutation(api.players.reserveNation, { ...bot, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...bot, ready: true });
    await t.mutation(api.players.reserveNation, { ...idle, nation: 'ussr' });
    await t.mutation(api.players.declareReady, { ...idle, ready: true });
    await t.mutation(api.seasons.launch, bot);
    await unclocked(t);
    await placeHq(t, bot);
    const player = await t.run((ctx) => seatIn(ctx, bot));
    await t.run(async (ctx) => neutralPoint(ctx, player.seasonId, 'lisbon'));
    const hq = await t.run(async (ctx) =>
      (await ctx.db.query('buildings').collect()).find(
        (building) => building.playerId === player._id && building.key === 'hq',
      ),
    );
    await t.run(async (ctx) => {
      for (let rank = 0; rank < BOT_POINT_COLUMN; rank += 1)
        await ctx.db.insert('troops', {
          seasonId: player.seasonId,
          playerId: player._id,
          role: 'infantry',
          tier: 1,
          nominalStrength: 50,
          currentStrength: 50,
          stationedAt: hq!._id,
        });
    });

    const refused: string[] = [];
    const played: string[] = [];
    // Le socle et le QG passent d'abord (leurs envies sont plus fortes, deux ordres par passage).
    for (let i = 0; i < 6 && !played.includes('movements.capture'); i++) {
      await pass(t, bot, refused, played);
      vi.advanceTimersByTime(HOUR);
      await t.finishInProgressScheduledFunctions();
    }
    expect(refused).toEqual([]);
    expect(played).toContain('movements.capture');
  });
});
