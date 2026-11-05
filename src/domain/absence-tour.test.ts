import { describe, expect, it } from 'vitest';
import { SETTLE_MS } from '@/map/engine/frame-demand';
import {
  TOUR_CAP,
  TOUR_HOLD_MS,
  absenceTourOf,
  tourBeatsOf,
  tourStampsOf,
  type TourGates,
} from './absence-tour';
import type { CombatReport, JournalDispatch } from './player-view';

const hour = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dispatch = (
  at: number,
  kind: JournalDispatch['kind'] = 'construction',
  place: { lon: number; lat: number } | null = { lon: at, lat: 45 },
  combat: CombatReport | null = null,
): JournalDispatch => ({
  at,
  place,
  t: `t${at}`,
  severity: 'notable',
  kind,
  text: `d${at}`,
  unread: true,
  remaining: null,
  resolutionAt: null,
  combat,
});
/** The journal is served newest first. */
const journalOf = (...ats: number[]) => ats.map((at) => dispatch(at)).sort((a, b) => b.at - a.at);
const open: TourGates = {
  mode: 'mondiale',
  concluded: false,
  arrivedOnReport: false,
  firstStepsShown: false,
  defeated: false,
  motion: 'full',
};
const marks = (journalReadAt: number | null, absenceTourAt: number | null = null) => ({
  journalReadAt,
  absenceTourAt,
});

describe('absenceTourOf', () => {
  it('replays what is newer than the journal closed and the tour seen, oldest first', () => {
    const journal = journalOf(5, 20, 30, 40).map((d) => ({ ...d, unread: d.at > 10 }));
    const tour = absenceTourOf(journal, marks(10, 25), open)!;
    expect(tour.stops.map((stop) => stop.text)).toEqual(['d30', 'd40']);
    expect(tour.stops[0]).toMatchObject({ at: [30, 45], hour: 't30' });
    // « N dépêches » counts the journal's unread, as the header does; the rest is left out.
    expect(tour).toMatchObject({ fresh: 3, leftOut: 1, since: 10 });
  });

  /** **Le cachet des Sept au rejeu** (#442), un seul arrêt pour la prise : son « capturé » se tait. */
  it('presses the seal of the Seven, at one stop for the point and its capture', () => {
    const narvik = { lon: 17.43, lat: 68.44 };
    const journal = [
      {
        ...dispatch(20, 'pointTaken', narvik),
        point: { key: 'narvik', nation: 'germany', held: 4 },
      },
      dispatch(20, 'captured', narvik),
    ] as JournalDispatch[];
    const tour = absenceTourOf(journal, marks(10), open)!;
    expect(tour.stops).toHaveLength(1);
    expect(tour.stops[0]!.stamps).toEqual([
      {
        kind: 'seal',
        at: [17.43, 68.44],
        words: { word: 'Narvik', hour: hour(20) },
        ink: '#2b6974',
        held: 4,
        roman: 'IV',
        holdMs: TOUR_HOLD_MS,
        over: true,
      },
    ]);
  });

  it('takes the twelve latest that have a place, and leaves the placeless to the journal', () => {
    const ats = Array.from({ length: 15 }, (_, i) => i + 1);
    const journal = [...journalOf(...ats), dispatch(16, 'research', null)].sort(
      (a, b) => b.at - a.at,
    );
    const tour = absenceTourOf(journal, marks(null), open)!;
    expect(TOUR_CAP).toBe(12);
    expect(tour.stops.map((stop) => stop.text)).toEqual(ats.slice(-12).map((at) => `d${at}`));
    expect(tour).toMatchObject({ fresh: 16, leftOut: 4, since: null });
  });

  it('replays nothing when nothing is new since the tour, even with the journal unread', () => {
    expect(absenceTourOf(journalOf(20), marks(10, 30), open)).toBeNull();
    expect(absenceTourOf(journalOf(20), marks(30), open)).toBeNull();
  });

  it('replays nothing when no new dispatch has a place', () => {
    expect(absenceTourOf([dispatch(20, 'research', null)], marks(null), open)).toBeNull();
  });

  it.each<[string, Partial<TourGates>]>([
    ['in Blitz', { mode: 'blitz' }],
    ['on a season over', { concluded: true }],
    ['on an arrival by a report', { arrivedOnReport: true }],
    ['while the first steps show', { firstStepsShown: true }],
    ['to a defeated player, whose tour could not be marked', { defeated: true }],
    ['with motion cut', { motion: 'off' }],
  ])('replays nothing %s', (_, gate) => {
    expect(absenceTourOf(journalOf(20), marks(null), { ...open, ...gate })).toBeNull();
  });
});

