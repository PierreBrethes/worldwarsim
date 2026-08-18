import { describe, expect, it } from 'vitest';
import { clipToCapacity, emptyStocks, settleStocks, type Conversion, type Stocks } from './economy';
import { RESOURCES, type ResourceKey } from './ids';

const stocksOf = (held: Partial<Record<ResourceKey, number>>): Stocks => ({
  ...emptyStocks(),
  ...held,
});

const CEILING = 400;
const ceilings = (): Stocks => stocksOf(Object.fromEntries(RESOURCES.map((key) => [key, CEILING])));

const foundry = (perHour: number): Conversion => ({
  by: 'foundry',
  output: 'alloy',
  inputs: [
    ['ore', 2],
    ['coal', 1],
  ],
  perHour,
});

function settleOne(
  conversion: Conversion,
  held: Partial<Record<ResourceKey, number>>,
  hours: number,
) {
  const settled = settleStocks({
    stocks: stocksOf(held),
    ratePerHour: emptyStocks(),
    cap: ceilings(),
    conversions: [conversion],
    hours,
  });
  const [report] = settled.chains;
  if (report === undefined) throw new Error('a conversion settles into exactly one report');
  return { stocks: settled.stocks, report };
}

/**
 * The starting kit of a format opens above what a nation without a warehouse can store, and
 * the warehouse is placed by the player, not handed to him. Clipping the opening stock would
 * confiscate the difference between the launch and his first click — silently, which is the
 * defect the whole starting line exists to kill.
 */
describe('a stock that opens above its ceiling', () => {
  it('is held, not confiscated', () => {
    const settled = settleStocks({
      stocks: stocksOf({ alloy: CEILING * 2 }),
      ratePerHour: emptyStocks(),
      cap: ceilings(),
      conversions: [],
      hours: 3,
    });
    expect(settled.stocks.alloy).toBe(CEILING * 2);
  });

  it('takes nothing more in while it stands there', () => {
    const { stocks, report } = settleOne(
      foundry(4),
      { alloy: CEILING * 2, ore: 200, coal: 200 },
      10,
    );
    expect(stocks.alloy).toBe(CEILING * 2);
    expect(report.made).toBe(0);
    expect(report.state).toBe('overflowing');
  });

  it('comes back under the ceiling once it has been spent down', () => {
    const settled = settleStocks({
      stocks: stocksOf({ alloy: CEILING - 10 }),
      ratePerHour: stocksOf({ alloy: 100 }),
      cap: ceilings(),
      conversions: [],
      hours: 10,
    });
    expect(settled.stocks.alloy).toBe(CEILING);
  });

  /** The other half of the rule (ADR 0017): what a reading never takes, a lost store does. */
  it('is clipped when the capacity itself falls, and says by how much', () => {
    const { stocks, lost } = clipToCapacity(
      stocksOf({ alloy: CEILING * 2, coal: CEILING - 40 }),
      ceilings(),
    );
    expect(stocks.alloy).toBe(CEILING);
    expect(lost.alloy).toBe(CEILING);
    // Untouched below the ceiling, and reported as nothing lost rather than as no answer.
    expect(stocks.coal).toBe(CEILING - 40);
    expect(lost.coal).toBe(0);
  });
});

