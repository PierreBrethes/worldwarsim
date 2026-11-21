import { readFileSync } from 'node:fs';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { decideTurn, worldFrom, type BotOrder } from '../src/domain/bot';
import { adaptServerView } from '../src/data/serverView';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, unclocked, type Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));
const world = worldFrom({
  projection: read('projection.json'),
  grid: read('grid.json'),
  coast: read('coast.json'),
  regionGrid: read('region-grid.json'),
});

/** Loin du repos de chacun : seul le bot est mesuré. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const HOUR = 3_600_000;

type Bench = ReturnType<typeof boot>;

/** Un passage du bot : sa vue, son atelier, ses ordres, posés par la porte d'un joueur. */
async function pass(t: Bench, seat: Seat, refused: string[]): Promise<BotOrder[]> {
  const view = adaptServerView(await t.query(api.view.playerView, seat));
  const workshop = await t.query(api.troops.workshop, seat);
  const orders = decideTurn({ view, workshop, world, now: Date.now() });
  for (const order of orders) {
    try {
      if (order.fn === 'constructions.start')
        await t.mutation(api.constructions.start, { ...seat, ...order.args });
      else
        await t.mutation(api.troops.recruit, {
          ...seat,
          ...order.args,
          buildingId: order.args.buildingId as Id<'buildings'>,
        });
    } catch (error) {
      refused.push(`${order.fn}: ${String(error)}`);
    }
  }
  return orders;
}

describe("un bot joue son ouverture par la porte d'un joueur", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it("pose le QG, solde le socle et met une caserne en chantier sans qu'aucun ordre soit refusé", async () => {
    const t = boot();
    const { seat: bot, code } = await foundSeat(t, 'Bot1', 0.5);
    const idle = await joinSeat(t, code, 'Inerte');
    await t.mutation(api.players.reserveNation, { ...bot, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...bot, ready: true });
    await t.mutation(api.players.reserveNation, { ...idle, nation: 'ussr' });
    await t.mutation(api.players.declareReady, { ...idle, ready: true });
    await t.mutation(api.seasons.launch, bot);
    await unclocked(t);

    const refused: string[] = [];
    for (let i = 0; i < 12; i++) {
      await pass(t, bot, refused);
      vi.advanceTimersByTime(HOUR);
      await t.finishInProgressScheduledFunctions();
    }

    const { me } = adaptServerView(await t.query(api.view.playerView, bot));
    expect(refused).toEqual([]);
    expect(me.hqLevel).toBe(1);
    expect(me.foundation).toEqual([]);
    const barracks =
      me.buildings.some((b) => b.key === 'barracks') ||
      [me.construction, ...me.constructionQueue].some((work) => work?.key === 'barracks');
    expect(barracks).toBe(true);
    const workshop = await t.query(api.troops.workshop, bot);
    expect(workshop.troopsInService + workshop.troopsQueued).toBeGreaterThan(1);
  });
});