describe('tourStampsOf', () => {
  const combat = { id: 'c1', point: { lon: 2, lat: 49 }, won: true } as CombatReport;
  const land = () => true;

  it('stamps « engagé », then « terrain tenu » 800 ms later, both held 2.2 s', () => {
    expect(tourStampsOf(dispatch(20, 'assault', { lon: 2, lat: 49 }, combat), land)).toEqual([
      {
        kind: 'combat',
        at: [2, 49],
        words: { word: 'engagé', hour: hour(20) },
        holdMs: 800,
        over: true,
      },
      {
        kind: 'held',
        at: [2, 49],
        words: { word: 'terrain tenu', hour: hour(20) },
        delayMs: 800,
        holdMs: TOUR_HOLD_MS,
        over: true,
      },
    ]);
  });

  it('draws no battery shot, which a gesture could not take up', () => {
    const fired = {
      ...combat,
      won: false,
      cause: 'bombardment',
      firedFrom: { lon: 1, lat: 48 },
    } as CombatReport;
    const [shelled] = tourStampsOf(dispatch(20, 'assault', { lon: 2, lat: 49 }, fired), land);
    expect(shelled).toMatchObject({ kind: 'combat', words: { word: 'bombardé' } });
    expect(shelled).not.toHaveProperty('from');
  });

  it('presses every stamp over its place, as the mockup does: no piece to keep readable', () => {
    const stamps = tourStampsOf(dispatch(20, 'assault', { lon: 2, lat: 49 }, combat), land);
    expect(stamps.length).toBeGreaterThan(0);
    for (const stamp of stamps) expect(stamp.over).toBe(true);
  });

  it('stamps a lost combat once', () => {
    const lost = { ...combat, won: false };
    expect(tourStampsOf(dispatch(20, 'attacked', { lon: 2, lat: 49 }, lost), land)).toEqual([
      {
        kind: 'combat',
        at: [2, 49],
        words: { word: 'engagé', hour: hour(20) },
        holdMs: 2200,
        over: true,
      },
    ]);
  });

  it.each<[JournalDispatch['kind'], string, string]>([
    ['column', 'arrival', 'arrivé'],
    ['captured', 'captured', 'capturé'],
    ['siteLost', 'captured', 'capturé'],
    ['airdrop', 'airdropped', 'largué'],
    ['construction', 'dispatch', 'chantier'],
    ['supplyDelivered', 'dispatch', 'ravitaillement livré'],
  ])('stamps a %s dispatch at its place', (kind, burst, word) => {
    expect(tourStampsOf(dispatch(20, kind, { lon: 9, lat: 52 }), land)).toEqual([
      {
        kind: burst,
        at: [9, 52],
        words: { word, hour: hour(20) },
        holdMs: TOUR_HOLD_MS,
        over: true,
      },
    ]);
  });
});

describe('tourBeatsOf', () => {
  it('flies 0.7 s and stamps on landing, one stop each 1.6 s after a 1.4 s intro', () => {
    const beats = tourBeatsOf(2, 'full');
    expect(beats).toEqual([
      { at: 1400, does: 'fly', stop: 0 },
      { at: 2100, does: 'stamp', stop: 0 },
      { at: 3000, does: 'fly', stop: 1 },
      { at: 3700, does: 'stamp', stop: 1 },
      { at: 5100, does: 'return', stop: 1 },
      { at: 6700, does: 'done', stop: 1 },
    ]);
  });

  it('cuts to the overview at once when motion is reduced, and stamps a quarter second in', () => {
    expect(tourBeatsOf(1, 'reduced')).toEqual([
      { at: 0, does: 'overview', stop: 0 },
      { at: 1400, does: 'fly', stop: 0 },
      { at: 1650, does: 'stamp', stop: 0 },
      { at: 3050, does: 'return', stop: 0 },
      { at: 4650, does: 'done', stop: 0 },
    ]);
  });

  it.each(['full', 'reduced'] as const)(
    'calls the engine again within the settle window, %s',
    (motion) => {
      const engine = tourBeatsOf(TOUR_CAP, motion).filter((beat) => beat.does !== 'done');
      const gaps = engine.slice(1).map((beat, i) => beat.at - engine[i]!.at);
      expect(Math.max(...gaps)).toBeLessThan(SETTLE_MS);
    },
  );
});
