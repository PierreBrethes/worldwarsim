import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { regionFacts } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { attacking, foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Le rejeu sert le détail de mon seul camp** (ADR 0026 §7). Les frappes portent les rôles des
 * deux camps ; ce qui sort d'ici n'en porte qu'un, et l'autre reste les totaux du compte rendu.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310';
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const NATIONS = ['france', 'ussr', 'germany'] as const;

type Bench = ReturnType<typeof boot>;

async function launched(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const seats = [seat, await joinSeat(t, code, 'Ivan'), await joinSeat(t, code, 'Hans')];
  for (const [rank, seated] of seats.entries()) {
    await t.mutation(api.players.reserveNation, { ...seated, nation: NATIONS[rank]! });
    await t.mutation(api.players.declareReady, { ...seated, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await t.run(async (ctx) => {
    for (const troop of await ctx.db.query('troops').collect()) await ctx.db.delete(troop._id);
  });
  return seats as [Seat, Seat, Seat];
}

async function form(
  t: Bench,
  seat: Seat,
  stationedAt: Id<'buildings'> | Id<'outposts'>,
  role: Doc<'troops'>['role'],
  tier: 1 | 2,
) {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role,
      tier,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt,
    });
  });
}

/** France walks two infantry columns and a tier-2 one onto Ivan's armour in Romania. */
async function fight(t: Bench, attacker: Seat, defender: Seat) {
  const barracks = await t.run(async (ctx) => {
    const player = await seatIn(ctx, attacker);
    return ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key: 'barracks' as const,
      regionId: MARNE,
      level: 1,
    });
  });
  const column = [
    await form(t, attacker, barracks, 'infantry', 1),
    await form(t, attacker, barracks, 'infantry', 1),
    await form(t, attacker, barracks, 'infantry', 2),
  ];
  const outpost = await t.run(async (ctx) => {
    const player = await seatIn(ctx, defender);
    const [lon, lat] = regionFacts(PRAHOVA)!.point;
    return ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId: player._id,
      point: { lon, lat },
      hostCountry: 'ROU',
      level: 1,
      specialization: 'relay' as const,
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
  });
  await form(t, defender, outpost, 'armor', 1);
  await form(t, defender, outpost, 'armor', 2);

  await attacking(t, {
    ...attacker,
    origin: { kind: 'building', buildingId: barracks },
    troopIds: column,
    target: { kind: 'outpost', outpostId: outpost },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const [engagement] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
  return engagement!._id;
}

type Detail = { troops: number; lost: number; routed: number; destroyed: number };
const sum = (rows: ReadonlyArray<Detail>) => ({
  troops: rows.reduce((total, row) => total + row.troops, 0),
  lost: rows.reduce((total, row) => total + row.lost, 0),
  routed: rows.reduce((total, row) => total + row.routed, 0),
  destroyed: rows.reduce((total, row) => total + row.destroyed, 0),
});

describe('replayOf', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('serves each side its own detail by role and mark, and never a role of the other', async () => {
    const t = boot();
    const [france, ussr] = await launched(t);
    const combatId = await fight(t, france, ussr);

    const attacker = await t.query(api.replay.replayOf, { ...france, combatId });
    const defender = await t.query(api.replay.replayOf, { ...ussr, combatId });
    if ('refusal' in attacker || 'refusal' in defender) throw new Error('refused');

    expect(attacker.side).toBe('attacker');
    expect(defender.side).toBe('defender');
    expect(attacker.won).toBe(!defender.won);
    expect(attacker.mine.map(({ role, tier, troops }) => ({ role, tier, troops }))).toEqual([
      { role: 'infantry', tier: 1, troops: 2 },
      { role: 'infantry', tier: 2, troops: 1 },
    ]);
    expect(defender.mine.map(({ role, tier, troops }) => ({ role, tier, troops }))).toEqual([
      { role: 'armor', tier: 1, troops: 1 },
      { role: 'armor', tier: 2, troops: 1 },
    ]);
    expect(JSON.stringify(attacker)).not.toContain('armor');
    expect(JSON.stringify(defender)).not.toContain('infantry');
    expect(attacker.theirs).toEqual(sum(defender.mine));
    expect(defender.theirs).toEqual(sum(attacker.mine));
  });

  it('adds up to the account the journal serves', async () => {
    const t = boot();
    const [france, ussr] = await launched(t);
    const combatId = await fight(t, france, ussr);

    for (const seat of [france, ussr]) {
      const replay = await t.query(api.replay.replayOf, { ...seat, combatId });
      if ('refusal' in replay) throw new Error('refused');
      const report = (await t.query(api.view.playerView, seat)).reports.find(
        (account) => account.id === combatId,
      )!;
      expect(sum(replay.mine)).toEqual(report.mine);
      expect(replay.theirs).toEqual(report.theirs);
      expect(sum(replay.mine).lost).toBeGreaterThan(0);
    }
  });

  it('refuses a player who had no side in it, and an id that names nothing', async () => {
    const t = boot();
    const [france, ussr, germany] = await launched(t);
    const combatId = await fight(t, france, ussr);

    expect(await t.query(api.replay.replayOf, { ...germany, combatId })).toEqual({
      refusal: 'NOT_A_PARTY',
    });
    expect(await t.query(api.replay.replayOf, { ...france, combatId: 'nonsense' })).toEqual({
      refusal: 'UNKNOWN_COMBAT',
    });
  });
});
