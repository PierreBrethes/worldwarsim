import { describe, expect, it } from 'vitest';
import { emptyStocks } from './economy';
import { emptyLoad } from './logistics';
import type { LonLat } from './geo';
import { costMinutes } from './pace';
import { fullSupplies, refuelAtHeap } from './supplies';
import { computeRoute, decodeGrid } from './routing';
import {
  launchRefusalOf,
  legMinutes,
  loopOf,
  orderBest,
  placeStop,
  proposeTour,
  rankStops,
  type SheetDepot,
  type SheetSite,
  type TourSheet,
} from './tour-sheet';
import type { Projection } from './world';
import gridAsset from '../../public/grid.json';
import projectionAsset from '../../public/projection.json';

const projection = projectionAsset as unknown as Projection;
const paris: LonLat = [2.35, 48.86];
const verdun: LonLat = [5.38, 49.16];
const belfort: LonLat = [6.86, 47.64];
const lens: LonLat = [2.83, 50.43];
const briey: LonLat = [5.95, 49.25];

const depot = (id: string, point: LonLat, held: number, capacity = 150): SheetDepot => ({
  kind: 'depot',
  id,
  stopPoint: point,
  depot: { ammunition: held, oil: 0, coal: 0 },
  capacity,
  level: 2,
  standing: true,
});
const site = (
  id: string,
  point: LonLat,
  heap: number,
  extra: Partial<SheetSite> = {},
): SheetSite => ({
  kind: 'site',
  id,
  stopPoint: point,
  resource: 'coal',
  heap,
  cap: 384,
  heapPerHour: 48,
  working: true,
  stoppedForHours: null,
  facts: { ours: true, exploitation: true, hasQuay: false, routed: true },
  ...extra,
});

const truck = (consigne = 80, stockRoom = 1000): TourSheet => ({
  world: projection,
  role: 'landTransport',
  base: paris,
  consigne: { ammunition: consigne, oil: 0, coal: 0 },
  stockRoom: { ...emptyStocks(), coal: stockRoom },
  rules: { place: { kind: 'building', key: 'hq' }, busy: null, baseOutpostId: null },
});

const verdunDepot = depot('verdun', verdun, 60);
const belfortDepot = depot('belfort', belfort, 20);
const lensSite = site('lens', lens, 170);
const brieySite = site('briey', briey, 290);
const lensDepot = depot('lens-depot', lens, 0);

describe('the leg estimate', () => {
  const grid = decodeGrid(gridAsset, projection);

  it('stays within a tenth of the real route a truck is dated at', () => {
    for (const [from, to] of [
      [paris, verdun],
      [paris, belfort],
      [verdun, lens],
    ] as const) {
      const real = computeRoute(grid, from, to, 'land', 1.15)!;
      const dated = costMinutes(real.costUnits, null);
      const estimated = legMinutes(projection, 'landTransport', from, to);
      expect(estimated / dated).toBeGreaterThan(0.9);
      expect(estimated / dated).toBeLessThan(1.1);
    }
  });

  it('is the real thing for a plane, which flies straight', () => {
    const real = computeRoute(grid, paris, belfort, 'air')!;
    expect(legMinutes(projection, 'airTransport', paris, belfort)).toBe(
      costMinutes(real.costUnits, null),
    );
  });
});

