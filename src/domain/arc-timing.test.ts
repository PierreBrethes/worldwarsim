import { describe, expect, it } from 'vitest';
import { arcTiming } from './arc-timing';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('arcTiming', () => {
  it('walks the thread between departure and arrival', () => {
    const timing = arcTiming(
      { departedAt: NOW - HOUR, arrivesAt: NOW + HOUR, heldAt: null, holdUntil: null },
      NOW,
    );
    expect(timing).toEqual({ minutesLeft: 60, progress: 0.5, borderWait: null });
  });

  it('stands the column at the end of the thread once the border held it', () => {
    const timing = arcTiming(
      { departedAt: NOW - HOUR, arrivesAt: NOW + 7 * HOUR, heldAt: NOW, holdUntil: NOW + 7 * HOUR },
      NOW,
    );
    expect(timing).toEqual({
      minutesLeft: 0,
      progress: 1,
      borderWait: { resolutionInMinutes: 420 },
    });
  });

  /** La retenue est annoncée avant d'être subie : la colonne marche encore vers une plage
   *  déjà connue, et le pion ne doit pas sauter au bout du fil pour autant. */
  it('keeps a column walking towards a rest window it has not reached yet', () => {
    const timing = arcTiming(
      { departedAt: NOW - HOUR, arrivesAt: NOW + HOUR, heldAt: null, holdUntil: NOW + 3 * HOUR },
      NOW,
    );
    expect(timing.progress).toBeLessThan(1);
    expect(timing.minutesLeft).toBe(60);
    expect(timing.borderWait).toEqual({ resolutionInMinutes: 180 });
  });
});
