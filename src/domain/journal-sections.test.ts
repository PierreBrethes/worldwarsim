import { describe, expect, it } from 'vitest';
import { journalSections } from './journal-sections';
import type { DispatchKind, DispatchSeverity, JournalDispatch } from './player-view';

const dispatch = (
  at: number,
  severity: DispatchSeverity,
  kind: DispatchKind,
  text = `${kind} ${at}`,
): JournalDispatch => ({
  at,
  t: String(at),
  severity,
  kind,
  text,
  unread: false,
  remaining: null,
  resolutionAt: null,
  combat: null,
  place: null,
});

describe('journalSections', () => {
  it('ranks by severity and drops a severity with nothing to say', () => {
    const sections = journalSections([
      dispatch(5, 'routine', 'delivery'),
      dispatch(4, 'notable', 'column'),
      dispatch(3, 'routine', 'construction'),
    ]);

    expect(sections.map((section) => section.severity)).toEqual(['notable', 'routine']);
    expect(sections[1]?.lines.map((line) => line.dispatch.at)).toEqual([5, 3]);
  });

  it('keeps the newest edition alone and counts the ones it replaces', () => {
    const sections = journalSections([
      dispatch(9, 'routine', 'edition', 'édition de 22:58 — 1er'),
      dispatch(8, 'routine', 'delivery'),
      dispatch(6, 'routine', 'edition', 'édition de 19:57 — 1er'),
      dispatch(3, 'routine', 'edition', 'édition de 16:57 — 2e'),
    ]);

    expect(sections).toEqual([
      {
        severity: 'routine',
        lines: [
          { dispatch: expect.objectContaining({ at: 9 }), earlier: 2 },
          { dispatch: expect.objectContaining({ at: 8 }), earlier: 0 },
        ],
      },
    ]);
  });
});