describe('the loop of a tour', () => {
  it('moves what it gives plus what it takes, and says what it banks', () => {
    const loop = loopOf(truck(), [verdunDepot, lensSite]);
    expect(loop.rows.map((row) => [row.id, row.moved])).toEqual([
      ['verdun', 80],
      ['lens', 170],
    ]);
    expect(loop.moved).toBe(250);
    expect(loop.peak).toBe(170 + 0);
    expect(loop.banked.coal).toBe(170);
    expect(loop.kept.coal).toBe(0);
    expect(loop.km).toBeGreaterThan(0);
    expect(loop.ratePerHour).toBeCloseTo(loop.moved / (loop.minutes / 60), 6);
  });

  it('keeps the unrounded kilometres to break ties on (#550)', () => {
    const loop = loopOf(truck(), [verdunDepot]);
    expect(Math.round(loop.exactKm)).toBe(loop.km);
    expect(Number.isInteger(loop.exactKm)).toBe(false);
  });

  it('keeps aboard what the store has no room for', () => {
    const loop = loopOf(truck(80, 100), [lensSite]);
    expect(loop.banked.coal).toBe(100);
    expect(loop.kept.coal).toBe(20);
  });

  it('skips a stop that would move nothing, and does not drive to it', () => {
    const full = loopOf(truck(0), [brieySite, lensSite]);
    expect(full.skipped.map((stop) => stop.id)).toEqual(['lens']);
    expect(full.rows.map((row) => row.id)).toEqual(['briey']);
    expect(full.skipped[0]).toMatchObject({ heap: 170, earlier: 170 });
  });

  it('reads a depot that is full as skipped', () => {
    const loop = loopOf(truck(), [depot('verdun', verdun, 150)]);
    expect(loop.skipped.map((stop) => stop.id)).toEqual(['verdun']);
    expect(loop.ratePerHour).toBe(0);
  });

  it('crawls at half pace when dry', () => {
    const sheet = truck();
    const normal = loopOf(sheet, [verdunDepot]);
    const slow = loopOf({ ...sheet, slow: true }, [verdunDepot]);
    expect(slow.minutes).toBe(normal.minutes * 2);
  });
});

describe('an exploitation that is out of service or cut off (#550)', () => {
  const down = site('down', briey, 290, { working: false });

  it('gives nothing, like the tour that skips it, and is not driven to', () => {
    const loop = loopOf(truck(0), [down]);
    expect(loop.rows).toEqual([]);
    expect(loop.moved).toBe(0);
    expect(loop.skipped).toMatchObject([{ id: 'down', earlier: 0 }]);
  });

  it('says why, and is never proposed', () => {
    const ranked = rankStops(truck(0), [], [down]);
    expect(ranked.offered[0]!.reason).toEqual({ code: 'siteDisabled' });
    expect(proposeTour(truck(0), [down])).toEqual([]);
  });
});

describe("the fill-up taken at a heap of the engine's resource (#550)", () => {
  const oil = (heap: number) => site('oil', briey, heap, { resource: 'oil' });
  const dry: TourSheet = {
    ...truck(0),
    fuelHeld: fullSupplies('landTransport').fuel - 2,
  };

  it('is taken first: the hold gets what is left of the heap, not all of it', () => {
    const fill = refuelAtHeap('landTransport', dry.fuelHeld!, { resource: 'oil', amount: 100 });
    expect(fill.steps).toBe(2);
    expect(loopOf(dry, [oil(100)]).moved).toBe(100 - fill.cost);
  });

  it('is nothing for a full tank, or a heap of another resource', () => {
    expect(loopOf(truck(0), [oil(100)]).moved).toBe(100);
    expect(loopOf(dry, [site('coal', briey, 100)]).moved).toBe(100);
  });

  it('is paid once: a second heap finds the engine full', () => {
    const second = { ...oil(100), id: 'oil2' };
    const loop = loopOf(dry, [oil(100), second]);
    const fill = refuelAtHeap('landTransport', dry.fuelHeld!, { resource: 'oil', amount: 100 });
    expect(loop.rows.map((row) => row.moved)).toEqual([100 - fill.cost, 100]);
  });
});

describe('where a stop is driven to (#550)', () => {
  it('is the quay for a cargo, not the heap: the legs follow the stop point', () => {
    const quay = site('quay', verdun, 100, { facts: { ...lensSite.facts, hasQuay: true } });
    const ship: TourSheet = { ...truck(50), role: 'cargo', rules: { ...truck().rules } };
    const there = loopOf(ship, [quay]);
    expect(there.km).toBe(loopOf(ship, [{ ...verdunDepot, id: 'v', depot: emptyLoad() }]).km);
  });
});

