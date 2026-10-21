import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptServerView, type ServerView } from './serverView';

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

const thread = {
  from: { lon: 0, lat: 0 },
  to: { lon: 1, lat: 1 },
  points: [
    { lon: 0, lat: 0 },
    { lon: 1, lat: 1 },
  ],
  legs: [{ medium: 'land', distanceUnits: 2 }],
  distanceUnits: 2,
  costUnits: 2,
};

/** One answer of the server at `loadedAt`: my column, and a column of theirs watched until +10. */
const answer = (loadedAt: number): ServerView =>
  ({
    loadedAt,
    season: { outcome: null },
    me: {
      nation: 'france',
      ink: '#2f4f78',
      progress: {},
      restWindow: { startMinutes: 0, endMinutes: 0 },
      resources: {},
      slots: {},
      buildings: [],
      chains: [],
      extraction: [],
      regions: [],
      troops: [],
      outposts: [],
    },
    opponents: [],
    movements: [
      {
        ...thread,
        id: 'mine',
        originCountry: 'France',
        destinationCountry: 'France',
        originName: 'Paris',
        destinationName: 'Lyon',
        type: 'march',
        roles: ['infantry'],
        troopIds: ['t'],
        departedAt: NOW - 30 * MINUTE,
        arrivesAt: NOW + 30 * MINUTE,
        heldAt: null,
        holdUntil: null,
      },
    ],
    detected: [
      {
        ...thread,
        id: 'theirs',
        arrivesAt: NOW + 60 * MINUTE,
        headingDegrees: 45,
        headingAtMe: false,
        seenFrom: NOW - 10 * MINUTE,
        seenTo: NOW + 10 * MINUTE,
        detector: 'troop',
        detectorRegion: null,
      },
    ],
  }) as unknown as ServerView;

afterEach(() => {
  vi.useRealTimers();
});

describe('adaptServerView', () => {
  /** **Une réponse qui ne fait qu'avancer l'heure ne change aucun arc** (#183) : la carte, les
   *  étiquettes et la rose ne recalculent pas leurs marches à chaque réponse. */
  it('keeps every arc identical when an answer only moves the clock', () => {
    vi.useFakeTimers({ now: NOW });
    const first = adaptServerView(answer(NOW));
    vi.setSystemTime(NOW + MINUTE);
    const second = adaptServerView(answer(NOW + MINUTE), first);
    expect(second.arcs).toBe(first.arcs);
    expect(second.loadedAt).toBe(NOW + MINUTE);
  });

  it('freezes a sighting into its last known position at the server hour past its watch', () => {
    const watched = adaptServerView(answer(NOW)).arcs[1];
    const lost = adaptServerView(answer(NOW + 11 * MINUTE)).arcs[1];
    expect(watched).toMatchObject({ state: 'enemyDetected', seenTo: NOW + 10 * MINUTE });
    expect(lost).toMatchObject({ state: 'lastKnown', lastSeenAt: NOW + 10 * MINUTE });
    expect(lost).not.toHaveProperty('arrivesAt');
  });
});
