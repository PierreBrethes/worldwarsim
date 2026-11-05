import { describe, expect, it } from 'vitest';
import {
  EMPTY_TALLY,
  finalEditionOf,
  raceEntriesOf,
  tallyPass,
  type FinalEditionInput,
  type FinalPass,
} from './final-edition';

const HOUR = 3_600_000;
const END = 100 * HOUR;

const pass = (over: Partial<FinalPass>): FinalPass => ({
  at: HOUR,
  regionId: 'FRA-1',
  attacker: 'germany',
  defender: 'france',
  winner: 'attacker',
  engaged: 4,
  attackerLost: 1,
  defenderLost: 2,
  ...over,
});

const figures = { territory: 10, general: 100, industry: 60, military: 40, deeds: 3 };

const nationLine = (nation: string, over: Partial<FinalEditionInput['nations'][number]> = {}) => ({
  nation,
  nickname: nation.toUpperCase(),
  final: figures,
  series: [{ at: END, ...figures }],
  exit: null,
  hqLost: null,
  outpostsCaptured: 0,
  outpostsLost: 0,
  dispatches: 0,
  pointHeldMs: 0,
  ...over,
});

const input = (over: Partial<FinalEditionInput> = {}): FinalEditionInput => ({
  concludedAt: END,
  verdict: { reason: 'points', winnerNation: 'germany' },
  nations: [nationLine('germany'), nationLine('france')],
  points: [],
  tally: EMPTY_TALLY,
  ...over,
});

describe('the passes of a season, folded once', () => {
  it('sums pieces destroyed and lost on both sides, irregulars counted as losses only', () => {
    const tally = [
      pass({ attackerLost: 1, defenderLost: 2 }),
      pass({ attacker: 'france', defender: null, attackerLost: 3, defenderLost: 5 }),
    ].reduce(tallyPass, EMPTY_TALLY);
    expect(tally.pieces).toEqual({
      germany: { destroyed: 2, lost: 1 },
      france: { destroyed: 1 + 5, lost: 2 + 3 },
    });
  });

  it('keeps the first contact and the biggest pass between nations, never against irregulars', () => {
    const tally = [
      pass({ at: 5 * HOUR, engaged: 10 }),
      pass({ at: 1 * HOUR, defender: null, engaged: 40 }),
      pass({ at: 3 * HOUR, engaged: 6 }),
    ].reduce(tallyPass, EMPTY_TALLY);
    expect(tally.firstContact?.at).toBe(3 * HOUR);
    expect(tally.biggest?.engaged).toBe(10);
  });

  it('keeps for each nation its worst pass and its finest won pass', () => {
    const tally = [
      pass({ at: 1 * HOUR, winner: 'attacker', defenderLost: 3, attackerLost: 0 }),
      pass({ at: 2 * HOUR, winner: 'attacker', defenderLost: 7, attackerLost: 4 }),
      pass({ at: 3 * HOUR, winner: 'defender', defenderLost: 1, attackerLost: 6 }),
      pass({ at: 4 * HOUR, defender: null, winner: 'attacker', defenderLost: 30 }),
    ].reduce(tallyPass, EMPTY_TALLY);
    expect(tally.finest.germany?.at).toBe(2 * HOUR);
    expect(tally.worst.germany?.at).toBe(3 * HOUR);
    expect(tally.finest.france?.at).toBe(3 * HOUR);
    expect(tally.worst.france?.at).toBe(2 * HOUR);
  });
});

describe('the race, replayed from the hands of the Sept', () => {
  it('enters a nation each time it reaches four points, and again after falling back', () => {
    const held = (key: string, at: number, nation: string | null) => ({ key, at, nation });
    const points = ['a', 'b', 'c', 'd'].map((key, rank) => ({
      key,
      regionId: `R-${key}`,
      hands: [held(key, (rank + 1) * HOUR, 'germany')],
    }));
    points[0]!.hands.push(held('a', 10 * HOUR, null), held('a', 12 * HOUR, 'germany'));
    expect(raceEntriesOf(points)).toEqual([
      { at: 4 * HOUR, nation: 'germany', key: 'd', regionId: 'R-d' },
      { at: 12 * HOUR, nation: 'germany', key: 'a', regionId: 'R-a' },
    ]);
  });
});

