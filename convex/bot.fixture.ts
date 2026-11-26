import { readFileSync } from 'node:fs';
import { convexTest } from 'convex-test';
import { expect, vi } from 'vitest';
import { api } from './_generated/api';
import { decideTurn, worldFrom, type BotOrder } from '../src/domain/bot';
import { submitBotOrder } from './botOrders';
import { playerViewOf } from '../src/domain/server-view';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, neutralPoint, seatIn, unclocked, type Seat } from './seats.fixture';
import { distanceKm } from '../src/domain/geo';

export const boot = () => convexTest({ schema, modules, transactionLimits: true });

const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));
export const world = worldFrom({
  projection: read('projection.json'),
  grid: read('grid.json'),
  coast: read('coast.json'),
  regionGrid: read('region-grid.json'),
  regionIndex: read('region-index.json'),
});

/** Loin du repos de chacun : seul le bot est mesuré. */
export const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
export const HOUR = 3_600_000;

export type Bench = ReturnType<typeof boot>;

/** Un passage du bot : sa vue, son atelier, ses ordres, posés par la porte d'un joueur. */
export async function pass(
  t: Bench,
  seat: Seat,
  refused: string[],
  played: string[] = [],
): Promise<BotOrder[]> {
  const view = playerViewOf(await t.query(api.view.playerView, seat));
  const workshop = await t.query(api.troops.workshop, seat);
  const orders = decideTurn({ view, workshop, world, now: Date.now() });
  for (const order of orders) {
    try {
      await submitBotOrder((mutation, args) => t.mutation(mutation, args as never), seat, order);
      played.push(order.fn);
    } catch (error) {
      refused.push(`${order.fn}: ${String(error)}`);
    }
  }
  return orders;
}

/** @a-mesurer : « près » d'un point, c'est une plage que `BOT_LANDING_KM` autour de lui peut offrir. */
const NEAR_KM = 250;

/**
 * **Un bot insulaire prend la mer** (#631) : il bâtit un port, forme un cargo, y embarque une
 * colonne, la porte sur la plage la plus proche d'un point neutre et l'y débarque, le tout par la
 * porte d'un joueur et sans qu'un ordre soit refusé. `onFoot` : le point se prend ensuite à pied.
 */
export async function crossesToward(
  nation: 'uk' | 'japan',
  key: 'lisbon' | 'hongKong',
  onFoot: boolean,
): Promise<void> {
  const t = boot();
  const { seat: bot, code } = await foundSeat(t, 'Bot1', 0.5);
  const idle = await joinSeat(t, code, 'Bot2');
  await t.mutation(api.players.reserveNation, { ...bot, nation });
  await t.mutation(api.players.declareReady, { ...bot, ready: true });
  await t.mutation(api.players.reserveNation, {
    ...idle,
    nation: nation === 'uk' ? 'ussr' : 'usa',
  });
  await t.mutation(api.players.declareReady, { ...idle, ready: true });
  await t.mutation(api.seasons.launch, bot);
  await unclocked(t);
  const player = await t.run((ctx) => seatIn(ctx, bot));
  await t.run(async (ctx) => neutralPoint(ctx, player.seasonId, key));

  const refused: string[] = [];
  const played: string[] = [];
  let near = false;
  for (let i = 0; i < 400 && !(near && (!onFoot || played.includes('movements.capture'))); i++) {
    await pass(t, bot, refused, played);
    vi.advanceTimersByTime(HOUR);
    await t.finishInProgressScheduledFunctions();
    const view = playerViewOf(await t.query(api.view.playerView, bot));
    near = view.me.troops.some(
      ({ role, carriedBy, stationedAt }) =>
        role === 'infantry' &&
        carriedBy === undefined &&
        stationedAt.kind === 'point' &&
        view.strategicPoints.some(
          (point) =>
            point.holder === null && distanceKm(point.point, stationedAt.lonLat) <= NEAR_KM,
        ),
    );
  }
  expect(refused).toEqual([]);
  for (const fn of [
    'constructions.start',
    'troops.recruit',
    'movements.board',
    'movements.marchTo',
    'movements.disembark',
  ])
    expect(played).toContain(fn);
  expect(near).toBe(true);
  if (onFoot) expect(played).toContain('movements.capture');
}
