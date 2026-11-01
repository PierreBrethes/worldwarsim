import { describe, expect, it } from 'vitest';
import {
  relayedCostUnits,
  relayedShare,
  temporalPosition,
  unrollRoute,
  unrolledCost,
} from './route-timing';
import { COST_BY_MEDIUM, TRANSFER_COST, directRoute, type ComputedRoute } from './routing';

const combined = (
  land1: number,
  sea: number,
  land2: number,
  landCost = COST_BY_MEDIUM.land,
): ComputedRoute => ({
  mode: 'combined',
  landCost,
  points: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  distanceUnits: land1 + sea + land2,
  costUnits: (land1 + land2) * landCost + sea * COST_BY_MEDIUM.sea + 2 * TRANSFER_COST,
  legs: [
    { medium: 'land', distanceUnits: land1 },
    { medium: 'sea', distanceUnits: sea },
    { medium: 'land', distanceUnits: land2 },
  ],
});

describe('unrollRoute', () => {
  it('inserts a dock between two legs, never at the ends', () => {
    const segments = unrollRoute(combined(10, 20, 5));
    expect(segments.map((segment) => segment.kind)).toEqual(['leg', 'dock', 'leg', 'dock', 'leg']);
  });

  it('the dock before the sea is an embarkation, the one after a landing', () => {
    const docks = unrollRoute(combined(10, 20, 5)).filter((segment) => segment.kind === 'dock');
    expect(docks.map((dock) => dock.embarking)).toEqual([true, false]);
  });

  it('shares sum to 1 and docks count in', () => {
    const segments = unrollRoute(combined(10, 20, 5));
    expect(segments.reduce((sum, segment) => sum + segment.share, 0)).toBeCloseTo(1, 10);
    const dockShare = segments
      .filter((segment) => segment.kind === 'dock')
      .reduce((sum, dock) => sum + dock.share, 0);
    expect(dockShare).toBeCloseTo((2 * TRANSFER_COST) / unrolledCost(combined(10, 20, 5)), 10);
  });

  it('the re-unrolled cost is what the route computation billed', () => {
    const route = combined(10, 20, 5);
    expect(unrolledCost(route)).toBeCloseTo(route.costUnits, 10);
  });

  it('a costless route unrolls nothing rather than dividing by zero', () => {
    expect(unrollRoute(directRoute([0, 0], [1, 1], 'sea', 0))).toEqual([]);
  });
});

describe('temporalPosition', () => {
  const unrolled = unrollRoute(combined(10, 20, 5));

  it('keeps the pawn still through the whole dock crossing', () => {
    const landShare = unrolled[0]!.share;
    const dockShare = unrolled[1]!.share;
    for (const share of [0.05, 0.5, 0.95]) {
      expect(temporalPosition(unrolled, landShare + dockShare * share)).toEqual({
        kind: 'dock',
        legIndex: 1,
      });
    }
  });

  it('returns the local fraction of the crossed leg', () => {
    const position = temporalPosition(unrolled, unrolled[0]!.share / 2);
    expect(position).toEqual({ kind: 'leg', legIndex: 0, local: 0.5 });
  });

  it('clamps at both ends: nothing before departure, nothing past arrival', () => {
    expect(temporalPosition(unrolled, -1)).toEqual({ kind: 'leg', legIndex: 0, local: 0 });
    expect(temporalPosition(unrolled, 2)).toEqual({ kind: 'leg', legIndex: 2, local: 1 });
  });

  it('a single-medium route has neither dock nor jump', () => {
    const direct = unrollRoute(directRoute([0, 0], [10, 0], 'air', 40));
    expect(direct).toHaveLength(1);
    expect(temporalPosition(direct, 0.25)).toEqual({
      kind: 'leg',
      legIndex: 0,
      local: 0.25,
    });
  });
});

/**
 * The pawn walks the trip that was **paid for**. A motorized crossing spends proportionally less
 * of its time on the road, and the shares have to say so — repricing the ground at the foot rate
 * here would park the pawn on the wrong leg while the arc drew the right one.
 */
