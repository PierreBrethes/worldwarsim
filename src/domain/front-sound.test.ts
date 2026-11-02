import { describe, expect, it } from 'vitest';
import {
  distanceStepOf,
  frontChangesOf,
  queued,
  onReturn,
  type FrontChange,
  type FrontView,
} from './front-sound';
import type { ArcView, JournalDispatch } from './player-view';
import { theatreById } from './theatres';

const PARIS: [number, number] = [2.35, 48.85];

const view = (patch: Partial<FrontView> = {}): FrontView => ({
  mode: 'mondiale',
  theatre: null,
  me: {
    buildings: [{ key: 'hq', point: PARIS }],
    capitalPoint: [13.4, 52.5],
    openingPoint: null,
  },
  arcs: [],
  journal: [],
  press: null,
  ...patch,
});

const seen = (id: string, from: [number, number], medium: 'land' | 'sea' | 'air' = 'land') =>
  ({
    state: 'enemyDetected',
    id,
    from,
    to: [from[0] + 1, from[1]],
    route: { legs: [{ medium, distanceUnits: 1 }], points: [from, [from[0] + 1, from[1]]] },
    headingAtMe: false,
  }) as unknown as ArcView;

const dispatch = (patch: Partial<JournalDispatch>): JournalDispatch =>
  ({ at: 1, kind: 'column', combat: null, place: null, ...patch }) as JournalDispatch;

describe('frontChangesOf', () => {
  it('says nothing between two equal views', () => {
    const board = view({ arcs: [seen('a', [3, 49])] });
    expect(frontChangesOf(board, board)).toEqual([]);
  });

  it('says a column entering the watch, near the HQ, from its side', () => {
    const [change] = frontChangesOf(view(), view({ arcs: [seen('a', [4.5, 48.85])] }));
    expect(change).toMatchObject({ nature: 'column', step: 'near', inbound: false });
    expect(change!.bearing).toBeGreaterThan(80);
    expect(change!.bearing).toBeLessThan(100);
  });

  it('hears distance from the HQ, not from the capital', () => {
    // Berlin is the capital: 880 km from the HQ in Paris, so far.
    const [change] = frontChangesOf(view(), view({ arcs: [seen('a', [13.4, 52.5], 'sea')] }));
    expect(change).toMatchObject({ nature: 'fleet', step: 'far' });
  });

  it('falls back to the capital before the HQ stands', () => {
    const bare = { buildings: [], capitalPoint: [13.4, 52.5] as const, openingPoint: null };
    const [change] = frontChangesOf(
      view({ me: bare }),
      view({ me: bare, arcs: [seen('a', [13.5, 52.5], 'air')] }),
    );
    expect(change).toMatchObject({ nature: 'aviation', step: 'near' });
  });

  it('names a combined arc by its first leg', () => {
    const arc = {
      ...seen('a', [3, 49]),
      route: { legs: [{ medium: 'sea' }, { medium: 'land' }], points: [[3, 49]] },
    } as unknown as ArcView;
    expect(frontChangesOf(view(), view({ arcs: [arc] }))[0]!.nature).toBe('fleet');
  });

  it('says one phrase for two sightings of one route', () => {
    const twice = [seen('a', [3, 49]), { ...seen('b', [3, 49]) }];
    expect(frontChangesOf(view(), view({ arcs: twice }))).toHaveLength(1);
  });

  it('keeps « vers vous » as served', () => {
    const arc = { ...seen('a', [3, 49]), headingAtMe: true } as ArcView;
    expect(frontChangesOf(view(), view({ arcs: [arc] }))[0]!.inbound).toBe(true);
  });

  it('stays mute for my own arcs and for what was already watched', () => {
    const mine = { ...seen('m', [3, 49]), state: 'mine' } as unknown as ArcView;
    const before = view({ arcs: [seen('a', [3, 49])] });
    expect(frontChangesOf(before, view({ arcs: [seen('a', [3, 49]), mine] }))).toEqual([]);
  });

  it('says a new combat of mine by its report, and an HQ attacked', () => {
    const report = { id: 'c1', point: { lon: 2.36, lat: 48.86 } };
    const fight = dispatch({
      at: 5,
      kind: 'attacked',
      combat: report as JournalDispatch['combat'],
      place: { lon: 2.36, lat: 48.86 },
    });
    const [change] = frontChangesOf(view(), view({ journal: [fight] }));
    expect(change).toMatchObject({ nature: 'combat', step: 'near', hqAttacked: true });
    expect(frontChangesOf(view({ journal: [fight] }), view({ journal: [fight] }))).toEqual([]);
  });

  it('rings a capture taken, lost or threatened, never one started or lifted', () => {
    const at = (kind: JournalDispatch['kind']) =>
      frontChangesOf(
        view(),
        view({ journal: [dispatch({ at: 9, kind, place: { lon: 20, lat: 50 } })] }),
      ).map((change) => change.nature);
    expect(at('captured')).toEqual(['capture']);
    expect(at('siteLost')).toEqual(['capture']);
    expect(at('captureThreat')).toEqual(['capture']);
    expect(at('captureStarted')).toEqual([]);
    expect(at('captureCancelled')).toEqual([]);
  });

  it('says a finished construction, not one cancelled or demolished', () => {
    const finished = dispatch({ at: 9, kind: 'construction', built: true });
    const cancelled = dispatch({ at: 9, kind: 'construction' });
    expect(frontChangesOf(view(), view({ journal: [finished, cancelled] }))).toMatchObject([
      { nature: 'construction', step: 'near' },
    ]);
  });

  it('only counts dispatches past the latest one already there', () => {
    const old = dispatch({ at: 9, kind: 'construction', built: true });
    const older = dispatch({ at: 3, kind: 'construction', built: true });
    expect(frontChangesOf(view({ journal: [old] }), view({ journal: [old, older] }))).toEqual([]);
  });

  it('says the edition when its hour changes, the first one included', () => {
    const press = { at: 100 } as FrontView['press'];
    expect(frontChangesOf(view(), view({ press }))).toMatchObject([
      { nature: 'edition', bearing: null },
    ]);
    expect(frontChangesOf(view({ press }), view({ press }))).toEqual([]);
  });
});

