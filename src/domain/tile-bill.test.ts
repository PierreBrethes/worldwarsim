import { describe, expect, it } from 'vitest';
import { billShortageText } from './compass-works';
import { tileBillOf } from './construction';
import { shortfallOf } from './economy';
import type { ResourceKey } from './ids';
import type { Cost, Resource } from './player-view';

const LOADED = 1_000_000;
const NOW = LOADED + 3_600_000;
const held = (stock: number, ratePerHour = 0, cap = 1000): Resource => ({
  stock,
  ratePerHour,
  cap,
});
const reserve = (resources: Partial<Record<ResourceKey, Resource>>) => (key: ResourceKey) =>
  resources[key] ?? held(0);

describe('tileBillOf', () => {
  const bill = (cost: Cost, resources: Partial<Record<ResourceKey, Resource>>, at = LOADED) =>
    tileBillOf(cost, reserve(resources), LOADED, at);

  it('lists only the matter that costs, steel first, a line each with what is held', () => {
    const lines = bill({ coal: 30, steel: 50, food: 0 }, { steel: held(80), coal: held(10) });
    expect(lines.map((line) => line.resource)).toEqual(['steel', 'coal']);
    expect(lines[0]).toMatchObject({
      due: 50,
      held: 80,
      missing: 0,
      availability: { kind: 'now' },
    });
    expect(lines[1]).toMatchObject({ due: 30, held: 10, missing: 20 });
  });

  it('dates each line on its own: a producer waits, a missing producer never comes', () => {
    const lines = bill({ steel: 100, coal: 40 }, { steel: held(50, 25), coal: held(0, 0) });
    expect(lines[0]?.availability).toEqual({ kind: 'inMinutes', minutes: 120 });
    expect(lines[1]?.availability).toEqual({ kind: 'never' });
  });

  it('reads the stock as it stands at now, not as it was loaded', () => {
    const [line] = bill({ steel: 10 }, { steel: held(0, 5) }, NOW);
    expect(line).toMatchObject({ held: 5, missing: 5 });
  });

  it('is empty, hence payable, when the price is empty', () => {
    expect(bill({}, {})).toEqual([]);
  });

  it('counts a stock that is not a number as nothing held', () => {
    const [line] = bill({ steel: 10 }, { steel: held(Number.NaN) });
    expect(line?.missing).toBe(10);
  });

  it('puts first the very resource the server refuses on', () => {
    const cost: Cost = { coal: 40, steel: 60, oil: 5, food: 9 };
    for (const stocks of [
      { steel: held(10), coal: held(0), oil: held(0), food: held(100) },
      { steel: held(60), coal: held(0), oil: held(0), food: held(100) },
      { steel: held(60), coal: held(40), oil: held(0), food: held(0) },
    ]) {
      expect(bill(cost, stocks).find((line) => line.missing > 0)?.resource).toBe(
        shortfallOf(
          cost,
          (key) => (stocks as Partial<Record<ResourceKey, Resource>>)[key]?.stock ?? 0,
        )?.resource,
      );
    }
  });
});

describe('billShortageText', () => {
  const lines = (cost: Cost, resources: Partial<Record<ResourceKey, Resource>>) =>
    tileBillOf(cost, reserve(resources), LOADED, LOADED);

  it('says nothing of a bill that is paid', () => {
    expect(billShortageText(lines({ steel: 10 }, { steel: held(10) }))).toBeNull();
  });

  it('names the first matter in want, steel before the rest, and dates it', () => {
    const text = billShortageText(
      lines({ steel: 100, coal: 40 }, { steel: held(50, 25), coal: held(0) }),
    );
    expect(text).toBe('il manque 50 acier · disponible dans 02:00:00');
  });
});
