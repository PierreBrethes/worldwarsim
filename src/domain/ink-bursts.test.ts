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

  it('stamps an arrival at the end of the thread that vanished', () => {
    expect(inkBursts([dispatch(20, 'column')], 10, [[10, 40]])).toEqual([
      { kind: 'arrival', at: [10, 40] },
    ]);
  });

  it('stamps no arrival when the vanished threads outnumber the dispatches', () => {
    // An attack resolved alongside a march: its thread vanishes too, without a column dispatch,
    // and counting alone would put the march's stamp on the attack's target.
    const vanished: ReadonlyArray<[number, number]> = [
      [10, 40],
      [11, 41],
    ];
    expect(inkBursts([dispatch(20, 'column')], 10, vanished)).toEqual([]);
    expect(inkBursts([dispatch(20, 'column'), dispatch(21, 'column')], 10, vanished)).toEqual([
      { kind: 'arrival', at: [10, 40] },
      { kind: 'arrival', at: [11, 41] },
    ]);
  });

  it('says nothing for a thread that vanished without a dispatch, or a dispatch without place', () => {
    expect(inkBursts([], 0, [[10, 40]])).toEqual([]);
    expect(inkBursts([dispatch(20, 'column')], 0, [])).toEqual([]);
    expect(inkBursts([dispatch(20, 'sighting')], 0, [[10, 40]])).toEqual([]);
  });
});
