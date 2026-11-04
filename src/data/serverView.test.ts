import { afterEach, describe, expect, it, vi } from 'vitest';
import { arcProgressAt } from '../domain/arc-timing';
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

  /** **Une colonne qui reparaît repart de sa réapparition** (#412) : le serveur ne sert plus que
   *  la seconde fenêtre, datée de son ouverture, et le pion part du début de ce tronçon — il ne
   *  glisse pas à travers le trou depuis la fin du premier. */
  it('starts a reappearing column at the opening of its new window', () => {
    const second = {
      ...thread,
      from: { lon: 3, lat: 3 },
      points: [
        { lon: 3, lat: 3 },
        { lon: 4, lat: 4 },
      ],
    };
    const reappeared = (loadedAt: number) => {
      const view = answer(loadedAt);
      return {
        ...view,
        detected: [{ ...view.detected![0]!, ...second, seenFrom: NOW, seenTo: NOW + 20 * MINUTE }],
      } as ServerView;
    };
    const [, arc] = adaptServerView(reappeared(NOW)).arcs;
    expect(arc).toMatchObject({ state: 'enemyDetected', since: NOW, from: [3, 3] });
    expect(arcProgressAt(arc!, NOW)).toBe(0);
    expect(arcProgressAt(arc!, NOW + 10 * MINUTE)).toBe(0.5);
    const [, later] = adaptServerView(reappeared(NOW + 5 * MINUTE)).arcs;
    expect(arcProgressAt(later!, NOW + 5 * MINUTE)).toBe(0.25);
  });

  /** **L'atout se dérive de la nation servie** (ADR 0039) : rien pour une nation sans atout, rien
   *  en Blitz, pour moi comme pour un adversaire. */
  it('reads the asset from the nation, in a Mondiale only', () => {
    const base = answer(NOW);
    const withNations = (mode: string, mine: string): ServerView =>
      ({
        ...base,
        mode,
        me: { ...base.me, nation: mine },
        opponents: [
          { nation: 'japan', ink: '#000', restWindow: { startMinutes: 0, endMinutes: 0 } },
        ],
      }) as unknown as ServerView;
    const mondiale = adaptServerView(withNations('mondiale', 'france'));
    expect(mondiale.me.asset).toBeNull();
    expect(mondiale.opponents[0]!.asset).toBe('carrierDoctrine');
    const blitz = adaptServerView(withNations('blitz', 'usa'));
    expect(blitz.me.asset).toBeNull();
    expect(blitz.opponents[0]!.asset).toBeNull();
    expect(adaptServerView(withNations('mondiale', 'usa')).me.asset).toBe('lendLease');
  });
});
