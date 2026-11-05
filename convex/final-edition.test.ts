import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { EMPTY_TALLY } from '../src/domain/final-edition';
import { nominalStrength } from './constants';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, holdPoint, joinSeat, seatDoc, signIn, type Seat } from './seats.fixture';

/**
 * **L'édition finale d'une Mondiale survit à sa saison** (#443). Ce qui est sous test : la chaîne
 * de clôture écrit l'archive après la conclusion, sans jamais la retenir ; le télégraphe s'efface
 * derrière le compte des dépêches ; seule une saison conclue se lit, et par ses seuls joueurs.
 * Le calcul (rang, moments, plus beau coup) est testé sans base (`src/domain/final-edition.test.ts`).
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre');
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
}

/** Une dépêche toutes les deux secondes : le télégraphe en refuse deux dans la même. */
async function post(t: ReturnType<typeof boot>, seat: Seat, text: string, to?: Seat) {
  vi.advanceTimersByTime(2000);
  const recipient = to === undefined ? {} : { to: (await seatDoc(t, to))._id };
  await t.mutation(api.messages.post, { ...seat, text, ...recipient });
}

/**
 * **La chaîne, maillon après maillon**, avant le repli de l'effacement : sous `runAllTimers`, le
 * repli d'une demi-heure partirait en même temps que le premier maillon, ce qui n'arrive jamais
 * en vrai. Puis tout ce qui reste.
 */