describe('the place of a stop', () => {
  it('takes the slot where the rate rises most, a heap before the depot that empties the hold', () => {
    const sheet = truck(150);
    const slot = placeStop(sheet, [verdunDepot], brieySite);
    expect(slot.at).toBeGreaterThanOrEqual(0);
    for (let at = 0; at <= 1; at++) {
      const order = at === 0 ? [brieySite, verdunDepot] : [verdunDepot, brieySite];
      expect(slot.rate).toBeGreaterThanOrEqual(loopOf(sheet, order).ratePerHour - 1e-9);
    }
    expect(slot.rateBefore).toBe(loopOf(sheet, [verdunDepot]).ratePerHour);
  });

  it('breaks a tie of rates by the shorter loop', () => {
    const sheet = truck(1);
    const near = depot('near', [5.38, 49.16], 0);
    const far = depot('far', [5.33, 49.16], 0);
    const [shorter, longer] = [near, far].sort(
      (a, b) => loopOf(sheet, [a]).km - loopOf(sheet, [b]).km,
    );
    expect(
      Math.abs(loopOf(sheet, [near]).ratePerHour - loopOf(sheet, [far]).ratePerHour),
    ).toBeLessThan(0.05);
    expect(loopOf(sheet, [shorter!]).km).toBeLessThan(loopOf(sheet, [longer!]).km);
    expect(placeStop(sheet, [shorter!], longer!).at).toBe(1);
  });

  it('says how many kilometres it adds', () => {
    const sheet = truck();
    const slot = placeStop(sheet, [verdunDepot], lensSite);
    const loop = loopOf(sheet, [verdunDepot]);
    expect(slot.addedKm).toBe(slot.km - loop.km);
  });
});

