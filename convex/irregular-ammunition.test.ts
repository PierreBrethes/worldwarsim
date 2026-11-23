import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { BOT_POINT_COLUMN } from '../src/domain/bot';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, neutralPoint, placeHq, seatIn } from './seats.fixture';
import { OBJECTIVE_AMMUNITION_PER_TROOP, POINT_GARRISON } from './constants';

/**
 * **Mesure de #626** : combien de munitions du siège irrégulier coûte un assaut sur la garnison
 * d'un point (3 infanteries T1), et combien d'assauts la dotation du lancement tient.
 *
 * Règle (ADR 0043 §6) — constat du 23/11/2026 : **zéro**. `upkeepOf` rend `storeOf: {}` pour le siège irrégulier, donc
 * `toppedUp` ne le ravitaille jamais et la réserve n'est débitée par aucun combat. Ce qui s'use
 * est le plein de chaque troupe (`rounds`, 3 crans pour une infanterie, jamais rechargés) et
 * leur effectif. La colonne des bots (9) gagne dès le premier assaut et rase la garnison.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
const MIDDAY = Date.UTC(2026, 9, 18, 12);
/** Seuil du garde-fou : la saison de 7 jours ne doit pas voir la réserve se tarir en moins de 20 assauts. */
const MIN_ASSAULTS_HELD = 20;
const DOTATION = 7 * POINT_GARRISON.length * OBJECTIVE_AMMUNITION_PER_TROOP;

async function setup() {
  const t = boot();
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  for (const [who, nation] of [
    [seat, 'france'],
    [guest, 'ussr'],
  ] as const) {
    await t.mutation(api.players.reserveNation, { ...who, nation });
    await t.mutation(api.players.declareReady, { ...who, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  const owner = await t.run((ctx) => seatIn(ctx, seat));
  await t.mutation(internal.objectives.commit, {
    seasonId: owner.seasonId,
    placements: [],
    gaps: [],
  });
  const lisbon = await t.run((ctx) => neutralPoint(ctx, owner.seasonId, 'lisbon'));
  const irregular = (await t.run((ctx) => ctx.db.query('players').collect())).find(
    (player) => player.irregular === true,
  )!;
  const reserve = async () =>
    (await t.run((ctx) => ctx.db.query('resources').collect())).find(
      (row) => row.playerId === irregular._id && row.key === 'ammunition',
    )!.stock;
  const garrison = () =>
    t.run(async (ctx) =>
      (await ctx.db.query('troops').collect()).filter(
        (troop) =>
          troop.playerId === irregular._id &&
          typeof troop.stationedAt === 'object' &&
          troop.stationedAt !== null &&
          'lon' in troop.stationedAt &&
          troop.stationedAt.lon === lisbon.point.lon,
      ),
    );
  /** Une colonne fraîche d'infanteries T1 à pleine force, bien nourrie, qui assaille Lisbonne. */
  const assault = async (size: number) => {
    const column: Array<Id<'troops'>> = [];
    for (let rank = 0; rank < size; rank += 1)
      column.push(
        await t.run((ctx) =>
          ctx.db.insert('troops', {
            seasonId: owner.seasonId,
            playerId: owner._id,
            role: 'infantry',
            tier: 1,
            nominalStrength: 50,
            currentStrength: 50,
            stationedAt: { lon: lisbon.point.lon + 0.3, lat: lisbon.point.lat },
          }),
        ),
      );
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', owner._id))
        .collect())
        if (row.key === 'food')
          await ctx.db.patch(row._id, { stock: 100_000, updatedAt: Date.now() });
    });
    const sent = await t.mutation(api.movements.capture, {
      ...seat,
      origin: { kind: 'point', point: { lon: lisbon.point.lon + 0.3, lat: lisbon.point.lat } },
      troopIds: column,
      target: { kind: 'point', pointId: lisbon._id },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();
    const fought = await t.run((ctx) => ctx.db.query('engagements').collect());
    return fought[fought.length - 1]!.winner;
  };
  return { reserve, garrison, assault };
}

describe('the ammunition reserve of the irregular seat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('is not spent by a column of nine that wins, and the garrison falls at once', async () => {
    const { reserve, garrison, assault } = await setup();
    expect(await reserve()).toBe(DOTATION);
    expect(await assault(BOT_POINT_COLUMN)).toBe('attacker');
    expect(await garrison()).toEqual([]);
    expect(await reserve()).toBe(DOTATION);
  });

  it('is not spent by repelled assaults either: it holds far more than twenty of them', async () => {
    const { reserve, garrison, assault } = await setup();
    let repelled = 0;
    while ((await garrison()).length > 0 && repelled < 30) {
      if ((await assault(1)) === 'defender') repelled += 1;
    }
    const spent = DOTATION - (await reserve());
    // Une seule infanterie repoussée huit fois (la garnison s'use, sans jamais se renforcer),
    // pour 0 munition : le coût par assaut est nul, donc la réserve en tient bien plus que le seuil.
    expect(repelled).toBeGreaterThanOrEqual(8);
    expect(spent * MIN_ASSAULTS_HELD).toBeLessThanOrEqual(DOTATION);
  });
});
