import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { MONDIALE_TROOP_BOUND } from './constants';
import { regionFacts } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatDoc } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **La lecture du rapport range les faits, elle n'en décide aucun** : ce que ce test tient est le
 * rangement qu'un calcul pur ne peut pas voir — la troupe est-elle sur son sol, quelle est sa
 * place, quelle dépêche dit quoi d'un avant-poste.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310';

const pointIn = (regionId: string) => {
  const [lon, lat] = regionFacts(regionId)!.point;
  return { lon, lat };
};

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Joueur 1');
  for (const [seated, nation] of [
    [seat, 'france'],
    [guest, 'ussr'],
  ] as const) {
    await t.mutation(api.players.reserveNation, { ...seated, nation });
    await t.mutation(api.players.declareReady, { ...seated, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  return [seat, guest] as const;
}

async function form(
  t: ReturnType<typeof boot>,
  seat: Seat,
  stationedAt: Doc<'troops'>['stationedAt'],
) {
  const player = await seatDoc(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role: 'infantry',
      tier: 1,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt,
    }),
  );
}

describe('seasonReport.facts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('files troops by place and by home soil, and passes the bound along', async () => {
    const t = boot();
    const [france] = await launchedSeason(t);
    await form(t, france, pointIn(MARNE));
    await form(t, france, pointIn(MARNE));
    await form(t, france, pointIn(PRAHOVA));
    await form(t, france, null);

    const facts = await t.query(internal.seasonReport.facts, {});
    const mine = facts.players.find((player) => player.nickname === 'Pierre')!;
    const troops = facts.troops.filter((troop) => troop.playerId === mine.id);

    expect(facts.bound).toBe(MONDIALE_TROOP_BOUND);
    expect(troops.map((troop) => troop.where)).toEqual(['home', 'home', 'abroad', 'home']);
    expect(new Set(troops.slice(0, 2).map((troop) => troop.place)).size).toBe(1);
    expect(troops[2]!.place).not.toBe(troops[0]!.place);
  });

  it('puts a column on the road apart from the troops standing', async () => {
    const t = boot();
    const [france] = await launchedSeason(t);
    const player = await seatDoc(t, france);
    const troopId = await form(t, france, pointIn(MARNE));
    await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: player.seasonId,
        playerId: player._id,
        type: 'march',
        fromBuildingId: null,
        target: { kind: 'home' },
        from: { lon: 0, lat: 0 },
        to: { lon: 1, lat: 1 },
        hostCountry: 'FRA',
        points: [],
        legs: [],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [troopId],
        departedAt: Date.now(),
        arrivesAt: Date.now() + 1000,
      } as never),
    );

    const facts = await t.query(internal.seasonReport.facts, {});
    expect(facts.troops).toEqual([
      { playerId: player._id, place: expect.stringMatching(/^march:/), where: 'marching' },
    ]);
  });
});

describe('seasonReport.outpostEvents', () => {
  it('keeps the dispatches that move the outpost count, and tells who captured', async () => {
    const t = boot();
    const [france] = await launchedSeason(t);
    const player = await seatDoc(t, france);
    const head = { playerId: player._id as Id<'players'> };
    const site = { kind: 'outpost' as const, hostCountry: 'FRA', level: 1 };
    const point = { lon: 0, lat: 0 };
    await t.run(async (ctx) => {
      await ctx.db.insert('notices', {
        ...head,
        at: 1,
        kind: 'outpostStands',
        hostCountry: 'FRA',
        specialization: 'relay',
      } as never);
      await ctx.db.insert('notices', {
        ...head,
        at: 2,
        kind: 'outpostRaised',
        hostCountry: 'FRA',
        regionId: null,
        level: 2,
      });
      await ctx.db.insert('notices', {
        ...head,
        at: 3,
        kind: 'captureSucceeded',
        side: 'defender',
        site,
        point,
      });
      await ctx.db.insert('notices', {
        ...head,
        at: 4,
        kind: 'captureSucceeded',
        side: 'capturer',
        site: { kind: 'building', building: 'mine', regionId: MARNE },
        point,
      } as never);
    });

    const page = await t.query(internal.seasonReport.outpostEvents, {
      playerId: player._id,
      cursor: null,
    });

    expect(page.next).toBeNull();
    expect(page.events.map((event) => event.kind)).toEqual(['stands', 'raised', 'taken']);
  });
});