describe('the ranking of stops', () => {
  it('ranks by what each makes the rate gain, a refusal never offered but served apart', () => {
    const foreign = site('sarre', [7.0, 49.23], 300, {
      facts: { ours: false, exploitation: true, hasQuay: false, routed: true },
    });
    const ranked = rankStops(truck(), [], [verdunDepot, lensSite, brieySite, foreign]);
    expect(ranked.offered.map((o) => o.stop.id)).not.toContain('sarre');
    expect(ranked.refused).toEqual([{ stop: foreign, refusal: { code: 'TOUR_PICKUP_NOT_OURS' } }]);
    const gains = ranked.offered.map((o) => o.gain);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });

  it('refuses a site the transport has no route to, never offers it (#550)', () => {
    const island = site('island', briey, 300, {
      facts: { ours: true, exploitation: true, hasQuay: false, routed: false },
    });
    const ranked = rankStops(truck(), [], [island]);
    expect(ranked.offered).toEqual([]);
    expect(ranked.refused).toEqual([
      { stop: island, refusal: { code: 'TOUR_PICKUP_NO_ROUTE', id: 'island' } },
    ]);
  });

  it('leaves out the stops already on the sheet', () => {
    const ranked = rankStops(truck(), [lensSite], [verdunDepot, lensSite]);
    expect([...ranked.offered, ...ranked.refused].map((o) => o.stop.id)).toEqual(['verdun']);
  });

  it('does not push a stopped exploitation ahead, and says so in its reason', () => {
    const live = site('live', briey, 150, { stoppedForHours: null });
    const stopped = site('stopped', briey, 100, { stoppedForHours: 3 });
    const ranked = rankStops(truck(0), [], [stopped, live]);
    expect(ranked.offered.map((o) => o.stop.id)).toEqual(['live', 'stopped']);
    const alike = rankStops(truck(0), [], [{ ...live, heap: 100 }, stopped]).offered;
    expect(alike[0]!.gain).toBe(alike[1]!.gain);
    const reasons = Object.fromEntries(ranked.offered.map((o) => [o.stop.id, o.reason]));
    expect(reasons.stopped).toEqual({ code: 'siteStopped', hours: 3, lostPerHour: 48 });
    expect(reasons.live).toMatchObject({ code: 'heapFilling' });
  });

  it('flags the emptiest of the depots on offer, not of those refused (#550)', () => {
    const closed = { ...belfortDepot, standing: false };
    const ranked = rankStops(truck(), [], [verdunDepot, closed, depot('lens', lens, 100)]);
    expect(ranked.refused.map((r) => r.stop.id)).toEqual(['belfort']);
    const flags = Object.fromEntries(
      ranked.offered.map((o) => [o.stop.id, (o.reason as { emptiest: boolean }).emptiest]),
    );
    expect(flags).toEqual({ verdun: true, lens: false });
  });

  it('refuses the depot the tour starts from as a stop twice (#550)', () => {
    const sheet = { ...truck(), rules: { ...truck().rules, baseOutpostId: 'verdun' } };
    expect(rankStops(sheet, [], [verdunDepot]).refused[0]!.refusal).toEqual({
      code: 'TOUR_STOP_TWICE',
    });
  });

  it('prices a dry crawl in the rate it ranks by (#550)', () => {
    const normal = rankStops(truck(), [], [verdunDepot]).offered[0]!;
    const slow = rankStops({ ...truck(), slow: true }, [], [verdunDepot]).offered[0]!;
    expect(slow.slot.rate).toBeCloseTo(normal.slot.rate / 2, 6);
  });

  it('gives each kind of reason', () => {
    const sheet = truck();
    const reasonOf = (stop: SheetSite | SheetDepot, tour: Array<SheetSite | SheetDepot> = []) =>
      rankStops(sheet, tour, [stop]).offered[0]!.reason;
    expect(reasonOf(site('a', briey, 290))).toEqual({
      code: 'heapFilling',
      heap: 290,
      cap: 384,
      hoursToFull: (384 - 290) / 48,
    });
    expect(reasonOf(site('b', briey, 0))).toEqual({ code: 'heapEmpty', perHour: 48 });
    expect(reasonOf(site('c', briey, 0, { cap: 0, heapPerHour: 0 }))).toEqual({ code: 'noHeap' });
    expect(reasonOf(depot('d', verdun, 20))).toMatchObject({
      code: 'depotRoom',
      depot: 20,
      capacity: 150,
    });
    expect(rankStops(truck(200), [], [lensSite]).offered[0]!.reason).toEqual({
      code: 'aboardFull',
      heap: 170,
    });
    const depots = rankStops(truck(), [], [verdunDepot, belfortDepot]).offered;
    expect(depots.find((o) => o.stop.id === 'belfort')!.reason).toMatchObject({ emptiest: true });
    expect(depots.find((o) => o.stop.id === 'verdun')!.reason).toMatchObject({ emptiest: false });
  });

  it('refuses a depot a plane cannot land at, through the depot rule', () => {
    const sheet: TourSheet = {
      ...truck(),
      role: 'airTransport',
      rules: { ...truck().rules, place: { kind: 'building', key: 'airfield' } },
    };
    const small = { ...verdunDepot, level: 1 };
    expect(rankStops(sheet, [], [small]).refused[0]!.refusal).toMatchObject({
      code: 'NO_AIR_STOP',
    });
  });

  it('refuses everyone when the sheet is already four stops long', () => {
    const four = [verdunDepot, belfortDepot, lensSite, brieySite];
    const ranked = rankStops(truck(), four, [site('extra', briey, 10)]);
    expect(ranked.offered).toEqual([]);
    expect(ranked.refused[0]!.refusal).toMatchObject({ code: 'TOUR_TOO_LONG' });
  });
});

