import { describe, expect, it } from 'vitest';
import {
  courseRefusalOf,
  fuelAfterCourse,
  fuelCreditOf,
  halfwayOf,
  type Course,
} from './carrier-doctrine';
import { fuelGaugeOf, fuelRefusalOf } from './supplies';

const HOUR = 3_600_000;
/** Yokosuka out to sea, ten hours of open water. */
const atSea: Course = {
  type: 'march',
  onMission: false,
  courseChangedAt: null,
  force: {
    id: 'm',
    points: [
      [140, 35],
      [150, 30],
    ],
    legs: [{ medium: 'sea', distanceUnits: 10 }],
    distanceUnits: 10,
    departedAt: 0,
    arrivesAt: 10 * HOUR,
  },
};
/** A landing: two hours ashore, then the sea. */
const ashoreFirst: Course = {
  ...atSea,
  force: {
    ...atSea.force,
    legs: [
      { medium: 'land', distanceUnits: 1 },
      { medium: 'sea', distanceUnits: 9 },
    ],
  },
};

describe('the carrier doctrine (ADR 0039 §4)', () => {
  it('frees a Japanese course at sea before halfway, and only then', () => {
    expect(halfwayOf(atSea.force)).toBe(5 * HOUR);
    expect(courseRefusalOf('carrierDoctrine', atSea, 2 * HOUR)).toBeNull();
    expect(courseRefusalOf('carrierDoctrine', atSea, 5 * HOUR)).toBe('PAST_HALFWAY');
    expect(courseRefusalOf('carrierDoctrine', ashoreFirst, HOUR / 2)).toBe('NOT_AT_SEA');
  });

  it('is nobody else’s', () => {
    expect(courseRefusalOf(null, atSea, HOUR)).toBe('NO_CARRIER_DOCTRINE');
    expect(courseRefusalOf('lendLease', atSea, HOUR)).toBe('NO_CARRIER_DOCTRINE');
  });

  it('turns a march, an attack or a plain raid, once', () => {
    expect(courseRefusalOf('carrierDoctrine', { ...atSea, type: 'raid' }, HOUR)).toBeNull();
    expect(courseRefusalOf('carrierDoctrine', { ...atSea, type: 'return' }, HOUR)).toBe(
      'COURSE_ON_MISSION',
    );
    expect(courseRefusalOf('carrierDoctrine', { ...atSea, onMission: true }, HOUR)).toBe(
      'COURSE_ON_MISSION',
    );
    expect(courseRefusalOf('carrierDoctrine', { ...atSea, courseChangedAt: 1 }, HOUR)).toBe(
      'COURSE_ALREADY_CHANGED',
    );
  });

  it('holds a column stopped at the border', () => {
    const held = { ...atSea, force: { ...atSea.force, heldAt: HOUR } };
    expect(courseRefusalOf('carrierDoctrine', held, HOUR)).toBe('PAST_HALFWAY');
  });
});

describe('the fuel of a new course', () => {
  it('credits what the old road paid and did not run', () => {
    // 2 400 km paid (5 steps of 500), 600 run (2 steps): 3 steps still paid.
    expect(fuelCreditOf('cargo', 2400, 600)).toBe(3);
    expect(fuelCreditOf('cargo', 2400, 2400)).toBe(0);
  });

  it('takes the surplus from the tank, and loses what the shorter road leaves', () => {
    expect(fuelAfterCourse(4, 3, 5)).toBe(2);
    expect(fuelAfterCourse(4, 3, 1)).toBe(4);
  });

  it('reads the credit in the same gauge and refusal as a departure', () => {
    const cargo = { role: 'cargo' as const, fuel: 1, credit: 3 };
    expect(fuelGaugeOf([cargo], 2400)).toMatchObject({ held: 1, paid: 3, eaten: 5, short: 1 });
    expect(fuelRefusalOf([cargo], 2400)).toEqual({ role: 'cargo', held: 4, needed: 5 });
    expect(fuelRefusalOf([cargo], 2000)).toBeNull();
    expect(fuelGaugeOf([{ role: 'cargo', fuel: 1 }], 400)).not.toHaveProperty('paid');
  });
});
