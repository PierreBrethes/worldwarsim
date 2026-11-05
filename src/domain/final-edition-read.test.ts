import { describe, expect, it } from 'vitest';
import { frameOf, handSpansOf, verdictTimingOf } from './final-edition-read';

const HOUR = 3_600_000;
const launchedAt = Date.UTC(2026, 9, 24, 18);
/** Une Mondiale de dix jours : l'horloge tombe à 240 h. */
const season = { launchedAt, durationHours: 240 };

describe('verdictTimingOf', () => {
  it('dit l’avance sur l’horloge pour les points, le QG pris et le dernier debout', () => {
    for (const reason of ['points', 'hqTaken', 'lastStanding'] as const)
      expect(verdictTimingOf({ ...season, reason, concludedAt: launchedAt + 237 * HOUR })).toEqual({
        kind: 'ahead',
        hours: 3,
      });
  });

  it('dit « à l’horloge » quand l’horloge a tranché, égalité comprise', () => {
    for (const reason of ['clock', 'territory', 'draw'] as const)
      expect(verdictTimingOf({ ...season, reason, concludedAt: launchedAt + 240 * HOUR })).toEqual({
        kind: 'clock',
      });
  });

  it('dit l’avance d’une clôture à la main avec horloge, la date seule sans horloge', () => {
    expect(
      verdictTimingOf({ ...season, reason: 'closed', concludedAt: launchedAt + 190 * HOUR }),
    ).toEqual({ kind: 'ahead', hours: 50 });
    expect(
      verdictTimingOf({
        launchedAt,
        durationHours: null,
        reason: 'closed',
        concludedAt: launchedAt + 190 * HOUR,
      }),
    ).toEqual({ kind: 'date' });
  });

  it('ne dit aucune avance de moins d’une heure : la conclusion tombe à l’horloge', () => {
    expect(
      verdictTimingOf({ ...season, reason: 'points', concludedAt: launchedAt + 239.8 * HOUR }),
    ).toEqual({ kind: 'clock' });
  });
});

describe('handSpansOf', () => {
  it('tient chaque main jusqu’à la suivante, retour au neutre compris, la dernière jusqu’à la fin', () => {
    expect(
      handSpansOf(
        [
          { at: 10, nation: 'france' },
          { at: 40, nation: null },
          { at: 60, nation: 'germany' },
        ],
        100,
      ),
    ).toEqual([
      { from: 10, to: 40, nation: 'france' },
      { from: 40, to: 60, nation: null },
      { from: 60, to: 100, nation: 'germany' },
    ]);
  });
});

describe('frameOf', () => {
  it('cadre le monde entier en Mondiale à huit, l’Europe à trois', () => {
    expect(frameOf('world')).toEqual([0, 0, 400, 208]);
    const [west, north, east, south] = frameOf('europe');
    expect(east - west).toBeLessThan(100);
    expect(south - north).toBeLessThan(80);
  });

  it('cadre une région de jeu inconnue sur le monde', () => {
    expect(frameOf('atlantide')).toEqual([0, 0, 400, 208]);
  });
});