describe('the final edition', () => {
  it('ranks by territory and keeps the winner apart from the rank', () => {
    const edition = finalEditionOf(
      input({
        nations: [
          nationLine('germany', { final: { ...figures, territory: 4 } }),
          nationLine('france', { final: { ...figures, territory: 9 } }),
        ],
      }),
    );
    expect(edition.nations.map(({ nation, rank }) => [nation, rank])).toEqual([
      ['france', 1],
      ['germany', 2],
    ]);
    expect(edition.verdict.winnerNation).toBe('germany');
  });

  it('tells the moments in the order of the season, verdict always, at most nine', () => {
    const fallen = Array.from({ length: 12 }, (_, rank) =>
      nationLine(`n${String(rank)}`, {
        hqLost: { at: (20 + rank) * HOUR, regionId: `HQ-${String(rank)}`, by: 'germany' },
      }),
    );
    const tally = [pass({ at: 2 * HOUR, engaged: 4 }), pass({ at: 30 * HOUR, engaged: 20 })].reduce(
      tallyPass,
      EMPTY_TALLY,
    );
    const { moments } = finalEditionOf(
      input({ nations: [nationLine('germany'), ...fallen], tally }),
    );
    expect(moments).toHaveLength(9);
    expect(moments.map((moment) => moment.kind)).toEqual([
      'contact',
      'hqTaken',
      'hqTaken',
      'hqTaken',
      'hqTaken',
      'hqTaken',
      'hqTaken',
      'battle',
      'verdict',
    ]);
    expect(moments[1]).toEqual({
      kind: 'hqTaken',
      at: 20 * HOUR,
      regionId: 'HQ-0',
      nations: ['germany', 'n0'],
    });
  });

  /** Le pli voyage d'un maillon à l'autre, sérialisé : la même passe n'y est plus le même objet. */
  it('does not tell the same pass twice as contact and as the biggest', () => {
    const folded = [pass({ engaged: 12 })].reduce(tallyPass, EMPTY_TALLY);
    const tally = JSON.parse(JSON.stringify(folded)) as typeof folded;
    const { moments } = finalEditionOf(input({ tally }));
    expect(moments.map((moment) => moment.kind)).toEqual(['contact', 'verdict']);
  });

  it('names a finest move: a QG, else one of the Sept, else the won pass that destroyed most', () => {
    const tally = [pass({ at: 2 * HOUR, winner: 'attacker', defenderLost: 5 })].reduce(
      tallyPass,
      EMPTY_TALLY,
    );
    const points = [
      {
        key: 'narvik' as const,
        regionId: 'NOR-1',
        hands: [{ at: 6 * HOUR, nation: 'france' }],
        heldMs: [],
      },
    ];
    const edition = finalEditionOf(
      input({
        nations: [
          nationLine('germany'),
          nationLine('france'),
          nationLine('italy', { hqLost: { at: 9 * HOUR, regionId: 'ITA-1', by: 'germany' } }),
          nationLine('japan'),
        ],
        points,
        tally,
      }),
    );
    const finest = Object.fromEntries(
      edition.nations.map(({ nation, finest }) => [nation, finest]),
    );
    expect(finest.germany?.kind).toBe('hqTaken');
    expect(finest.france).toEqual({
      kind: 'pointTaken',
      at: 6 * HOUR,
      regionId: 'NOR-1',
      key: 'narvik',
      nations: ['france'],
    });
    const losses = (nation: string) =>
      edition.nations.find((page) => page.nation === nation)!.losses;
    expect(losses('france').worstPass?.at).toBe(2 * HOUR);
    expect(losses('japan').worstPass).toBeNull();
    expect(finest.japan).toBeNull();
  });

  it('lists the points taken and lost by each nation, a return to neutral included', () => {
    const points = [
      {
        key: 'baku' as const,
        regionId: 'AZE-1',
        hands: [
          { at: 1 * HOUR, nation: 'germany' },
          { at: 2 * HOUR, nation: 'france' },
          { at: 3 * HOUR, nation: null },
        ],
        heldMs: [],
      },
    ];
    const { nations } = finalEditionOf(input({ points }));
    const [germany, france] = nations;
    expect(germany!.gains.points).toEqual([{ key: 'baku', at: 1 * HOUR, from: null }]);
    expect(germany!.losses.points).toEqual([{ key: 'baku', at: 2 * HOUR, to: 'france' }]);
    expect(france!.losses.points).toEqual([{ key: 'baku', at: 3 * HOUR, to: null }]);
  });
});
