import { describe, expect, it } from 'vitest';
import { BLITZ_SHARE, contactKm, detectionRangeOf } from '../../convex/constants';
import { openingFrameOf, theatreById, theatreKm } from './theatres';

const europe = theatreById('europe')!;
const pacific = theatreById('pacific')!;

describe('une distance de Blitz, part de l’étendue de son théâtre (A2)', () => {
  it('garde à l’Europe ses kilomètres d’avant', () => {
    expect(contactKm(europe)).toBe(25);
    expect(detectionRangeOf(['infantry'], europe)).toBeCloseTo(60, -0.5);
    expect(detectionRangeOf(['carrier'], europe)).toBeCloseTo(200, -1);
    expect(theatreKm(europe, BLITZ_SHARE.fireRange)).toBe(150);
    expect(theatreKm(europe, BLITZ_SHARE.deadZone)).toBe(50);
  });

  it('grandit avec le théâtre, dans le même rapport pour toutes', () => {
    const ratio = theatreKm(pacific, 1) / theatreKm(europe, 1);
    expect(ratio).toBeGreaterThan(3);
    expect(contactKm(pacific) / contactKm(europe)).toBeCloseTo(ratio, 1);
    expect(
      detectionRangeOf(['fighter'], pacific) / detectionRangeOf(['fighter'], europe),
    ).toBeCloseTo(ratio, 1);
  });

  it('laisse la Mondiale à ses kilomètres', () => {
    expect(contactKm(null)).toBe(25);
    expect(detectionRangeOf(['infantry', 'fighter'], null)).toBe(150);
  });
});

describe('le cadrage d’ouverture du plateau', () => {
  it('cadre tout le théâtre d’une Blitz, QG posé ou non', () => {
    expect(openingFrameOf({ theatre: europe, hqLevel: 1, openingPoint: [16.5, 53] })).toEqual([
      [-12, 34],
      [45, 34],
      [-12, 72],
      [45, 72],
    ]);
  });

  it('garde l’est déroulé du Pacifique, pour que le cadre tienne sur l’antiméridien', () => {
    expect(openingFrameOf({ theatre: pacific, hqLevel: 1, openingPoint: null })).toContainEqual([
      240, 55,
    ]);
  });

  it('va à la capitale d’une Mondiale sans QG, et nulle part une fois le QG posé', () => {
    expect(openingFrameOf({ theatre: null, hqLevel: 0, openingPoint: [2.35, 48.85] })).toEqual([
      [2.35, 48.85],
    ]);
    expect(openingFrameOf({ theatre: null, hqLevel: 1, openingPoint: [2.35, 48.85] })).toBeNull();
    expect(openingFrameOf({ theatre: null, hqLevel: 0, openingPoint: null })).toBeNull();
  });
});
