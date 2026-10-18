import { describe, expect, it } from 'vitest';
import { fuelRefusalOf, outOfRounds, pileSupplies, suppliesOf, topUp } from './supplies';

const STOCKS = { ammunition: 1000, oil: 1000, coal: 1000 };

describe('what a troop carries', () => {
  it('is full when nothing was ever spent', () => {
    expect(suppliesOf({ role: 'armor' })).toEqual({ rounds: 2, fuel: 3 });
    expect(suppliesOf({ role: 'infantry' })).toEqual({ rounds: 3, fuel: 0 });
  });
});

describe('the top-up at the anchor', () => {
  it('fills what is missing, ten a step, rounds in ammunition and fuel in its own resource', () => {
    const { supplies, cost } = topUp(
      [
        { id: 'tank', role: 'armor', rounds: 0, fuel: 1 },
        { id: 'ship', role: 'escort', rounds: 3, fuel: 2 },
      ],
      STOCKS,
    );
    expect(supplies.get('tank')).toEqual({ rounds: 2, fuel: 3 });
    expect(supplies.get('ship')).toEqual({ rounds: 3, fuel: 6 });
    expect(cost).toEqual({ ammunition: 20, oil: 20, coal: 40 });
  });

  it('hands out whole steps only, in order, while the stock lasts', () => {
    const { supplies, cost } = topUp(
      [
        { id: 'a', role: 'infantry', rounds: 0 },
        { id: 'b', role: 'infantry', rounds: 0 },
      ],
      { ammunition: 45, oil: 0, coal: 0 },
    );
    expect(supplies.get('a')).toEqual({ rounds: 3, fuel: 0 });
    expect(supplies.get('b')).toEqual({ rounds: 1, fuel: 0 });
    expect(cost.ammunition).toBe(40);
  });
});

describe('the fuel a route asks', () => {
  it('lets a route within the smallest fuel of the squad go', () => {
    expect(fuelRefusalOf([{ role: 'armor', fuel: 3 }], 1500)).toBeNull();
  });

  it('refuses a route longer than the smallest fuel, and says by how much', () => {
    expect(
      fuelRefusalOf(
        [
          { role: 'armor', fuel: 3 },
          { role: 'landTransport', fuel: 1 },
        ],
        700,
      ),
    ).toEqual({ needed: 2, held: 1, role: 'landTransport' });
  });

  it('asks nothing of a troop without an engine', () => {
    expect(fuelRefusalOf([{ role: 'infantry' }], 5000)).toBeNull();
  });
});

describe('an attack without rounds', () => {
  it('is out of rounds when every armed troop is dry', () => {
    expect(outOfRounds([{ role: 'infantry', rounds: 0 }, { role: 'landTransport' }])).toBe(true);
    expect(
      outOfRounds([
        { role: 'infantry', rounds: 0 },
        { role: 'armor', rounds: 1 },
      ]),
    ).toBe(false);
  });

  it('never says it of a column that carries no weapon', () => {
    expect(outOfRounds([{ role: 'cargo' }])).toBe(false);
  });
});

describe('what a pile says of its steps', () => {
  it('sums the rounds of its armed troops and keeps the smallest fuel', () => {
    expect(
      pileSupplies([
        { role: 'infantry', supplies: { rounds: 1, fuel: 0 } },
        { role: 'armor', supplies: { rounds: 2, fuel: 3 } },
        { role: 'landTransport', supplies: { rounds: 0, fuel: 1 } },
      ]),
    ).toEqual({
      rounds: { held: 3, full: 5 },
      fuel: { held: 1, full: 4, resource: 'oil' },
    });
  });

  it('says nothing in Blitz, where nobody counts', () => {
    expect(pileSupplies([{ role: 'infantry' }])).toBeNull();
  });
});