describe('the order that wastes', () => {
  it('names a stop the order makes useless, and what it would take earlier', () => {
    const loop = loopOf(truck(0), [brieySite, lensSite]);
    expect(loop.skipped[0]).toMatchObject({ id: 'lens', heap: 170, earlier: 170 });
  });

  it('puts the order that moves most first, then the one that drives least', () => {
    const sheet = truck();
    const wasteful = [brieySite, verdunDepot];
    const best = orderBest(sheet, wasteful);
    expect(best.same).toBe(false);
    expect(best.order).toEqual([verdunDepot, brieySite]);
    expect(best.loop.moved).toBeGreaterThan(loopOf(sheet, wasteful).moved);
    expect(best.gain.moved).toBe(best.loop.moved - loopOf(sheet, wasteful).moved);
  });

  it('keeps the current order when none does better', () => {
    const sheet = truck();
    const first = orderBest(sheet, [verdunDepot, belfortDepot]);
    const again = orderBest(sheet, first.order);
    expect(again.same).toBe(true);
    expect(again.gain).toEqual({ moved: 0, km: 0 });
  });

  it('orders a dry crawl like a normal one, twice as slow (#550)', () => {
    const wasteful = [brieySite, verdunDepot];
    const normal = orderBest(truck(), wasteful);
    const slow = orderBest({ ...truck(), slow: true }, wasteful);
    expect(slow.order).toEqual(normal.order);
    expect(slow.loop.minutes).toBe(normal.loop.minutes * 2);
  });

  it('does not permute a sheet longer than the rule allows', () => {
    const six = Array.from({ length: 6 }, (_, i) => depot(`d${i}`, verdun, 0));
    expect(orderBest(truck(), six).same).toBe(true);
  });

  it('drives least among orders that move the same', () => {
    const sheet = truck(150);
    const stops = [belfortDepot, lensDepot, verdunDepot];
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ].map((order) =>
      loopOf(
        sheet,
        order.map((i) => stops[i]!),
      ),
    );
    expect(new Set(orders.map((loop) => loop.moved)).size).toBe(1);
    expect(orderBest(sheet, stops).loop.km).toBe(Math.min(...orders.map((loop) => loop.km)));
  });
});

describe('proposing a tour on an empty sheet', () => {
  it('adds the stop that lifts the rate most, while it lifts it, never past four', () => {
    const sheet = truck();
    const proposed = proposeTour(sheet, [verdunDepot, belfortDepot, lensSite, brieySite]);
    expect(proposed.length).toBeGreaterThan(0);
    expect(proposed.length).toBeLessThanOrEqual(4);
    const rate = loopOf(sheet, proposed).ratePerHour;
    for (const dropped of proposed) {
      const without = proposed.filter((stop) => stop !== dropped);
      expect(rate).toBeGreaterThanOrEqual(loopOf(sheet, without).ratePerHour - 1e-9);
    }
  });

  it('stops at four stops however many candidates would still lift the rate (#550)', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      site(`s${i}`, [verdun[0] + i * 0.05, verdun[1]], 10),
    );
    expect(proposeTour(truck(0), many)).toHaveLength(4);
  });

  it('proposes nothing when no stop would move anything', () => {
    const empty = site('dry', briey, 0);
    expect(proposeTour(truck(0), [empty, depot('d', verdun, 20)])).toEqual([]);
  });

  it('never proposes a refused stop', () => {
    const foreign = site('sarre', [7.0, 49.23], 300, {
      facts: { ours: false, exploitation: true, hasQuay: false, routed: true },
    });
    expect(proposeTour(truck(0), [foreign])).toEqual([]);
  });
});

describe('what refuses the sheet as it stands (#551)', () => {
  it('says an empty sheet has no stop', () => {
    expect(launchRefusalOf(truck(), [])).toEqual({ code: 'TOUR_NO_STOP' });
  });

  it('refuses a depot that is no longer standing, as the server does', () => {
    const razed = { ...depot('razed', verdun, 20), standing: false };
    expect(launchRefusalOf(truck(), [lensSite, razed])).toMatchObject({
      code: 'DEPOT_NOT_STANDING',
    });
  });

  it('refuses a site the road does not reach, and lets a good sheet go', () => {
    const cut = site('cut', briey, 100, {
      facts: { ours: true, exploitation: true, hasQuay: false, routed: false },
    });
    expect(launchRefusalOf(truck(), [verdunDepot, cut])).toMatchObject({
      code: 'TOUR_PICKUP_NO_ROUTE',
    });
    expect(launchRefusalOf(truck(), [verdunDepot, lensSite])).toBeNull();
  });
});
