import { describe, expect, it } from 'vitest';
import {
  courseNoteOf,
  courseRefusalOf,
  courseTargetRefusalOf,
  nextCourseTurnAt,
  fuelAfterCourse,
  fuelCreditOf,
  halfwayOf,
  type Course,
} from './carrier-doctrine';
import { fuelGaugeOf, fuelRefusalOf } from './supplies';
import { fr } from '@/i18n/fr';

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

describe('the target a fleet is let go on (#449)', () => {
  const march = { kind: 'march' } as const;
  it('takes a march, an attack or a plain raid', () => {
    for (const type of ['march', 'attack', 'raid'] as const)
      expect(courseTargetRefusalOf({ type, mission: march })).toBeNull();
  });
  it('refuses a target that would give the fleet a mission, a boarding or a round trip', () => {
    for (const mission of [
      { kind: 'plunder' },
      { kind: 'collect' },
      { kind: 'march', boardsOn: 'tr' },
      { kind: 'march', roundTrip: true },
    ])
      expect(courseTargetRefusalOf({ type: 'march', mission })).toBe('COURSE_TARGET_ON_MISSION');
    expect(courseTargetRefusalOf({ type: 'outpost', mission: march })).toBe(
      'COURSE_TARGET_ON_MISSION',
    );
  });
});

describe('the fiche of a fleet at sea', () => {
  const arc = {
    state: 'mine',
    id: 'm',
    type: 'march',
    from: [140, 35],
    to: [150, 30],
    route: { points: atSea.force.points, legs: atSea.force.legs, distanceUnits: 10 },
    schedule: { departedAt: 0, arrivesAt: 10 * HOUR, heldAt: null, holdUntil: null },
  } as unknown as Parameters<typeof courseNoteOf>[1];
  it('tells another nation at sea in Mondiale that a departed movement stays its course', () => {
    expect(courseNoteOf(null, arc, HOUR, 'mondiale')).toEqual({ kind: 'others' });
  });
  it('says nothing in Blitz, where the doctrine does not exist', () => {
    expect(courseNoteOf(null, arc, HOUR, 'blitz')).toBeNull();
  });
  it('is read again at the next halfway of a Japanese fleet', () => {
    expect(nextCourseTurnAt([arc], 'carrierDoctrine', HOUR)).toBe(5 * HOUR);
    expect(nextCourseTurnAt([arc], 'carrierDoctrine', 6 * HOUR)).toBeNull();
    expect(nextCourseTurnAt([arc], null, HOUR)).toBeNull();
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

/** **Le plein d'un cap changé, refusé** : le compte tient déjà le crédit, et l'ancre est loin. */
describe('a course change short of fuel', () => {
  it('says the paid fuel is counted, and sends nobody to anchor', () => {
    const said = fr.errors.NOT_ENOUGH_FUEL({
      role: 'cargo',
      held: 4,
      needed: 5,
      km: 2400,
      roundTrip: false,
      course: true,
    });
    expect(said).toContain('plein déjà payé compris');
    expect(said).not.toContain('ancre');
  });
});
