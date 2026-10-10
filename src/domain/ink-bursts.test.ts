import { describe, expect, it } from 'vitest';
import { inkBursts } from './ink-bursts';
import type { CombatReport, JournalDispatch } from './player-view';

const combat = { point: { lon: 2, lat: 49 } } as CombatReport;
const dispatch = (
  at: number,
  kind: JournalDispatch['kind'],
  report: CombatReport | null = null,
): JournalDispatch => ({
  at,
  t: '',
  severity: 'notable',
  kind,
  text: '',
  unread: true,
  remaining: null,
  resolutionAt: null,
  combat: report,
});

describe('inkBursts', () => {
  it('stamps a combat at its pass, once it is newer than what the map has seen', () => {
    const journal = [dispatch(20, 'assault', combat), dispatch(5, 'attacked', combat)];
    expect(inkBursts(journal, 10, [])).toEqual([{ kind: 'combat', at: [2, 49] }]);
  });

  it('stamps an arrival at the end of the thread that vanished, one per dispatch', () => {
    const journal = [dispatch(20, 'column')];
    expect(
      inkBursts(journal, 10, [
        [10, 40],
        [11, 41],
      ]),
    ).toEqual([{ kind: 'arrival', at: [10, 40] }]);
  });

  it('says nothing for a thread that vanished without a dispatch, or a dispatch without place', () => {
    expect(inkBursts([], 0, [[10, 40]])).toEqual([]);
    expect(inkBursts([dispatch(20, 'column')], 0, [])).toEqual([]);
    expect(inkBursts([dispatch(20, 'sighting')], 0, [[10, 40]])).toEqual([]);
  });
});
