import { describe, expect, it } from 'vitest';
import { BAKU_REFUEL_MS } from '../../convex/constants';
import {
  bakuGainOf,
  bakuRefuel,
  fuelGaugeOf,
  fuelRefusalOf,
  fuelStepsOf,
  outOfRounds,
  pileSupplies,
  suppliesOf,
  topUp,
} from './supplies';

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
        { id: 'tank', role: 'armor', rounds: 0, fuel: 1, anchored: true },
        { id: 'ship', role: 'escort', rounds: 3, fuel: 2, anchored: true },
      ],
      STOCKS,
    );
    expect(supplies.get('tank')).toEqual({ rounds: 2, fuel: 3 });
    expect(supplies.get('ship')).toEqual({ rounds: 3, fuel: 6 });
    expect(cost).toEqual({ ammunition: 20, oil: 20, coal: 40 });
  });

  it('hands out whole steps only, by identifier whatever the order given, while the stock lasts', () => {
    const { supplies, cost } = topUp(
      [
        { id: 'b', role: 'infantry', rounds: 0, anchored: true },
        { id: 'a', role: 'infantry', rounds: 0, anchored: true },
      ],
      { ammunition: 45, oil: 0, coal: 0 },
    );
    expect(supplies.get('a')).toEqual({ rounds: 3, fuel: 0 });
    expect(supplies.get('b')).toEqual({ rounds: 1, fuel: 0 });
    expect(cost.ammunition).toBe(40);
  });

  it('leaves a troop away from its anchor on what it carries', () => {
    const { supplies, cost } = topUp(
      [{ id: 'far', role: 'infantry', rounds: 0, anchored: false }],
      STOCKS,
    );
    expect(supplies.has('far')).toBe(false);
    expect(cost.ammunition).toBe(0);
  });
});

describe('the fuel a route costs an engine', () => {
  it('is the plain ceil(km / 500) for everyone without Singapore', () => {
    expect(fuelStepsOf('landTransport', 0)).toBe(0);
    expect(fuelStepsOf('landTransport', 1)).toBe(1);
    expect(fuelStepsOf('landTransport', 1500)).toBe(3);
    expect(fuelStepsOf('armor', 1500, true)).toBe(3);
  });

  it('takes 20 % off a truck or a cargo at Singapore, in whole steps rounded up', () => {
    // A one-step road stays one step: the discount never makes a trip free.
    expect(fuelStepsOf('landTransport', 1, true)).toBe(1);
    expect(fuelStepsOf('landTransport', 500, true)).toBe(1);
    expect(fuelStepsOf('cargo', 501, true)).toBe(1);
    expect(fuelStepsOf('cargo', 626, true)).toBe(2);
    expect(fuelStepsOf('cargo', 2500, true)).toBe(4);
    expect(fuelStepsOf('landTransport', 0, true)).toBe(0);
  });
});

