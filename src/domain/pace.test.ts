import { describe, expect, it } from 'vitest';
import { MINUTES_PER_ROUTE_UNIT, routeMinutes } from '../../convex/constants';
import { theatreMinutesPer1000Km } from './blitz';
import { costMinutes, minutesPer1000KmOf, paceCostOf } from './pace';
import { COST_BY_MEDIUM, KM_PER_UNIT } from './routing';
import { THEATRES } from './theatres';

const europe = THEATRES[0];

describe('costMinutes', () => {
  it('prices a Mondiale route as routeMinutes does', () => {
    expect(costMinutes(100, null)).toBe(routeMinutes(100));
  });

  it('prices a Blitz route on the theatre clock, in whole seconds', () => {
    const minutes = costMinutes(100, europe);
    const exact = (100 * MINUTES_PER_ROUTE_UNIT * theatreMinutesPer1000Km(europe)) / 14;
    expect(minutes).toBeCloseTo(exact, 1);
    expect(Math.round(minutes * 60)).toBe(minutes * 60);
  });
});

describe('paceCostOf', () => {
  it('walks infantry and rolls everything else on land', () => {
    expect(paceCostOf(['infantry'])).toBe(COST_BY_MEDIUM.land);
    expect(paceCostOf(['armor'])).toBe(COST_BY_MEDIUM.landMotorized);
    expect(paceCostOf(['artillery'])).toBe(COST_BY_MEDIUM.landMotorized);
  });

  it('puts the infantry in the truck, one truck seating two', () => {
    expect(paceCostOf(['infantry', 'infantry', 'landTransport'])).toBe(
      COST_BY_MEDIUM.landMotorized,
    );
    expect(paceCostOf(['infantry', 'infantry', 'infantry', 'landTransport'])).toBe(
      COST_BY_MEDIUM.land,
    );
  });

  it('prices the sea and the air at one unit a unit', () => {
    expect(paceCostOf(['cargo'])).toBe(COST_BY_MEDIUM.sea);
    expect(paceCostOf(['fighter'])).toBe(1);
  });

  it('sets a mixed pile at its slowest medium', () => {
    expect(paceCostOf(['cargo', 'infantry'])).toBe(COST_BY_MEDIUM.land);
  });
});

describe('minutesPer1000KmOf', () => {
  it('is a thousand kilometres of the role’s cost, on the Mondiale clock', () => {
    expect(minutesPer1000KmOf(['infantry'], null)).toBe(
      routeMinutes((1000 / KM_PER_UNIT) * COST_BY_MEDIUM.land),
    );
    expect(minutesPer1000KmOf(['cargo'], null)).toBe(
      routeMinutes((1000 / KM_PER_UNIT) * COST_BY_MEDIUM.sea),
    );
  });

  it('is shorter on the Blitz theatre', () => {
    expect(minutesPer1000KmOf(['infantry'], europe)).toBeLessThan(
      minutesPer1000KmOf(['infantry'], null),
    );
  });
});