describe('the motorized share', () => {
  it('gives the road a smaller share than the same route on foot', () => {
    const share = (route: ComputedRoute) =>
      unrollRoute(route)
        .filter((segment) => segment.kind === 'leg' && segment.medium === 'land')
        .reduce((sum, segment) => sum + segment.share, 0);
    expect(share(combined(10, 20, 5, COST_BY_MEDIUM.landMotorized))).toBeLessThan(
      share(combined(10, 20, 5)),
    );
  });

  it('still adds up to the route it was handed', () => {
    const route = combined(10, 20, 5, COST_BY_MEDIUM.landMotorized);
    expect(unrolledCost(route)).toBeCloseTo(route.costUnits, 10);
  });
});

/**
 * **Le relais logistique** (fiche 03) : la part de route qui passe dans son rayon se parcourt
 * plus vite, et rien d'autre ne change. Les quais ne sont pas accélérés — un relais ne rend pas
 * un embarquement plus rapide — et un relais que la route ne croise jamais ne coûte rien.
 */
describe('what a logistics relay does to a road', () => {
  /** A degree of longitude on the equator is some 111 km, so a road along it is a ruler: a
   *  reach of 400 km spans a little over three and a half degrees either side. **Le rayon est
   *  celui du fixture** — il suit le niveau du point en jeu (`outpostReachKm`), et le figer ici
   *  garde ces cas sur la règle plutôt que sur la valeur d'équilibrage du jour. */
  const watching = (lon: number, lat: number) => ({ point: [lon, lat] as const, reachKm: 400 });
  const straight = (fromLon: number, toLon: number): ComputedRoute =>
    directRoute([fromLon, 0], [toLon, 0], 'land', toLon - fromLon);

  it('leaves a road no relay watches exactly as it was', () => {
    const road = straight(0, 10);
    const relays = [watching(0, 40)];

    expect(relayedShare({ points: road.points, relays })).toBe(0);
    expect(relayedCostUnits({ route: road, relays, multiplier: 1.5 })).toBe(road.costUnits);
  });

  it('walks a road entirely under a relay at the multiplier, and nothing else', () => {
    const road = straight(0, 2);
    const relays = [watching(1, 0)];

    expect(relayedShare({ points: road.points, relays })).toBe(1);
    expect(relayedCostUnits({ route: road, relays, multiplier: 1.5 })).toBeCloseTo(
      road.costUnits / 1.5,
      6,
    );
  });

  it('speeds up only the stretch inside the reach', () => {
    const road = straight(0, 10);
    const relays = [watching(0, 0)];
    const share = relayedShare({ points: road.points, relays });

    // 400 km of a 1 110 km road: a bit over a third of it, and the rest at the ordinary pace.
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.4);
    expect(relayedCostUnits({ route: road, relays, multiplier: 1.5 })).toBeCloseTo(
      road.costUnits * (1 - share + share / 1.5),
      6,
    );
  });

  /** **Un relais n'accélère pas un quai.** Le transfert est ce qu'il en coûte de mettre une
   *  colonne sur une coque ; le relais ravitaille la route, pas le port. */
  it('never touches the transfers, even when it covers the whole crossing', () => {
    const road = combined(10, 20, 5);
    const relays = [watching(1.5, 0)];
    const legs = 15 * COST_BY_MEDIUM.land + 20 * COST_BY_MEDIUM.sea;

    expect(relayedShare({ points: road.points, relays })).toBe(1);
    expect(relayedCostUnits({ route: road, relays, multiplier: 1.5 })).toBeCloseTo(
      legs / 1.5 + 2 * TRANSFER_COST,
      6,
    );
  });

  /** **Une liaison n'accélère pas l'air** (Pierre, 01/11, ADR 0037) : la terre et la mer seules. */
  it('leaves a flight under the relays at its full length', () => {
    const flight = directRoute([0, 0], [2, 0], 'air', 2);
    const relays = [watching(1, 0)];

    expect(relayedShare({ points: flight.points, relays })).toBe(1);
    expect(relayedCostUnits({ route: flight, relays, multiplier: 1.5 })).toBe(flight.costUnits);
  });
});
