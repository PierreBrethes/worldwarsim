import { describe, expect, it } from 'vitest';
import { STAMP_MS, inkBursts, stampAt } from './ink-bursts';
import type { CombatReport, JournalDispatch } from './player-view';

const combat = { id: 'c1', point: { lon: 2, lat: 49 }, won: false } as CombatReport;
const hour = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dispatch = (
  at: number,
  kind: JournalDispatch['kind'],
  report: CombatReport | null = null,
): JournalDispatch => ({
  at,
  place: null,
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
  it('stamps « capturé » where a site changed hands, on both sides', () => {
    const at = (kind: JournalDispatch['kind']) => ({
      ...dispatch(20, kind),
      place: { lon: 30, lat: 57 },
    });
    expect(inkBursts([at('captured'), at('siteLost')], 10, [])).toEqual([
      { kind: 'captured', at: [30, 57], words: { word: 'capturé', hour: hour(20) } },
      { kind: 'captured', at: [30, 57], words: { word: 'capturé', hour: hour(20) } },
    ]);
  });

  it('stamps « largué » where a packet came down, and nothing for a delivery', () => {
    const at = (kind: JournalDispatch['kind']) => ({
      ...dispatch(20, kind),
      place: { lon: 9, lat: 52 },
    });
    expect(inkBursts([at('airdrop'), at('supply')], 10, [])).toEqual([
      { kind: 'airdropped', at: [9, 52], words: { word: 'largué', hour: hour(20) } },
    ]);
  });

  it('stamps a combat at its pass, once it is newer than what the map has seen', () => {
    const journal = [dispatch(20, 'assault', combat), dispatch(5, 'attacked', combat)];
    expect(inkBursts(journal, 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], words: { word: 'engagé', hour: hour(20) } },
    ]);
  });

  it('stamps « bombardé » on both sides, and draws the shot from my battery alone', () => {
    const fired = {
      ...combat,
      cause: 'bombardment',
      firedFrom: { lon: 1, lat: 48 },
    } as CombatReport;
    const taken = { ...combat, cause: 'bombardment' } as CombatReport;
    expect(inkBursts([dispatch(20, 'assault', fired)], 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], from: [1, 48], words: { word: 'bombardé', hour: hour(20) } },
    ]);
    expect(inkBursts([dispatch(20, 'attacked', taken)], 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], words: { word: 'bombardé', hour: hour(20) } },
    ]);
  });

  it('stamps « terrain tenu » after « engagé » when the ground was held', () => {
    const won = { ...combat, won: true };
    expect(inkBursts([dispatch(20, 'assault', won)], 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], words: { word: 'engagé', hour: hour(20) } },
      {
        kind: 'held',
        at: [2, 49],
        words: { word: 'terrain tenu', hour: hour(20) },
        delayMs: STAMP_MS,
        combatId: 'c1',
      },
    ]);
  });

  it('stamps an arrival at the end of the thread that vanished', () => {
    expect(inkBursts([dispatch(20, 'column')], 10, [[10, 40]])).toEqual([
      { kind: 'arrival', at: [10, 40], words: { word: 'arrivé', hour: hour(20) } },
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
      { kind: 'arrival', at: [10, 40], words: { word: 'arrivé', hour: hour(21) } },
      { kind: 'arrival', at: [11, 41], words: { word: 'arrivé', hour: hour(21) } },
    ]);
  });

  it('says nothing for a thread that vanished without a dispatch, or a dispatch without place', () => {
    expect(inkBursts([], 0, [[10, 40]])).toEqual([]);
    expect(inkBursts([dispatch(20, 'column')], 0, [])).toEqual([]);
    expect(inkBursts([dispatch(20, 'sighting')], 0, [[10, 40]])).toEqual([]);
  });
});

describe('stampAt', () => {
  it('presses from 1.7 to 1 in 0.14 s, as the prototype does', () => {
    expect(stampAt(0, 'full')).toEqual({ scale: 1.7, opacity: 0 });
    expect(stampAt(70, 'full')!.scale).toBeCloseTo(1.35);
    expect(stampAt(140, 'full')).toEqual({ scale: 1, opacity: 0.88 });
  });

  it('holds three seconds, then lifts, then is gone', () => {
    expect(stampAt(2999, 'full')!.opacity).toBe(0.88);
    expect(stampAt(3200, 'full')!.opacity).toBeCloseTo(0.58);
    expect(stampAt(STAMP_MS, 'full')).toBeNull();
    expect(STAMP_MS).toBeCloseTo(3587, 0);
  });

  it('lays flat at once when motion is reduced, and waits unseen while delayed', () => {
    expect(stampAt(0, 'reduced')).toEqual({ scale: 1, opacity: 0.88 });
    expect(stampAt(-10, 'full')).toEqual({ scale: 1, opacity: 0 });
  });
});
