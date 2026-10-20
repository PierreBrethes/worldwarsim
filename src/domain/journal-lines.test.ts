import { describe, expect, it } from 'vitest';
import { journalLines, passesFilter } from './journal-lines';
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
