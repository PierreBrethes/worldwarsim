import { describe, expect, it } from 'vitest';
import {
  clipToCapacity,
  placementRefusal,
  emptyStocks,
  isLinked,
  produces,
  settleStocks,
  type Conversion,
  type Stocks,
} from './economy';
import { RESOURCES, type ResourceKey } from './ids';

const stocksOf = (held: Partial<Record<ResourceKey, number>>): Stocks => ({
  ...emptyStocks(),
  ...held,
});

const CEILING = 400;
const ceilings = (): Stocks => stocksOf(Object.fromEntries(RESOURCES.map((key) => [key, CEILING])));

/** The arsenal left to run on its own: the pure settlement knows no lot unless it is given one. */
const arsenal = (perHour: number, quota: number | null = null): Conversion => ({
  by: 'arsenal',
  output: 'ammunition',
  inputs: [
    ['coal', 1],
    ['steel', 1],
  ],
  perHour,
  quota,
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
      stocks: stocksOf({ steel: CEILING * 2 }),
      ratePerHour: emptyStocks(),
      cap: ceilings(),
      conversions: [],
      hours: 3,
    });
    expect(settled.stocks.steel).toBe(CEILING * 2);
  });

  it('takes nothing more in while it stands there', () => {
    const { stocks, report } = settleOne(
      arsenal(4),
      { ammunition: CEILING * 2, steel: 200, coal: 200 },
      10,
    );
    expect(stocks.ammunition).toBe(CEILING * 2);
    expect(report.made).toBe(0);
    expect(report.state).toBe('overflowing');
  });

  it('comes back under the ceiling once it has been spent down', () => {
    const settled = settleStocks({
      stocks: stocksOf({ steel: CEILING - 10 }),
      ratePerHour: stocksOf({ steel: 100 }),
      cap: ceilings(),
      conversions: [],
      hours: 10,
    });
    expect(settled.stocks.steel).toBe(CEILING);
  });

  /** The other half of the rule (ADR 0017): what a reading never takes, a lost store does. */
  it('is clipped when the capacity itself falls, and says by how much', () => {
    const { stocks, lost } = clipToCapacity(
      stocksOf({ steel: CEILING * 2, coal: CEILING - 40 }),
      ceilings(),
    );
    expect(stocks.steel).toBe(CEILING);
    expect(lost.steel).toBe(CEILING);
    // Untouched below the ceiling, and reported as nothing lost rather than as no answer.
    expect(stocks.coal).toBe(CEILING - 40);
    expect(lost.coal).toBe(0);
  });
});

describe('a building only produces when its region carries its colour', () => {
  const held = new Map([
    ['FRA-5323', 'pierre'],
    ['ROU-310', 'lea'],
  ]);

  it('links a region its owner holds, and nothing else', () => {
    expect(isLinked({ regionId: 'FRA-5323' }, held, 'pierre')).toBe(true);
    // Tenue, mais par quelqu'un d'autre : bâtir chez le voisin ne relie pas (ADR 0004).
    expect(isLinked({ regionId: 'ROU-310' }, held, 'pierre')).toBe(false);
    // Tenue par personne : la même réponse, et c'est la règle entière.
    expect(isLinked({ regionId: 'ROU-314' }, held, 'pierre')).toBe(false);
  });

  /** Les trois extracteurs et l'arsenal, et rien d'autre : le stockage, la projection et le
   *  quartier général ne font rien entrer dans le monde. */
  it('only ever cuts what produces', () => {
    for (const key of ['farm', 'mine', 'oilWell', 'arsenal'] as const) {
      expect(produces(key)).toBe(true);
    }
    for (const key of ['hq', 'warehouse', 'depot', 'barracks', 'port', 'airfield'] as const) {
      expect(produces(key)).toBe(false);
    }
  });
});

