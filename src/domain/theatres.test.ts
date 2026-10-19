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
  it('cadre le QG d’une Blitz, servi par le serveur, avec un quart du théâtre autour', () => {
    expect(openingFrameOf({ theatre: europe, hqLevel: 1, openingPoint: [16, 53] })).toEqual([
      [16, 53],
      [1.75, 43.5],
      [30.25, 62.5],
    ]);
  });

  it('reste centré sur le QG de part et d’autre de l’antiméridien', () => {
    const [hq, low, high] = openingFrameOf({
      theatre: pacific,
      hqLevel: 1,
      openingPoint: [170, 0],
    })!;
    expect([(low![0] + high![0]) / 2, (low![1] + high![1]) / 2]).toEqual(hq);
    expect(high![0]).toBeGreaterThan(180);
  });

  it('va à la capitale d’une Mondiale et à ses pièces, QG posé ou non', () => {
    expect(openingFrameOf({ theatre: null, hqLevel: 0, openingPoint: [2.35, 48.85] })).toEqual([
      [2.35, 48.85],
    ]);
    expect(
      openingFrameOf({
        theatre: null,
        hqLevel: 1,
        openingPoint: [2.35, 48.85],
        pieces: [[4.8, 45.7]],
      }),
    ).toEqual([
      [2.35, 48.85],
      [4.8, 45.7],
    ]);
    expect(openingFrameOf({ theatre: europe, hqLevel: 1, openingPoint: null })).toBeNull();
  });
});
