import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { positionAt } from '../src/domain/interception';
import { nominalStrength } from './constants';
import { regionFacts } from './regions';
import { marchingForce, reassessDetection } from './movement/detection';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn, type Seat } from './seats.fixture';

/**
 * **Le Fort retient les colonnes adverses qu'il voit** (ADR 0037 §6, #374) : à l'entrée dans sa
 * vigie, l'arrivée est rechiffrée, la colonne repart de là plus lente, et chacun reçoit sa
 * dépêche. Un Fort sans charbon ne retient rien, ses propres colonnes passent.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const HERE = regionFacts('ROU-310')!.point;

const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];
const northOf = (point: LonLat, km: number): LonLat => [point[0], point[1] + km / 111.32];
/** Une route d'ouest en est qui passe à 30 km du Fort : dans sa vigie de niveau 2 (90 km). */
const FROM = eastOf(northOf(HERE, 30), -150);
const TO = eastOf(northOf(HERE, 30), 150);

async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

async function fort(t: Bench, seat: Seat, specialty: 'fort' | 'general' = 'fort') {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: asPoint(HERE),
      hostCountry: 'ROU',
      level: 2,
      specialty,
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

async function march(t: Bench, seat: Seat) {
  const playerId = await playerOf(t, seat);
  const strength = nominalStrength('infantry', 1);
  const troopId = await t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role: 'infantry',
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt: asPoint(FROM),
    }),
  );
  const { movementId } = await t.mutation(api.movements.marchTo, {
    ...seat,
    origin: { kind: 'point', point: asPoint(FROM) },
    troopIds: [troopId],
    point: asPoint(TO),
  });
  return movementId;
}

const movementOf = (t: Bench, id: Id<'movements'>) => t.run(async (ctx) => ctx.db.get(id));

async function dryCoal(t: Bench, seat: Seat) {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect())
      await ctx.db.patch(row._id, {
        stock: row.key === 'coal' ? 0 : row.stock,
        updatedAt: Date.now(),
      });
  });
  await t.mutation(internal.listening.reassess, { playerId });
}

/** Ce que la colonne et le Fort ont fait dire, le tirage des points de la saison à part. */
const noticesOf = (t: Bench, seat: Seat) =>
  t.run(async (ctx) => {
    const playerId = (await seatIn(ctx, seat))._id;
    return (await ctx.db.query('notices').collect()).filter(
      (notice) =>
        notice.playerId === playerId &&
        ['fortSlowed', 'fortHeld', 'movementSighted'].includes(notice.kind),
    );
  });

/** L'heure du rendez-vous venue : la révélation du relevé d'abord, le Fort ensuite — l'ordre où
 *  deux jobs à la même heure peuvent tomber, et le pire pour la dépêche unique. */
async function enter(t: Bench, guest: Seat, movementId: Id<'movements'>) {
  const at = (await movementOf(t, movementId))!.fortEntry!.at;
  vi.setSystemTime(at);
  const guestId = await playerOf(t, guest);
  for (const sighting of await t.run(async (ctx) =>
    ctx.db
      .query('sightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', guestId))
      .collect(),
  ))
    await t.mutation(internal.movements.revealSighting, { sightingId: sighting._id });
  await t.mutation(internal.movements.holdAtFort, { movementId, expectedAt: at });
  return at;
}

