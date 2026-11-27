import { describe, expect, it } from 'vitest';
import {
  FIRST_HOUR_SHARE,
  MARCH_FIRST_HOUR_MS,
  MARCH_HORIZON_MS,
  marchScheduleOf,
  positionOf,
} from './march-schedule';
import { worksMinutes } from './level-speed';
import type { ArcView, PlayerView } from './player-view';

const LOADED = 10_000_000;
const HOUR = 3_600_000;
const minutes = (count: number) => LOADED + count * 60_000;

const stock = (amount: number, ratePerHour: number, cap = 1000) => ({
  stock: amount,
  ratePerHour,
  cap,
});

/** Nothing runs, nothing drains; each test adds its line. */
const board = (over: Readonly<Record<string, unknown>> = {}, arcs: ReadonlyArray<ArcView> = []) =>
  ({
    mode: 'mondiale',
    arcs,
    loadedAt: LOADED,
    press: null,
    me: {
      hqLevel: 1,
      construction: null,
      constructionQueue: [],
      buildings: [],
      outposts: [],
      troops: [],
      regions: [],
      chains: [],
      research: { researched: [], running: null, queue: [] },
      resources: {
        food: stock(500, 10),
        steel: stock(500, 0),
        coal: stock(500, 0),
        oil: stock(500, 0),
        ammunition: stock(500, 0),
      },
      ...over,
    },
  }) as unknown as PlayerView;

const march = (id: string, minutesLeft: number): ArcView =>
  ({
    state: 'mine',
    id,
    type: 'march',
    stack: { infantry: 2 },
    destinationLabel: 'Somme',
    schedule: {
      departedAt: LOADED,
      arrivesAt: minutes(minutesLeft),
      heldAt: null,
      holdUntil: null,
    },
  }) as unknown as ArcView;

const queued = (id: string, key = 'mine', level = 1) => ({
  id,
  name: key,
  key,
  outpostId: null,
  regionId: 'FRA-1',
  regionName: 'Somme',
  point: [3, 50],
  level,
  specialty: null,
  respecialize: false,
});

const head = (minutesLeft: number, over: Record<string, unknown> = {}) => ({
  ...queued('W-0'),
  minutesLeft,
  ...over,
});

