import { describe, expect, it } from 'vitest';
import {
  groupJournal,
  retainBundles,
  journalLines,
  passesFilter,
  type JournalLine,
} from './journal-lines';
import type { DispatchKind, DispatchSeverity, JournalDispatch } from './player-view';

const dispatch = (
  at: number,
  severity: DispatchSeverity,
  kind: DispatchKind,
  text = `${kind} ${at}`,
  unread = false,
): JournalDispatch => ({
  at,
  t: String(at),
  severity,
  kind,
  text,
  unread,
  remaining: null,
  resolutionAt: null,
  combat: null,
  place: null,
});

describe('journalLines', () => {
  it('keeps the served order, whatever the severity', () => {
    const lines = journalLines([
      dispatch(5, 'routine', 'delivery'),
      dispatch(4, 'critical', 'column'),
      dispatch(3, 'routine', 'construction'),
    ]);

    expect(lines.map((line) => line.dispatch.at)).toEqual([5, 4, 3]);
  });

  it('keeps the newest edition alone and counts the ones it replaces', () => {
    const lines = journalLines([
      dispatch(9, 'routine', 'edition', 'édition de 22:58 — 1er'),
      dispatch(8, 'routine', 'delivery'),
      dispatch(6, 'routine', 'edition', 'édition de 19:57 — 1er'),
      dispatch(3, 'routine', 'edition', 'édition de 16:57 — 2e'),
    ]);

    expect(lines).toEqual([
      { dispatch: expect.objectContaining({ at: 9 }), earlier: 2 },
      { dispatch: expect.objectContaining({ at: 8 }), earlier: 0 },
    ]);
  });
});

describe('passesFilter', () => {
  const fresh = dispatch(2, 'critical', 'column', 'a', true);
  const read = dispatch(1, 'notable', 'column', 'b');

  it('lets everything through on « tout »', () => {
    expect([fresh, read].every((entry) => passesFilter(entry, 'all'))).toBe(true);
  });

  it('keeps the unread on « non lues », a severity on its own filter', () => {
    expect([fresh, read].filter((entry) => passesFilter(entry, 'unread'))).toEqual([fresh]);
    expect([fresh, read].filter((entry) => passesFilter(entry, 'notable'))).toEqual([read]);
  });
});

describe('groupJournal', () => {
  const MIN = 60_000;
  const at = (minute: number, second = 0) => minute * MIN + second * 1000;
  const entry = (
    time: number,
    kind: DispatchKind,
    extra: Partial<JournalDispatch> = {},
  ): JournalLine => ({
    dispatch: { ...dispatch(time, 'routine', kind), ...extra },
    earlier: 0,
  });
  const sizes = (lines: JournalLine[]) => groupJournal(lines).map((bundle) => bundle.lines.length);
  const place = (lon: number) => ({ place: { lon, lat: 10 } });

  it('folds neighbours of the same kind in the same minute, newest first, and leaves a lone one alone', () => {
    const bundles = groupJournal([
      entry(at(5, 50), 'delivery'),
      entry(at(5, 10), 'delivery'),
      entry(at(2), 'delivery'),
    ]);

    expect(bundles.map((bundle) => bundle.lines.map((line) => line.dispatch.at))).toEqual([
      [at(5, 50), at(5, 10)],
      [at(2)],
    ]);
  });

  it('folds neighbours at the very same place, minutes apart', () => {
    expect(
      sizes([
        entry(at(9), 'delivery', place(2)),
        entry(at(5), 'delivery', place(2)),
        entry(at(1), 'delivery', place(3)),
      ]),
    ).toEqual([2, 1]);
  });

  it('does not take two dispatches with no place for the same place', () => {
    expect(sizes([entry(at(9), 'delivery'), entry(at(5), 'delivery')])).toEqual([1, 1]);
  });

  it('never folds across another kind', () => {
    expect(
      sizes([
        entry(at(5, 30), 'delivery'),
        entry(at(5, 20), 'construction'),
        entry(at(5, 10), 'delivery'),
      ]),
    ).toEqual([1, 1, 1]);
  });

  it('never folds an alarm, a combat, a Seven, a stood Blitzkrieg, a dated one or an edition', () => {
    const lone: Array<[DispatchKind, Partial<JournalDispatch>]> = [
      ['attacked', {}],
      ['delivery', { combat: {} as never }],
      ['delivery', { point: {} as never }],
      ['delivery', { stood: {} as never }],
      ['delivery', { resolutionAt: '09:00' }],
      ['delivery', { remaining: '2 h' }],
      ['edition', {}],
    ];
    for (const [kind, extra] of lone) {
      expect(sizes([entry(at(5, 30), kind, extra), entry(at(5, 10), kind, extra)])).toEqual([1, 1]);
    }
  });

  it('breaks a bundle at an alarm between two deliveries', () => {
    expect(
      sizes([
        entry(at(5, 30), 'delivery'),
        entry(at(5, 20), 'attacked'),
        entry(at(5, 10), 'delivery'),
      ]),
    ).toEqual([1, 1, 1]);
  });

  it('compares with the head of the bundle, not with the previous line (A~B~C)', () => {
    // A et B partagent une minute, B et C un lieu, mais C n'a ni le lieu ni la minute de A.
    expect(
      sizes([
        entry(at(9, 50), 'delivery', place(2)),
        entry(at(9, 10), 'delivery', place(5)),
        entry(at(4), 'delivery', place(5)),
      ]),
    ).toEqual([2, 1]);
  });
});

describe('retainBundles', () => {
  const line = (time: number, severity: DispatchSeverity, unread = false): JournalLine => ({
    dispatch: { ...dispatch(time, severity, 'delivery'), unread },
    earlier: 0,
  });

  it('filters the lines inside each bundle, and drops a bundle left empty', () => {
    const [bundle] = groupJournal([
      line(30, 'routine', true),
      line(20, 'routine'),
      line(10, 'routine', true),
    ]);
    const kept = retainBundles([bundle!], 'unread');

    expect(kept).toHaveLength(1);
    expect(kept[0]!.lines.map((entry) => entry.dispatch.at)).toEqual([30, 10]);
    expect(kept[0]!.head.dispatch.at).toBe(30);
    expect(kept[0]!.oldest.dispatch.at).toBe(10);
    expect(retainBundles([bundle!], 'critical')).toEqual([]);
  });
});