describe('the state of a conversion', () => {
  it('names the input that ran out, and not the one still there', () => {
    const { report } = settleOne(foundry(4), { ore: 200, coal: 0 }, 1);
    expect(report.state).toBe('starved');
    expect(report.missing).toBe('coal');
  });

  /**
   * The two causes call for opposite moves — mine more, or store more — so mistaking one for
   * the other sends the player digging ore he already cannot keep.
   */
  it('calls a full output a ceiling, never a drought', () => {
    const { report } = settleOne(foundry(4), { ore: 200, coal: 200, alloy: CEILING }, 1);
    expect(report.state).toBe('overflowing');
    expect(report.missing).toBeNull();
  });

  it('reports a chain nobody built as off, not as starved', () => {
    const { report } = settleOne(foundry(0), { ore: 0, coal: 0 }, 1);
    expect(report.state).toBe('off');
    expect(report.missing).toBeNull();
  });

  it('says nothing is wrong when the nominal rate goes through', () => {
    const { stocks, report } = settleOne(foundry(4), { ore: 200, coal: 200 }, 1);
    expect(report.state).toBe('running');
    expect(stocks.alloy).toBe(4);
  });

  /**
   * **The point of returning the report from `settleStocks` rather than recomputing it.** One
   * rate drives the stock and the verdict; a second loop making the same trade-off elsewhere
   * would be free to make it differently, and the window would explain a number it does not
   * produce.
   */
  /**
   * The distinction the whole commanded-chain rule rests on. Both lines show a chain making
   * nothing; one wants a click, the other wants a mine. Reading them the same way is what sent
   * a player looking for ore when his arsenal was simply never told to start.
   */
  it('separates a chain awaiting an order from a chain out of matter', () => {
    const arsenal = (quota: number | null): Conversion => ({
      by: 'arsenal',
      output: 'ammunition',
      inputs: [['alloy', 1]],
      perHour: 3,
      quota,
    });

    const waiting = settleOne(arsenal(0), { alloy: 200 }, 1);
    expect(waiting.report.state).toBe('idle');
    expect(waiting.report.missing).toBeNull();
    // And it takes nothing while it waits — the point of the rule.
    expect(waiting.stocks.alloy).toBe(200);
    expect(waiting.stocks.ammunition).toBe(0);

    const dry = settleOne(arsenal(200), { alloy: 0 }, 1);
    expect(dry.report.state).toBe('starved');
    expect(dry.report.missing).toBe('alloy');
  });

  /** A lot is a quantity, never a throughput: it caps what comes out, not how fast. */
  it('stops a lot at its quantity without slowing the line down', () => {
    const arsenal = (quota: number): Conversion => ({
      by: 'arsenal',
      output: 'ammunition',
      inputs: [['alloy', 1]],
      perHour: 3,
      quota,
    });

    // Three an hour, five owed: two hours would make six, the lot stops it at five.
    const closing = settleOne(arsenal(5), { alloy: 200 }, 2);
    expect(closing.stocks.ammunition).toBe(5);
    expect(closing.stocks.alloy).toBe(195);
    expect(closing.report.made).toBe(5);
    expect(closing.report.state).toBe('running');

    // Well inside the lot, the rate is the building's own and nothing clamps it.
    const open = settleOne(arsenal(500), { alloy: 200 }, 2);
    expect(open.stocks.ammunition).toBe(6);
  });

  /**
   * The window used to be read as a single step: everything accrued *and clipped*, then one
   * conversion off the clipped figure. A foundry then behaved as if it had received four
   * hundred ore in three days instead of the twelve hundred that went through the mine.
   */
  it('reports a chain starved only by a clipped input as running', () => {
    const settled = settleStocks({
      stocks: emptyStocks(),
      // The alloy has a warehouse behind it, the ore does not: its bac saturates on the
      // second day and the whole question is whether the foundry still gets the flow.
      cap: stocksOf({ ...ceilings(), alloy: 4_000 }),
      ratePerHour: stocksOf({ ore: 18, coal: 10 }),
      conversions: [foundry(8)],
      hours: 72,
    });
    const [report] = settled.chains;
    expect(report?.state).toBe('running');
    expect(report?.made).toBe(8 * 72);
  });

  it('moves the stock and the verdict together when the rate changes', () => {
    const held = { ore: 20, coal: 20 };

    const slow = settleOne(foundry(4), held, 1);
    expect(slow.stocks.alloy).toBe(4);
    expect(slow.report.state).toBe('running');

    // Forty an hour asks for eighty ore; twenty are held, so ten alloy come out and the ore is
    // what stopped it — the same arbitration that produced the ten.
    const fast = settleOne(foundry(40), held, 1);
    expect(fast.stocks.alloy).toBe(10);
    expect(fast.report.state).toBe('starved');
    expect(fast.report.missing).toBe('ore');
  });
});