describe('marchScheduleOf', () => {
  it('has nothing to say when nothing runs', () => {
    const schedule = marchScheduleOf(board(), LOADED)!;
    expect(schedule.movements).toEqual([]);
    expect(schedule.works).toEqual([]);
    expect(schedule.queueEmptiesAt).toBeNull();
    expect(schedule.stocks).toEqual([]);
    expect(schedule.edition).toBeNull();
    expect(schedule.next).toBeNull();
    expect(schedule.others).toBe(0);
    expect(schedule.beyond).toBe(0);
  });

  it('is Mondiale only', () => {
    expect(marchScheduleOf({ ...board(), mode: 'blitz' } as PlayerView, LOADED)).toBeNull();
  });

  it('dates each of my movements at its arrival, as the « en cours » column does', () => {
    const schedule = marchScheduleOf(board({}, [march('M-1', 90), march('M-2', 20)]), LOADED)!;
    expect(schedule.movements.map((one) => [one.id, one.arrivesAt, one.label])).toEqual([
      ['movement-M-2', minutes(20), 'marche → Somme'],
      ['movement-M-1', minutes(90), 'marche → Somme'],
    ]);
  });

  it('lines the head of the works and a queue of four end to end, with the instant the queue empties', () => {
    const view = board({
      construction: head(30),
      constructionQueue: [queued('W-1'), queued('W-2', 'mine', 2), queued('W-3'), queued('W-4')],
    });
    const now = minutes(10);
    const { works, queueEmptiesAt } = marchScheduleOf(view, now)!;
    expect(works).toHaveLength(5);
    expect(works[0]).toMatchObject({ running: true, startsAt: now, endsAt: minutes(30) });
    let at = minutes(30);
    for (const [rank, level] of [1, 2, 1, 1].entries()) {
      const work = works[rank + 1]!;
      const span = worksMinutes('mine', level, 1) * 60_000;
      expect(work).toMatchObject({ running: false, startsAt: at, endsAt: at + span });
      at += span;
    }
    expect(queueEmptiesAt).toBe(at);
  });

  it('holds a frozen head where it stopped: its rest does not count down', () => {
    const view = board({ construction: head(30, { frozen: true }) });
    const { works } = marchScheduleOf(view, minutes(20))!;
    expect(works[0]).toMatchObject({ frozen: true, endsAt: minutes(20 + 30) });
  });

  it('lists a stock draining inside the horizon and one that runs dry beyond it', () => {
    const view = board({
      resources: {
        food: stock(600, -100),
        steel: stock(1000, -10),
        coal: stock(100, 5),
        oil: stock(0, 0),
        ammunition: stock(500, 0),
      },
    });
    const { stocks, beyond } = marchScheduleOf(view, LOADED)!;
    expect(stocks).toEqual([
      {
        resource: 'food',
        level: 600,
        cap: 1000,
        ratePerHour: -100,
        dryAt: LOADED + 6 * HOUR,
        placed: true,
      },
      {
        resource: 'steel',
        level: 1000,
        cap: 1000,
        ratePerHour: -10,
        dryAt: LOADED + 100 * HOUR,
        placed: false,
      },
    ]);
    expect(beyond).toBe(1);
  });

  it('reads the stock at now, not at the reading', () => {
    const view = board({ resources: { ...board().me.resources, food: stock(600, -100) } });
    const [food] = marchScheduleOf(view, LOADED + 2 * HOUR)!.stocks;
    expect(food).toMatchObject({ level: 400, dryAt: LOADED + 6 * HOUR });
  });

  it('gives the next edition, or null once it is past or final', () => {
    const edition = (next: number | null) => ({
      press: { at: LOADED, next, final: next === null },
    });
    expect(
      marchScheduleOf({ ...board(), ...edition(minutes(300)) } as PlayerView, LOADED)!.edition,
    ).toBe(minutes(300));
    expect(
      marchScheduleOf({ ...board(), ...edition(null) } as PlayerView, LOADED)!.edition,
    ).toBeNull();
    expect(
      marchScheduleOf({ ...board(), ...edition(minutes(5)) } as PlayerView, minutes(6))!.edition,
    ).toBeNull();
  });

  it('names the nearest due of every family, counts the others, and counts what falls after the horizon apart', () => {
    const view = {
      ...board(
        {
          construction: head(45),
          resources: { ...board().me.resources, food: stock(100, -10) },
        },
        [march('M-1', 20), march('M-2', 13 * 60)],
      ),
      press: { at: LOADED, next: minutes(120), final: false },
    } as PlayerView;
    const schedule = marchScheduleOf(view, LOADED)!;
    expect(schedule.next).toMatchObject({ family: 'movement', at: minutes(20) });
    // movement M-1, works head, edition, food dry at 10 h: four placed; M-2 is beyond.
    expect(schedule.others).toBe(3);
    expect(schedule.beyond).toBe(1);
    expect(schedule.horizonAt).toBe(LOADED + MARCH_HORIZON_MS);
  });

  it('puts a work that starts after the horizon beyond, and one that straddles it inside', () => {
    const view = board({
      construction: head(11 * 60),
      constructionQueue: [queued('W-1', 'mine', 3), queued('W-2', 'mine', 3)],
    });
    const { works } = marchScheduleOf(view, LOADED)!;
    expect(works.map((work) => work.placed)).toEqual([true, true, false]);
  });
});

describe('positionOf', () => {
  it('gives the first hour a fixed share of the width, linear, and the eleven next the rest', () => {
    expect(positionOf(0)).toBe(0);
    expect(positionOf(MARCH_FIRST_HOUR_MS / 2)).toBeCloseTo(FIRST_HOUR_SHARE / 2);
    expect(positionOf(MARCH_FIRST_HOUR_MS)).toBeCloseTo(FIRST_HOUR_SHARE);
    expect(positionOf(MARCH_FIRST_HOUR_MS + 5.5 * HOUR)).toBeCloseTo((1 + FIRST_HOUR_SHARE) / 2);
    expect(positionOf(MARCH_HORIZON_MS)).toBe(1);
  });

  it('holds at the ends: nothing before now, nothing past the horizon', () => {
    expect(positionOf(-HOUR)).toBe(0);
    expect(positionOf(MARCH_HORIZON_MS * 3)).toBe(1);
  });
});