async function closeTheSeason(t: ReturnType<typeof boot>) {
  for (let link = 0; link < 40; link++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
  }
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

const messagesOf = (t: ReturnType<typeof boot>, seat: Seat) =>
  t.run(async (ctx) =>
    ctx.db
      .query('messages')
      .withIndex('bySeason', (q) => q.eq('seasonId', seat.seasonId))
      .collect(),
  );

/** Une passe gagnée par la France sur l'URSS : deux pièces soviétiques détruites, une française. */
async function passWonByFrance(t: ReturnType<typeof boot>, seat: Seat, guest: Seat) {
  const france = await seatDoc(t, seat);
  const ussr = await seatDoc(t, guest);
  const strength = nominalStrength('infantry', 1);
  const troop = (side: 'attacker' | 'defender', destroyed: boolean) => ({
    troopId: france._id as never,
    side,
    role: 'infantry' as const,
    tier: 1 as const,
    strengthBefore: strength,
    strengthAfter: destroyed ? 0 : strength,
    state: destroyed ? ('destroyed' as const) : ('standing' as const),
  });
  await t.run(async (ctx) => {
    const troopId = await ctx.db.insert('troops', {
      seasonId: seat.seasonId,
      playerId: france._id,
      role: 'infantry',
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt: null,
    });
    await ctx.db.insert('engagements', {
      seasonId: seat.seasonId,
      attackerId: france._id,
      defenderId: ussr._id,
      cause: 'arrival',
      point: { lon: 24.03, lat: 49.84 },
      hostCountry: 'UKR',
      at: Date.now(),
      winner: 'attacker',
      outpostId: null,
      disabledUntil: null,
      troops: [
        { ...troop('attacker', true), troopId },
        { ...troop('attacker', false), troopId },
        { ...troop('defender', true), troopId },
        { ...troop('defender', true), troopId },
      ],
    });
  });
}

describe('the final edition of a Mondiale', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('is written after a closing by hand, with the telegraph counted before it is erased', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await post(t, seat, 'un');
    await post(t, seat, 'deux');
    await post(t, seat, 'trois');
    await post(t, guest, 'réponse');
    await post(t, seat, 'en privé', guest);
    await post(t, seat, 'encore', guest);
    await passWonByFrance(t, seat, guest);

    await t.mutation(api.seasons.conclude, seat);
    await closeTheSeason(t);

    const edition = (await t.query(api.finalEdition.ofSeason, seat))!;
    expect(edition.verdict).toEqual({ reason: 'closed', closedBy: 'france', winnerNation: null });
    const page = Object.fromEntries(edition.nations.map((one) => [one.nation, one]));
    /** Le canal général seul : les deux messages privés ne comptent pas (décision du 04/11). */
    expect(page.france!.figures.dispatches).toBe(3);
    expect(page.ussr!.figures.dispatches).toBe(1);
    expect(await messagesOf(t, seat)).toEqual([]);

    expect(page.france!.figures).toMatchObject({ destroyed: 2, lost: 1 });
    expect(page.ussr!.figures).toMatchObject({ destroyed: 1, lost: 2 });
    expect(page.france!.finest).toMatchObject({ kind: 'pass', nations: ['france', 'ussr'] });
    expect(edition.moments.map((moment) => moment.kind)).toEqual(['contact', 'verdict']);
    expect(page.france!.mine).toBe(true);
    expect(page.ussr!.mine).toBe(false);
    expect(JSON.stringify(edition)).not.toContain('accountId');
    /** Le sol national, lu à l'heure de la conclusion : la carte de la fin le porte. */
    expect(
      edition.regions.some(
        ({ regionId, nation }) => regionId.startsWith('FRA') && nation === 'france',
      ),
    ).toBe(true);
  });

  it('keeps every hand of the Sept, a return to neutral included, and how each nation left', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await holdPoint(t, seat, 'narvik');
    vi.advanceTimersByTime(3_600_000);
    await t.mutation(api.players.surrender, seat);
    await closeTheSeason(t);

    const edition = (await t.query(api.finalEdition.ofSeason, guest))!;
    expect(edition.verdict).toMatchObject({ reason: 'lastStanding', winnerNation: 'ussr' });
    const narvik = edition.points.find((point) => point.key === 'narvik')!;
    expect(narvik.hands.map((hand) => hand.nation)).toEqual(['france', null]);
    expect(narvik.heldMs).toEqual([{ nation: 'france', ms: 3_600_000 }]);
    const france = edition.nations.find((one) => one.nation === 'france')!;
    expect(france.exit).toEqual({ kind: 'surrendered', at: MIDDAY.getTime() + 3_600_000 });
    expect(france.losses.points).toEqual([
      { key: 'narvik', at: MIDDAY.getTime() + 3_600_000, to: null },
    ]);
  });

  it('is read by the players of the season only', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await t.mutation(api.seasons.conclude, seat);
    await closeTheSeason(t);
    const { _id: editionId } = (await t.query(api.finalEdition.ofSeason, seat))!;

    const stranger = await signIn(t, 'Nour');
    await expect(
      t.query(api.finalEdition.ofSeason, { token: stranger, seasonId: seat.seasonId }),
    ).rejects.toThrow('NOT_A_PARTICIPANT');
    await expect(t.query(api.finalEdition.read, { token: stranger, editionId })).rejects.toThrow(
      'NOT_A_PARTICIPANT',
    );
    expect(await t.query(api.finalEdition.recent, { token: stranger })).toEqual([]);
  });

  it('is refused while the season is played, and the closing chain writes nothing then', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await expect(t.query(api.finalEdition.ofSeason, seat)).rejects.toThrow('SEASON_NOT_CONCLUDED');
    const stranger = await signIn(t, 'Nour');
    await expect(
      t.query(api.finalEdition.ofSeason, { token: stranger, seasonId: seat.seasonId }),
    ).rejects.toThrow('NOT_A_PARTICIPANT');

    await t.mutation(internal.finalEdition.publish, {
      seasonId: seat.seasonId,
      from: 0,
      dispatches: {},
      journal: {},
      tally: EMPTY_TALLY,
      regions: [],
    });
    expect(await t.run(async (ctx) => ctx.db.query('finalEditions').collect())).toEqual([]);
  });

  /** Un maillon qui tombe ne retient ni la conclusion, ni l'effacement du télégraphe. */
  it('leaves the season concluded and the telegraph erased when the chain fails', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await post(t, seat, 'dernier mot');
    await t.mutation(api.seasons.conclude, seat);
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system.query('_scheduled_functions').collect())
        if (job.name.includes('countDispatches') && job.state.kind === 'pending')
          await ctx.scheduler.cancel(job._id);
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run(async (ctx) => ctx.db.get(seat.seasonId)))!.status).toBe('concluded');
    expect(await messagesOf(t, seat)).toEqual([]);
    expect(await t.query(api.finalEdition.ofSeason, seat)).toBeNull();
  });

  it("survives the founder's destroy, and stays on the account's home page", async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await t.mutation(api.seasons.conclude, seat);
    await closeTheSeason(t);
    const { _id: editionId } = (await t.query(api.finalEdition.ofSeason, seat))!;

    await t.mutation(api.seasons.destroy, seat);

    const edition = await t.query(api.finalEdition.read, { token: guest.token, editionId });
    expect(edition.nations.map((one) => one.nation).sort()).toEqual(['france', 'ussr']);
    expect(await t.query(api.finalEdition.recent, { token: guest.token })).toMatchObject([
      { editionId, nation: 'ussr', verdict: { reason: 'closed' } },
    ]);
  });
});