describe('a Fort holding the enemy column it sees (ADR 0037 §6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('sets a rendezvous at the entry, unannounced on the departure', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await fort(t, guest);
    const movementId = await march(t, seat);

    const movement = (await movementOf(t, movementId))!;
    expect(movement.fortEntry!.at).toBeGreaterThan(movement.departedAt);
    expect(movement.fortEntry!.at).toBeLessThan(movement.arrivesAt);
    expect(await noticesOf(t, seat)).toEqual([]);
  });

  it('pushes the arrival back at the entry, resumes from there, and tells both sides once', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await fort(t, guest);
    const movementId = await march(t, seat);
    const before = (await movementOf(t, movementId))!;
    const entryPoint = positionAt(marchingForce(before), before.fortEntry!.at);

    const at = await enter(t, guest, movementId);

    const after = (await movementOf(t, movementId))!;
    expect(after.arrivesAt).toBeGreaterThan(before.arrivesAt);
    expect(after.fortEntry).toBeUndefined();
    expect(after.resumed!.at).toBe(at);
    const resumedAt = positionAt(marchingForce(after), at);
    expect(resumedAt[0]).toBeCloseTo(entryPoint[0], 6);
    expect(resumedAt[1]).toBeCloseTo(entryPoint[1], 6);

    expect(await noticesOf(t, seat)).toEqual([
      expect.objectContaining({ kind: 'fortSlowed', arrivesAt: after.arrivesAt }),
    ]);
    const told = await noticesOf(t, guest);
    expect(told.map((notice) => notice.kind)).toEqual(['fortHeld']);
    expect(told[0]).toMatchObject({ hostCountry: 'ROU', arrivesAt: after.arrivesAt });

    /** Le compte à rebours de l'attaquant s'allonge et son pion repart de l'entrée ; le
     *  défenseur lit l'arrivée rechiffrée sur l'arc relevé, rien de la reprise. */
    const mine = (await t.query(api.view.playerView, seat)).movements![0]!;
    expect(mine).toMatchObject({ arrivesAt: after.arrivesAt, resumed: after.resumed });
    const seen = (await t.query(api.view.playerView, guest)).detected!;
    expect(seen).toEqual([expect.objectContaining({ arrivesAt: after.arrivesAt })]);
    expect(seen[0]).not.toHaveProperty('resumed');
  });

  it('lets the old arrival job pass without landing the column early', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await fort(t, guest);
    const movementId = await march(t, seat);
    const due = (await movementOf(t, movementId))!.arrivesAt;
    await enter(t, guest, movementId);

    vi.setSystemTime(due + 1);
    await t.mutation(internal.movements.arrive, { movementId });

    expect(await movementOf(t, movementId)).not.toBeNull();
  });

  it('holds nothing of its own owner', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await fort(t, seat);
    const movementId = await march(t, seat);

    expect((await movementOf(t, movementId))!.fortEntry).toBeUndefined();
  });

  it('holds nothing without coal, nor as a generalist', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await fort(t, guest);
    await dryCoal(t, guest);
    expect((await movementOf(t, await march(t, seat)))!.fortEntry).toBeUndefined();

    const other = boot();
    const seats = await launchedSeason(other);
    await fort(other, seats.guest, 'general');
    expect((await movementOf(other, await march(other, seats.seat)))!.fortEntry).toBeUndefined();
  });

  /** **Un Fort qui tombe après le départ** : le rendez-vous s'annule, et rien n'est retenu. */
  it('cancels the rendezvous of a Fort disabled after the departure', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const outpost = await fort(t, guest);
    const movementId = await march(t, seat);
    const { at, jobId } = (await movementOf(t, movementId))!.fortEntry!;

    await t.run(async (ctx) => {
      await ctx.db.patch(outpost, { disabledUntil: Date.now() + 86_400_000 });
      await reassessDetection(ctx, (await ctx.db.get(outpost))!.seasonId);
    });

    expect((await movementOf(t, movementId))!.fortEntry).toBeUndefined();
    expect((await t.run(async (ctx) => ctx.db.system.get(jobId)))!.state.kind).toBe('canceled');
    vi.setSystemTime(at);
    await t.mutation(internal.movements.holdAtFort, { movementId, expectedAt: at });
    expect((await movementOf(t, movementId))!.resumed).toBeUndefined();
  });

  /** **Un Fort qui naît après le départ** retient la colonne qui n'est pas encore entrée. */
  it('sets the rendezvous of a Fort raised after the departure', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const outpost = await fort(t, guest, 'general');
    const movementId = await march(t, seat);

    await t.run(async (ctx) => {
      await ctx.db.patch(outpost, { specialty: 'fort' });
      await reassessDetection(ctx, (await ctx.db.get(outpost))!.seasonId);
    });

    expect((await movementOf(t, movementId))!.fortEntry).toBeDefined();
  });
});