/**
 * **A ceiling bounds what accumulates, never what flows.** A mine at level 2 pushes eighteen
 * ore an hour and the foundry beside it eats sixteen: the bac stays full and the foundry has
 * to run forever. Read as a single step, the window credited it with four hundred ore in all
 * and stopped it at two hundred alloy — half the production of a three-day absence, lost in
 * silence, and only for the player who has no warehouse yet.
 *
 * The reference these tests hold the settlement against is **the same window read hour by
 * hour**: it is the behaviour a player watching his screen would have obtained, and an
 * asynchronous season may not punish the absence the design invites (ADR 0001, fiche 07).
 */
describe('a long window and a short one', () => {
  const MINE_AND_FOUNDRY: ReadonlyArray<Conversion> = [foundry(8)];

  /** The cascade: the alloy the foundry casts is what the arsenal spends, same window. */
  const WITH_ARSENAL: ReadonlyArray<Conversion> = [
    foundry(8),
    { by: 'arsenal', output: 'ammunition', inputs: [['alloy', 1]], perHour: 6, quota: null },
  ];

  const EXTRACTION = stocksOf({ ore: 18, coal: 10, textile: 8 });

  const settleBy = (
    step: number,
    hours: number,
    conversions: ReadonlyArray<Conversion>,
    cap: Stocks = ceilings(),
  ) => {
    let stocks: Stocks = emptyStocks();
    for (let done = 0; done < hours; done += step) {
      stocks = settleStocks({
        stocks,
        ratePerHour: EXTRACTION,
        cap,
        conversions,
        hours: step,
      }).stocks;
    }
    return stocks;
  };

  it('makes four hundred alloy over three days, where a single step made two hundred', () => {
    expect(settleBy(72, 72, MINE_AND_FOUNDRY).alloy).toBe(400);
  });

  it.each([4, 24, 72, 168])('reads the same over %i h as hour by hour', (hours) => {
    for (const conversions of [MINE_AND_FOUNDRY, WITH_ARSENAL]) {
      const once = settleBy(hours, hours, conversions);
      const hourly = settleBy(1, hours, conversions);
      for (const key of RESOURCES) expect(once[key]).toBeCloseTo(hourly[key], 6);
    }
  });

  /** The cascade the two ledgers must not break: alloy cast at 9 h is spent at 9 h. */
  it('lets the arsenal spend the alloy the foundry casts in the same window', () => {
    const settled = settleStocks({
      stocks: stocksOf({ ore: 100, coal: 100 }),
      ratePerHour: emptyStocks(),
      cap: ceilings(),
      conversions: WITH_ARSENAL,
      hours: 1,
    });

    expect(settled.chains[0]?.made).toBe(8);
    expect(settled.chains[1]?.made).toBe(6);
    expect(settled.stocks.alloy).toBe(2);
    expect(settled.stocks.ammunition).toBe(6);
  });

  it('still spills whatever the bac cannot hold', () => {
    const settled = settleBy(168, 168, WITH_ARSENAL);
    for (const key of RESOURCES) expect(settled[key]).toBeLessThanOrEqual(CEILING);
  });

  /**
   * The warehouse used to hide the defect: with input bacs that never saturate, the clipping
   * never bit, so the player it punished was the one who had not built one yet — the beginning
   * of a season, where nothing on screen said a word about it.
   *
   * The two players here differ **on their input bacs only**, which is what isolates the fault:
   * they cast the same alloy now, and only the ore left standing behind tells them apart. What
   * the poor player still loses is his ore spilling over a full bac — the ceiling doing its job
   * out in the open, reported as `overflowing`, not a step of integration eating his week.
   */
  it('produces the same with and without a warehouse, and stores differently', () => {
    const stored = (cap: Stocks) =>
      settleStocks({
        stocks: emptyStocks(),
        ratePerHour: EXTRACTION,
        cap,
        conversions: MINE_AND_FOUNDRY,
        hours: 72,
      });

    const bare = stored(ceilings());
    const warehoused = stored(stocksOf({ ...ceilings(), ore: 1_600, coal: 1_600 }));

    expect(bare.chains[0]?.made).toBe(warehoused.chains[0]?.made);
    expect(bare.stocks.ore).toBeLessThan(warehoused.stocks.ore);
  });
});