describe('distanceStepOf', () => {
  it('cuts the Mondiale at 250 and 550 km', () => {
    expect([200, 400, 600].map((km) => distanceStepOf(km, null))).toEqual(['near', 'mid', 'far']);
  });

  it('cuts a wide Blitz theatre as a share of it', () => {
    const pacific = theatreById('pacific');
    expect(pacific).not.toBeNull();
    expect(distanceStepOf(400, pacific)).toBe('near');
  });
});

const change = (key: string, patch: Partial<FrontChange> = {}): FrontChange => ({
  key,
  nature: 'column',
  step: 'mid',
  bearing: 0,
  inbound: false,
  hqAttacked: false,
  ...patch,
});

describe('the queue', () => {
  it('holds six, dropping the coldest first', () => {
    const fights = [1, 2, 3].map((n) => change(`f${n}`, { nature: 'combat' }));
    const columns = [1, 2, 3].map((n) => change(`c${n}`));
    const full = [...fights, ...columns].reduce(queued, [] as ReadonlyArray<FrontChange>);
    const next = queued(full, change('f4', { nature: 'combat' }));
    expect(next.map((item) => item.key)).toEqual(['f1', 'f2', 'f3', 'c2', 'c3', 'f4']);
  });

  it('on return, sounds the three hottest and prints the rest', () => {
    const missed = [
      change('c1'),
      change('c1'),
      change('in', { inbound: true }),
      change('hq', { nature: 'combat', hqAttacked: true }),
      change('f', { nature: 'combat' }),
      change('c2', { step: 'far' }),
    ];
    const { heard, printed } = onReturn(missed);
    expect(heard.map((item) => item.key)).toEqual(['hq', 'f', 'in']);
    expect(printed.map((item) => item.key)).toEqual(['c1', 'c2']);
  });
});
