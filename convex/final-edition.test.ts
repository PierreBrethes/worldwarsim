import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { EMPTY_TALLY } from '../src/domain/final-edition';
import { ERASE_FALLBACK_MS } from './finalEdition';
import { blitzLaunchedOn } from './blitz.fixture';
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

async function launchedSeason(t: ReturnType<typeof boot>, third?: 'germany') {
  const { seat, code } = await foundSeat(t, 'Pierre');
  const guest = await joinSeat(t, code, 'Léa');
  const seats: Array<[Seat, string]> = [
    [seat, 'france'],
    [guest, 'ussr'],
  ];
  if (third !== undefined) seats.push([await joinSeat(t, code, 'Marc'), third]);
  for (const [who, nation] of seats) {
    await t.mutation(api.players.reserveNation, { ...who, nation });
    await t.mutation(api.players.declareReady, { ...who, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest, third: seats[2]?.[0] };
}

const finalEditionsOf = (t: ReturnType<typeof boot>) =>
  t.run(async (ctx) => ({
    editions: await ctx.db.query('finalEditions').collect(),
    readers: await ctx.db.query('finalEditionReaders').collect(),
  }));

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

/** L'archive écrite, ou l'échec du test qui l'attendait. */
async function editionOf(t: ReturnType<typeof boot>, seat: Seat) {
  const read = await t.query(api.finalEdition.ofSeason, seat);
  if (read.state !== 'ready') throw new Error(`no final edition: ${read.state}`);
  return read.edition;
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

    const edition = await editionOf(t, seat);
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

    const edition = await editionOf(t, guest);
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
    const { _id: editionId } = await editionOf(t, seat);

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
    /** La chaîne a encore le temps : l'édition s'imprime. */
    expect(await t.query(api.finalEdition.ofSeason, seat)).toEqual({ state: 'pending' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run(async (ctx) => ctx.db.get(seat.seasonId)))!.status).toBe('concluded');
    expect(await messagesOf(t, seat)).toEqual([]);
    /** Le repli est passé, l'archive n'est pas venue : il n'y en aura pas. */
    expect(Date.now()).toBeGreaterThanOrEqual(MIDDAY.getTime() + ERASE_FALLBACK_MS);
    expect(await t.query(api.finalEdition.ofSeason, seat)).toEqual({ state: 'none' });
  });

  it("survives the founder's destroy, and stays on the account's home page", async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await t.mutation(api.seasons.conclude, seat);
    await closeTheSeason(t);
    const { _id: editionId } = await editionOf(t, seat);

    await t.mutation(api.seasons.destroy, seat);

    const edition = await t.query(api.finalEdition.read, { token: guest.token, editionId });
    expect(edition.nations.map((one) => one.nation).sort()).toEqual(['france', 'ussr']);
    expect(await t.query(api.finalEdition.recent, { token: guest.token })).toMatchObject([
      { editionId, nation: 'ussr', verdict: { reason: 'closed' } },
    ]);
  });

  /** Détruite avant son archive, la saison l'emporterait : le fondateur attend l'impression. */
  it('refuses the destroy between the conclusion and the archive', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await t.mutation(api.seasons.conclude, seat);
    await expect(t.mutation(api.seasons.destroy, seat)).rejects.toThrow('EDITION_PENDING');

    await closeTheSeason(t);
    await t.mutation(api.seasons.destroy, seat);
    expect((await finalEditionsOf(t)).editions).toHaveLength(1);
  });

  it('is written once, a second publish finding it there', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await t.mutation(api.seasons.conclude, seat);
    await closeTheSeason(t);
    await t.mutation(internal.finalEdition.publish, {
      seasonId: seat.seasonId,
      dispatches: {},
      journal: {},
      tally: EMPTY_TALLY,
      regions: [],
    });
    const { editions, readers } = await finalEditionsOf(t);
    expect(editions).toHaveLength(1);
    expect(readers).toHaveLength(2);
  });

  /** Un `dev:reset` passé entre la conclusion et la chaîne a emporté l'édition ordinaire. */
  it('writes nothing when the final edition line is gone', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await t.mutation(api.seasons.conclude, seat);
    await t.run(async (ctx) => {
      for (const line of await ctx.db.query('editions').collect()) await ctx.db.delete(line._id);
    });
    await closeTheSeason(t);
    expect((await finalEditionsOf(t)).editions).toEqual([]);
  });

  /** Une place qui n'est pas entrée en guerre n'a pas de page : elle n'a rien joué. */
  it('leaves out a seat that never went to war', async () => {
    const t = boot();
    const { seat, third } = await launchedSeason(t, 'germany');
    const late = (await seatDoc(t, third!))._id;
    await t.run(async (ctx) => ctx.db.patch(late, { enteredWarAt: null }));
    await t.mutation(api.seasons.conclude, seat);
    await closeTheSeason(t);
    const edition = await editionOf(t, seat);
    expect(edition.nations.map((page) => page.nation).sort()).toEqual(['france', 'ussr']);
    expect((await finalEditionsOf(t)).readers).toHaveLength(2);
  });

  /** Chaque place lit les capitulations de toutes : la sienne seule date sa sortie. */
  it('dates each surrender by its own nation, when two of three give up', async () => {
    const t = boot();
    const { seat, guest, third } = await launchedSeason(t, 'germany');
    vi.advanceTimersByTime(3_600_000);
    await t.mutation(api.players.surrender, guest);
    vi.advanceTimersByTime(2 * 3_600_000);
    await t.mutation(api.players.surrender, third!);
    await closeTheSeason(t);

    const edition = await editionOf(t, seat);
    const exitOf = (nation: string) => edition.nations.find((page) => page.nation === nation)!.exit;
    expect(exitOf('ussr')).toEqual({ kind: 'surrendered', at: MIDDAY.getTime() + 3_600_000 });
    expect(exitOf('germany')).toEqual({
      kind: 'surrendered',
      at: MIDDAY.getTime() + 3 * 3_600_000,
    });
    expect(exitOf('france')).toBeNull();
  });

  /** Un point pris avant le journal des mains (#443) n'a que son teneur et l'heure de sa prise. */
  it('starts a point held before the hands were kept at its holding', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const pointId = await holdPoint(t, seat, 'narvik');
    await t.run(async (ctx) => ctx.db.patch(pointId, { hands: undefined }));
    vi.advanceTimersByTime(3_600_000);
    await t.mutation(api.seasons.conclude, seat);
    await closeTheSeason(t);

    const narvik = (await editionOf(t, seat)).points.find((point) => point.key === 'narvik')!;
    expect(narvik.hands).toEqual([{ at: MIDDAY.getTime(), nation: 'france' }]);
  });
});

/** **La Blitz garde sa fin** (#443) : ni verdict à la main, ni archive, le télégraphe effacé. */
describe('a Blitz closed by hand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('has no verdict, no closing chain, and its telegraph erased at once', async () => {
    const t = boot();
    const [seat] = await blitzLaunchedOn(t, 'europe', 2);
    await post(t, seat!, 'dernier mot');
    await t.mutation(api.seasons.conclude, seat!);

    const jobs = await t.run(async (ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(jobs.filter((job) => job.name.includes('finalEdition'))).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    expect(await messagesOf(t, seat!)).toEqual([]);

    const season = await t.run(async (ctx) => ctx.db.get(seat!.seasonId));
    expect(season!.status).toBe('concluded');
    expect(season!.verdict).toBeUndefined();
    expect(await t.query(api.finalEdition.ofSeason, seat!)).toEqual({ state: 'none' });
    await t.mutation(api.seasons.destroy, seat!);
  });
});
