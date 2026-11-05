import { describe, expect, it } from 'vitest';
import { momentBeatsOf, momentOf, type MomentFacts } from './moments';
import type { JournalDispatch, StrategicPointView } from './player-view';

const NOON = Date.UTC(2026, 10, 5, 12);
const hour = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const point = (key: string, nation: string | null, heldSince: number, at: [number, number]) =>
  ({
    id: key,
    key,
    point: at,
    holder: nation === null ? null : { nation, heldMs: 0 },
    heldSince,
  }) as unknown as StrategicPointView;
const fall = (place: { lon: number; lat: number } | null): JournalDispatch =>
  ({ at: NOON, kind: 'elimination', place, text: '' }) as JournalDispatch;
const facts = (over: Partial<MomentFacts> = {}): MomentFacts => ({
  mode: 'mondiale',
  nation: 'germany',
  eliminatedAt: null,
  journal: [],
  verdict: { reason: 'points', winnerNation: 'germany', perMinute: null },
  concludedAt: NOON,
  strategicPoints: [
    point('baku', 'germany', 30, [49.87, 40.41]),
    point('narvik', 'germany', 10, [17.43, 68.44]),
    point('tangier', 'germany', 20, [-5.81, 35.77]),
    point('istanbul', 'germany', 40, [28.98, 41.01]),
    point('dakar', 'france', 5, [-17.25, 14.7]),
  ],
  ...over,
});

describe('momentOf', () => {
  /** **La victoire aux points** (#442) : la scène entière, sur les points du vainqueur dans
   *  l'ordre de leur prise, et sur les Sept pour le recul. */
  it('plays the whole victory over the winner’s points, in the order he took them', () => {
    const moment = momentOf('final', facts());
    expect(moment).toMatchObject({
      kind: 'victory',
      ink: '#2b6974',
      word: 'Victoire',
      line: 'quatre des Sept, vingt-quatre heures',
      held: [
        { at: [17.43, 68.44], name: 'Narvik' },
        { at: [-5.81, 35.77], name: 'Tanger' },
        { at: [49.87, 40.41], name: 'Bakou' },
        { at: [28.98, 41.01], name: 'Istanbul' },
      ],
    });
    expect(moment!.kind === 'victory' && moment!.seven).toHaveLength(5);
    expect(momentOf('final', facts({ nation: 'france' }))).toMatchObject({
      word: 'Saison close',
      line: 'Allemagne prend la saison',
    });
  });

  it('plays a stamp and the sepia alone for any other end, without a camera', () => {
    const verdict = { reason: 'hqTaken', winnerNation: 'germany', perMinute: null } as const;
    expect(momentOf('final', facts({ verdict }))).toMatchObject({
      kind: 'victory',
      held: null,
      seven: null,
    });
  });

  /** **Un QG pris, chez l'éliminé** : là où il est tombé, s'il le sait. */
  it('plays the fall where the fallen’s headquarters stood', () => {
    const fallen = { eliminatedAt: NOON, verdict: null, concludedAt: null };
    expect(
      momentOf('out', facts({ ...fallen, journal: [fall({ lon: 12.5, lat: 41.9 })] })),
    ).toEqual({
      kind: 'fall',
      at: [12.5, 41.9],
      hour: hour(NOON),
    });
    expect(momentOf('out', facts({ ...fallen, journal: [fall(null)] }))).toBeNull();
  });

  it('plays nothing in a Blitz, nor before an end', () => {
    expect(momentOf('final', facts({ mode: 'blitz' }))).toBeNull();
    expect(momentOf(null, facts())).toBeNull();
  });
});

describe('momentBeatsOf', () => {
  const victory = momentOf('final', facts())!;
  const does = (beats: ReturnType<typeof momentBeatsOf>) =>
    beats.map((beat) => `${beat.does}@${beat.at}`);

  it('pulls back, seals, traces, stamps, turns sepia, then opens the edition', () => {
    expect(does(momentBeatsOf(victory, 'full'))).toEqual([
      'pull@0',
      'seal@2000',
      'seal@2450',
      'seal@2900',
      'seal@3350',
      'trace@3900',
      'big@5300',
      'sepia@5900',
      'open@7500',
    ]);
  });

  it('cuts to the Seven when motion is reduced, and opens at once over them when it is cut', () => {
    expect(does(momentBeatsOf(victory, 'reduced'))[0]).toBe('pull@0');
    expect(does(momentBeatsOf(victory, 'reduced')).at(-1)).toBe('open@4400');
    expect(does(momentBeatsOf(victory, 'off'))).toEqual(['pull@0', 'sepia@0', 'open@0']);
    const elsewise = { reason: 'hqTaken', winnerNation: 'germany', perMinute: null } as const;
    expect(does(momentBeatsOf(momentOf('final', facts({ verdict: elsewise }))!, 'off'))).toEqual([
      'sepia@0',
      'open@0',
    ]);
  });

  it('lands on the fallen headquarters, stamps it, then opens his sheet', () => {
    const fallen = { kind: 'fall', at: [12.5, 41.9], hour: '14:32' } as const;
    expect(does(momentBeatsOf(fallen, 'full'))).toEqual(['fly@0', 'stamp@1000', 'open@4200']);
    expect(does(momentBeatsOf(fallen, 'off'))).toEqual(['fly@0', 'open@0']);
  });
});
