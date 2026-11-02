import { describe, expect, it } from 'vitest';
import { borderResolution, arcProgressAt, shareWalked } from './arc-timing';
import type { ArcView } from './player-view';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('shareWalked', () => {
  it('walks the thread between departure and arrival', () => {
    const schedule = {
      departedAt: NOW - HOUR,
      arrivesAt: NOW + HOUR,
      heldAt: null,
      holdUntil: null,
    };
    expect(shareWalked(schedule, NOW)).toBe(0.5);
    expect(borderResolution(schedule)).toBeNull();
  });

  it('stands the column at the end of the thread once the border held it', () => {
    const schedule = {
      departedAt: NOW - HOUR,
      arrivesAt: NOW + 7 * HOUR,
      heldAt: NOW,
      holdUntil: NOW + 7 * HOUR,
    };
    expect(shareWalked(schedule, NOW)).toBe(1);
    expect(borderResolution(schedule)).toBe(NOW + 7 * HOUR);
  });

  /** La retenue est annoncée avant d'être subie : la colonne marche encore vers une plage
   *  déjà connue, et le pion ne doit pas sauter au bout du fil pour autant. */
  it('keeps a column walking towards a rest window it has not reached yet', () => {
    const schedule = {
      departedAt: NOW - HOUR,
      arrivesAt: NOW + HOUR,
      heldAt: null,
      holdUntil: NOW + 3 * HOUR,
    };
    expect(shareWalked(schedule, NOW)).toBe(0.5);
    expect(borderResolution(schedule)).toBe(NOW + 3 * HOUR);
  });
});

/** **La reprise au Fort** (ADR 0037 §6) : le pion repart du point d'entrée, sans reculer. */
describe('shareWalked after a Fort', () => {
  it('reads the stretch before the entry at the old pace and the rest at the new one', () => {
    const schedule = {
      departedAt: NOW,
      arrivesAt: NOW + 16 * HOUR,
      heldAt: null,
      holdUntil: null,
      resumed: { at: NOW + 4 * HOUR, share: 0.4 },
    };
    expect(shareWalked(schedule, NOW + 2 * HOUR)).toBeCloseTo(0.2, 9);
    expect(shareWalked(schedule, NOW + 4 * HOUR)).toBeCloseTo(0.4, 9);
    expect(shareWalked(schedule, NOW + 10 * HOUR)).toBeCloseTo(0.7, 9);
  });
});

/** **The arc does not move, the hour does** (#183): one served arc, read at two instants. */
describe('arcProgressAt', () => {
  const route = {
    mode: 'land',
    points: [],
    distanceUnits: 0,
    costUnits: 0,
    landCost: 1,
    legs: [],
  } as const;
  const watched = {
    state: 'enemyDetected',
    id: 'seen',
    from: [0, 0],
    to: [1, 1],
    route,
    detector: 'troop',
    detectorRegion: null,
    headingDegrees: 0,
    headingAtMe: false,
    identification: { pierced: false },
    arrivesAt: NOW + 5 * HOUR,
    seenTo: NOW + HOUR,
    since: NOW - HOUR,
  } as const satisfies ArcView;

  it('paces a sighting on its watch window, not on the arrival', () => {
    expect(arcProgressAt(watched, NOW)).toBe(0.5);
    expect(arcProgressAt(watched, NOW + 2 * HOUR)).toBe(1);
  });

  /** **Le relevé d'une colonne retenue sous les yeux** (ADR 0037 §6) : le pion ne recule pas, il
   *  ralentit à l'entrée, la part du tronçon déjà vue à cet instant. */
  it('paces a sighting held by a Fort in its window in two paces', () => {
    const held = { ...watched, seenTo: NOW + 5 * HOUR, resumed: { at: NOW, share: 0.25 } };
    expect(arcProgressAt(held, NOW - HOUR / 2)).toBeCloseTo(0.125, 9);
    expect(arcProgressAt(held, NOW)).toBeCloseTo(0.25, 9);
    expect(arcProgressAt(held, NOW + 2.5 * HOUR)).toBeCloseTo(0.625, 9);
  });

  it('keeps a last known position at the end of its stretch', () => {
    const lost = {
      state: 'lastKnown',
      id: 'lost',
      from: [0, 0],
      to: [1, 1],
      route,
      detector: 'troop',
      detectorRegion: null,
      headingDegrees: 0,
      lastSeenAt: NOW - HOUR,
    } as const satisfies ArcView;
    expect(arcProgressAt(lost, NOW)).toBe(1);
  });
});