describe('the state of a conversion', () => {
  it('names the input that ran out, and not the one still there', () => {
    const { report } = settleOne(arsenal(4), { steel: 200, coal: 0 }, 1);
    expect(report.state).toBe('starved');
    expect(report.missing).toBe('coal');
  });

  /**
   * The two causes call for opposite moves — mine more, or store more — so mistaking one for
   * the other sends the player digging coal he already cannot keep.
   */
  it('calls a full output a ceiling, never a drought', () => {
    const { report } = settleOne(arsenal(4), { steel: 200, coal: 200, ammunition: CEILING }, 1);
    expect(report.state).toBe('overflowing');
    expect(report.missing).toBeNull();
  });

  /**
   * **Hors réseau passe avant tout le reste** (ADR 0020 §6) : un site coupé n'est pas à sec, il
   * n'est pas éteint, et il ne déborde pas — les trois envoient le joueur ailleurs que là où le
   * remède se trouve, qui est la carte.
   */
  it('calls a cut chain unlinked, whatever else would have been said of it', () => {
    const cut = { ...arsenal(0), linked: false };
    expect(settleOne(cut, { steel: 200, coal: 200 }, 1).report.state).toBe('unlinked');
    expect(settleOne({ ...cut, perHour: 4 }, { steel: 0, coal: 0 }, 1).report.state).toBe(
      'unlinked',
    );
    expect(settleOne({ ...cut, perHour: 4 }, { steel: 200, coal: 200 }, 1).report.state).toBe(
      'unlinked',
    );
  });

  it('makes nothing at all on a cut chain, whatever the reserve', () => {
    const { stocks } = settleOne({ ...arsenal(0), linked: false }, { steel: 200, coal: 200 }, 8);
    expect(stocks.ammunition).toBe(0);
    expect(stocks.steel).toBe(200);
  });

  it('reports a chain nobody built as off, not as starved', () => {
    const { report } = settleOne(arsenal(0), { steel: 0, coal: 0 }, 1);
    expect(report.state).toBe('off');
    expect(report.missing).toBeNull();
  });

  it('says nothing is wrong when the nominal rate goes through', () => {
    const { stocks, report } = settleOne(arsenal(4), { steel: 200, coal: 200 }, 1);
    expect(report.state).toBe('running');
    expect(stocks.ammunition).toBe(4);
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
   * a player looking for coal when his arsenal was simply never told to start.
   */
  it('separates a chain awaiting an order from a chain out of matter', () => {
    const waiting = settleOne(arsenal(3, 0), { steel: 200, coal: 200 }, 1);
    expect(waiting.report.state).toBe('idle');
    expect(waiting.report.missing).toBeNull();
    // And it takes nothing while it waits — the point of the rule.
    expect(waiting.stocks.steel).toBe(200);
    expect(waiting.stocks.ammunition).toBe(0);

    const dry = settleOne(arsenal(3, 200), { steel: 0, coal: 200 }, 1);
    expect(dry.report.state).toBe('starved');
    expect(dry.report.missing).toBe('steel');
  });

  /** A lot is a quantity, never a throughput: it caps what comes out, not how fast. */
  it('stops a lot at its quantity without slowing the line down', () => {
    // Three an hour, five owed: two hours would make six, the lot stops it at five.
    const closing = settleOne(arsenal(3, 5), { steel: 200, coal: 200 }, 2);
    expect(closing.stocks.ammunition).toBe(5);
    expect(closing.stocks.steel).toBe(195);
    expect(closing.stocks.coal).toBe(195);
    expect(closing.report.made).toBe(5);
    expect(closing.report.state).toBe('running');

    // Well inside the lot, the rate is the building's own and nothing clamps it.
    const open = settleOne(arsenal(3, 500), { steel: 200, coal: 200 }, 2);
    expect(open.stocks.ammunition).toBe(6);
  });

  /**
   * The window used to be read as a single step: everything accrued *and clipped*, then one
   * conversion off the clipped figure. An arsenal then behaved as if it had received four
   * hundred steel in three days instead of the seven hundred that went through the mine.
   */
  it('reports a chain starved only by a clipped input as running', () => {
    const settled = settleStocks({
      stocks: emptyStocks(),
      // The rounds have a warehouse behind them, the inputs do not: their bacs saturate on the
      // second day and the whole question is whether the arsenal still gets the flow.
      cap: stocksOf({ ...ceilings(), ammunition: 4_000 }),
      ratePerHour: stocksOf({ steel: 10, coal: 10 }),
      conversions: [arsenal(8)],
      hours: 72,
    });
    const [report] = settled.chains;
    expect(report?.state).toBe('running');
    expect(report?.made).toBe(8 * 72);
  });

  it('moves the stock and the verdict together when the rate changes', () => {
    const held = { steel: 20, coal: 30 };

    const slow = settleOne(arsenal(4), held, 1);
    expect(slow.stocks.ammunition).toBe(4);
    expect(slow.report.state).toBe('running');

    // Forty an hour asks for forty steel; twenty are held, so twenty rounds come out and the
    // steel is what stopped it — the same arbitration that produced the twenty.
    const fast = settleOne(arsenal(40), held, 1);
    expect(fast.stocks.ammunition).toBe(20);
    expect(fast.report.state).toBe('starved');
    expect(fast.report.missing).toBe('steel');
  });
});

/**
 * **A ceiling bounds what accumulates, never what flows.** A mine pushes sixteen steel an hour and
 * the arsenal beside it eats eight: the input bacs fill and the arsenal has to run forever.
 * Read as a single step, the window credited it with four hundred steel in all and stopped it
 * there — part of the production of a three-day absence, lost in silence, and only for the
 * player who has no warehouse yet.
 *
 * The reference these tests hold the settlement against is **the same window read hour by
 * hour**: it is the behaviour a player watching his screen would have obtained, and an
 * asynchronous season may not punish the absence the design invites (ADR 0001, fiche 07).
 */
describe('a long window and a short one', () => {
  const MINES_AND_ARSENAL: ReadonlyArray<Conversion> = [arsenal(8)];
  const EXTRACTION = stocksOf({ steel: 16, coal: 16 });
  const ROOM_FOR_ROUNDS = stocksOf({ ...ceilings(), ammunition: 4_000 });

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

  it('casts eight rounds an hour over three days, where a single step stopped at four hundred', () => {
    expect(settleBy(72, 72, MINES_AND_ARSENAL, ROOM_FOR_ROUNDS).ammunition).toBe(8 * 72);
  });

  it.each([4, 24, 72, 168])('reads the same over %i h as hour by hour', (hours) => {
    const once = settleBy(hours, hours, MINES_AND_ARSENAL, ROOM_FOR_ROUNDS);
    const hourly = settleBy(1, hours, MINES_AND_ARSENAL, ROOM_FOR_ROUNDS);
    for (const key of RESOURCES) expect(once[key]).toBeCloseTo(hourly[key], 6);
  });

  it('still spills whatever the bac cannot hold', () => {
    const settled = settleBy(168, 168, MINES_AND_ARSENAL);
    for (const key of RESOURCES) expect(settled[key]).toBeLessThanOrEqual(CEILING);
  });

  /**
   * The warehouse used to hide the defect: with input bacs that never saturate, the clipping
   * never bit, so the player it punished was the one who had not built one yet — the beginning
   * of a season, where nothing on screen said a word about it.
   *
   * The two players here differ **on their input bacs only**, which is what isolates the fault:
   * they cast the same rounds now, and only the steel left standing behind tells them apart.
   */
  it('produces the same with and without a warehouse, and stores differently', () => {
    const stored = (cap: Stocks) =>
      settleStocks({
        stocks: emptyStocks(),
        ratePerHour: EXTRACTION,
        cap,
        conversions: MINES_AND_ARSENAL,
        hours: 72,
      });

    const bare = stored(ROOM_FOR_ROUNDS);
    const warehoused = stored(stocksOf({ ...ROOM_FOR_ROUNDS, steel: 1_600, coal: 1_600 }));

    expect(bare.chains[0]?.made).toBe(warehoused.chains[0]?.made);
    expect(bare.stocks.steel).toBeLessThan(warehoused.stocks.steel);
  });
});

/**
 * **The instant a reserve ran dry, not merely that it is empty** — what a net rate turning
 * negative owes everything downstream (`consommation-continue.md`). A recruitment queue that
 * reads "it is at zero" advances by eight hours of an army that had nothing to eat for six of
 * them; one that reads "it ran out after two" advances by two.
 */
describe('a reserve emptied by a negative rate', () => {
  const dryAfter = (stock: number, rate: number, hours: number) =>
    settleStocks({
      stocks: stocksOf({ food: stock }),
      ratePerHour: { ...emptyStocks(), food: rate },
      cap: ceilings(),
      conversions: [],
      hours,
    });

  /** The acceptance case, in figures: forty in hand, twenty an hour eaten, read eight hours
   *  later. It ran out after two, and six of those eight hours were a famine. */
  it('says after how long it ran out, not that it is at zero', () => {
    const settled = dryAfter(40, -20, 8);
    expect(settled.stocks.food).toBe(0);
    expect(settled.driedAfterHours.food).toBe(2);
  });

  it('answers nothing for a reserve that lasted the window out', () => {
    const settled = dryAfter(400, -20, 8);
    expect(settled.stocks.food).toBe(240);
    expect(settled.driedAfterHours.food).toBeNull();
  });

  /** A famine that began before the window is read off the stock, not off this: the reserve
   *  did not run out *during* these hours, it opened empty. */
  it('answers nothing for a reserve that opened empty', () => {
    const settled = dryAfter(0, -20, 8);
    expect(settled.stocks.food).toBe(0);
    expect(settled.driedAfterHours.food).toBe(0);
  });

  it('leaves every reserve nobody drains alone', () => {
    expect(dryAfter(40, -20, 8).driedAfterHours.steel).toBeNull();
  });
});

describe('legacy storage placement', () => {
  const region = { deposit: null, coastal: false };
  it('refuses a new depot even on free ground', () => {
    expect(placementRefusal('depot', region, { onRegion: null, hqLevel: 2 }, 1)).toBe(
      'UNKNOWN_BUILDING',
    );
  });
  it('raises an old depot as a warehouse', () => {
    expect(placementRefusal('warehouse', region, { onRegion: 'depot', hqLevel: 2 }, 1)).toBeNull();
  });
});