describe('the fuel Baku gives back to a stopped troop', () => {
  const since = 1_000_000;
  it('is a step every twelve hours, none before', () => {
    expect(bakuRefuel('armor', 0, since, since + BAKU_REFUEL_MS - 1)).toMatchObject({
      steps: 0,
      nextAt: since + BAKU_REFUEL_MS,
    });
    expect(bakuRefuel('armor', 0, since, since + BAKU_REFUEL_MS)).toMatchObject({
      steps: 1,
      since: since + BAKU_REFUEL_MS,
      nextAt: since + 2 * BAKU_REFUEL_MS,
    });
  });

  it('keeps the remainder of a period it has not counted yet', () => {
    const got = bakuRefuel('armor', 0, since, since + 2.5 * BAKU_REFUEL_MS);
    expect(got).toEqual({
      steps: 2,
      since: since + 2 * BAKU_REFUEL_MS,
      nextAt: since + 3 * BAKU_REFUEL_MS,
    });
  });

  it('stops at the full tank and announces no next step', () => {
    expect(bakuRefuel('armor', 2, since, since + 9 * BAKU_REFUEL_MS)).toEqual({
      steps: 1,
      since: since + 9 * BAKU_REFUEL_MS,
      nextAt: null,
    });
    expect(bakuRefuel('armor', 3, since, since + BAKU_REFUEL_MS).nextAt).toBeNull();
  });

  it('gives nothing to a troop without an engine, nor before the clock starts', () => {
    expect(bakuRefuel('infantry', 0, since, since + 9 * BAKU_REFUEL_MS).steps).toBe(0);
    expect(bakuRefuel('armor', 0, since + BAKU_REFUEL_MS, since).steps).toBe(0);
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

  it('asks a truck of Singapore’s holder 20 % less, an armour the plain price', () => {
    expect(
      fuelRefusalOf(
        [
          { role: 'landTransport', fuel: 3 },
          { role: 'armor', fuel: 3 },
        ],
        1500,
        true,
      ),
    ).toBeNull();
    expect(fuelRefusalOf([{ role: 'landTransport', fuel: 4 }], 2500, true)).toBeNull();
    expect(fuelRefusalOf([{ role: 'landTransport', fuel: 4 }], 2500)).toEqual({
      needed: 5,
      held: 4,
      role: 'landTransport',
    });
    expect(fuelRefusalOf([{ role: 'landTransport', fuel: 3 }], 2500, true)).toEqual({
      needed: 4,
      held: 3,
      role: 'landTransport',
    });
  });

  it('asks nothing of a troop without an engine', () => {
    expect(fuelRefusalOf([{ role: 'infantry' }], 5000)).toBeNull();
  });
});

describe('the gauge a route drains', () => {
  it('shows the smallest fuel of the squad, the steps the route eats and none missing', () => {
    expect(
      fuelGaugeOf(
        [
          { role: 'armor', fuel: 3 },
          { role: 'landTransport', fuel: 4 },
        ],
        1200,
      ),
    ).toEqual({ held: 3, full: 3, resource: 'oil', eaten: 3, spared: 0, short: 0 });
  });

  it('says what is missing when the route is longer than the fuel', () => {
    expect(fuelGaugeOf([{ role: 'landTransport', fuel: 1 }], 1600)).toMatchObject({
      held: 1,
      eaten: 4,
      short: 3,
    });
  });

  it('reads coal for a ship', () => {
    expect(fuelGaugeOf([{ role: 'cargo' }], 400)).toMatchObject({ resource: 'coal', full: 6 });
  });

  it('shows the step Singapore spares a truck', () => {
    expect(fuelGaugeOf([{ role: 'landTransport', fuel: 2 }], 1000, true)).toMatchObject({
      eaten: 2,
      spared: 0,
    });
    expect(fuelGaugeOf([{ role: 'landTransport', fuel: 4 }], 2500, true)).toMatchObject({
      eaten: 4,
      spared: 1,
      short: 0,
    });
  });

  it('reads the engine the route binds, not only the emptiest one', () => {
    // At Singapore the cargo pays 5 steps of 7 and holds them; the escort pays all 7 of its 6.
    expect(
      fuelGaugeOf(
        [
          { role: 'cargo', fuel: 5 },
          { role: 'escort', fuel: 6 },
        ],
        3100,
        true,
      ),
    ).toMatchObject({ held: 6, eaten: 7, short: 1 });
  });

  it('has no gauge for a pile without an engine', () => {
    expect(fuelGaugeOf([{ role: 'infantry' }], 900)).toBeNull();
    expect(fuelGaugeOf([], 900)).toBeNull();
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
      fuel: { held: 1, full: 4, resource: 'oil', refuelAt: null },
    });
  });

  it('says nothing in Blitz, where nobody counts', () => {
    expect(pileSupplies([{ role: 'infantry' }])).toBeNull();
  });
});

describe('who gets Baku’s steps back', () => {
  const tank = { role: 'armor' as const, fuel: 0, fuelAt: 0, createdAt: 0 };
  const idle = { heldSince: 0, marching: false, anchored: false };
  const day = BAKU_REFUEL_MS * 2;

  it('counts from the taking of the point when the troop waited there before', () => {
    expect(bakuGainOf(tank, { ...idle, heldSince: 10 * day }, 10 * day + 1)?.steps).toBe(0);
    expect(
      bakuGainOf(tank, { ...idle, heldSince: 10 * day }, 10 * day + BAKU_REFUEL_MS)?.steps,
    ).toBe(1);
    expect(bakuGainOf(tank, idle, 10 * day)?.steps).toBe(3);
  });

  it('gives nothing to a marching, anchored or point-less owner, nor to a troop without an engine', () => {
    expect(bakuGainOf(tank, { ...idle, marching: true }, 9 * day)).toBeNull();
    expect(bakuGainOf(tank, { ...idle, anchored: true }, 9 * day)).toBeNull();
    expect(bakuGainOf(tank, { ...idle, heldSince: null }, 9 * day)).toBeNull();
    expect(bakuGainOf({ ...tank, role: 'infantry' }, idle, 9 * day)).toBeNull();
  });
});
